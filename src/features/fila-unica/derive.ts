// Fila Única — lógica PURA que funde as fontes de "o que eu faço agora" numa
// lista só, deduplicada e ordenada. Fatia 1 (leitura): nenhuma fonte nova, só
// as que já existem no CRM — a inbox de Atender (atendimento_inbox_v4), a fila
// da régua de follow-up (followup_fila_v1) e o guardrail "sem próxima ação"
// (leads_sem_acao). Cada lead entra em UM balde, o mais urgente, e a tela
// nunca duplica gente.
//
// Ordem dos baldes (decisão de 12/09/2026, medida no banco: a passagem "em
// atendimento → agendado" está em 7% contra meta de 70%, e 124 dos 134 leads
// em análise de crédito estão parados numa etapa que converte 39%):
//   1. sla        — lead novo na mesa; o SLA do 1º contato está correndo e,
//                   estourado, o lead vai para o próximo da roleta
//   2. fundo      — agendado / visita realizada / análise de crédito parados:
//                   é onde o dinheiro está, ordenado por dias sem movimento
//   3. responder  — o cliente falou por último
//   4. followup   — toque da régua vencido ou de hoje
//   5. sem_acao   — lead ativo sem tarefa, sem agendamento, sem follow-up
//   6. esfriando  — quente/morno sem contato há 3+ dias
//   7. docs       — pasta travada fora do fundo do funil
// Dentro do balde: fundo por dias parado (desc), follow-up por vencimento
// (desc), os demais pelo Score de prioridade (lib/priority). O teto de itens
// exibidos (40) é o tamanho de dia de um corretor — a "carteira ativa" como
// regra de banco fica para a Fatia 2.

import { diasDesde, scoreLead, type ScoreTier } from "@/lib/priority";
import { PROXIMA_ACAO } from "@/lib/leads";
import { formatRelativeTime } from "@/lib/interacoes";
import type { AtendimentoLead, QueueItem, QueueKey } from "@/features/atendimento/derive";
import type { AtendimentoInbox } from "@/features/atendimento/inbox";
import { motivoDoToque } from "@/features/atendimento/fila-regua";
import type { FilaFollowUp, FilaItem } from "@/features/followup/fila-client";

export type FilaBucket =
  | "sla"
  | "fundo"
  | "responder"
  | "followup"
  | "sem_acao"
  | "esfriando"
  | "docs";

export const BUCKET_ORDER: FilaBucket[] = [
  "sla",
  "fundo",
  "responder",
  "followup",
  "sem_acao",
  "esfriando",
  "docs",
];

export const BUCKET_LABEL: Record<FilaBucket, string> = {
  sla: "Chegaram agora",
  fundo: "Fundo do funil parado",
  responder: "Cliente respondeu e espera",
  followup: "Follow-up vencido ou de hoje",
  sem_acao: "Sem próximo passo",
  esfriando: "Esfriando",
  docs: "Pasta travada",
};

export const BUCKET_HINT: Record<FilaBucket, string> = {
  sla: "o SLA do primeiro contato está correndo — estourou, o lead vai para o próximo",
  fundo: "agendado, visita e análise de crédito parados — converte 39% e é onde o dinheiro está",
  responder: "o cliente falou por último — cada minuto conta",
  followup: "você combinou de voltar — o prazo passou ou é hoje",
  sem_acao: "nenhuma tarefa, agendamento ou follow-up aberto — defina o próximo passo agora",
  esfriando: "quentes e mornos sem contato há 3+ dias",
  docs: "pasta parada por documento pendente ou reprovado",
};

/** Etapas do fundo do funil: parado aqui custa mais que lead novo frio. */
export const ETAPAS_FUNDO = ["agendado", "visita_realizada", "proposta_enviada", "analise_credito"];

const ETAPAS_ENCERRADAS = ["perdido", "contrato_fechado", "pos_venda"];

export const LIMITE_FILA = 40;

export type FilaLead = AtendimentoLead & {
  /** Texto livre do próximo passo (leads.proxima_acao) — só a régua o traz. */
  proxima_acao?: string | null;
};

/** Linha da RPC leads_sem_acao (mesmo shape que a home consome). */
export type SemAcaoRow = {
  id: string;
  nome: string;
  telefone: string | null;
  status: string;
  temperatura: string | null;
  proximo_followup: string | null;
  ultima_interacao: string | null;
  projeto_nome?: string | null;
  corretor_id?: string | null;
  created_at?: string | null;
};

export type FilaFonte = "inbox" | "regua" | "sem_acao";

export type FilaUnicaItem = {
  lead: FilaLead;
  bucket: FilaBucket;
  fonte: FilaFonte;
  /** Fila da inbox de onde o item veio (dá o script certo do WhatsApp). */
  filaInbox: QueueKey | null;
  motivo: string;
  score: number;
  tier: ScoreTier;
  /** Dias sem movimento (última interação, ou chegada do lead). */
  diasParado: number | null;
  /** Próximo passo combinado: texto livre do lead, senão a ação sugerida pela etapa. */
  proximoPasso: string | null;
  /** Prazo do próximo passo (ISO), quando existe. */
  prazo: string | null;
  /** Minutos além do prazo (0 = dentro do prazo ou sem prazo). */
  vencidoMin: number;
  /** true quando o prazo cai hoje e ainda não venceu. */
  venceHoje: boolean;
  docsPendentes: number;
  agendamentoId: string | null;
  visitaEm: string | null;
};

