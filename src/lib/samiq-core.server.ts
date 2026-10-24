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

import { APICallError, generateText, stepCountIs, tool, type ModelMessage, type ToolSet } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { parseAtendimentoInbox } from "@/features/atendimento/inbox";
import {
  displayNameForSamiQ,
  estimateSamiQTokens,
  firstNameForSamiQ,
  minimizeSamiQContext,
  redactSamiQFreeText,
  redactSamiQPii,
  redigirTextoDoCorretor,
  type MapaPiiCorretor,
} from "@/lib/samiq-governance";
import {
  SAMIQ_ACTION_META,
  sugestoesPara,
  type SamiQCanal,
  type SamiQInput,
  type SamiQResposta,
} from "@/lib/samiq";
import {
  AbrirFerramentasInput,
  SAMIQ_TEXTO_SEM_RESPOSTA,
  SAMIQ_TOOL_DESCRIPTIONS,
  contarFerramentasSamiQ,
  detectarFallbackSamiQ,
  hojeSaoPaulo,
  type GrupoFerramentas,
} from "@/lib/samiq-tools";
import {
  descreverProposta,
  type ModoEscritaSamiQ,
  type PropostaSamiQ,
} from "@/lib/samiq-propostas";
import type { ExecutorImediato, PropostaColetada } from "@/lib/samiq-propostas.server";
import type { CitarClienteSamiQ } from "@/lib/samiq-tools.server";
import { compatibilizarFerramentasSamiQ } from "@/lib/samiq-ferramentas-compat";
import { agoraParaModelo, calendarioParaModelo } from "@/lib/samiq-datas";
import { ferramentasAtivas, gruposPelaMensagem } from "@/lib/samiq-grupos";
import {
  mesclarClientes,
  textoClientesCitados,
  type ClienteCitado,
  type ContextoConversaSamiQ,
} from "@/lib/samiq-contexto";
import { pareceEscolha, textoParaWhatsApp } from "@/lib/samiq-canal";
import { leadStatusLabel } from "@/lib/leads";
import { finishSamiQExecution, reserveSamiQExecution } from "./samiq-governance.server";
import {
  gravarContextoTurnoSamiQ,
  gravarTurnoSamiQ,
  registrarPropostasSamiQ,
} from "./samiq-memoria.server";
import type { AcaoExecutada } from "./samiq-acoes.server";
import type { ControleDoTurno } from "./samiq-controle.server";

type Db = SupabaseClient<Database>;

// 24k de contexto + ate 7,2k de historico + prompts cabem com margem.
// A finalizacao substitui esta reserva conservadora pelo consumo real.
const RESERVED_INPUT_TOKENS = 10_000;
// Com ferramentas, cada passo devolve um resultado ao modelo: reserva maior,
// ainda dentro do teto de 50k da RPC.
const RESERVED_INPUT_TOKENS_COM_FERRAMENTAS = 24_000;
// WhatsApp v8: até 10 passos com o CRM inteiro. Ainda é só a reserva (teto de
// 50k da RPC); a finalização cobra o consumo real.
const RESERVED_INPUT_TOKENS_WHATSAPP = 40_000;
const MAX_CONTEXT_CHARS = 24_000;
/** Pergunta do painel (campo de 500) e do WhatsApp (áudio transcrito cabe em 4000). */
const LIMITE_PERGUNTA: Record<SamiQCanal, number> = { painel: 500, whatsapp: 4000 };
/** Histórico: o WhatsApp reenvia 16 mensagens de até 1200 caracteres (a conversa É o CRM). */
const LIMITE_HISTORICO: Record<SamiQCanal, number> = { painel: 600, whatsapp: 1200 };
/**
 * Teto de tempo do turno. WhatsApp abaixo do timeout do n8n (90 s): se o n8n
 * desistir antes, o corretor vê erro mas o que foi gravado fica, e ele reenvia.
 */
