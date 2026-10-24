// O CÉREBRO da Sami (Onda S4, decisão D15: um cérebro, dois canais; v8: o
// CRM inteiro no WhatsApp).
//
// Tudo que o painel fazia em samiq.functions.ts vive aqui, como função de
// servidor pura de framework: recebe a sessão do corretor (RLS), a entrada já
// validada e o canal, e devolve a resposta. O painel (server function) e o
// WhatsApp (/api/sami, chamado pelo n8n) chamam a MESMA função: prompt
// versionado, ferramentas, ações, governança, memória e telemetria iguais.
//
// Escrita (v8, autonomia por risco):
//  * painel: tudo vira card e só grava com o toque do corretor (como na S2);
//  * WhatsApp: ações leves (contato, nota, tarefa, ficha, documentos, tarefas,
//    confirmar e remarcar visita, check-in) gravam NA HORA pelo mesmo núcleo
//    do CONFIRMAR (samiq-acoes.server.ts → samiq-confirmar.server.ts), com
//    recibo e DESFAZER de 24 h; ações pesadas (etapa, perda, visita, crédito,
//    venda, cadastro, lote) esperam o CONFIRMAR.
// Este arquivo não grava nada diretamente: só monta o turno e delega.
//
// Desde a quebra em módulos (2026-10): limites e tipos em samiq-core-config.ts,
// contexto por ação em samiq-core-contexto.server.ts, cabeçalho do turno em
// samiq-core-cabecalho.ts, ferramentas em samiq-core-ferramentas.server.ts e o
// fechamento do turno (recibo, pendentes e memória) em
// samiq-core-fechamento.server.ts.

import { APICallError, generateText, stepCountIs, type ModelMessage } from "ai";
import {
  displayNameForSamiQ,
  estimateSamiQTokens,
  minimizeSamiQContext,
  redactSamiQFreeText,
  redactSamiQPii,
  redigirTextoDoCorretor,
  type MapaPiiCorretor,
} from "@/lib/samiq-governance";
import { SAMIQ_ACTION_META, type SamiQResposta } from "@/lib/samiq";
import {
  SAMIQ_TEXTO_SEM_RESPOSTA,
  contarFerramentasSamiQ,
  detectarFallbackSamiQ,
} from "@/lib/samiq-tools";
import type { ModoEscritaSamiQ } from "@/lib/samiq-propostas";
import type { PropostaColetada } from "@/lib/samiq-propostas.server";
import type { CitarClienteSamiQ } from "@/lib/samiq-tools.server";
import { type AmbiguosDoTurno, type ClienteCitado } from "@/lib/samiq-contexto";
import { escolherCandidato } from "@/lib/samiq-canal";
import { finishSamiQExecution, reserveSamiQExecution } from "./samiq-governance.server";
import type { AcaoExecutada } from "./samiq-acoes.server";
import type { ControleDoTurno } from "./samiq-controle.server";
import {
  instrucoesDoCanal,
  LIMITE_HISTORICO,
  LIMITE_PERGUNTA,
  MAX_CONTEXT_CHARS,
  RESERVED_INPUT_TOKENS,
  RESERVED_INPUT_TOKENS_COM_FERRAMENTAS,
  RESERVED_INPUT_TOKENS_WHATSAPP,
  TEMPO_MAXIMO_MS,
  type ResponderSamiQArgs,
} from "./samiq-core-config";
import { montarContextoDaAcao } from "./samiq-core-contexto.server";
import { cabecalhoDoTurno } from "./samiq-core-cabecalho";
import { montarFerramentasDoTurno } from "./samiq-core-ferramentas.server";
import { fecharTurnoSamiQ } from "./samiq-core-fechamento.server";
import { prepararTurnoComFerramentas, promptSemFerramentas } from "./samiq-core-turno";

export {
  instrucoesDoCanal,
  type AnexoDoTurno,
  type LocalizacaoDoTurno,
  type RecentesDaConversa,
  type ResponderSamiQArgs,
} from "./samiq-core-config";

