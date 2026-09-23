// Leitura da CARTA DE APROVAÇÃO de crédito por IA: o corretor anexa o PDF/print
// e o CRM devolve os números (financiamento, parcela, FGTS, subsídio, prazo,
// taxa…) para PRÉ-PREENCHER o formulário. Nada é gravado aqui — o corretor
// revisa e confirma; a leitura é uma sugestão, como toda IA do CRM.
//
// Governança igual às outras superfícies (item 0.6 / C3): reserva e finaliza
// pela RPC do SamiQ (ação `ler_aprovacao_credito`, migration 20260927120000),
// modelo e teto de saída vêm da reserva.
//
// PII: o documento é do próprio cliente e já está no bucket privado; a
// imagem não tem como ser redigida antes do modelo. A minimização acontece na
// SAÍDA: o schema só aceita os campos numéricos/condições previstos (qualquer
// outra chave — nome, CPF, endereço — é descartada pelo zod) e o texto livre
// passa por redactSamiQFreeText antes de voltar à tela.

import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  faixaPelaRenda,
  sanearEntradaDoSimulador,
  type DadosAprovacao,
} from "@/features/leads/aprovacao-credito";
import { parseValorBR } from "./simulador";
import { estimateSamiQTokens, redactSamiQFreeText } from "./samiq-governance";

const IA_RATE_MAX = Number(process.env.APROVACAO_IA_RATE_LIMIT ?? 10); // por minuto (fallback)
const LEITURA_MAX_OUTPUT_TOKENS = 700; // JSON de ~20 campos
const BUCKET = "documentacao";
const TIPOS_LIDOS = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
// Estimativa grosseira do custo de entrada de uma página/imagem para a cota.
const TOKENS_POR_DOCUMENTO = 3_000;

const InputSchema = z.object({ documentacaoId: z.string().uuid() });

// Cada campo tolera o formato "humano" que o modelo às vezes devolve
// ("R$ 185.000,00", "7,66%") e cai para null se vier lixo — um campo ruim
// não derruba a leitura inteira.
const valor = z
  .preprocess(
    (v) => (typeof v === "string" ? parseValorBR(v) : v),
    z.number().nonnegative().finite().nullable(),
  )
  .catch(null);
const inteiro = valor.transform((v) => (v == null ? null : Math.round(v)));
const dataIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .catch(null);
const bool = z.boolean().nullable().catch(null);

const ExtracaoSchema = z.object({
  banco: z.string().max(80).nullable().catch(null),
  modalidade: z.enum(["mcmv", "sbpe", "pro_cotista", "outro"]).nullable().catch(null),
  sistema_amortizacao: z.enum(["price", "sac"]).nullable().catch(null),
  valor_financiamento: valor,
  valor_parcela: valor,
  prazo_meses: inteiro,
  taxa_juros_anual: valor,
  valor_fgts: valor,
  valor_subsidio: valor,
  valor_entrada: valor,
  valor_imovel_max: valor,
  renda_familiar: valor,
  faixa_mcmv: z.enum(["1", "2", "3", "4"]).nullable().catch(null),
  qtd_participantes: inteiro,
  cotista_fgts: bool,
  possui_dependente: bool,
  data_aprovacao: dataIso,
  validade_ate: dataIso,
  confianca: z.number().min(0).max(1).catch(0.5),
  observacoes: z.string().nullable().catch(null),
});

export type LeituraAprovacao = {
  dados: DadosAprovacao;
  confianca: number;
  observacoes: string | null;
  /** Campos que a IA conseguiu ler — a tela destaca o que preencheu. */
  camposLidos: (keyof DadosAprovacao)[];
};

const LEGACY_PROMPT =
  'Extraia da carta de aprovação de crédito imobiliário APENAS os valores e condições. Responda só com JSON válido, sem markdown: {"banco","modalidade"("mcmv"|"sbpe"|"pro_cotista"|"outro"),"sistema_amortizacao"("price"|"sac"),"valor_financiamento","valor_parcela","prazo_meses","taxa_juros_anual","valor_fgts","valor_subsidio","valor_entrada","valor_imovel_max","renda_familiar","faixa_mcmv"("1".."4"),"qtd_participantes","cotista_fgts","possui_dependente","data_aprovacao"(AAAA-MM-DD),"validade_ate"(AAAA-MM-DD),"confianca"(0-1),"observacoes"}. Números puros em reais, taxa em % a.a., null para o que não aparece. ATENÇÃO ao formato "Simulador - Detalhamento" da CAIXA (retorno do SIRIC): "Valor de Financiamento + Despesa Cartorária" = valor_financiamento; "Prestação Máxima - SIRIC" = valor_parcela (se ausente, use "Primeira Prestação"); "Valor do imóvel" = valor_imovel_max; "Juros Nominais" = taxa_juros_anual; "Renda Familiar" = renda_familiar; "Número De Participantes" = qtd_participantes; "FGTS Há Mais De 3 Anos" = cotista_fgts; "PRICE FGTS"/"SAC" = sistema_amortizacao; origem de recurso FGTS ou NPMCMV/MCMV = modalidade "mcmv", SBPE = "sbpe". O campo "Valor de entrada" do simulador é a DIFERENÇA entre imóvel e financiamento, NÃO é recurso do cliente: NUNCA o coloque em valor_entrada — valor_entrada só quando o documento disser explicitamente recursos próprios/poupança do cliente. valor_fgts só com saldo/uso de FGTS explícito; valor_subsidio só com desconto/subsídio explícito. Nunca devolva nome, CPF ou endereço.';