export type FilaUnica = {
  /** Itens já ordenados, deduplicados e cortados no teto. */
  itens: FilaUnicaItem[];
  /** Total antes do corte — o que a fila inteira pede. */
  total: number;
  porBucket: Record<FilaBucket, number>;
  resumo: {
    vencidos: number;
    hoje: number;
    semProximoPasso: number;
    slaCorrendo: number;
    fundoParado: number;
  };
};

const FUSO = "America/Sao_Paulo";

function diaEm(iso: string, agora: Date): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO });
  return fmt.format(new Date(t)) === fmt.format(agora);
}

function minutosVencidos(iso: string | null | undefined, agora: Date): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((agora.getTime() - t) / 60_000));
}

function proximoPassoDe(lead: FilaLead): string | null {
  const livre = lead.proxima_acao?.trim();
  if (livre) return livre;
  return PROXIMA_ACAO[lead.status as keyof typeof PROXIMA_ACAO]?.label ?? null;
}

function baseDoItem(
  lead: FilaLead,
  agora: Date,
  extra: Partial<Pick<FilaUnicaItem, "score" | "tier">> = {},
): Omit<FilaUnicaItem, "bucket" | "fonte" | "filaInbox" | "motivo" | "docsPendentes"> & {
  docsPendentes: number;
} {
  const r =
    extra.score !== undefined && extra.tier !== undefined
      ? { score: extra.score, tier: extra.tier }
      : scoreLead({
          temperatura: lead.temperatura,
          status: lead.status,
          ultimaInteracao: lead.ultima_interacao,
          agora,
        });
  const prazo = lead.proximo_followup ?? null;
  const vencidoMin = minutosVencidos(prazo, agora);
  return {
    lead,
    score: r.score,
    tier: r.tier,
    diasParado: diasDesde(lead.ultima_interacao ?? lead.created_at, agora),
    proximoPasso: proximoPassoDe(lead),
    prazo,
    vencidoMin,
    venceHoje: !!prazo && vencidoMin === 0 && diaEm(prazo, agora),
    docsPendentes: 0,
    agendamentoId: null,
    visitaEm: null,
  };
}

const ehFundo = (status: string) => ETAPAS_FUNDO.includes(status);

/** Fila da inbox → balde da Fila Única. O fundo do funil vence qualquer fila
 *  da inbox que não seja o SLA do 1º contato nem "responder": um lead em
 *  análise que está esfriando é dinheiro parado, não "esfriando". */
function bucketDaInbox(fila: QueueKey, lead: AtendimentoLead): FilaBucket {
  if (fila === "novos") return "sla";
  if (fila === "responder") return "responder";
  if (fila === "confirmar_visita") return "fundo";
  if (ehFundo(lead.status)) return "fundo";
  if (fila === "followups") return "followup";
  if (fila === "esfriando") return "esfriando";
  return "docs";
}

function itemDaInbox(fila: QueueKey, q: QueueItem, agora: Date): FilaUnicaItem {
  const base = baseDoItem(q.lead, agora, { score: q.score, tier: q.tier });
  return {
    ...base,
    bucket: bucketDaInbox(fila, q.lead),
    fonte: "inbox",
    filaInbox: fila,
    motivo: q.motivo,
    docsPendentes: q.docsPendentes,
    agendamentoId: q.agendamentoId ?? null,
    visitaEm: q.visitaEm ?? null,
  };
}

function itemDaRegua(f: FilaItem, agora: Date): FilaUnicaItem {
  const lead: FilaLead = {
    id: f.id,
    nome: f.nome,
    telefone: f.telefone,
    email: f.email,
    status: f.status,
    temperatura: f.temperatura,
    ultima_interacao: f.ultima_interacao,
    proximo_followup: f.proximo_followup,
    projeto_nome: f.projeto_nome,
    created_at: f.created_at,
    corretor_id: f.corretor_id,
    origem: f.origem,
    renda_informada: f.renda_informada,
    entrada_disponivel: f.entrada_disponivel,
    usa_fgts: f.usa_fgts,
    proxima_acao: f.proxima_acao,
  };
  const base = baseDoItem(lead, agora);
  return {
    ...base,
    bucket: ehFundo(f.status) ? "fundo" : "followup",
    fonte: "regua",
    filaInbox: "followups",
    motivo: motivoDoToque(f),
    // A régua é a fonte de verdade do vencimento do toque — o espelho
    // proximo_followup pode estar defasado.
    vencidoMin: f.minutos_vencido,
    venceHoje: f.minutos_vencido === 0,
  };
}