export async function responderSamiQ(args: ResponderSamiQArgs): Promise<SamiQResposta> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");
  const { supabase, userId, data, canal } = args;
  const agora = args.agora ?? new Date();
  const meta = SAMIQ_ACTION_META[data.action];
  if (meta.precisaLead && !data.leadId) {
    throw new Error("Abra um lead (ou selecione um) para usar esta ação do SamiQ.");
  }

  const podeUsarFerramentas = data.action === "pergunta_livre";
  const reservation = await reserveSamiQExecution({
    userId,
    action: data.action,
    estimatedInputTokens: podeUsarFerramentas
      ? canal === "whatsapp"
        ? RESERVED_INPUT_TOKENS_WHATSAPP
        : RESERVED_INPUT_TOKENS_COM_FERRAMENTAS
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

  // Ações gravadas na hora e o que as ferramentas de controle fizeram: ficam
  // fora do try para o recibo sobreviver a uma falha no meio do turno.
  let executadas: AcaoExecutada[] = [];
  const controle: ControleDoTurno = { confirmadas: [], descartadas: [], desfeitas: [] };

  try {
    // ----- Contexto por ação (RLS-scoped; campos e volumes truncados) -----
    const ctx = await montarContextoDaAcao({ supabase, userId, data, reservation });

    // ----- Prompt versionado e minimizado -----
    const safeContext = minimizeSamiQContext(ctx, { maxArray: 40, maxString: 400 }) as Record<
      string,
      unknown
    >;
    const contextJson = JSON.stringify(safeContext);
    const doCanal = instrucoesDoCanal(canal, args.origemMidia);

    // Melhoria contínua (23/10/2026): diretrizes aprovadas pelo gestor entram no fim do prompt.
    const { blocoDiretrizesSamiQ } = await import("./samiq-diretrizes.server");
    const systemPrompt = reservation.systemPrompt + (await blocoDiretrizesSamiQ());

    errorCode = "gateway_error";
    const { createGovernedModelGateway } = await import("./ai-gateway.server");
    const gateway = createGovernedModelGateway(apiKey);
    const model = gateway(reservation.modelId);

    let texto = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let telemetria = { chamadas: 0, erros: 0, nomes: [] as string[] };
    let interrompido = false;
    // Ações que esperam o OK (painel: tudo; WhatsApp: as pesadas).
    const coletor: PropostaColetada[] = [];
    // Memória de trabalho que este turno deixa para o próximo.
    const citados: Array<Omit<ClienteCitado, "em">> = [];
    // Candidatos da pergunta "qual Maria?" deste turno (vazio = sem pergunta).
    const ambiguos: AmbiguosDoTurno = { lista: [], conflito: false };
    // v8.2: a pergunta com marcadores numerados e o mapa vão para a memória da conversa.
    let perguntaParaMemoria: string | undefined;
    let mapaPiiDoTurno: MapaPiiCorretor | undefined;

    if (usarFerramentas) {
      const {
        perguntaSegura,
        mapaPii,
        historicoSeguro,
        contexto,
        recentes,
        citar,
        escolhido,
        liberados,
        textoDoCorretor,
        localizacao,
        contextoExecucao,
      } = prepararTurnoComFerramentas({ data, canal, args, citados });
      perguntaParaMemoria = perguntaSegura;
      mapaPiiDoTurno = mapaPii;

      // Loop de ferramentas: leitura pelo supabase do usuário (RLS) e ações
      // validadas antes de qualquer gravação.
      const montadas = await montarFerramentasDoTurno({
        supabase,
        userId,
        agora,
        mapaPii,
        citar,
        reservation,
        args,
        coletor,
        textoDoCorretor,
        data,
        liberados,
        ambiguos,
        canal,
        recentes,
        contextoExecucao,
        controle,
        historicoSeguro,
        perguntaSegura,
        localizacao,
      });
      const { ferramentas, ativas } = montadas;
      if (montadas.executadas) executadas = montadas.executadas;

      const cabecalho = cabecalhoDoTurno({
        meta,
        reservation,
        agora,
        doCanal,
        args,
        data,
        safeContext,
        contexto,
        recentes,
        localizacao,
        escolhido,
        mapaPii,
        canal,
      });
      const messages: ModelMessage[] = [
        ...historicoSeguro.map((m) => ({ role: m.role, content: m.content })),
        {
          role: "user",
          content: `${cabecalho.join("\n")}\n\nMensagem do corretor: ${perguntaSegura || "(vazia)"}`,
        },
      ];
      try {
        const result = await generateText({
          model,
          system: systemPrompt,
          messages,
          tools: ferramentas,
          activeTools: ativas(),
          // abrir_ferramentas no passo N amplia o conjunto do passo N+1.
          prepareStep: () => ({ activeTools: ativas() }),
          stopWhen: stepCountIs(reservation.maxToolSteps),
          maxOutputTokens: reservation.maxOutputTokens,
          timeout: { totalMs: Math.min(TEMPO_MAXIMO_MS[canal], args.tempoMaximoMs ?? Infinity) },
        });
        telemetria = contarFerramentasSamiQ(result.steps);
        texto = result.text.trim();
        inputTokens =
          result.totalUsage.inputTokens ??
          estimateSamiQTokens(reservation.systemPrompt + JSON.stringify(messages));
        outputTokens = result.totalUsage.outputTokens ?? estimateSamiQTokens(texto);
      } catch (error) {
        // Se algo já foi gravado, o corretor PRECISA do recibo (senão ele
        // reenvia e duplica). Sem gravação, o erro segue o caminho normal.
        const gravouAlgo =
          executadas.length > 0 || controle.confirmadas.length > 0 || controle.desfeitas.length > 0;
        if (!gravouAlgo) throw error;
        interrompido = true;
        errorCode = APICallError.isInstance(error)
          ? `gateway_${error.statusCode ?? "erro"}`
          : "interrompido";
        console.error(JSON.stringify({ event: "samiq_turno_interrompido", codigo: errorCode }));
        texto =
          "Tive um problema no meio da resposta. O que está no recibo abaixo já ficou gravado; me diga o que faltou.";
        inputTokens = estimateSamiQTokens(reservation.systemPrompt + JSON.stringify(messages)) * 2;
        outputTokens = estimateSamiQTokens(texto);
      }
    } else {
      const perguntaSegura = data.pergunta
        ? redactSamiQFreeText(data.pergunta, LIMITE_PERGUNTA[canal])
        : "";
      const historicoSeguro = (data.historico ?? []).map((message) => ({
        role: message.role,
        content: redactSamiQFreeText(message.content, 600),
      }));
      const prompt = promptSemFerramentas({
        meta,
        reservation,
        doCanal,
        perguntaSegura,
        ctx,
        contextJson,
        historicoSeguro,
      });
      const result = await generateText({
        model,
        system: systemPrompt,
        prompt,
        maxOutputTokens: reservation.maxOutputTokens,
      });
      texto = result.text.trim();
      inputTokens =
        result.usage.inputTokens ?? estimateSamiQTokens(reservation.systemPrompt + prompt);
      outputTokens = result.usage.outputTokens ?? estimateSamiQTokens(texto);
    }

    const agiu =
      executadas.length > 0 ||
      coletor.length > 0 ||
      controle.confirmadas.length > 0 ||
      controle.descartadas.length > 0 ||
      controle.desfeitas.length > 0;
    // Sem texto mas com ação, o recibo fala por si: não é fallback.
    const fallback = interrompido || (!agiu && detectarFallbackSamiQ(texto));
    if (!texto && !agiu) texto = SAMIQ_TEXTO_SEM_RESPOSTA;

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

    return fecharTurnoSamiQ({
      executadas,
      controle,
      args,
      coletor,
      userId,
      reservation,
      data,
      canal,
      texto,
      meta,
      telemetria,
      citados,
      agora,
      ambiguos,
      fallback,
      perguntaSegura: perguntaParaMemoria,
      mapaPii: mapaPiiDoTurno,
    });
  } catch (error) {
    if (APICallError.isInstance(error)) {
      // Sem isto o painel só mostra "indisponível" e ninguém sabe se foi 400
      // (pedido rejeitado), 429 (cota do gateway) ou 5xx (gateway fora).
      const status = error.statusCode ?? null;
      errorCode = status ? `gateway_${status}` : "gateway_error";
      console.error(
        JSON.stringify({
          event: "samiq_gateway_failed",
          status,
          comFerramentas: usarFerramentas,
          corpo: (error.responseBody ?? "").slice(0, 300),
        }),
      );
    }
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
