// Ferramentas de ESCRITA da Sami (Onda S2 → v8 "CRM no WhatsApp").
//
// Cada ferramenta valida o que o modelo montou ANTES de qualquer gravação:
// schema (zod), cliente na carteira do corretor (RLS), homônimo, datas no
// fuso de SP e no futuro, e a máquina de estados do funil (espelho de
// transicao_lead_permitida em lib/leads.ts). Nada aqui grava:
//  * ação "direto" (autonomia por risco, só no WhatsApp) vai para o executor
//    imediato do turno (samiq-acoes.server.ts), que registra a ação em
//    samiq_propostas e executa pelo MESMO caminho do CONFIRMAR;
//  * ação "confirmar" (e tudo no painel) fica no coletor e vira pendente.
// O retorno de cada ferramenta diz ao modelo o que aconteceu de verdade.

import { tool, type ToolSet } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { displayNameForSamiQ, restaurarPiiDoCorretor, type MapaPiiCorretor } from "@/lib/samiq-governance";
import {
  INSTRUCAO_CLIENTE_AMBIGUO,
  avaliarDesambiguacao,
  candidatosParaPergunta,
  filtrarHomonimos,
  primeiroNomeNormalizado,
  type ClienteParaDesambiguar,
} from "@/lib/samiq-homonimos";
import { escapeLike } from "@/lib/validators";
import { filtroOrTelefone, sufixosTelefone } from "@/lib/lead-busca-telefone";
import {
  LEAD_STATUS_LABEL,
  MOTIVO_EM_ATENDIMENTO_CONSEQUENCIA,
  transicaoLeadPermitida,
  type LeadStatus,
} from "@/lib/leads";
import { agoraParaModelo, isoComFusoSP } from "@/lib/samiq-datas";
import type { CitarClienteSamiQ } from "@/lib/samiq-tools.server";
import { tabelaAnexosSamiQ } from "@/lib/samiq-anexos-tabela";
import {
  AgendarVisitaPayload,
  AnexarDocumentoPayload,
  AnotarPayload,
  AtualizarDocumentoPayload,
  AtualizarQualificacaoBase,
  CancelarTarefaPayload,
  CancelarVisitaPayload,
  ConcluirTarefaPayload,
  ConfirmarVisitaPayload,
  CriarLeadPayload,
  CriarTarefaPayload,
  DocumentosChecklistPayload,
  EnviarAnaliseCreditoPayload,
  FazerCheckinBase,
  MSG_CHECKIN_FILIAL,
  MSG_CREDITO,
  MSG_PERDA_OUTRO,
  MSG_QUALIFICACAO_VAZIA,
  MSG_TROCA,
  MSG_VENDA_PROJETO,
  MSG_VISITA_SEM_COMPARECIMENTO,
  MarcarPerdidoBase,
  MudarEtapaFerramentaBase,
  PedirLotePayload,
  PropostaPayloadSchema,
  ReagendarTarefaPayload,
  RegistrarContatoPayload,
  RegistrarResultadoCreditoBase,
  RegistrarRetornoPayload,
  RegistrarVendaBase,
  RegistrarVisitaBase,
  RemarcarVisitaPayload,
  TrocarVagaBase,
  checkinTemFilial,
  creditoCoerente,
  datasQueDevemSerFuturas,
  descreverProposta,
  leadIdDaProposta,
  nivelDaAcao,
  normalizarDatasDoPayload,
  perdaOutroTemDetalhe,
  qualificacaoTemCampo,
  trocaTemDados,
  vendaTemProjeto,
  visitaSemComparecimentoSemInteresse,
  type ModoEscritaSamiQ,
  type PropostaPayload,
  type SamiQPropostaTipo,
} from "@/lib/samiq-propostas";

type Db = SupabaseClient<Database>;

/** Ação montada no loop — ainda sem id (o banco dá ao persistir). */
export type PropostaColetada = {
  payload: PropostaPayload;
  leadId: string | null;
  leadNome: string | null;
};

/** Resposta do executor imediato (ações "direto" no WhatsApp). */
export type ResultadoImediato =
  | { ok: true; id: string; efeito: string | null; desfazivel: boolean }
  | { ok: false; erro: string };

export type ExecutorImediato = (c: PropostaColetada) => Promise<ResultadoImediato>;

export const SAMIQ_MAX_PROPOSTAS_POR_TURNO = 20;

const PROSPECCAO = new Set<string>([
  "novo",
  "aguardando_corretor",
  "aguardando_atendimento",
  "aguardando_retorno",
  "qualificacao_corretor",
  "qualificado",
]);