const TEMPO_MAXIMO_MS: Record<SamiQCanal, number> = { painel: 60_000, whatsapp: 75_000 };
/** Ferramentas de controle da fila da conversa: ativas sempre que existem. */
const FERRAMENTAS_DE_CONTROLE = ["confirmar_pendentes", "descartar_pendentes", "desfazer_acoes"];

export type RecentesDaConversa = {
  /** Esperando o OK, na numeração que o corretor viu (CONFIRMAR 2). */
  pendentes: PropostaSamiQ[];
  /** Gravadas no último recibo, na numeração do DESFAZER 2. */
  executadas: PropostaSamiQ[];
};

/** Arquivo que o corretor mandou (o conteúdo nunca vai ao modelo). */
export type AnexoDoTurno = {
  id: string;
  mime: string;
  tamanho: number;
  legenda: string | null;
  nome: string | null;
  /** true = chegou nesta mensagem; false = chegou antes e ainda não foi anexado. */
  agora: boolean;
};

export type LocalizacaoDoTurno = {
  latitude: number;
  longitude: number;
  precisao?: number | null;
  /** true = veio nesta mensagem. */
  agora: boolean;
};

export type ResponderSamiQArgs = {
  supabase: Db;
  userId: string;
  data: SamiQInput;
  canal: SamiQCanal;
  /** WhatsApp: a mensagem veio de um áudio transcrito pelo n8n (D8). */
  origemMidia?: "texto" | "audio";
  /** v8: "por_risco" grava as ações leves na hora (WhatsApp). Padrão: confirmar tudo. */
  modoEscrita?: ModoEscritaSamiQ;
  corretorNome?: string | null;
  /** v8: memória de trabalho da conversa (clientes citados, numerações, escolha). */
  contexto?: ContextoConversaSamiQ;
  recentes?: RecentesDaConversa;
  /** Arquivos ainda não anexados (o desta mensagem primeiro), no máximo 5. */
  anexos?: AnexoDoTurno[];
  localizacao?: LocalizacaoDoTurno | null;
  /** v8: contexto que só o n8n tem (material enviado fora do CRM, últimas mensagens). */
  contextoCanal?: string | null;
  agora?: Date;
};

/** Instruções que dependem do canal: vão no cabeçalho da mensagem, não no prompt versionado. */
export function instrucoesDoCanal(canal: SamiQCanal, origemMidia?: "texto" | "audio"): string[] {
  const linhas: string[] = [];
  if (canal === "whatsapp") {
    linhas.push(
      "Canal: WhatsApp (o corretor está no celular). Responda em texto corrido, sem markdown e sem travessão, em até 8 linhas curtas. O sistema anexa sozinho, depois do seu texto, o recibo do que foi gravado e a lista do que espera o OK, com as instruções de CONFIRMAR e DESFAZER: não repita essas listas, ids nem instruções. Fale do cliente, do resultado e do próximo passo.",
    );
  }
  if (origemMidia === "audio") {
    linhas.push(
      "A mensagem foi ditada por áudio e transcrita automaticamente: tolere erros de transcrição e nomes aproximados (confirme o cliente com buscar_clientes antes de registrar).",
    );
  }
  return linhas;
}

function linhaDeItens(itens: ReadonlyArray<PropostaSamiQ>): string {
  return itens
    .map((p, i) => {
      const d = descreverProposta(p.payload, p.leadNome);
      return `${i + 1}) ${d.titulo}${d.detalhes.length ? ` (${d.detalhes.slice(0, 2).join(", ")})` : ""}`;
    })
    .join("; ");
}

