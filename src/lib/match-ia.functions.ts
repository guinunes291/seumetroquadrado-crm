import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";

import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rateLimit } from "@/lib/rate-limit";

// Teto de custo de IA: limita buscas por usuário (cada busca = 1 chamada ao LLM).
const IA_RATE_MAX = Number(process.env.MATCH_IA_RATE_LIMIT ?? 20); // por minuto
const IA_RATE_WINDOW_MS = 60_000;

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

    // Teto de custo: limita buscas de IA por usuário.
    const rl = rateLimit(`match-ia:${userId}`, IA_RATE_MAX, IA_RATE_WINDOW_MS);
    if (!rl.allowed) {
      throw new Error(
        `Muitas buscas seguidas. Tente novamente em ${rl.retryAfterS}s.`,
      );
    }

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
      return { resumo: "Nenhum empreendimento ativo cadastrado.", filtrosUsados: {}, totalFiltrados: 0, projetos: [] };
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

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const { text } = await generateText({
      model,
      system:
        "Você é um especialista em imóveis MCMV em São Paulo. Analise a descrição do corretor e o catálogo. Responda APENAS com JSON válido (sem markdown, sem cercas ```), no formato exato: {\"resumo\": string, \"filtrosUsados\": {\"regiao\"?: string, \"dorms\"?: string, \"vagas\"?: string, \"precoMax\"?: string, \"programa\"?: string, \"entrega\"?: string}, \"projetos\": [{\"id\": string, \"pontuacao\": number 0-10, \"motivo\": string, \"tipologiaRecomendada\"?: string}]}. Use apenas ids existentes no catálogo. Máximo 6 projetos, ordenados por aderência. Motivo em 1 frase PT-BR.",
      prompt: `Descrição do corretor:\n${data.descricao}\n\nCatálogo (JSON):\n${JSON.stringify(catalogo)}`,
    });

    // Tolerar cercas markdown caso o modelo as inclua
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    let parsed: z.infer<typeof AiSchema>;
    try {
      parsed = AiSchema.parse(JSON.parse(cleaned));
    } catch (e) {
      throw new Error(`Resposta da IA em formato inválido: ${(e as Error).message}`);
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
