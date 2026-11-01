// Leitura do CONTRATO DE COMPRA E VENDA por IA (Venda por contrato): o
// navegador extrai o texto do PDF com o pdf.js e manda só as páginas que
// importam (quadro-resumo, ficha cadastral, resumo da venda, assinatura); PDF
// escaneado ou foto vai como até 4 imagens. O servidor devolve os dados do
// comprador e da venda para PRÉ-PREENCHER a tela. Nada é gravado aqui — o
// usuário revisa e confirma, como toda IA do CRM.
//
// Por que o texto vem do navegador e não do arquivo no bucket: o deploy é
// Cloudflare (sem canvas, pdf.js pesado no worker) — mesmo motivo da extração
// de plantas do book. E o texto é só uma SUGESTÃO para a tela que o próprio
// usuário edita: quem manipulasse o texto só preencheria errado o próprio
// formulário. O arquivo original continua indo para o bucket privado pela rota
// mediada de sempre (/api/documentacao), ligado ao cliente.
//
// Governança igual às outras superfícies (item 0.6 / C3): reserva e finaliza
// pela RPC do SamiQ (ação `ler_contrato_venda`, migration 20261101120000);
// modelo e teto de saída vêm da reserva. Sem a migration, cai no fallback
// (rate limit local + modelo legado), nunca numa cota negada.
//
// PII: aqui a extração de dados pessoais É o objetivo (decisão do dono). O que
// sai passa pelo schema fechado (nenhuma chave extra) e pela validação
// determinística (CPF/telefone/e-mail inválidos viram vazio). Nada é logado.

import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ExtracaoContratoSchema,
  LIMITE_CARACTERES_CONTRATO,
  normalizarLeituraContrato,
  type LeituraContrato,
} from "@/features/vendas/contrato-venda";
import { estimateSamiQTokens, redactSamiQFreeText } from "./samiq-governance";

const IA_RATE_MAX = Number(process.env.CONTRATO_IA_RATE_LIMIT ?? 6); // por minuto (fallback)
const LEITURA_MAX_OUTPUT_TOKENS = 1_200; // JSON de ~30 campos
const TOKENS_POR_IMAGEM = 1_600;
const MAX_IMAGENS = 4;
// ~2,2 MB de imagem por página (base64 ≈ +33%): JPEG de página A4 a 150 dpi.
const MAX_BASE64_IMAGEM = 3_000_000;

const InputSchema = z
  .object({
    texto: z
      .string()
      .max(LIMITE_CARACTERES_CONTRATO + 4_000)
      .optional(),
    imagens: z
      .array(
        z.object({
          mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
          base64: z
            .string()
            .min(100)
            .max(MAX_BASE64_IMAGEM)
            .regex(/^[A-Za-z0-9+/=]+$/),
        }),
      )
      .max(MAX_IMAGENS)
      .optional(),
    totalPaginas: z.number().int().min(1).max(500),
  })
  .refine((d) => (d.texto?.trim().length ?? 0) > 0 || (d.imagens?.length ?? 0) > 0, {
    message: "Envie o texto ou as imagens do contrato.",
  });

// Fallback (governança sem a ação): o MESMO conteúdo do prompt versionado da
// migration 20261101120000, em forma compacta.
const LEGACY_PROMPT = `Você recebe trechos de um CONTRATO DE COMPRA E VENDA de imóvel na planta (quadro-resumo, resumo da venda, ficha cadastral, assinatura), separados por "=== Página N ===". Responda APENAS com JSON válido, sem markdown: {"comprador":{"nome","cpf","rg","rg_orgao_emissor","data_nascimento"(AAAA-MM-DD),"estado_civil","regime_casamento","profissao","nacionalidade","email","telefone","renda_familiar"(número),"endereco":{"logradouro","numero","complemento","bairro","cidade","uf","cep"}},"segundo_comprador":{"nome","cpf"}|null,"venda":{"construtora","empreendimento","unidade","valor_venda"(número),"data_assinatura"(AAAA-MM-DD)},"confianca"(0-1),"observacoes"}. COMPRADOR é o promissário comprador, nunca a vendedora, imobiliária, corretor ou testemunha; segundo comprador/cônjuge vai em segundo_comprador. CPF, CEP e telefone só com dígitos; e-mail minúsculo; UF com 2 letras. "XXXXXXXX", "-" ou vazio = null. construtora = MARCA comercial do grupo (Plano&Plano, Vibra Residencial, MRV, Cury), não a razão social da SPE; use o campo "Construtora:" ou o site do rodapé. empreendimento = nome comercial do condomínio, sem endereço. unidade = número + torre/bloco como aparecem. valor_venda = PREÇO TOTAL da unidade, nunca sinal, parcela ou só o financiamento. data_assinatura = data do contrato/da venda, nunca vencimentos nem entrega da obra. renda_familiar só se declarada. null para o que não aparece; nunca invente. observacoes: até 2 frases sobre ambiguidades, sem dados pessoais.`;

export const lerContratoVenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }): Promise<LeituraContrato> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");
    const { userId } = context;

    const texto = data.texto?.trim() ?? "";
    const imagens = data.imagens ?? [];
    const estimativa = Math.ceil(texto.length / 3.5) + imagens.length * TOKENS_POR_IMAGEM + 1_500;

    // Cota ANTES do modelo.
    const { reserveGovernedAIExecution, finishSamiQExecution } =
      await import("./samiq-governance.server");
    const reservation = await reserveGovernedAIExecution({
      userId,
      action: "ler_contrato_venda",
      estimatedInputTokens: estimativa,
      requestedOutputTokens: LEITURA_MAX_OUTPUT_TOKENS,
      fallback: {
        rateLimitKey: "contrato-ia",
        maxPerMinute: IA_RATE_MAX,
        maxOutputTokens: LEITURA_MAX_OUTPUT_TOKENS,
      },
    });

    const { createGovernedModelGateway } = await import("./ai-gateway.server");
    const model = createGovernedModelGateway(apiKey)(reservation.modelId);

    const instrucao = `${reservation.actionPrompt ?? LEGACY_PROMPT}\n\nO contrato tem ${data.totalPaginas} página(s). ${
      texto ? "Seguem as páginas relevantes." : "Seguem as primeiras páginas como imagem."
    }`;

    const startedAt = Date.now();
    let bruta: z.infer<typeof ExtracaoContratoSchema>;
    try {
      const { text, usage } = await generateText({
        model,
        system: reservation.systemPrompt ?? undefined,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: instrucao },
              ...(texto ? [{ type: "text" as const, text: texto }] : []),
              ...imagens.map((img) => ({
                type: "file" as const,
                data: img.base64,
                mediaType: img.mediaType,
              })),
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
        bruta = ExtracaoContratoSchema.parse(JSON.parse(cleaned));
      } catch {
        throw new Error("A IA não conseguiu ler o contrato. Preencha os dados manualmente.");
      }
      if (reservation.governed) {
        await finishSamiQExecution({
          userId,
          executionId: reservation.executionId,
          status: "completed",
          inputTokens: usage.inputTokens ?? estimativa,
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

    const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const leitura = normalizarLeituraContrato(bruta, hoje);
    return {
      ...leitura,
      observacoes: leitura.observacoes ? redactSamiQFreeText(leitura.observacoes, 400) : null,
    };
  });
