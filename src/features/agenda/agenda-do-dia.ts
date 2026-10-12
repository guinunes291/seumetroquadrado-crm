// Regras PURAS da "agenda do dia" que mora no hub /inicio — sem React nem
// Supabase de propósito: classificação por recorte, quais ações cada
// compromisso aceita, mensagem de confirmação e payloads de escrita são
// funções testáveis (tests/agenda-do-dia.test.ts).
//
// Por que existe (auditoria ux-ia-2026-08, fase 4): "confirmar a visita" era
// INEXISTENTE para o corretor e "agendar" custava 5 toques. Aqui o corretor
// vê o dia já na primeira tela após o login e resolve confirmar / validar /
// remarcar sem trocar de aba. A validação continua sendo POR AGENDAMENTO (a
// métrica cai no dia da visita, não no dia do registro) e reusa a mesma RPC
// do Modo Visita — duas portas, uma história no banco.

import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Database } from "@/integrations/supabase/types";
import type { InteresseVisita, ObjecaoVisita } from "@/features/visitas/resultado-visita";
import { STATUS_LABEL, TIPO_LABEL, type Agendamento } from "./types";

/** Lead embutido no agendamento (join `lead:leads(...)`). null = compromisso sem lead. */
export type LeadDaAgenda = {
  id: string;
  nome: string;
  telefone: string | null;
  projeto_nome?: string | null;
} | null;

/** Recorte de colunas que a agenda do dia carrega — o suficiente para agir. */
export type ItemAgendaDia = Pick<
  Agendamento,
  | "id"
  | "lead_id"
  | "corretor_id"
  | "tipo"
  | "status"
  | "titulo"
  | "descricao"
  | "local"
  | "data_inicio"
  | "data_fim"
  | "lembrete_minutos"
> & { lead: LeadDaAgenda };

/** Visita de até 7 dias atrás que passou sem validação continua alcançável —
 *  mesma janela do Modo Visita (visita que some é visita fora do relatório). */
export const JANELA_PENDENCIAS_DIAS = 7;

const HORA_MS = 60 * 60 * 1000;

function inicioDoDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function somarDias(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Intervalo da query: de (hoje − 7 dias) 00:00 até amanhã 23:59:59.999, no
 *  fuso LOCAL do aparelho (toISOString direto viraria o dia às 21h). */
export function janelaDaAgenda(agora: Date = new Date()): { inicio: Date; fim: Date } {
  const inicio = inicioDoDia(somarDias(agora, -JANELA_PENDENCIAS_DIAS));
  const fim = new Date(inicioDoDia(somarDias(agora, 2)).getTime() - 1);
  return { inicio, fim };
}

/** Compromisso ainda aberto (nem validado, nem cancelado, nem remarcado). */
export function estaAberto(item: Pick<ItemAgendaDia, "status">): boolean {
  return item.status === "agendado" || item.status === "confirmado";
}

/** Visita com lead cujo horário já acabou e que segue sem desfecho: enquanto
 *  não for validada, não entra no relatório de visitas. */
export function aguardaValidacao(
  item: Pick<ItemAgendaDia, "tipo" | "lead_id" | "status" | "data_fim">,
  agora: Date = new Date(),
): boolean {
  return (
    item.tipo === "visita" &&
    !!item.lead_id &&
    estaAberto(item) &&
    Date.parse(item.data_fim) < agora.getTime()
  );
}

export type AgendaClassificada = {
  /** Visitas de dias ANTERIORES que passaram sem validação (janela de 7 dias). */
  pendentes: ItemAgendaDia[];
  /** Tudo de hoje, exceto cancelados — concluídos ficam, em tom apagado. */
  hoje: ItemAgendaDia[];
  /** Prévia de amanhã, para confirmar D-1 sem esperar a tarefa lembrar. */
  amanha: ItemAgendaDia[];
};

const porInicio = (a: ItemAgendaDia, b: ItemAgendaDia) =>
  Date.parse(a.data_inicio) - Date.parse(b.data_inicio);

export function classificarAgenda(
  itens: ItemAgendaDia[],
  agora: Date = new Date(),
): AgendaClassificada {
  const hojeIni = inicioDoDia(agora).getTime();
  const amanhaIni = somarDias(inicioDoDia(agora), 1).getTime();
  const depoisIni = somarDias(inicioDoDia(agora), 2).getTime();

  const pendentes: ItemAgendaDia[] = [];
  const hoje: ItemAgendaDia[] = [];
  const amanha: ItemAgendaDia[] = [];

  for (const item of itens) {
    if (item.status === "cancelado") continue;
    const ini = Date.parse(item.data_inicio);
    if (Number.isNaN(ini)) continue;
    if (ini >= hojeIni && ini < amanhaIni) hoje.push(item);
    else if (ini >= amanhaIni && ini < depoisIni) amanha.push(item);
    else if (ini < hojeIni && aguardaValidacao(item, agora)) pendentes.push(item);
  }

  return {
    pendentes: pendentes.sort(porInicio),
    hoje: hoje.sort(porInicio),
    amanha: amanha.sort(porInicio),
  };
}

export type AcaoAgenda = "confirmar" | "validar" | "remarcar";

/** Tipos em que "confirmar com o cliente" faz sentido (cliente presente). */
const TIPOS_COM_CLIENTE: ReadonlyArray<ItemAgendaDia["tipo"]> = ["visita", "reuniao"];

/**
 * Ações que a linha oferece, por estado — a UI não decide regra:
 * - confirmar: agendado, com lead, com cliente presente e ainda no futuro;
 * - validar (realizada / não compareceu): visita com lead que já começou;
 * - remarcar: qualquer compromisso ainda aberto.
 */
export function acoesDisponiveis(
  item: Pick<ItemAgendaDia, "status" | "lead_id" | "tipo" | "data_inicio">,
  agora: Date = new Date(),
): AcaoAgenda[] {
  if (!estaAberto(item)) return [];
  const out: AcaoAgenda[] = [];
  const iniciou = Date.parse(item.data_inicio) <= agora.getTime();
  if (
    item.status === "agendado" &&
    !!item.lead_id &&
    TIPOS_COM_CLIENTE.includes(item.tipo) &&
    !iniciou
  ) {
    out.push("confirmar");
  }
  if (item.tipo === "visita" && !!item.lead_id && iniciou) out.push("validar");
  out.push("remarcar");
  return out;
}

/** "hoje" | "amanhã" | "na sexta-feira (06/09)" — para a mensagem ao cliente. */
export function rotuloDoDia(iso: string, agora: Date = new Date()): string {
  const d = new Date(iso);
  if (isSameDay(d, agora)) return "hoje";
  if (isSameDay(d, somarDias(agora, 1))) return "amanhã";
  const semana = format(d, "EEEE", { locale: ptBR });
  const artigo = /^(s[aá]bado|domingo)$/i.test(semana) ? "no" : "na";
  return `${artigo} ${semana} (${format(d, "dd/MM")})`;
}

export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] || "";
}

/**
 * Mensagem de confirmação pronta para o WhatsApp — mesma voz do script
 * "confirmar_visita" do Atendimento, com dia, hora e local do compromisso.
 * Sempre revisável antes de enviar.
 */
export function mensagemConfirmacao(item: ItemAgendaDia, agora: Date = new Date()): string {
  const nome = primeiroNome(item.lead?.nome);
  const saudacao = nome ? `Oi, ${nome}!` : "Oi, tudo bem?";
  const oque = item.tipo === "reuniao" ? "nossa reunião" : "nossa visita";
  const quando = rotuloDoDia(item.data_inicio, agora);
  const hora = format(new Date(item.data_inicio), "HH:mm");
  const local = item.local?.trim() ? ` (${item.local.trim()})` : "";
  return `${saudacao} Passando para confirmar ${oque} ${quando} às ${hora}${local} — posso contar com você? Qualquer imprevisto, me avisa que a gente reagenda.`;
}

// ---------------------------------------------------------------------------
// Remarcar: o compromisso atual vira "remarcado" e nasce um novo, com a
// mesma duração, lead, local e título — o histórico preserva o horário
// original (é ele que explica "cliente remarcou 3 vezes").
// ---------------------------------------------------------------------------

export type AgendamentoInsert = Database["public"]["Tables"]["agendamentos"]["Insert"];

export function validarRemarcacao(novoInicio: Date, agora: Date = new Date()): string | null {
  if (Number.isNaN(novoInicio.getTime())) return "Informe o novo dia e horário.";
  if (novoInicio.getTime() <= agora.getTime()) return "O novo horário precisa ser no futuro.";
  return null;
}