const FILIAIS_CONHECIDAS = ["barra-funda", "liberdade", "belem"];

// Descrições: são o MANUAL de cada ferramenta (só chegam ao modelo quando o
// grupo dela está aberto). Diretas e sem travessão.
const D = {
  registrar_contato:
    "Registra um contato feito com o cliente (ligação, WhatsApp, visita...) com o resultado, resumo, objeções e o próximo follow-up. É o MESMO registrar contato da tela: se o cliente respondeu (atendeu, interessado, pediu retorno) e estava em prospecção, ele entra em Em atendimento sozinho; se não atendeu e estava em Novo/Aguardando atendimento, vai para Aguardando retorno. Se o Em atendimento estiver lotado, o contato fica gravado e o retorno diz 'lotado': ofereça trocar_vaga.",
  anotar: "Grava uma anotação interna sobre o cliente (algo para lembrar).",
  criar_tarefa:
    "Cria uma tarefa ou lembrete com data e hora para o corretor (ligar, mandar WhatsApp, cobrar documento). Use para 'me lembra de...'. Tarefa aberta do mesmo cliente no mesmo horário (até 2 h) é reaproveitada.",
  atualizar_qualificacao:
    "Atualiza a ficha do cliente só com os campos informados: renda, entrada, FGTS (e saldo), tipo de renda, faixa (F1 a F4), temperatura, decisor, região (zona/bairro), dormitórios, vaga, prioridades, nota de perfil, empreendimento de interesse (de preferência pelo projetoId de catalogo_projetos), objeções, parecer.",
  agendar_visita:
    "Agenda uma visita (data e hora de SP, local) e move o cliente para Agendado. Precisa do CONFIRMAR do corretor. Só agenda para cliente em Em atendimento ou etapa posterior: se ele ainda está em prospecção, registre ANTES o contato em que ele topou a visita (não em paralelo). Lembre o corretor de pedir ao cliente que confirme data e horário.",
  mudar_etapa:
    "Move o cliente para Qualificação Corretor (única etapa sem formulário). Para as outras etapas use a ferramenta do desfecho: registrar_contato (Em atendimento é consequência), registrar_retorno, agendar_visita, registrar_visita, enviar_analise_credito, marcar_perdido. Precisa do CONFIRMAR.",
  registrar_retorno:
    "Desfecho 'pediu retorno' ou 'esfriou': registra o contato e leva o cliente para Aguardando retorno com a data combinada (vira tarefa). 'Esfriou' deixa o cliente frio. Retorno a mais de 30 dias vira perda 'retorno futuro' (menos lead próprio) e volta pela reativação. Precisa do CONFIRMAR.",
  marcar_perdido:
    "Marca o cliente como perdido com a categoria oficial. Atenção: igual à tela, o cliente SAI da carteira do corretor (vai para outro corretor ou para a base). Precisa do CONFIRMAR. Na dúvida entre perder e retorno, pergunte.",
  trocar_vaga:
    "Entra um, sai um, quando o Em atendimento está lotado: o cliente que respondeu entra e outro do Em atendimento sai como pediu retorno, esfriou (com data) ou perdido (com categoria). Use listar_clientes etapa em_atendimento ordem mais_parados para sugerir quem sai. Precisa do CONFIRMAR.",
  concluir_tarefa: "Marca uma tarefa como feita (id de minhas_tarefas ou detalhe_cliente), com o resultado.",
  reagendar_tarefa: "Muda a data e hora de uma tarefa aberta.",
  cancelar_tarefa: "Cancela uma tarefa aberta que não faz mais sentido.",
  confirmar_visita:
    "Marca a visita como confirmada pelo cliente (id de minha_agenda ou detalhe_cliente) e conclui a tarefa 'Confirmar visita'.",
  remarcar_visita:
    "Remarca uma visita para nova data e hora: cria a nova, marca a antiga como remarcada e agenda a confirmação na véspera.",
  cancelar_visita: "Cancela uma visita com o motivo. Precisa do CONFIRMAR.",
  registrar_visita:
    "Resultado da visita (igual ao Modo Visita): foi ou não foi, interesse, objeção principal, observações e a próxima etapa (visita realizada, aguardando retorno ou análise de crédito). Não compareceu exige data do próximo passo ou nova visita (reagendarPara). Precisa do CONFIRMAR.",
  documentos_checklist:
    "Monta o checklist de documentos do cliente pelo perfil de renda (CLT, autônomo, empresário, aposentado), casado, usa FGTS e declara IR. Só cria os itens que faltam.",
  atualizar_documento:
    "Muda o status de um documento do checklist (pendente, recebido, aprovado, reprovado). Com 3 documentos recebidos a pasta se monta e o cliente pode ir sozinho para Análise de crédito.",
  anexar_documento:
    "Anexa na ficha do cliente o arquivo que o corretor mandou no WhatsApp (anexoId do cabeçalho), no tipo de documento certo. Se não souber de quem é ou qual documento é, pergunte antes.",
  enviar_analise_credito:
    "Envia o cliente para análise de crédito (abre o registro da análise, nota na timeline, etapa Análise de crédito e tarefa de cobrança em 3 dias). Precisa do CONFIRMAR.",
  registrar_resultado_credito:
    "Registra o resultado da análise: aprovada, aprovada com condição ou reprovada, com os valores da carta (financiamento, parcela, prazo, taxa, FGTS, subsídio, validade). Não muda a etapa. Precisa do CONFIRMAR.",
  registrar_venda:
    "Registra a venda para aprovação da gestão (empreendimento, unidade, valor, data da assinatura, mês previsto de recebimento e marcos: contrato assinado, ato pago, apto para repasse). A comissão segue o tier do corretor. Precisa do CONFIRMAR.",
  fazer_checkin:
    "Check-in do dia: na filial (barra-funda, liberdade, belem; usa a localização que o corretor mandou no WhatsApp), em casa (só libera a roleta com o mínimo de vendas do mês anterior) ou sair (encerra a presença).",
  criar_lead:
    "Cadastra um cliente novo do corretor (captação própria, indicação, plantão...). Use o marcador [TELEFONE_n] da mensagem no campo telefone. Se o telefone já existir no CRM, não duplica e avisa. Precisa do CONFIRMAR.",
  pedir_lote:
    "Pede o lote de prospecção (até 30 leads da base) de uma zona. Só funciona com vaga na carteira e sem lote em andamento (veja minha_situacao). Precisa do CONFIRMAR.",
} satisfies Record<SamiQPropostaTipo, string>;

