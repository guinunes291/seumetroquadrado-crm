import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  estimateSamiQTokens,
  firstNameForSamiQ,
  minimizeSamiQContext,
  redactSamiQFreeText,
} from "./samiq-governance";

const InputSchema = z.object({ leadId: z.string().uuid() });

export type LeadResumoIA = {
  resumo: string;
  totalInteracoes: number;
};

// Sob governança (item 0.6): quota/modelo/prompt do banco via ação
// `resumo_lead`; PII minimizada como no SamiQ (primeiro nome, texto livre
// redigido). A reserva acontece DEPOIS dos early-returns — consulta de 2
// queries baratas não justifica gastar cota de quem nem vai chamar o modelo.
export const gerarResumoLeadIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }): Promise<LeadResumoIA> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");
    const { supabase, userId } = context;

    const [{ data: lead, error: leadErr }, { data: interacoes, error: intErr }] = await Promise.all(
      [
        supabase
          .from("leads")
          .select(
            "nome, origem, status, temperatura, projeto_nome, renda_informada, entrada_disponivel, usa_fgts, observacoes, created_at, motivo_perdido",
          )
          .eq("id", data.leadId)
          .maybeSingle(),
        supabase
          .from("interacoes")
          .select("tipo, direcao, titulo, conteudo, ocorreu_em")
          .eq("lead_id", data.leadId)
          .is("deleted_at", null)
          .order("ocorreu_em", { ascending: true })
          .limit(50),
      ],
    );
    if (leadErr) throw new Error(leadErr.message);
    if (intErr) throw new Error(intErr.message);

    const lista = interacoes ?? [];
    if (!lead) return { resumo: "Lead não encontrado.", totalInteracoes: 0 };

    if (lista.length === 0) {
      return {
        resumo:
          "Sem interações registradas ainda. Faça o primeiro contato priorizando entender o momento de compra, renda e uso de FGTS.",
        totalInteracoes: 0,
      };
    }

    // Minimização: primeiro nome no lugar do nome completo; observações e o
    // corpo real das conversas (onde moram telefone/CPF/endereço) redigidos.
    const ctx = minimizeSamiQContext(
      {
        lead: {
          primeiro_nome: firstNameForSamiQ(lead.nome),
          origem: lead.origem,
          status: lead.status,
          temperatura: lead.temperatura,
          projeto: lead.projeto_nome,
          renda: lead.renda_informada,
          entrada: lead.entrada_disponivel,
          fgts: lead.usa_fgts,
          observacoes: redactSamiQFreeText(lead.observacoes ?? "", 500) || undefined,
          motivo_perdido: lead.motivo_perdido,
        },
        interacoes: lista.map((i) => ({
          em: i.ocorreu_em,
          tipo: i.tipo,
          direcao: i.direcao,
          titulo: redactSamiQFreeText(i.titulo ?? "", 120) || undefined,
          conteudo: redactSamiQFreeText(i.conteudo ?? "", 400) || undefined,
        })),
      },
      { maxArray: 50, maxString: 400 },
    );

    const promptCorpo = `Dados do lead e interações (JSON):\n${JSON.stringify(ctx)}`;

    const { reserveGovernedAIExecution, finishSamiQExecution } =
      await import("./samiq-governance.server");
    const reservation = await reserveGovernedAIExecution({
      userId,
      action: "resumo_lead",
      estimatedInputTokens: Math.min(50_000, estimateSamiQTokens(promptCorpo) + 500),
      requestedOutputTokens: 700,
      fallback: { rateLimitKey: "resumo-ia", maxPerMinute: 20, maxOutputTokens: 700 },
    });

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway(reservation.modelId);

    const LEGACY_SYSTEM =
      "Você é assistente de corretor MCMV em São Paulo. Resuma o histórico do lead em PT-BR, no MÁXIMO 6 linhas curtas, em bullets começando com '•'. Foque em: estágio atual, principais objeções, próximo passo recomendado. Sem markdown além dos bullets, sem títulos.";

    const startedAt = Date.now();
    try {
      const { text, usage } = await generateText({
        model,
        system: reservation.systemPrompt ?? LEGACY_SYSTEM,
        prompt: [reservation.actionPrompt, promptCorpo].filter(Boolean).join("\n\n"),
        maxOutputTokens: reservation.maxOutputTokens,
      });
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
      return { resumo: text.trim(), totalInteracoes: lista.length };
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
  });