export function remarcarPayload(
  item: ItemAgendaDia,
  novoInicio: Date,
  criadoPorId: string,
): AgendamentoInsert {
  const duracao = Date.parse(item.data_fim) - Date.parse(item.data_inicio);
  const dur = Number.isFinite(duracao) && duracao > 0 ? duracao : HORA_MS;
  return {
    lead_id: item.lead_id,
    corretor_id: item.corretor_id,
    criado_por_id: criadoPorId,
    tipo: item.tipo,
    status: "agendado",
    titulo: item.titulo,
    descricao: item.descricao,
    local: item.local,
    data_inicio: novoInicio.toISOString(),
    data_fim: new Date(novoInicio.getTime() + dur).toISOString(),
    timezone: "America/Sao_Paulo",
    lembrete_minutos: item.lembrete_minutos ?? 30,
  };
}

// ---------------------------------------------------------------------------
// Validar a visita (mini-registro): as mesmas regras da RPC salvar_modo_visita
// checadas antes de chamar o banco, para o erro aparecer no campo certo.
// ---------------------------------------------------------------------------

export type ProximaEtapaVisita = "visita_realizada" | "aguardando_retorno";

export type RegistroVisita = {
  compareceu: boolean;
  interesse: InteresseVisita | "";
  objecao: ObjecaoVisita | "";
  proximaEtapa: ProximaEtapaVisita;
  /** datetime-local (ou ISO). Obrigatório em "aguardando retorno" e no no-show. */
  proximoFollowup: string;
  /** datetime-local (ou ISO). Opcional: novo horário criado na mesma transação. */
  reagendarPara: string;
  observacoes: string;
};

export function registroVisitaInicial(agora: Date = new Date()): RegistroVisita {
  return {
    compareceu: true,
    interesse: "",
    objecao: "",
    proximaEtapa: "visita_realizada",
    proximoFollowup: sugestaoProximoContato(agora),
    reagendarPara: "",
    observacoes: "",
  };
}

