// O CÉREBRO da Sami (Onda S4, decisão D15 — um cérebro, dois canais).
//
// Tudo que o painel fazia em samiq.functions.ts vive aqui, como função de
// servidor pura de framework: recebe a sessão do corretor (RLS), a entrada já
// validada e o canal, e devolve a resposta. O painel (server function) e o
// WhatsApp (/api/sami, chamado pelo n8n) chamam a MESMA função — prompt
// versionado, ferramentas de leitura, propostas, governança, memória e
// telemetria iguais nos dois canais. Uma correção de prompt vale para os dois.
//
// Doutrina inalterada: o modelo só lê (ferramentas com o supabase do usuário)
// e propõe (propor_* apenas coleta); a escrita continua exigindo o toque do
// corretor (samiq-confirmar.server.ts). Nada aqui grava.

import { generateText, stepCountIs, type ModelMessage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
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
  sugestoesPara,
  type SamiQCanal,
  type SamiQInput,
  type SamiQResposta,
} from "@/lib/samiq";
import {
  SAMIQ_TEXTO_SEM_RESPOSTA,
  contarFerramentasSamiQ,
  detectarFallbackSamiQ,
  hojeSaoPaulo,
} from "@/lib/samiq-tools";
import type { PropostaSamiQ } from "@/lib/samiq-propostas";
import type { PropostaColetada } from "@/lib/samiq-propostas.server";
import { finishSamiQExecution, reserveSamiQExecution } from "./samiq-governance.server";
import { gravarTurnoSamiQ, registrarPropostasSamiQ } from "./samiq-memoria.server";

type Db = SupabaseClient<Database>;

// 24k de contexto + ate 7,2k de historico + prompts cabem com margem.
// A finalizacao substitui esta reserva conservadora pelo consumo real.
const RESERVED_INPUT_TOKENS = 10_000;
// Com ferramentas, cada passo devolve um resultado ao modelo: reserva maior,
// ainda dentro do teto de 50k da RPC.
const RESERVED_INPUT_TOKENS_COM_FERRAMENTAS = 24_000;
const MAX_CONTEXT_CHARS = 24_000;
/** Pergunta do painel (campo de 500) e do WhatsApp (áudio transcrito cabe em 1500). */
const LIMITE_PERGUNTA: Record<SamiQCanal, number> = { painel: 500, whatsapp: 1500 };

export type ResponderSamiQArgs = {
  supabase: Db;
  userId: string;
  data: SamiQInput;
  canal: SamiQCanal;
  /** WhatsApp: a mensagem veio de um áudio transcrito pelo n8n (D8). */
  origemMidia?: "texto" | "audio";
};

/** Instruções que dependem do canal — vão no cabeçalho da mensagem, não no prompt versionado. */
export function instrucoesDoCanal(canal: SamiQCanal, origemMidia?: "texto" | "audio"): string[] {
  const linhas: string[] = [];
  if (canal === "whatsapp") {
    linhas.push(
      "Canal: WhatsApp (o corretor está no celular). Responda em texto corrido, sem markdown, em até 6 linhas curtas. Se preparar registros com propor_*, não cite ids nem peça para abrir o CRM: termine dizendo que ele pode responder CONFIRMAR para registrar ou CANCELAR para descartar.",
    );
  }
  if (origemMidia === "audio") {
    linhas.push(
      "A mensagem foi ditada por áudio e transcrita automaticamente: tolere erros de transcrição e nomes aproximados (confirme o cliente com buscar_clientes antes de propor).",
    );
  }
  return linhas;
}

export async function responderSamiQ(args: ResponderSamiQArgs): Promise<SamiQResposta> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");
  const { supabase, userId, data, canal } = args;
  const meta = SAMIQ_ACTION_META[data.action];
  if (meta.precisaLead && !data.leadId) {
    throw new Error("Abra um lead (ou selecione um) para usar esta ação do SamiQ.");
  }

  const podeUsarFerramentas = data.action === "pergunta_livre";
  const reservation = await reserveSamiQExecution({
    userId,
    action: data.action,
    estimatedInputTokens: podeUsarFerramentas
      ? RESERVED_INPUT_TOKENS_COM_FERRAMENTAS
      : RESERVED_INPUT_TOKENS,
    canal,
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
    const perguntaSegura = data.pergunta
      ? redactSamiQFreeText(data.pergunta, LIMITE_PERGUNTA[canal])
      : "";
    const historicoSeguro = (data.historico ?? []).map((message) => ({
      role: message.role,
      content: redactSamiQFreeText(message.content, 600),
    }));
    const doCanal = instrucoesDoCanal(canal, args.origemMidia);

    errorCode = "gateway_error";
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway(reservation.modelId);

    let texto = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let telemetria = { chamadas: 0, erros: 0, nomes: [] as string[] };
    // Onda S2: propostas de escrita empilhadas pelas ferramentas propor_*.
    // Nada aqui grava; viram card (painel) ou pergunta de confirmação
    // (WhatsApp) e só executam quando o corretor confirma.
    const coletor: PropostaColetada[] = [];

    if (usarFerramentas) {
      // Loop de ferramentas de LEITURA: o modelo consulta a carteira pelo
      // supabase do usuário (RLS) até o teto de passos da política.
      const { criarFerramentasSamiQ } = await import("./samiq-tools.server");
      const tools = criarFerramentasSamiQ({ supabase, userId });
      // Onda S5 (D16): skills determinísticas, também só de leitura.
      const { criarFerramentasDeSkillsSamiQ } = await import("./samiq-skills.server");
      Object.assign(tools, criarFerramentasDeSkillsSamiQ({ supabase, userId }));
      if (reservation.propostasEnabled) {
        const { criarFerramentasDePropostaSamiQ } = await import("./samiq-propostas.server");
        Object.assign(tools, criarFerramentasDePropostaSamiQ({ supabase, userId, coletor }));
      }
      const cabecalho = [
        `Ação solicitada: ${meta.label}.`,
        reservation.actionPrompt,
        `Hoje é ${hojeSaoPaulo()} (fuso de São Paulo).`,
        ...doCanal,
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
      const parts: string[] = [
        `Ação solicitada: ${meta.label}.`,
        reservation.actionPrompt,
        ...doCanal,
      ];
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
              (message) => `${message.role === "user" ? "Corretor" : "SamiQ"}: ${message.content}`,
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

    // ----- Memória (D11): o turno vai para a conversa do canal, já redigido -----
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
      canal,
    });

    // ----- Propostas (S2): persistem como 'pendente' até o toque do corretor -----
    let propostas: PropostaSamiQ[] = [];
    if (coletor.length > 0) {
      propostas = await registrarPropostasSamiQ({
        userId,
        executionId: reservation.executionId,
        conversaId,
        coletadas: coletor,
      });
    }

    return {
      texto,
      sugestoes: sugestoesPara(data.action, texto, data.leadId),
      executionId: reservation.executionId,
      conversaId,
      ferramentas: telemetria.nomes,
      fallback,
      custoMesPct: reservation.custoMesPct,
      propostas,
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
}