function textoDoAnexo(a: AnexoDoTurno): string {
  const tipo = a.mime === "application/pdf" ? "PDF" : "imagem";
  const kb = Math.max(1, Math.round(a.tamanho / 1024));
  const tamanho = kb >= 1024 ? `${(kb / 1024).toFixed(1).replace(".", ",")} MB` : `${kb} KB`;
  const legenda = a.legenda ? redactSamiQPii(a.legenda, 200) : null;
  return `${a.agora ? "O corretor mandou um arquivo nesta mensagem" : "Arquivo recebido antes e ainda não anexado"}: ${tipo} de ${tamanho}${
    legenda ? `, legenda "${legenda}"` : ""
  } (anexoId ${a.id}). Você não vê o conteúdo. Para guardar na ficha use anexar_documento com esse anexoId e o tipo de documento; se não souber de qual cliente ou qual documento é, pergunte.`;
}

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
    const ambiguos: string[] = [];

    if (usarFerramentas) {
      // Texto do corretor: nomes passam (D12); telefone, e-mail e CPF viram
      // marcadores numerados que só o servidor desfaz (cadastro e busca).
      const { texto: perguntaSegura, mapa: mapaPii } = data.pergunta
        ? redigirTextoDoCorretor(data.pergunta, LIMITE_PERGUNTA[canal])
        : { texto: "", mapa: {} as MapaPiiCorretor };
      // Histórico: o do WhatsApp vem do banco já redigido; o do painel vem do
      // browser. Nomes ficam (sem eles "ela", "a mesma" perdem o dono).
      const historicoSeguro = (data.historico ?? []).map((message) => ({
        role: message.role,
        content: redactSamiQPii(message.content, LIMITE_HISTORICO[canal]),
      }));
      const contexto = args.contexto ?? {};
      const recentes = args.recentes ?? { pendentes: [], executadas: [] };

      const citar: CitarClienteSamiQ = (c) => {
        const i = citados.findIndex((x) => x.id === c.id);
        if (i >= 0) citados.splice(i, 1);
        citados.push({ id: c.id, nome: displayNameForSamiQ(c.nome), etapa: c.etapa ?? null });
      };
      // "a 2" depois de "qual Maria? 1) ... 2) ...": a escolha é do corretor.
      const liberados =
        contexto.ambiguos?.length && pareceEscolha(data.pergunta ?? "")
          ? new Set(contexto.ambiguos)
          : undefined;
      // Trava de homônimos lê o texto CRU do corretor (este turno e os dele antes).
      const textoDoCorretor = [
        ...(data.historico ?? []).filter((m) => m.role === "user").map((m) => m.content),
        data.pergunta ?? "",
      ].join("\n");
      const localizacao = args.localizacao ?? null;
      const contextoExecucao = {
        localizacao: localizacao
          ? {
              latitude: localizacao.latitude,
              longitude: localizacao.longitude,
              precisao: localizacao.precisao ?? null,
            }
          : null,
      };

      // Loop de ferramentas: leitura pelo supabase do usuário (RLS) e ações
      // validadas antes de qualquer gravação.
      const { criarFerramentasSamiQ } = await import("./samiq-tools.server");
      const tools: ToolSet = criarFerramentasSamiQ({ supabase, userId, agora, mapaPii, citar });
      // Onda S5 (D16): skills determinísticas, também só de leitura.
      const { criarFerramentasDeSkillsSamiQ } = await import("./samiq-skills.server");
      Object.assign(tools, criarFerramentasDeSkillsSamiQ({ supabase, userId }));
      if (reservation.propostasEnabled) {
        const modo: ModoEscritaSamiQ = args.modoEscrita ?? "confirmar_tudo";
        let executarAgora: ExecutorImediato | undefined;
        if (modo === "por_risco") {
          const { criarExecucaoImediata } = await import("./samiq-acoes.server");
          const execucao = criarExecucaoImediata({
            supabase,
            userId,
            executionId: reservation.executionId,
            contexto: contextoExecucao,
          });
          executarAgora = execucao.executar;
          executadas = execucao.executadas;
        }
        const { criarFerramentasDePropostaSamiQ } = await import("./samiq-propostas.server");
        Object.assign(
          tools,
          criarFerramentasDePropostaSamiQ({
            supabase,
            userId,
            coletor,
            modo,
            executarAgora,
            textoDoCorretor,
            leadIdEmContexto: data.leadId,
            liberados,
            aoAmbiguo: (ids) => {
              ambiguos.splice(0, ambiguos.length, ...ids);
            },
            mapaPii,
            citar,
            agora,
          }),
        );
        if (
          canal === "whatsapp" &&
          (recentes.pendentes.length > 0 || recentes.executadas.length > 0)
        ) {
          const { criarFerramentasDeControleSamiQ } = await import("./samiq-controle.server");
          Object.assign(
            tools,
            criarFerramentasDeControleSamiQ({
              supabase,
              userId,
              textoDoCorretor: data.pergunta ?? "",
              pendentes: recentes.pendentes,
              executadas: recentes.executadas,
              contexto: contextoExecucao,
              registro: controle,
            }),
          );
        }
      }

      // Ferramentas por intenção: a mensagem escolhe os grupos do 1º passo e o
      // modelo abre outros com abrir_ferramentas (economia de ~70% de tokens).
      const ultimaDaSami = [...historicoSeguro]
        .reverse()
        .find((m) => m.role === "assistant")?.content;
      const gruposAbertos = new Set<GrupoFerramentas>(
        gruposPelaMensagem({
          texto: perguntaSegura,
          contextoRecente: ultimaDaSami,
          temAnexo: (args.anexos?.length ?? 0) > 0,
          temLocalizacao: !!localizacao,
        }),
      );
      tools.abrir_ferramentas = tool({
        description: SAMIQ_TOOL_DESCRIPTIONS.abrir_ferramentas,
        inputSchema: AbrirFerramentasInput,
        execute: async ({ grupos }) => {
          for (const g of grupos) gruposAbertos.add(g);
          return {
            abertos: [...gruposAbertos],
            aviso: "As ferramentas desses grupos ficam disponíveis a partir do próximo passo.",
          };
        },
      });

      const citadosAntes = textoClientesCitados(contexto.clientes, leadStatusLabel);
      const cabecalho = [
        `Ação solicitada: ${meta.label}.`,
        reservation.actionPrompt,
        `Agora: ${agoraParaModelo(agora)} (São Paulo). Hoje é ${hojeSaoPaulo(agora)}. Próximos dias: ${calendarioParaModelo(agora)}. Datas nas ferramentas: AAAA-MM-DDTHH:MM no horário de São Paulo.`,
        ...doCanal,
        args.corretorNome
          ? `Corretor: ${firstNameForSamiQ(args.corretorNome) ?? "corretor"}.`
          : null,
        data.leadId
          ? `Cliente em contexto (id ${data.leadId}): ${JSON.stringify(safeContext.cliente ?? {}).slice(0, 2000)}`
          : null,
        citadosAntes
          ? `Clientes citados nesta conversa (o mais recente primeiro): ${citadosAntes}.`
          : null,
        !data.leadId && !citadosAntes
          ? "Sem cliente em contexto: use buscar_clientes quando o corretor citar um nome."
          : null,
        recentes.pendentes.length
          ? `Esperando o OK do corretor (numeração do CONFIRMAR): ${linhaDeItens(recentes.pendentes)}.`
          : null,
        recentes.executadas.length
          ? `Gravado recentemente (numeração do DESFAZER): ${linhaDeItens(recentes.executadas)}.`
          : null,
        ...(args.anexos ?? []).slice(0, 5).map(textoDoAnexo),
        localizacao
          ? `${localizacao.agora ? "O corretor mandou a localização nesta mensagem" : "Localização recebida há poucos minutos"} (vale para o check-in na filial).`
          : canal === "whatsapp"
            ? "Sem localização recente: check-in na filial precisa dela (peça pelo clipe, Localização)."
            : null,
        Object.keys(mapaPii).length
          ? "Os marcadores [TELEFONE_n], [EMAIL_n] e [CPF_n] desta mensagem valem só nela: use-os direto nas ferramentas (buscar_clientes, criar_lead), sem pedir o dado de novo."
          : null,
        args.contextoCanal?.trim()
          ? `Contexto do WhatsApp (o que foi enviado fora do CRM; use para entender a mensagem, não responda a ele): ${redactSamiQPii(args.contextoCanal, 1500)}`
          : null,
      ].filter((l): l is string => !!l);
      const messages: ModelMessage[] = [
        ...historicoSeguro.map((m) => ({ role: m.role, content: m.content })),
        {
          role: "user",
          content: `${cabecalho.join("\n")}\n\nMensagem do corretor: ${perguntaSegura || "(vazia)"}`,
        },
      ];
      // Schemas no menor denominador comum: o gateway não pode rejeitar a
      // chamada por "$schema", "format: uuid" ou "additionalProperties".
      const ferramentas = compatibilizarFerramentasSamiQ(tools);
      const disponiveis = new Set(Object.keys(ferramentas));
      const ativas = () => [
        ...ferramentasAtivas(gruposAbertos, disponiveis),
        ...FERRAMENTAS_DE_CONTROLE.filter((n) => disponiveis.has(n)),
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
          timeout: { totalMs: TEMPO_MAXIMO_MS[canal] },
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

    // ----- WhatsApp: o texto final (resposta + recibo + pendentes) é o que
    // vai para a memória, para o "o 2" do próximo turno bater com o que o
    // corretor viu. -----
    const gravadas: PropostaSamiQ[] = [...executadas, ...controle.confirmadas];
    const gravadasOk = gravadas.filter((p) => p.status === "aceita" || p.status === "editada");
    const decididas = new Set<string>([
      ...controle.confirmadas.map((p) => p.id),
      ...controle.descartadas.map((p) => p.id),
    ]);
    const pendentesAntes = (args.recentes?.pendentes ?? []).filter((p) => !decididas.has(p.id));
    const pendentesNovas = coletor.map((c) => ({ payload: c.payload, leadNome: c.leadNome }));
    const mostrarPendentes = pendentesNovas.length > 0 || decididas.size > 0;
    const textoCanal =
      canal === "whatsapp"
        ? textoParaWhatsApp({
            texto,
            executadas: gravadas,
            pendentes: mostrarPendentes ? [...pendentesAntes, ...pendentesNovas] : [],
            desfeitas: controle.desfeitas,
            descartadas: controle.descartadas,
          })
        : undefined;

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
      resposta: textoCanal ?? texto,
      ferramentas: telemetria.nomes,
      executionId: reservation.executionId,
      canal,
    });

    // ----- Ações que esperam o OK: persistem como 'pendente' até o corretor decidir -----
    let propostas: PropostaSamiQ[] = [];
    if (coletor.length > 0) {
      propostas = await registrarPropostasSamiQ({
        userId,
        executionId: reservation.executionId,
        conversaId,
        coletadas: coletor,
      });
    }

    // ----- v8: memória de trabalho da conversa (só quando há conversa) -----
    const pendentesConversa = [...pendentesAntes, ...propostas];
    if (conversaId && canal === "whatsapp") {
      const contexto = args.contexto ?? {};
      await gravarContextoTurnoSamiQ({
        userId,
        conversaId,
        executionId: reservation.executionId,
        contexto: {
          ...contexto,
          clientes: mesclarClientes(contexto.clientes, [...citados].reverse(), agora),
          pendentes: pendentesConversa.map((p) => p.id),
          // DESFAZER N vale para o último recibo que o corretor viu.
          executadas: gravadasOk.length ? gravadasOk.map((p) => p.id) : (contexto.executadas ?? []),
          // "sim"/"ok" só decidem quando ESTA mensagem pediu o OK.
          pediu_decisao: mostrarPendentes && pendentesConversa.length > 0,
          ambiguos,
          localizacao: contexto.localizacao ?? null,
          anexo_pendente:
            (args.anexos ?? []).find(
              (a) =>
                !gravadasOk.some(
                  (p) => p.payload.tipo === "anexar_documento" && p.payload.anexoId === a.id,
                ),
            )?.id ?? null,
        },
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
      executadas: gravadas,
      pendentes: pendentesConversa,
      textoCanal,
    };
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
