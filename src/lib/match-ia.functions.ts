import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";

import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { estimateSamiQTokens, minimizeSamiQContext, redactSamiQFreeText } from "./samiq-governance";

// Governança (item 0.6): quota/modelo/prompt vêm do banco via
// reserveGovernedAIExecution; o rate limit em memória sobrevive apenas como
// FALLBACK enquanto a migration não chega em produção.
const IA_RATE_MAX = Number(process.env.MATCH_IA_RATE_LIMIT ?? 20); // por minuto (fallback)
const MATCH_MAX_OUTPUT_TOKENS = 2000; // JSON com até 6 projetos + motivos

// Linha do catálogo de projetos usada na busca por IA.
type ProjetoRow = {
  id: string;
  nome: string;
  construtora: string | null;
  bairro: string | null;
  cidade: string | null;
  regiao: string | null;
  zona_smq: string | null;
  tipologia: string | null;
  dorms_min: number | null;
  dorms_max: number | null;
  vagas_min: number | null;
  vagas_max: number | null;
  metragem_min: number | null;
  metragem_max: number | null;
  preco_a_partir: number | null;
  status_entrega: string | null;
  mes_entrega: number | string | null;
  ano_entrega: number | null;
  observacoes: string | null;
};

// Cache curto, em memória, do catálogo de projetos ativos — reduz carga no banco
// em buscas repetidas. Não afeta o custo de tokens (vem do rate limit + limit(200)).
const CATALOGO_TTL_MS = 60_000;
let catalogoCache: { at: number; data: ProjetoRow[] } | null = null;

const InputSchema = z.object({
  descricao: z.string().min(10).max(2000),
  leadId: z.string().optional(),
});

const AiSchema = z.object({
  resumo: z.string(),
  filtrosUsados: z.object({
    regiao: z.string().nullable().optional(),
    dorms: z.string().nullable().optional(),
    vagas: z.string().nullable().optional(),
    precoMax: z.string().nullable().optional(),
    programa: z.string().nullable().optional(),
    entrega: z.string().nullable().optional(),
  }),
  projetos: z
    .array(
      z.object({
        id: z.string(),
        pontuacao: z.number().min(0).max(10),
        motivo: z.string(),
        tipologiaRecomendada: z.string().nullable().optional(),
      }),
    )
    .max(6),
});

export type BuscaIAResultado = {
  resumo: string;
  filtrosUsados: Record<string, string | null | undefined>;
  totalFiltrados: number;
  projetos: Array<{
    id: string;
    nome: string;
    construtora: string | null;
    bairro: string | null;
    cidade: string | null;
    preco_a_partir: number | null;
    pontuacao: number;
    motivo: string;
    tipologiaRecomendada?: string | null;
  }>;
};