type LeadResolvido = {
  id: string;
  nome: string | null;
  status: string;
  corretorId: string | null;
  bruto: ClienteParaDesambiguar;
};

async function resolverLead(supabase: Db, leadId: string): Promise<LeadResolvido | null> {
  const { data, error } = await supabase
    .from("leads")
    .select("id, nome, status, corretor_id, projeto_nome, telefone, telefone_e164")
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    nome: displayNameForSamiQ(data.nome),
    status: data.status,
    corretorId: data.corretor_id ?? null,
    bruto: {
      id: data.id,
      nome: data.nome,
      projeto_nome: data.projeto_nome,
      status: data.status,
      telefone: data.telefone,
      telefone_e164: data.telefone_e164,
    },
  };
}

/**
 * Outros clientes da carteira (RLS do corretor) com o mesmo primeiro nome.
 * Falha de consulta devolve null: quem chama bloqueia, porque gravar no
 * cliente errado é pior do que perguntar.
 */
async function buscarHomonimos(
  supabase: Db,
  alvo: ClienteParaDesambiguar,
): Promise<ClienteParaDesambiguar[] | null> {
  const primeiro = primeiroNomeNormalizado(alvo.nome);
  if (!primeiro) return [];
  const original = (alvo.nome ?? "").trim().split(/\s+/)[0] ?? "";
  const { data, error } = await supabase
    .from("leads")
    .select("id, nome, status, projeto_nome, telefone, telefone_e164")
    .is("deleted_at", null)
    .eq("na_lixeira", false)
    .neq("id", alvo.id)
    .ilike("nome", `${escapeLike(original)}%`)
    .limit(30);
  if (error) return null;
  return filtrarHomonimos(alvo, (data ?? []) as ClienteParaDesambiguar[]);
}

function rotulo(s: string): string {
  return LEAD_STATUS_LABEL[s as LeadStatus] ?? s;
}

type Bloqueio = { erro: string; detalhe: string; [k: string]: unknown };

