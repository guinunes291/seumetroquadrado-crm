// SamiQ server-side: contexto RLS-scoped e minimizado, configuração versionada
// no banco, quota distribuída e telemetria sem conteúdo/PII.
//
// Onda S1 (docs/samiq/2026-09-05-decisoes-copiloto.md): a pergunta livre roda
// um loop de FERRAMENTAS DE LEITURA sobre a carteira (samiq-tools.server.ts)
// quando a versão de prompt ativa autoriza (tools_enabled). O modelo continua
// sem qualquer ferramenta de escrita; a resposta segue limitada a texto para
// copiar/navegar. Cada turno é gravado na memória (samiq-memoria.server.ts).

import { createServerFn } from "@tanstack/react-start";
import { generateText, stepCountIs, type ModelMessage } from "ai";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseAtendimentoInbox } from "@/features/atendimento/inbox";
import {
  displayNameForSamiQ,
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
import {
  SAMIQ_TEXTO_SEM_RESPOSTA,
  contarFerramentasSamiQ,
  detectarFallbackSamiQ,
  hojeSaoPaulo,
} from "@/lib/samiq-tools";

// 24k de contexto + ate 7,2k de historico + prompts cabem com margem.
// A finalizacao substitui esta reserva conservadora pelo consumo real.
const RESERVED_INPUT_TOKENS = 10_000;
// Com ferramentas, cada passo devolve um resultado ao modelo: reserva maior,
// ainda dentro do teto de 50k da RPC.
const RESERVED_INPUT_TOKENS_COM_FERRAMENTAS = 24_000;
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
    const podeUsarFerramentas = data.action === "pergunta_livre";
    const reservation = await reserveSamiQExecution({
      userId,
      action: data.action,
      estimatedInputTokens: podeUsarFerramentas
        ? RESERVED_INPUT_TOKENS_COM_FERRAMENTAS
        : RESERVED_INPUT_TOKENS,
    });
    const usarFerramentas = podeUsarFerramentas && reservation.toolsEnabled;
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
        // Nome completo só quando a versão ativa já é a que sabe lidar com ele
        // (D12); com a v2 no ar, o comportamento antigo (primeiro nome) fica.
        ctx.cliente = {
          ...leadWithoutName,
          primeiro_nome: firstNameForSamiQ(leadName),
          ...(reservation.toolsEnabled ? { nome: displayNameForSamiQ(leadName) } : {}),
        };
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
      const safeContext = minimizeSamiQContext(ctx, { maxArray: 40, maxString: 400 }) as Record<
        string,
        unknown
      >;
      const contextJson = JSON.stringify(safeContext);
      const perguntaSegura = data.pergunta ? redactSamiQFreeText(data.pergunta, 500) : "";
      const historicoSeguro = (data.historico ?? []).map((message) => ({
        role: message.role,
        content: redactSamiQFreeText(message.content, 600),
      }));

      errorCode = "gateway_error";
      const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
      const gateway = createLovableAiGatewayProvider(apiKey);
      const model = gateway(reservation.modelId);

      let texto = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let telemetria = { chamadas: 0, erros: 0, nomes: [] as string[] };

      if (usarFerramentas) {
        // Loop de ferramentas de LEITURA: o modelo consulta a carteira pelo
        // supabase do usuário (RLS) até o teto de passos da política.
        const { criarFerramentasSamiQ } = await import("./samiq-tools.server");
        const tools = criarFerramentasSamiQ({ supabase, userId });
        const cabecalho = [
          `Ação solicitada: ${meta.label}.`,
          reservation.actionPrompt,
          `Hoje é ${hojeSaoPaulo()} (fuso de São Paulo).`,
          data.leadId
            ? `Cliente em contexto (id ${data.leadId}): ${JSON.stringify(safeContext.cliente ?? {}).slice(0, 2000)}`
            : "Sem cliente em contexto — use buscar_clientes quando o corretor citar um nome.",
        ];
        const messages: ModelMessage[] = [
          ...historicoSeguro.map((m) => ({ role: m.role, content: m.content })),
          {
            role: "user",
            content: `${cabecalho.join("\n")}\n\nPergunta do corretor: ${perguntaSegura || "(vazia)"}`,
          },
        ];
        const result = await generateText({
          model,
          system: reservation.systemPrompt,
          messages,
          tools,
          stopWhen: stepCountIs(reservation.maxToolSteps),
          maxOutputTokens: reservation.maxOutputTokens,
        });
        telemetria = contarFerramentasSamiQ(result.steps);
        texto = result.text.trim();
        inputTokens =
          result.totalUsage.inputTokens ??
          estimateSamiQTokens(reservation.systemPrompt + JSON.stringify(messages));
        outputTokens = result.totalUsage.outputTokens ?? estimateSamiQTokens(texto);
      } else {
        const parts: string[] = [`Ação solicitada: ${meta.label}.`, reservation.actionPrompt];
        if (perguntaSegura) parts.push(`Detalhe do corretor: ${perguntaSegura}`);
        if (Object.keys(ctx).length > 0) {
          parts.push(
            `Contexto minimizado (${reservation.promptVersion}):\n${contextJson.slice(0, MAX_CONTEXT_CHARS)}`,
          );
        }
        if (historicoSeguro.length) {
          parts.push(
            `Conversa recente:\n${historicoSeguro
              .map(
                (message) =>
                  `${message.role === "user" ? "Corretor" : "SamiQ"}: ${message.content}`,
              )
              .join("\n")}`,
          );
        }
        const prompt = parts.join("\n\n");
        const result = await generateText({
          model,
          system: reservation.systemPrompt,
          prompt,
          maxOutputTokens: reservation.maxOutputTokens,
        });
        texto = result.text.trim();
        inputTokens =
          result.usage.inputTokens ?? estimateSamiQTokens(reservation.systemPrompt + prompt);
        outputTokens = result.usage.outputTokens ?? estimateSamiQTokens(texto);
      }

      const fallback = detectarFallbackSamiQ(texto);
      if (!texto) texto = SAMIQ_TEXTO_SEM_RESPOSTA;

      const recorded = await finishSamiQExecution({
        userId,
        executionId: reservation.executionId,
        status: "completed",
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - startedAt,
        toolCalls: telemetria.chamadas,
        toolErrors: telemetria.erros,
        fallback,
      });
      if (!recorded) {
        console.error(JSON.stringify({ event: "samiq_metrics_failed", status: "completed" }));
      }

      // ----- Memória (D11): o turno vai para a conversa, já redigido -----
      const { gravarTurnoSamiQ } = await import("./samiq-memoria.server");
      const rotulo = data.pergunta
        ? data.action === "pergunta_livre"
          ? data.pergunta
          : `${meta.label}: ${data.pergunta}`
        : meta.label;
      const conversaId = await gravarTurnoSamiQ({
        userId,
        conversaId: data.conversaId ?? null,
        leadId: data.leadId ?? null,
        pergunta: rotulo,
        resposta: texto,
        ferramentas: telemetria.nomes,
        executionId: reservation.executionId,
      });

      return {
        texto,
        sugestoes: sugestoesPara(data.action, texto, data.leadId),
        executionId: reservation.executionId,
        conversaId,
        ferramentas: telemetria.nomes,
        fallback,
        custoMesPct: reservation.custoMesPct,
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