export const buscarProjetosIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }): Promise<BuscaIAResultado> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

    const { supabase, userId } = context;

    // Catálogo de projetos ativos com cache curto em memória.
    let lista: ProjetoRow[];
    if (catalogoCache && Date.now() - catalogoCache.at < CATALOGO_TTL_MS) {
      lista = catalogoCache.data;
    } else {
      const { data: projetos, error } = await supabase
        .from("projetos")
        .select(
          "id, nome, construtora, bairro, cidade, regiao, zona_smq, tipologia, dorms_min, dorms_max, vagas_min, vagas_max, metragem_min, metragem_max, preco_a_partir, status_entrega, mes_entrega, ano_entrega, observacoes",
        )
        .eq("ativo", true)
        .is("deleted_at", null)
        .limit(200);
      if (error) throw new Error(error.message);
      lista = (projetos ?? []) as unknown as ProjetoRow[];
      catalogoCache = { at: Date.now(), data: lista };
    }

    if (lista.length === 0) {
      return {
        resumo: "Nenhum empreendimento ativo cadastrado.",
        filtrosUsados: {},
        totalFiltrados: 0,
        projetos: [],
      };
    }

    const catalogo = lista.map((p) => ({
      id: p.id,
      nome: p.nome,
      construtora: p.construtora,
      regiao: p.regiao ?? p.zona_smq,
      bairro: p.bairro,
      cidade: p.cidade,
      tipologia: p.tipologia,
      dorms: [p.dorms_min, p.dorms_max].filter(Boolean).join("-") || null,
      vagas: [p.vagas_min, p.vagas_max].filter(Boolean).join("-") || null,
      metragem: [p.metragem_min, p.metragem_max].filter(Boolean).join("-") || null,
      preco_a_partir: p.preco_a_partir,
      entrega: [p.status_entrega, p.mes_entrega, p.ano_entrega].filter(Boolean).join("/") || null,
      obs: p.observacoes?.slice(0, 200) ?? null,
    }));

    // A descrição vem do cliente e pode embutir observações do lead — redigir
    // PII no servidor (o ponto que o cliente não controla). O catálogo é dado
    // público de negócio: minimizar preserva nomes de empreendimento.
    const descricaoRedigida = redactSamiQFreeText(data.descricao, 2000);
    const catalogoMin = minimizeSamiQContext(catalogo, { maxArray: 200, maxString: 200 });

    const promptCorpo = `Descrição do corretor:\n${descricaoRedigida}\n\nCatálogo (JSON):\n${JSON.stringify(catalogoMin)}`;

    // Reserva de quota DEPOIS do early-return (catálogo vazio não gasta cota)
    // e ANTES do modelo. Fallback = comportamento legado até a migration subir.
    const { reserveGovernedAIExecution, finishSamiQExecution } =
      await import("./samiq-governance.server");
    const reservation = await reserveGovernedAIExecution({
      userId,
      action: "match_projetos",
      estimatedInputTokens: Math.min(50_000, estimateSamiQTokens(promptCorpo) + 500),
      requestedOutputTokens: MATCH_MAX_OUTPUT_TOKENS,
      fallback: {
        rateLimitKey: "match-ia",
        maxPerMinute: IA_RATE_MAX,
        maxOutputTokens: MATCH_MAX_OUTPUT_TOKENS,
      },
    });

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway(reservation.modelId);

    const LEGACY_SYSTEM =
      'Você é um especialista em imóveis MCMV em São Paulo. Analise a descrição do corretor e o catálogo. Responda APENAS com JSON válido (sem markdown, sem cercas ```), no formato exato: {"resumo": string, "filtrosUsados": {"regiao"?: string, "dorms"?: string, "vagas"?: string, "precoMax"?: string, "programa"?: string, "entrega"?: string}, "projetos": [{"id": string, "pontuacao": number 0-10, "motivo": string, "tipologiaRecomendada"?: string}]}. Use apenas ids existentes no catálogo. Máximo 6 projetos, ordenados por aderência. Motivo em 1 frase PT-BR.';

    const startedAt = Date.now();
    let parsed: z.infer<typeof AiSchema>;
    try {
      const { text, usage } = await generateText({
        model,
        system: reservation.systemPrompt ?? LEGACY_SYSTEM,
        prompt: [reservation.actionPrompt, promptCorpo].filter(Boolean).join("\n\n"),
        maxOutputTokens: reservation.maxOutputTokens,
      });

      // Tolerar cercas markdown caso o modelo as inclua
      const cleaned = text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "");
      try {
        parsed = AiSchema.parse(JSON.parse(cleaned));
      } catch (e) {
        throw new Error(`Resposta da IA em formato inválido: ${(e as Error).message}`);
      }

      if (reservation.governed) {
        await finishSamiQExecution({
          userId,
          executionId: reservation.executionId,
          status: "completed",
          inputTokens: usage.inputTokens ?? estimateSamiQTokens(promptCorpo),
          outputTokens: usage.outputTokens ?? estimateSamiQTokens(text),
          latencyMs: Date.now() - startedAt,
        });
      }
    } catch (error) {
      if (reservation.governed) {
        await finishSamiQExecution({
          userId,
          executionId: reservation.executionId,
          status: "failed",
          latencyMs: Date.now() - startedAt,
          errorCode: "gateway_error",
        });
      }
      throw error;
    }

    const byId = new Map(lista.map((p) => [p.id, p]));
    const projetosOut = parsed.projetos
      .filter((p) => byId.has(p.id))
      .sort((a, b) => b.pontuacao - a.pontuacao)
      .map((p) => {
        const proj = byId.get(p.id)!;
        return {
          id: proj.id,
          nome: proj.nome,
          construtora: proj.construtora,
          bairro: proj.bairro,
          cidade: proj.cidade,
          preco_a_partir: proj.preco_a_partir,
          pontuacao: Math.round(p.pontuacao),
          motivo: p.motivo,
          tipologiaRecomendada: p.tipologiaRecomendada ?? null,
        };
      });

    return {
      resumo: parsed.resumo,
      filtrosUsados: parsed.filtrosUsados,
      totalFiltrados: projetosOut.length,
      projetos: projetosOut,
    };
  });
