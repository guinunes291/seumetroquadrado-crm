// SamiQ server-side: contexto RLS-scoped e minimizado, configuração versionada
// no banco, quota distribuída e telemetria sem conteúdo/PII. O modelo não
// recebe ferramentas; a resposta continua limitada a texto para copiar/navegar.

import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseAtendimentoInbox } from "@/features/atendimento/inbox";
import {
  estimateSamiQTokens,
  firstNameForSamiQ,
  minimizeSamiQContext,
  redactSamiQFreeText,
} from "@/lib/samiq-governance";
import {
  SAMIQ_ACTION_META,
  SamiQInputSchema,
  sugestoesPara,
  type SamiQResposta,
} from "@/lib/samiq";

// 24k de contexto + ate 7,2k de historico + prompts cabem com margem.
// A finalizacao substitui esta reserva conservadora pelo consumo real.
const RESERVED_INPUT_TOKENS = 10_000;
const MAX_CONTEXT_CHARS = 24_000;

export const perguntarSamiQ = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SamiQInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<SamiQResposta> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");
    const { supabase, userId } = context;
    const meta = SAMIQ_ACTION_META[data.action];
    if (meta.precisaLead && !data.leadId) {
      throw new Error("Abra um lead (ou selecione um) para usar esta ação do SamiQ.");
    }

    const { finishSamiQExecution, reserveSamiQExecution } =
      await import("./samiq-governance.server");
    const reservation = await reserveSamiQExecution({
      userId,
      action: data.action,
      estimatedInputTokens: RESERVED_INPUT_TOKENS,
    });
    const startedAt = Date.now();
    let errorCode = "context_error";

    const recordFailure = async () => {
      try {
        const recorded = await finishSamiQExecution({
          userId,
          executionId: reservation.executionId,
          status: "failed",
          latencyMs: Date.now() - startedAt,
          errorCode,
        });
        if (!recorded) {
          console.error(JSON.stringify({ event: "samiq_metrics_failed", status: "failed" }));
        }
      } catch {
        console.error(JSON.stringify({ event: "samiq_metrics_failed", status: "failed" }));
      }
    };

    try {
      // ----- Contexto por ação (RLS-scoped; campos e volumes truncados) -----
      const ctx: Record<string, unknown> = {};

      if (data.leadId) {
        const [{ data: lead, error: leadErr }, { data: interacoes, error: interactionErr }] =
          await Promise.all([
            supabase
              .from("leads")
              .select(
                "nome, origem, status, temperatura, projeto_nome, renda_informada, entrada_disponivel, usa_fgts, proximo_followup, ultima_interacao, visita_data, visita_hora, visita_empreendimento, tipo_renda, faixa_mcmv",
              )
              .eq("id", data.leadId)
              .maybeSingle(),
            supabase
              .from("interacoes")
              .select("tipo, direcao, ocorreu_em")
              .eq("lead_id", data.leadId)
              .is("deleted_at", null)
              .order("ocorreu_em", { ascending: false })
              .limit(12),
          ]);
        if (leadErr || interactionErr) throw new Error("context_unavailable");
        if (!lead) throw new Error("lead_not_found");
        const { nome: leadName, ...leadWithoutName } = lead;
        ctx.cliente = { ...leadWithoutName, primeiro_nome: firstNameForSamiQ(leadName) };
        ctx.ultimasInteracoes = (interacoes ?? []).map((interaction) => ({
          em: interaction.ocorreu_em,
          tipo: interaction.tipo,
          direcao: interaction.direcao,
        }));
      }

      if (data.action === "checklist_docs" && data.leadId) {
        const { data: docs, error } = await supabase
          .from("documentacoes")
          .select("tipo, status")
          .eq("lead_id", data.leadId)
          .limit(40);
        if (error) throw new Error("context_unavailable");
        ctx.documentacao = (docs ?? []).map((doc) => ({
          documento: doc.tipo,
          status: doc.status,
        }));
      }

      if (data.action === "responder_objecao") {
        const { data: objections, error } = await supabase
          .from("objecoes")
          .select("objecao, resposta")
          .eq("ativo", true)
          .order("ordem")
          .limit(30);
        if (error) throw new Error("context_unavailable");
        const target = (data.pergunta ?? "").toLowerCase();
        const hit = target
          ? ((objections ?? []).find((item) => target.includes(item.objecao.toLowerCase())) ??
            (objections ?? []).find((item) => item.objecao.toLowerCase().includes(target)))
          : null;
        if (hit) ctx.respostaBiblioteca = hit.resposta;
      }

      if (data.action === "projeto_ideal") {
        const { data: projects, error } = await supabase
          .from("projetos")
          .select("nome, bairro, cidade, regiao, tipologia, dorms_min, dorms_max, preco_a_partir")
          .eq("ativo", true)
          .is("deleted_at", null)
          .limit(40);
        if (error) throw new Error("context_unavailable");
        ctx.catalogo = projects ?? [];
      }

      if (data.action === "analise_funil") {
        const { data: snapshot, error } = await supabase.rpc("pipeline_snapshot_v2", {
          _corretor_id: userId,
        });
        if (error) throw new Error("context_unavailable");
        ctx.funil = Object.fromEntries(
          (snapshot ?? []).map((stage) => [stage.etapa, stage.quantidade]),
        );
      }

      if (data.action === "prioridade_dia") {
        const { data: inboxRows, error } = await supabase.rpc("atendimento_inbox_v2", {
          _corretor_id: userId,
          _limit_per_queue: 10,
        });
        if (error) throw new Error("context_unavailable");
        const inbox = parseAtendimentoInbox(inboxRows ?? []);
        ctx.fila = Object.values(inbox.filas)
          .flat()
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
          .map((item) => ({
            primeiro_nome: firstNameForSamiQ(item.lead.nome),
            status: item.lead.status,
            temperatura: item.lead.temperatura,
            projeto: item.lead.projeto_nome,
            score: item.score,
            motivo: item.motivo,
          }));
      }

      // ----- Prompt versionado e minimizado -----
      const safeContext = minimizeSamiQContext(ctx, { maxArray: 40, maxString: 400 });
      const contextJson = JSON.stringify(safeContext);
      const parts: string[] = [`Ação solicitada: ${meta.label}.`, reservation.actionPrompt];
      if (data.pergunta) {
        parts.push(`Detalhe do corretor: ${redactSamiQFreeText(data.pergunta, 500)}`);
      }
      if (Object.keys(ctx).length > 0) {
        parts.push(
          `Contexto minimizado (${reservation.promptVersion}):\n${contextJson.slice(0, MAX_CONTEXT_CHARS)}`,
        );
      }
      if (data.historico?.length) {
        parts.push(
          `Conversa recente:\n${data.historico
            .map(
              (message) =>
                `${message.role === "user" ? "Corretor" : "SamiQ"}: ${redactSamiQFreeText(message.content, 600)}`,
            )
            .join("\n")}`,
        );
      }
      const prompt = parts.join("\n\n");

      errorCode = "gateway_error";
      const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
      const gateway = createLovableAiGatewayProvider(apiKey);
      const model = gateway(reservation.modelId);
      const result = await generateText({
        model,
        system: reservation.systemPrompt,
        prompt,
        maxOutputTokens: reservation.maxOutputTokens,
      });

      const inputTokens =
        result.usage.inputTokens ?? estimateSamiQTokens(reservation.systemPrompt + prompt);
      const outputTokens = result.usage.outputTokens ?? estimateSamiQTokens(result.text);
      const recorded = await finishSamiQExecution({
        userId,
        executionId: reservation.executionId,
        status: "completed",
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - startedAt,
      });
      if (!recorded) {
        console.error(JSON.stringify({ event: "samiq_metrics_failed", status: "completed" }));
      }

      return {
        texto: result.text.trim(),
        sugestoes: sugestoesPara(data.action, result.text, data.leadId),
      };
    } catch (error) {
      await recordFailure();
      if (error instanceof Error && error.message === "lead_not_found") {
        throw new Error("Lead não encontrado.");
      }
      if (errorCode === "context_error") {
        throw new Error("Não foi possível montar o contexto do SamiQ.");
      }
      throw new Error("O SamiQ está temporariamente indisponível. Tente novamente.");
    }
  });