function itemSemAcao(r: SemAcaoRow, agora: Date): FilaUnicaItem {
  const lead: FilaLead = {
    id: r.id,
    nome: r.nome,
    telefone: r.telefone ?? "",
    email: null,
    status: r.status,
    temperatura: r.temperatura,
    ultima_interacao: r.ultima_interacao,
    proximo_followup: r.proximo_followup,
    projeto_nome: r.projeto_nome ?? null,
    created_at: r.created_at ?? r.ultima_interacao ?? agora.toISOString(),
    corretor_id: r.corretor_id ?? null,
    origem: "",
    renda_informada: null,
    entrada_disponivel: null,
    usa_fgts: null,
  };
  const base = baseDoItem(lead, agora);
  const desde = r.ultima_interacao
    ? `sem movimento ${formatRelativeTime(r.ultima_interacao, agora)}`
    : "sem contato registrado";
  return {
    ...base,
    bucket: ehFundo(r.status) ? "fundo" : "sem_acao",
    fonte: "sem_acao",
    filaInbox: null,
    motivo: `sem próximo passo definido · ${desde}`,
    // Sem próxima ação = sem prazo por definição; o espelho não vale aqui.
    proximoPasso: null,
    prazo: null,
    vencidoMin: 0,
    venceHoje: false,
  };
}

const rank = (b: FilaBucket) => BUCKET_ORDER.indexOf(b);

function compararNoBalde(a: FilaUnicaItem, b: FilaUnicaItem): number {
  if (a.bucket === "fundo") {
    const d = (b.diasParado ?? -1) - (a.diasParado ?? -1);
    if (d !== 0) return d;
  }
  if (a.bucket === "followup") {
    const d = b.vencidoMin - a.vencidoMin;
    if (d !== 0) return d;
  }
  if (a.bucket === "sla") {
    // Quem chegou primeiro está mais perto de estourar o SLA.
    const d = Date.parse(a.lead.created_at) - Date.parse(b.lead.created_at);
    if (!Number.isNaN(d) && d !== 0) return d;
  }
  const s = b.score - a.score;
  if (s !== 0) return s;
  return a.lead.nome.localeCompare(b.lead.nome, "pt-BR");
}

export function buildFilaUnica(input: {
  inbox: AtendimentoInbox | null;
  regua: FilaFollowUp | null;
  semAcao: SemAcaoRow[];
  agora?: Date;
  limite?: number;
}): FilaUnica {
  const agora = input.agora ?? new Date();
  const limite = input.limite ?? LIMITE_FILA;

  const candidatos: FilaUnicaItem[] = [];

  if (input.inbox) {
    for (const fila of Object.keys(input.inbox.filas) as QueueKey[]) {
      // Com a régua disponível, a fila "followups" da inbox é ignorada —
      // fonte única com o hub Follow-Up (mesma regra de aplicarFilaRegua).
      if (fila === "followups" && input.regua) continue;
      for (const q of input.inbox.filas[fila]) candidatos.push(itemDaInbox(fila, q, agora));
    }
  }
  if (input.regua) {
    for (const f of input.regua.itens) candidatos.push(itemDaRegua(f, agora));
  }
  for (const r of input.semAcao) candidatos.push(itemSemAcao(r, agora));

  // Dedup: um lead, um balde — o mais urgente vence; empate fica com a
  // primeira fonte (a inbox, cujas contagens vêm do banco).
  const porLead = new Map<string, FilaUnicaItem>();
  for (const c of candidatos) {
    if (ETAPAS_ENCERRADAS.includes(c.lead.status)) continue;
    const atual = porLead.get(c.lead.id);
    if (!atual || rank(c.bucket) < rank(atual.bucket)) porLead.set(c.lead.id, c);
  }

  const todos = Array.from(porLead.values()).sort((a, b) => {
    const r = rank(a.bucket) - rank(b.bucket);
    return r !== 0 ? r : compararNoBalde(a, b);
  });

  const porBucket = Object.fromEntries(BUCKET_ORDER.map((b) => [b, 0])) as Record<
    FilaBucket,
    number
  >;
  for (const i of todos) porBucket[i.bucket] += 1;

  return {
    itens: todos.slice(0, limite),
    total: todos.length,
    porBucket,
    resumo: {
      vencidos: todos.filter((i) => i.vencidoMin > 0).length,
      hoje: todos.filter((i) => i.venceHoje).length,
      semProximoPasso: porBucket.sem_acao,
      // O SLA conta a carteira inteira (contagem do banco), não só os cards.
      slaCorrendo: input.inbox?.counts.novos ?? porBucket.sla,
      fundoParado: porBucket.fundo,
    },
  };
}

/** Fila da inbox equivalente ao balde — dá o script certo de WhatsApp
 *  (scriptParaFila) sem inventar texto novo. */
export function filaParaScript(item: FilaUnicaItem): QueueKey {
  if (item.filaInbox) return item.filaInbox;
  switch (item.bucket) {
    case "sla":
      return "novos";
    case "responder":
      return "responder";
    case "followup":
      return "followups";
    case "docs":
      return "docs";
    case "fundo":
      return item.agendamentoId
        ? "confirmar_visita"
        : item.docsPendentes > 0
          ? "docs"
          : "followups";
    default:
      return "esfriando";
  }
}