export function criarFerramentasDePropostaSamiQ(args: {
  supabase: Db;
  userId: string;
  coletor: PropostaColetada[];
  /** v8: "por_risco" (WhatsApp) executa as ações "direto" na hora; padrão confirmar tudo. */
  modo?: ModoEscritaSamiQ;
  executarAgora?: ExecutorImediato;
  /**
   * Texto CRU do corretor neste turno (e nos anteriores dele), usado só aqui
   * no servidor para a trava de homônimos. Nunca vai ao modelo.
   */
  textoDoCorretor?: string;
  /** Cliente já escolhido na tela (ex.: Sami aberta no dossiê): sem trava. */
  leadIdEmContexto?: string;
  /**
   * Candidatos da pergunta "qual Maria?" do turno anterior quando o corretor
   * respondeu escolhendo ("a 2", "a primeira"): a escolha veio dele.
   */
  liberados?: ReadonlySet<string>;
  /** Avisa quem chama dos candidatos da pergunta (vão para a memória da conversa). */
  aoAmbiguo?: (ids: string[]) => void;
  mapaPii?: MapaPiiCorretor;
  citar?: CitarClienteSamiQ;
  agora?: Date;
}): ToolSet {
  const { supabase, coletor } = args;
  const modo: ModoEscritaSamiQ = args.executarAgora ? (args.modo ?? "confirmar_tudo") : "confirmar_tudo";
  const textoDoCorretor = args.textoDoCorretor ?? "";
  const mapaPii = args.mapaPii ?? {};
  const citar: CitarClienteSamiQ = args.citar ?? (() => {});
  const agora = () => args.agora ?? new Date();
  let total = 0;
  const desambiguados = new Map<string, Bloqueio | null>();

  const travaDeHomonimos = async (lead: LeadResolvido): Promise<Bloqueio | null> => {
    if (args.leadIdEmContexto && args.leadIdEmContexto === lead.id) return null;
    if (args.liberados?.has(lead.id)) return null;
    if (desambiguados.has(lead.id)) return desambiguados.get(lead.id) ?? null;
    const homonimos = await buscarHomonimos(supabase, lead.bruto);
    let bloqueio: Bloqueio | null = null;
    if (homonimos === null) {
      bloqueio = {
        erro: "cliente_ambiguo",
        detalhe:
          "Não consegui confirmar se há outro cliente com esse nome. Confirme com o corretor o nome completo ou o empreendimento antes de gravar.",
      };
    } else {
      const r = avaliarDesambiguacao({ alvo: lead.bruto, homonimos, texto: textoDoCorretor });
      if (!r.ok) {
        const candidatos = candidatosParaPergunta([lead.bruto, ...homonimos], displayNameForSamiQ);
        args.aoAmbiguo?.(candidatos.map((c) => c.id));
        bloqueio = {
          erro: "cliente_ambiguo",
          detalhe: `${INSTRUCAO_CLIENTE_AMBIGUO} Numere a lista (1, 2, 3...) nessa ordem: o corretor pode responder só com o número.`,
          candidatos,
        };
      }
    }
    desambiguados.set(lead.id, bloqueio);
    return bloqueio;
  };

  /** Regras do funil e do dado que dá para checar sem gravar (sem RPC). */
  const checarRegras = async (
    payload: PropostaPayload,
    lead: LeadResolvido | null,
  ): Promise<{ payload: PropostaPayload; bloqueio?: Bloqueio; nomeAlvo?: string | null }> => {
    const status = lead?.status ?? "";
    switch (payload.tipo) {
      case "agendar_visita": {
        const fim = new Date(Date.parse(payload.inicioEm) + (payload.duracaoMin ?? 60) * 60_000);
        const { data: abertas } = await supabase
          .from("agendamentos")
          .select("id, data_inicio")
          .eq("lead_id", payload.leadId)
          .eq("tipo", "visita")
          .in("status", ["agendado", "confirmado"])
          .is("deleted_at", null)
          .gte("data_inicio", new Date(Date.parse(payload.inicioEm) - 2 * 3600_000).toISOString())
          .lte("data_inicio", fim.toISOString())
          .limit(1);
        if (abertas && abertas.length > 0) {
          return {
            payload,
            bloqueio: {
              erro: "visita_ja_marcada",
              detalhe: "Esse cliente já tem visita aberta nesse horário. Use remarcar_visita se mudou a hora.",
              agendamentoId: abertas[0].id,
            },
          };
        }
        if (payload.moverParaAgendado !== false && status !== "agendado") {
          if (!transicaoLeadPermitida(status, "agendado", false)) {
            return {
              payload,
              bloqueio: {
                erro: "etapa_nao_permite",
                detalhe: `O cliente está em ${rotulo(status)} e o funil não vai direto para Agendado. ${
                  PROSPECCAO.has(status)
                    ? "Registre primeiro o contato em que ele topou a visita (registrar_contato, resultado interessado ou atendeu): ele entra em Em atendimento e aí a visita pode ser agendada."
                    : "Agende sem mudar a etapa (moverParaAgendado false) ou fale com o gestor."
                }`,
              },
            };
          }
        }
        return { payload };
      }
      case "mudar_etapa": {
        if (status === "em_atendimento") {
          return {
            payload,
            bloqueio: {
              erro: "etapa_nao_permite",
              detalhe:
                "De Em atendimento o cliente sai por desfecho: agendou (agendar_visita), pediu retorno ou esfriou (registrar_retorno), mandou doc (enviar_analise_credito) ou perdido (marcar_perdido).",
            },
          };
        }
        if (!transicaoLeadPermitida(status, payload.novoStatus as LeadStatus, false)) {
          return {
            payload,
            bloqueio: {
              erro: "etapa_nao_permite",
              detalhe: `O funil não vai de ${rotulo(status)} para ${rotulo(payload.novoStatus)}.`,
            },
          };
        }
        return { payload };
      }
      case "registrar_retorno": {
        if (status === "aguardando_retorno") {
          return {
            payload,
            bloqueio: {
              erro: "ja_em_retorno",
              detalhe:
                "O cliente já está em Aguardando retorno. Para mudar a data, reagende a tarefa de retorno (reagendar_tarefa) ou crie outra (criar_tarefa).",
            },
          };
        }
        if (!PROSPECCAO.has(status) && !transicaoLeadPermitida(status, "aguardando_retorno", false)) {
          return {
            payload,
            bloqueio: {
              erro: "etapa_nao_permite",
              detalhe: `O cliente está em ${rotulo(status)}: o funil não leva para Aguardando retorno.`,
            },
          };
        }
        return { payload };
      }
      case "marcar_perdido": {
        if (["perdido", "contrato_fechado", "pos_venda"].includes(status)) {
          return {
            payload,
            bloqueio: { erro: "etapa_nao_permite", detalhe: `O cliente está em ${rotulo(status)}.` },
          };
        }
        return { payload };
      }
      case "trocar_vaga": {
        const sai = await resolverLead(supabase, payload.saiLeadId);
        if (!sai) {
          return { payload, bloqueio: { erro: "cliente_nao_encontrado", detalhe: "quem sai não está na carteira" } };
        }
        if (sai.status !== "em_atendimento") {
          return {
            payload,
            bloqueio: {
              erro: "troca_invalida",
              detalhe: `${sai.nome ?? "Quem sai"} está em ${rotulo(sai.status)}; quem sai precisa estar em Em atendimento.`,
            },
          };
        }
        if (status === "em_atendimento") {
          return { payload, bloqueio: { erro: "troca_invalida", detalhe: "quem entra já está em Em atendimento" } };
        }
        citar({ id: sai.id, nome: sai.nome, etapa: sai.status });
        return { payload };
      }
      case "registrar_visita": {
        const etapa = payload.proximaEtapa ?? (payload.compareceu ? "visita_realizada" : "aguardando_retorno");
        const deAgendado = transicaoLeadPermitida("agendado", etapa as LeadStatus, false);
        const direto = status === etapa || transicaoLeadPermitida(status, etapa as LeadStatus, false);
        const viaAgendado = status !== "agendado" && transicaoLeadPermitida(status, "agendado", false) && deAgendado;
        if (!direto && !viaAgendado) {
          return {
            payload,
            bloqueio: {
              erro: "etapa_nao_permite",
              detalhe: `O cliente está em ${rotulo(status)}: o funil não leva para ${rotulo(etapa)} depois da visita.${
                PROSPECCAO.has(status) ? " Registre antes o contato com ele." : ""
              }`,
            },
          };
        }
        if (!payload.compareceu && !payload.reagendarPara && !payload.proximoFollowupEm) {
          return {
            payload,
            bloqueio: {
              erro: "falta_data",
              detalhe: "Cliente não compareceu: informe a nova visita (reagendarPara) ou a data do próximo contato (proximoFollowupEm).",
            },
          };
        }
        return { payload };
      }
      case "enviar_analise_credito": {
        if (status !== "analise_credito" && !transicaoLeadPermitida(status, "analise_credito", false)) {
          return {
            payload,
            bloqueio: {
              erro: "etapa_nao_permite",
              detalhe: `O cliente está em ${rotulo(status)}: o funil não vai para Análise de crédito.${
                PROSPECCAO.has(status) && status !== "aguardando_retorno" && status !== "qualificacao_corretor"
                  ? " Registre antes o contato com ele."
                  : ""
              }`,
            },
          };
        }
        return { payload };
      }
      case "registrar_venda": {
        if (!lead?.corretorId) {
          return {
            payload,
            bloqueio: { erro: "lead_sem_corretor", detalhe: "Venda exige cliente com corretor responsável." },
          };
        }
        return { payload };
      }
      case "concluir_tarefa":
      case "reagendar_tarefa":
      case "cancelar_tarefa": {
        const { data: t } = await supabase
          .from("tarefas")
          .select("id, titulo, status, lead_id, lead:leads(id, nome)")
          .eq("id", payload.tarefaId)
          .is("deleted_at", null)
          .maybeSingle();
        if (!t) return { payload, bloqueio: { erro: "tarefa_nao_encontrada", detalhe: "use minhas_tarefas para achar o id" } };
        if (t.status === "concluida" || t.status === "cancelada") {
          return { payload, bloqueio: { erro: "tarefa_fechada", detalhe: `a tarefa já está ${t.status}` } };
        }
        const l = t.lead as { id: string; nome: string | null } | null;
        if (l) citar({ id: l.id, nome: l.nome });
        return { payload, nomeAlvo: l ? displayNameForSamiQ(l.nome) : null };
      }
      case "confirmar_visita":
      case "remarcar_visita":
      case "cancelar_visita": {
        const { data: a } = await supabase
          .from("agendamentos")
          .select("id, status, tipo, lead_id, lead:leads(id, nome, status)")
          .eq("id", payload.agendamentoId)
          .is("deleted_at", null)
          .maybeSingle();
        if (!a) return { payload, bloqueio: { erro: "visita_nao_encontrada", detalhe: "use minha_agenda para achar o id" } };
        if (!["agendado", "confirmado"].includes(a.status)) {
          return { payload, bloqueio: { erro: "visita_fechada", detalhe: `a visita está ${a.status}` } };
        }
        if (payload.tipo === "confirmar_visita" && a.status === "confirmado") {
          return { payload, bloqueio: { erro: "ja_confirmada", detalhe: "a visita já está confirmada" } };
        }
        const l = a.lead as { id: string; nome: string | null; status: string } | null;
        if (l) citar({ id: l.id, nome: l.nome, etapa: l.status });
        return { payload, nomeAlvo: l ? displayNameForSamiQ(l.nome) : null };
      }
      case "anexar_documento": {
        // RLS de samiq_anexos: o corretor só enxerga os próprios arquivos.
        const { data: row } = await tabelaAnexosSamiQ(supabase)
          .select("id, usado_em")
          .eq("id", payload.anexoId)
          .maybeSingle();
        if (!row) return { payload, bloqueio: { erro: "anexo_nao_encontrado", detalhe: "o arquivo não está mais disponível; peça para reenviar" } };
        if (row.usado_em) return { payload, bloqueio: { erro: "anexo_ja_usado", detalhe: "esse arquivo já foi anexado" } };
        return { payload };
      }
      case "fazer_checkin": {
        if (payload.modo === "loja" && payload.filial && !FILIAIS_CONHECIDAS.includes(payload.filial)) {
          return {
            payload,
            bloqueio: { erro: "filial_invalida", detalhe: `use uma destas: ${FILIAIS_CONHECIDAS.join(", ")}` },
          };
        }
        return { payload };
      }
      case "criar_lead": {
        const telefone = restaurarPiiDoCorretor(payload.telefone, mapaPii);
        const email = payload.email ? restaurarPiiDoCorretor(payload.email, mapaPii) : undefined;
        const sufixos = sufixosTelefone(telefone);
        if (sufixos.length === 0) {
          return {
            payload,
            bloqueio: { erro: "telefone_invalido", detalhe: "telefone com DDD é obrigatório (peça ao corretor)" },
          };
        }
        const { data: dup } = await supabase
          .from("leads")
          .select("id, nome, status")
          .is("deleted_at", null)
          .or(filtroOrTelefone(sufixos[0]))
          .limit(1);
        if (dup && dup.length > 0) {
          citar({ id: dup[0].id, nome: dup[0].nome, etapa: dup[0].status });
          return {
            payload,
            bloqueio: {
              erro: "cliente_ja_existe",
              detalhe: "Esse telefone já é de um cliente da carteira: use o cadastro existente.",
              cliente: { id: dup[0].id, nome: displayNameForSamiQ(dup[0].nome), etapa: dup[0].status },
            },
          };
        }
        return { payload: { ...payload, telefone, ...(email ? { email } : {}) }, nomeAlvo: displayNameForSamiQ(payload.nome) };
      }
      case "pedir_lote":
        return { payload, nomeAlvo: null };
      default:
        return { payload };
    }
  };

  const executar = async (bruto: PropostaPayload) => {
    if (total >= SAMIQ_MAX_PROPOSTAS_POR_TURNO) {
      return { erro: "limite_de_acoes", detalhe: `máximo de ${SAMIQ_MAX_PROPOSTAS_POR_TURNO} ações por resposta` };
    }
    // Datas sem fuso viram horário de SP antes de validar e gravar.
    const normalizado = normalizarDatasDoPayload(bruto as Record<string, unknown>, (v) => isoComFusoSP(v)) as PropostaPayload;
    const parsed = PropostaPayloadSchema.safeParse(normalizado);
    if (!parsed.success) {
      return { erro: "dados_invalidos", detalhe: parsed.error.issues.map((i) => i.message).join("; ").slice(0, 300) };
    }
    let payload = parsed.data;
    for (const d of datasQueDevemSerFuturas(payload)) {
      if (Date.parse(d.iso) < agora().getTime() - 5 * 60_000) {
        return {
          erro: "data_no_passado",
          detalhe: `${d.campo} ficou no passado. Agora é ${agoraParaModelo(agora())} (São Paulo). Refaça a data.`,
        };
      }
    }

    let lead: LeadResolvido | null = null;
    const leadId = leadIdDaProposta(payload);
    if (leadId) {
      lead = await resolverLead(supabase, leadId);
      if (!lead) {
        return {
          erro: "cliente_nao_encontrado",
          detalhe: "esse id não está na carteira do corretor; use buscar_clientes",
        };
      }
      const bloqueio = await travaDeHomonimos(lead);
      if (bloqueio) return bloqueio;
      citar({ id: lead.id, nome: lead.nome, etapa: lead.status });
      if (payload.tipo === "mudar_etapa" && lead.status === payload.novoStatus) {
        return { erro: "etapa_igual", detalhe: `o cliente já está em ${rotulo(lead.status)}` };
      }
    }

    const regras = await checarRegras(payload, lead);
    if (regras.bloqueio) return regras.bloqueio;
    payload = regras.payload;
    const leadNome = lead?.nome ?? regras.nomeAlvo ?? null;
    const coletada: PropostaColetada = { payload, leadId: lead?.id ?? null, leadNome };
    const descricao = descreverProposta(payload, leadNome);
    total += 1;

    if (nivelDaAcao(payload.tipo, modo) === "direto" && args.executarAgora) {
      const r = await args.executarAgora(coletada);
      if (!r.ok) {
        return {
          status: "falhou",
          proposta: descricao,
          erro: r.erro,
          aviso: "Nada foi gravado. Explique o motivo ao corretor em uma frase e diga o que fazer.",
        };
      }
      return {
        status: "gravado",
        proposta: descricao,
        efeito: r.efeito ?? undefined,
        desfazer: r.desfazivel ? "o corretor pode responder DESFAZER em até 24 h" : "não se desfaz pelo WhatsApp",
        aviso: "Já está no CRM. Não repita a lista: o sistema manda o recibo. Fale só o próximo passo.",
      };
    }

    coletor.push(coletada);
    return {
      status: "aguardando_confirmacao",
      posicao: coletor.length,
      proposta: descricao,
      aviso:
        "Nada foi gravado ainda: o corretor confirma (no WhatsApp respondendo CONFIRMAR; no painel pelo card). Não diga que registrou.",
    };
  };

  return {
    registrar_contato: tool({
      description: D.registrar_contato,
      inputSchema: RegistrarContatoPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "registrar_contato", ...input }),
    }),
    anotar: tool({
      description: D.anotar,
      inputSchema: AnotarPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "anotar", ...input }),
    }),
    criar_tarefa: tool({
      description: D.criar_tarefa,
      inputSchema: CriarTarefaPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "criar_tarefa", ...input }),
    }),
    atualizar_qualificacao: tool({
      description: D.atualizar_qualificacao,
      inputSchema: AtualizarQualificacaoBase.omit({ tipo: true }).refine(
        qualificacaoTemCampo,
        MSG_QUALIFICACAO_VAZIA,
      ),
      execute: (input) => executar({ tipo: "atualizar_qualificacao", ...input }),
    }),
    agendar_visita: tool({
      description: D.agendar_visita,
      inputSchema: AgendarVisitaPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "agendar_visita", ...input }),
    }),
    mudar_etapa: tool({
      description: D.mudar_etapa,
      inputSchema: MudarEtapaFerramentaBase.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "mudar_etapa", ...input }),
    }),
    registrar_retorno: tool({
      description: D.registrar_retorno,
      inputSchema: RegistrarRetornoPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "registrar_retorno", ...input }),
    }),
    marcar_perdido: tool({
      description: D.marcar_perdido,
      inputSchema: MarcarPerdidoBase.omit({ tipo: true }).refine(perdaOutroTemDetalhe, MSG_PERDA_OUTRO),
      execute: (input) => executar({ tipo: "marcar_perdido", ...input }),
    }),
    trocar_vaga: tool({
      description: D.trocar_vaga,
      inputSchema: TrocarVagaBase.omit({ tipo: true }).refine(trocaTemDados, MSG_TROCA),
      execute: (input) => executar({ tipo: "trocar_vaga", ...input }),
    }),
    concluir_tarefa: tool({
      description: D.concluir_tarefa,
      inputSchema: ConcluirTarefaPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "concluir_tarefa", ...input }),
    }),
    reagendar_tarefa: tool({
      description: D.reagendar_tarefa,
      inputSchema: ReagendarTarefaPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "reagendar_tarefa", ...input }),
    }),
    cancelar_tarefa: tool({
      description: D.cancelar_tarefa,
      inputSchema: CancelarTarefaPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "cancelar_tarefa", ...input }),
    }),
    confirmar_visita: tool({
      description: D.confirmar_visita,
      inputSchema: ConfirmarVisitaPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "confirmar_visita", ...input }),
    }),
    remarcar_visita: tool({
      description: D.remarcar_visita,
      inputSchema: RemarcarVisitaPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "remarcar_visita", ...input }),
    }),
    cancelar_visita: tool({
      description: D.cancelar_visita,
      inputSchema: CancelarVisitaPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "cancelar_visita", ...input }),
    }),
    registrar_visita: tool({
      description: D.registrar_visita,
      inputSchema: RegistrarVisitaBase.omit({ tipo: true }).refine(
        visitaSemComparecimentoSemInteresse,
        MSG_VISITA_SEM_COMPARECIMENTO,
      ),
      execute: (input) => executar({ tipo: "registrar_visita", ...input }),
    }),
    documentos_checklist: tool({
      description: D.documentos_checklist,
      inputSchema: DocumentosChecklistPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "documentos_checklist", ...input }),
    }),
    atualizar_documento: tool({
      description: D.atualizar_documento,
      inputSchema: AtualizarDocumentoPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "atualizar_documento", ...input }),
    }),
    anexar_documento: tool({
      description: D.anexar_documento,
      inputSchema: AnexarDocumentoPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "anexar_documento", ...input }),
    }),
    enviar_analise_credito: tool({
      description: D.enviar_analise_credito,
      inputSchema: EnviarAnaliseCreditoPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "enviar_analise_credito", ...input }),
    }),
    registrar_resultado_credito: tool({
      description: D.registrar_resultado_credito,
      inputSchema: RegistrarResultadoCreditoBase.omit({ tipo: true }).refine(creditoCoerente, MSG_CREDITO),
      execute: (input) => executar({ tipo: "registrar_resultado_credito", ...input }),
    }),
    registrar_venda: tool({
      description: D.registrar_venda,
      inputSchema: RegistrarVendaBase.omit({ tipo: true }).refine(vendaTemProjeto, MSG_VENDA_PROJETO),
      execute: (input) => executar({ tipo: "registrar_venda", ...input }),
    }),
    fazer_checkin: tool({
      description: D.fazer_checkin,
      inputSchema: FazerCheckinBase.omit({ tipo: true }).refine(checkinTemFilial, MSG_CHECKIN_FILIAL),
      execute: (input) => executar({ tipo: "fazer_checkin", ...input }),
    }),
    criar_lead: tool({
      description: D.criar_lead,
      inputSchema: CriarLeadPayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "criar_lead", ...input }),
    }),
    pedir_lote: tool({
      description: D.pedir_lote,
      inputSchema: PedirLotePayload.omit({ tipo: true }),
      execute: (input) => executar({ tipo: "pedir_lote", ...input }),
    }),
  };
}

/** Exportado para testes e para o texto do prompt: em atendimento é consequência. */
export const SAMIQ_REGRA_EM_ATENDIMENTO = MOTIVO_EM_ATENDIMENTO_CONSEQUENCIA;