export const lerAprovacaoCredito = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }): Promise<LeituraAprovacao> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");
    const { supabase, userId } = context;

    // 1) Autorização pela RLS do usuário: "não existe" e "fora da carteira"
    //    ficam indistinguíveis, como no handler de documentação.
    const { data: doc, error: docErr } = await supabase
      .from("documentacoes")
      .select("id, lead_id, tipo, url")
      .eq("id", data.documentacaoId)
      .maybeSingle();
    if (docErr) throw new Error("Não foi possível validar o documento.");
    if (!doc || doc.tipo !== "aprovacao_credito" || !doc.url) {
      throw new Error("Carta de aprovação não encontrada.");
    }

    // 2) Só a versão ATIVA registrada (mesma guarda anti confused-deputy do
    //    GET de /api/documentacao) — `url` sozinha é editável.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: versao, error: vErr } = await supabaseAdmin
      .from("documentacao_versoes")
      .select("object_path, mime_type")
      .eq("documentacao_id", doc.id)
      .eq("lead_id", doc.lead_id)
      .eq("object_path", doc.url)
      .eq("ativa", true)
      .maybeSingle();
    if (vErr || !versao || !TIPOS_LIDOS.has(versao.mime_type)) {
      throw new Error("Arquivo da carta de aprovação indisponível.");
    }
    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .download(versao.object_path);
    if (dlErr || !blob) throw new Error("Não foi possível abrir o arquivo anexado.");
    const bytes = new Uint8Array(await blob.arrayBuffer());

    // 3) Cota ANTES do modelo.
    const { reserveGovernedAIExecution, finishSamiQExecution } =
      await import("./samiq-governance.server");
    const reservation = await reserveGovernedAIExecution({
      userId,
      action: "ler_aprovacao_credito",
      estimatedInputTokens: TOKENS_POR_DOCUMENTO,
      requestedOutputTokens: LEITURA_MAX_OUTPUT_TOKENS,
      fallback: {
        rateLimitKey: "aprovacao-ia",
        maxPerMinute: IA_RATE_MAX,
        maxOutputTokens: LEITURA_MAX_OUTPUT_TOKENS,
      },
    });

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway(reservation.modelId);

    const startedAt = Date.now();
    let parsed: z.infer<typeof ExtracaoSchema>;
    try {
      const { text, usage } = await generateText({
        model,
        system: reservation.systemPrompt ?? undefined,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: reservation.actionPrompt ?? LEGACY_PROMPT },
              { type: "file", data: bytes, mediaType: versao.mime_type },
            ],
          },
        ],
        maxOutputTokens: reservation.maxOutputTokens,
      });
      const cleaned = text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "");
      try {
        parsed = ExtracaoSchema.parse(JSON.parse(cleaned));
      } catch {
        throw new Error("A IA não conseguiu ler a carta. Preencha os valores manualmente.");
      }
      if (reservation.governed) {
        await finishSamiQExecution({
          userId,
          executionId: reservation.executionId,
          status: "completed",
          inputTokens: usage.inputTokens ?? TOKENS_POR_DOCUMENTO,
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

    const { confianca, observacoes, ...lidos } = parsed;
    // Pós-processamento determinístico: descarta a "entrada" do simulador da
    // Caixa (é a diferença a cobrir, não recurso do cliente) e deriva a faixa
    // pela renda quando o documento não a traz.
    const dados = sanearEntradaDoSimulador(lidos);
    if (!dados.faixa_mcmv) dados.faixa_mcmv = faixaPelaRenda(dados.renda_familiar);
    const camposLidos = (Object.keys(dados) as (keyof DadosAprovacao)[]).filter(
      (k) => dados[k] != null,
    );
    return {
      dados,
      confianca,
      observacoes: observacoes ? redactSamiQFreeText(observacoes, 400) : null,
      camposLidos,
    };
  });