/** Amanhã às 10h, no formato do <input type="datetime-local">. */
export function sugestaoProximoContato(agora: Date = new Date()): string {
  const d = somarDias(inicioDoDia(agora), 1);
  d.setHours(10, 0, 0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

export type ErroRegistroVisita = Partial<Record<keyof RegistroVisita, string>>;

/** Sem comparecimento a etapa é sempre "aguardando retorno" (regra da RPC). */
export function etapaEfetiva(r: Pick<RegistroVisita, "compareceu" | "proximaEtapa">) {
  return r.compareceu ? r.proximaEtapa : ("aguardando_retorno" as const);
}

export function validarRegistroVisita(
  r: RegistroVisita,
  agora: Date = new Date(),
): ErroRegistroVisita {
  const erros: ErroRegistroVisita = {};
  if (r.compareceu && !r.interesse) erros.interesse = "Diga como o cliente saiu da visita.";
  if (r.observacoes.length > 5000) erros.observacoes = "No máximo 5.000 caracteres.";

  const exigeFollowup = etapaEfetiva(r) === "aguardando_retorno";
  if (exigeFollowup) {
    const f = Date.parse(r.proximoFollowup);
    if (!r.proximoFollowup || Number.isNaN(f) || f <= agora.getTime()) {
      erros.proximoFollowup = "Escolha uma data futura para o próximo contato.";
    }
  }
  if (r.reagendarPara) {
    const q = Date.parse(r.reagendarPara);
    if (Number.isNaN(q) || q <= agora.getTime()) {
      erros.reagendarPara = "O reagendamento precisa ser no futuro.";
    }
  }
  return erros;
}

export type SalvarVisitaArgs = Database["public"]["Functions"]["salvar_modo_visita"]["Args"];

const toIso = (local: string) => (local ? new Date(local).toISOString() : undefined);

/** Payload da RPC salvar_modo_visita (p_concluir = true), a partir do
 *  mini-registro. Só campos válidos pela regra do banco entram. */
export function payloadSalvarVisita(item: ItemAgendaDia, r: RegistroVisita): SalvarVisitaArgs {
  const etapa = etapaEfetiva(r);
  const proximaAcao = r.compareceu
    ? "Pós-visita: definir o próximo passo com o cliente"
    : "Retomar contato e remarcar a visita";
  return {
    p_agendamento_id: item.id,
    p_checklist: {},
    p_concluir: true,
    p_compareceu: r.compareceu,
    p_interesse: r.compareceu && r.interesse ? r.interesse : undefined,
    p_objecao_principal: r.compareceu && r.objecao ? r.objecao : undefined,
    p_proxima_etapa: etapa,
    p_proxima_acao: proximaAcao,
    p_proximo_followup: toIso(r.proximoFollowup),
    p_reagendar_para: toIso(r.reagendarPara),
    p_observacoes: r.observacoes.trim() || undefined,
  };
}

// ---------------------------------------------------------------------------
// Resumo do cabeçalho: responde "o que me espera" em uma frase.
// ---------------------------------------------------------------------------

export type ResumoDoDia = {
  total: number;
  semConfirmacao: number;
  paraValidar: number;
  concluidos: number;
};

export function resumoDoDia(cls: AgendaClassificada, agora: Date = new Date()): ResumoDoDia {
  const semConfirmacao = cls.hoje.filter((i) =>
    acoesDisponiveis(i, agora).includes("confirmar"),
  ).length;
  const paraValidar =
    cls.pendentes.length + cls.hoje.filter((i) => aguardaValidacao(i, agora)).length;
  const concluidos = cls.hoje.filter(
    (i) => i.status === "realizado" || i.status === "nao_compareceu",
  ).length;
  return { total: cls.hoje.length, semConfirmacao, paraValidar, concluidos };
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

export function fraseResumo(r: ResumoDoDia): string {
  if (r.total === 0 && r.paraValidar === 0) return "Sem compromissos hoje.";
  const partes: string[] = [];
  if (r.total > 0) partes.push(`${plural(r.total, "compromisso", "compromissos")} hoje`);
  if (r.semConfirmacao > 0) partes.push(`${r.semConfirmacao} sem confirmação`);
  if (r.paraValidar > 0) partes.push(`${plural(r.paraValidar, "visita", "visitas")} para validar`);
  return `${partes.join(" · ")}.`;
}

export function tipoLabel(tipo: string): string {
  return TIPO_LABEL[tipo] ?? tipo;
}

/**
 * Mensagem do botão WhatsApp da linha, pelo momento do compromisso:
 * a confirmar → pede confirmação; confirmado e ainda por começar hoje →
 * "estou a caminho"; nos demais casos, só a saudação (o corretor escreve).
 */
export function mensagemContato(item: ItemAgendaDia, agora: Date = new Date()): string {
  if (acoesDisponiveis(item, agora).includes("confirmar")) return mensagemConfirmacao(item, agora);
  const nome = primeiroNome(item.lead?.nome);
  const saudacao = nome ? `Oi, ${nome}!` : "Oi, tudo bem?";
  const inicio = new Date(item.data_inicio);
  if (item.status === "confirmado" && isSameDay(inicio, agora) && inicio > agora) {
    const oque = item.tipo === "reuniao" ? "da nossa reunião" : "da nossa visita";
    return `${saudacao} Estou a caminho ${oque} — te vejo às ${format(inicio, "HH:mm")}.`;
  }
  return saudacao;
}

// ---------------------------------------------------------------------------
// Escopo: de quem é a agenda que o hub mostra. Mesma regra da Central de
// Comando: admin e superintendente veem a operação inteira, gestor vê
// a própria equipe (e a si), corretor vê só a própria. Um admin sem
// compromisso no próprio nome via "sem compromissos hoje" com o calendário
// cheio — a agenda da gestão é a da operação, não a pessoal.
// ---------------------------------------------------------------------------

export type TipoEscopoAgenda = "minha" | "equipe" | "operacao";

export type EscopoAgenda = {
  tipo: TipoEscopoAgenda;
  /** null = sem filtro de corretor (toda a operação); array = restringe. */
  ids: string[] | null;
};

export function escopoDaAgenda(p: {
  userId: string;
  isAdmin: boolean;
  isSuperintendente: boolean;
  isGestor: boolean;
  /** Corretores da equipe do gestor (pode incluir ou não o próprio gestor). */
  equipeIds?: string[] | null;
}): EscopoAgenda {
  if (p.isAdmin || p.isSuperintendente) return { tipo: "operacao", ids: null };
  if (p.isGestor) {
    return { tipo: "equipe", ids: Array.from(new Set([p.userId, ...(p.equipeIds ?? [])])) };
  }
  return { tipo: "minha", ids: [p.userId] };
}

export function tituloDoEscopo(tipo: TipoEscopoAgenda): string {
  if (tipo === "operacao") return "Agenda da operação";
  if (tipo === "equipe") return "Agenda da equipe";
  return "Seu dia";
}

export function vazioDoEscopo(tipo: TipoEscopoAgenda): string {
  if (tipo === "operacao") return "Nenhum compromisso na operação hoje.";
  if (tipo === "equipe") return "Nenhum compromisso da equipe hoje.";
  return "Sem compromissos hoje. Que tal encaixar uma visita?";
}

/** Listas secundárias (pendências e amanhã) cortam aqui; o resto vai para a
 *  agenda completa. Na operação inteira a prévia de amanhã passa de 10 linhas. */
export const LIMITE_LISTA_SECUNDARIA = 10;

// ---------------------------------------------------------------------------
// A Agenda no padrão Lançamento (2026-10): o cartão "Hoje" mostra o estado de
// cada compromisso e UMA ação visível; a grade e a lista usam o mesmo estado.
// Só leitura do que acoesDisponiveis/aguardaValidacao já decidem — nenhuma
// regra nova.
// ---------------------------------------------------------------------------

type CompromissoBase = Pick<
  ItemAgendaDia,
  "status" | "lead_id" | "tipo" | "data_inicio" | "data_fim"
>;

export type IntentDoEstado = "success" | "warning" | "neutral";

/**
 * "confirmada" / "sem confirmação" / "validar" — a mesma régua da lateral da
 * Fila (AgendaDeHoje). Agendado sem nada a cobrar não ganha selo; encerrados
 * (realizado, não compareceu, remarcado, cancelado) ficam em cinza.
 */
export function estadoDoCompromisso(
  item: CompromissoBase,
  agora: Date = new Date(),
): { rotulo: string; intent: IntentDoEstado } | null {
  if (item.status === "agendado") {
    if (aguardaValidacao(item, agora)) return { rotulo: "validar", intent: "warning" };
    if (acoesDisponiveis(item, agora).includes("confirmar")) {
      return { rotulo: "sem confirmação", intent: "warning" };
    }
    return null;
  }
  if (item.status === "confirmado") return { rotulo: "confirmada", intent: "success" };
  return { rotulo: (STATUS_LABEL[item.status] ?? item.status).toLowerCase(), intent: "neutral" };
}

export type AcaoPrincipal = "validar" | "confirmar" | "ligar" | "remarcar";

/**
 * A ação visível da linha (as outras moram no "…"): validar a visita que já
 * começou → confirmar a que ainda vai acontecer → ligar, quando o compromisso
 * É uma ligação → remarcar o que segue aberto. Encerrado não tem ação.
 */
export function acaoPrincipal(item: ItemAgendaDia, agora: Date = new Date()): AcaoPrincipal | null {
  const acoes = acoesDisponiveis(item, agora);
  if (acoes.includes("validar")) return "validar";
  if (acoes.includes("confirmar")) return "confirmar";
  if (item.tipo === "ligacao" && estaAberto(item) && !!item.lead?.telefone) return "ligar";
  if (acoes.includes("remarcar")) return "remarcar";
  return null;
}

/** O ponto do compromisso na grade e na legenda: a validar acende; encerrado
 *  fica cinza; visita em navy; os demais tipos em neutro. */
export type PontoDoCompromisso = "validar" | "encerrado" | "visita" | "outro";

export function pontoDoCompromisso(
  item: CompromissoBase,
  agora: Date = new Date(),
): PontoDoCompromisso {
  if (aguardaValidacao(item, agora)) return "validar";
  if (!estaAberto(item)) return "encerrado";
  return item.tipo === "visita" ? "visita" : "outro";
}

/** O recorte do filtro "Corretor" da gestão aplicado ao dia (pendentes, hoje,
 *  amanhã) — o mesmo filtro que a grade usa, só que no cliente. */
export function recortarPorCorretor(
  cls: AgendaClassificada,
  corretorId: string | null,
): AgendaClassificada {
  if (!corretorId) return cls;
  const doCorretor = (i: ItemAgendaDia) => i.corretor_id === corretorId;
  return {
    pendentes: cls.pendentes.filter(doCorretor),
    hoje: cls.hoje.filter(doCorretor),
    amanha: cls.amanha.filter(doCorretor),
  };
}

/** "há 40 min" | "há 1 h 40" | "há 3 h" — quanto tempo a visita passou sem desfecho. */
export function passouHa(iso: string, agora: Date = new Date()): string {
  const min = Math.max(0, Math.floor((agora.getTime() - Date.parse(iso)) / 60_000));
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto === 0 ? `há ${h} h` : `há ${h} h ${String(resto).padStart(2, "0")}`;
}

/** "Carlos Mendes" → "Carlos M." — o rótulo que cabe numa célula da grade. */
export function nomeCurto(nome: string | null | undefined): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes[0]} ${partes[partes.length - 1][0]}.`;
}
