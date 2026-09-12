// Fila Única — lógica PURA que funde as fontes de "o que eu faço agora" numa
// lista só, deduplicada e ordenada. Fatia 1 (leitura): nenhuma fonte nova, só
// as que já existem no CRM — a inbox de Atender (atendimento_inbox_v4), a fila
// da régua de follow-up (followup_fila_v1) e o guardrail "sem próxima ação"
// (leads_sem_acao). Cada lead entra em UM balde, o mais urgente, e a tela
// nunca duplica gente.
//
// Ordem dos baldes (mockup aprovado em 12/09/2026, medido no banco: a passagem
// "em atendimento → agendado" está em 7% contra meta de 70%, e 124 dos 134
// leads em análise de crédito estão parados numa etapa que converte 39%):
//   1. fundo      — agendado / visita realizada / análise de crédito parados:
//                   é onde o dinheiro está, ordenado por dias sem movimento —
//                   "um lead em análise parado há 66 dias vale mais do que
//                   200 leads frios novos", por isso vem antes de tudo
//   2. sla        — lead novo na mesa; o SLA do 1º contato está correndo e,
//                   estourado, o lead vai para o próximo da roleta
//   3. responder  — o cliente falou por último
//   4. followup   — toque da régua vencido ou de hoje
//   5. sem_acao   — lead ativo sem tarefa, sem agendamento, sem follow-up
//   6. esfriando  — quente/morno sem contato há 3+ dias
//   7. docs       — pasta travada fora do fundo do funil
// A precedência vale para QUALQUER fonte: um lead da régua que respondeu vai
// para "responder"; um lead de leads_sem_acao em aguardando_atendimento vai
// para "sla". Dentro do balde: fundo por dias sem movimento (desc, sem data =
// mais parado), follow-up por vencimento (desc) e prazo (asc), os demais pelo
// Score de prioridade (lib/priority). O teto de itens exibidos (40) é o
// tamanho de dia de um corretor — a "carteira ativa" como regra de banco
// fica para a Fatia 2.
//
// O relógio "dias sem movimento" é o mesmo da Higiene do Funil:
// GREATEST(ultima_interacao, ultimo_contato), com created_at de fallback. As
// fontes não trazem ultimo_contato nem (no caso de leads_sem_acao) created_at,
// projeto e corretor — o hook enriquece por id (`extras`) e esta função nunca
// inventa data: sem data conhecida, diasParado é null.

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
  "fundo",
  "sla",
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
/** Lead ainda sem primeiro atendimento — espelha ETAPAS_PRIMEIRO_CONTATO de Atender. */
const ETAPAS_PRIMEIRO_CONTATO = ["novo", "aguardando_atendimento"];

export const LIMITE_FILA = 40;

export type FilaLead = AtendimentoLead & {
  /** Texto livre do próximo passo (leads.proxima_acao) — só a régua o traz. */
  proxima_acao?: string | null;
  /** Os fatos do Resumo (vêm do enriquecimento por id). */
  faixa_mcmv?: string | null;
  decisor?: string | null;
  tipo_renda?: string | null;
};

/** Linha da RPC leads_sem_acao (7 colunas — não traz created_at, projeto nem
 *  corretor; ver `extras`). */
export type SemAcaoRow = {
  id: string;
  nome: string;
  telefone: string | null;
  status: string;
  temperatura: string | null;
  proximo_followup: string | null;
  ultima_interacao: string | null;
};

/** Campos que as fontes não trazem e o hook busca por id em `leads`. */
export type LeadExtras = {
  created_at?: string | null;
  ultimo_contato?: string | null;
  projeto_nome?: string | null;
  corretor_id?: string | null;
  faixa_mcmv?: string | null;
  decisor?: string | null;
  tipo_renda?: string | null;
  /** Preço "a partir de" do projeto de interesse (VGV estimado do lead). */
  valor_projeto?: number | null;
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
  /** Dias sem movimento (GREATEST de última interação e último contato, ou
   *  chegada do lead). null = nenhuma data conhecida. */
  diasParado: number | null;
  /** Próximo passo combinado: texto livre do lead, senão a ação sugerida pela etapa. */
  proximoPasso: string | null;
  /** Prazo do próximo passo (ISO), quando existe. */
  prazo: string | null;
  /** Minutos além do prazo (0 = dentro do prazo ou sem prazo). */
  vencidoMin: number;
  /** true quando há prazo, ele cai hoje e ainda não venceu. */
  venceHoje: boolean;
  docsPendentes: number;
  agendamentoId: string | null;
  visitaEm: string | null;
  /** Dinheiro em jogo: o VGV estimado pelo preço de tabela do projeto de
   *  interesse (a convenção `valor_potencial` das métricas). null sem projeto
   *  ou com preço sob consulta — nunca um chute. */
  valorEmJogo: number | null;
};

export type FilaUnica = {
  /** Itens já ordenados, deduplicados e cortados no teto. */
  itens: FilaUnicaItem[];
  /** Total de candidatos distintos recebidos das fontes, antes do teto. */
  total: number;
  porBucket: Record<FilaBucket, number>;
  resumo: {
    vencidos: number;
    hoje: number;
    semProximoPasso: number;
    slaCorrendo: number;
    fundoParado: number;
    /** Leads que a inbox conta nas filas dela mas não mandou como card (a RPC
     *  corta em _limit_per_queue). A fila não os vê — a tela precisa dizer. */
    ocultosInbox: number;
    /** Soma do VGV estimado dos leads na fila (os cards do dia). */
    emJogo: number;
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

function maisRecente(...isos: (string | null | undefined)[]): string | null {
  let melhor: string | null = null;
  let melhorT = -Infinity;
  for (const iso of isos) {
    if (!iso) continue;
    const t = Date.parse(iso);
    if (!Number.isNaN(t) && t > melhorT) {
      melhorT = t;
      melhor = iso;
    }
  }
  return melhor;
}

/** Relógio da Higiene do Funil: o toque mais recente, senão a chegada. */
function diasSemMovimento(lead: FilaLead, extra: LeadExtras | undefined, agora: Date) {
  const ult = maisRecente(lead.ultima_interacao, extra?.ultimo_contato);
  const base = ult ?? maisRecente(extra?.created_at, lead.created_at);
  return base ? diasDesde(base, agora) : null;
}

function proximoPassoDe(lead: FilaLead): string | null {
  const livre = lead.proxima_acao?.trim();
  if (livre) return livre;
  return PROXIMA_ACAO[lead.status as keyof typeof PROXIMA_ACAO]?.label ?? null;
}

const ehFundo = (status: string) => ETAPAS_FUNDO.includes(status);
const ehPrimeiroContato = (status: string) => ETAPAS_PRIMEIRO_CONTATO.includes(status);

function aplicarExtras(lead: FilaLead, extra: LeadExtras | undefined): FilaLead {
  if (!extra) return lead;
  return {
    ...lead,
    created_at: lead.created_at || extra.created_at || "",
    projeto_nome: lead.projeto_nome ?? extra.projeto_nome ?? null,
    corretor_id: lead.corretor_id ?? extra.corretor_id ?? null,
    faixa_mcmv: lead.faixa_mcmv ?? extra.faixa_mcmv ?? null,
    decisor: lead.decisor ?? extra.decisor ?? null,
    tipo_renda: lead.tipo_renda ?? extra.tipo_renda ?? null,
  };
}

type Base = Omit<FilaUnicaItem, "bucket" | "fonte" | "filaInbox" | "motivo">;

function baseDoItem(
  leadBruto: FilaLead,
  extra: LeadExtras | undefined,
  agora: Date,
  score?: { score: number; tier: ScoreTier },
): Base {
  const lead = aplicarExtras(leadBruto, extra);
  const r =
    score ??
    scoreLead({
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
    diasParado: diasSemMovimento(lead, extra, agora),
    proximoPasso: proximoPassoDe(lead),
    prazo,
    vencidoMin,
    venceHoje: !!prazo && vencidoMin === 0 && diaEm(prazo, agora),
    docsPendentes: 0,
    agendamentoId: null,
    visitaEm: null,
    valorEmJogo: extra?.valor_projeto ?? null,
  };
}

function motivoChegada(lead: FilaLead, agora: Date): string {
  return lead.created_at
    ? `chegou ${formatRelativeTime(lead.created_at, agora)} e aguarda o primeiro contato`
    : "aguarda o primeiro contato";
}

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

function itemDaInbox(
  fila: QueueKey,
  q: QueueItem,
  extra: LeadExtras | undefined,
  agora: Date,
): FilaUnicaItem {
  const base = baseDoItem(q.lead, extra, agora, { score: q.score, tier: q.tier });
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

/** A fila da régua traz TODO lead ativo sem toque agendado (venc NULL) além
 *  dos toques de hoje e vencidos. Sem prazo, o lead não "vence hoje" — ele
 *  está sem próximo passo, e é assim que entra aqui. */
function itemDaRegua(f: FilaItem, extra: LeadExtras | undefined, agora: Date): FilaUnicaItem {
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
  const base = baseDoItem(lead, extra, agora);
  const comum = { ...base, fonte: "regua" as const, filaInbox: "followups" as const };

  if (ehPrimeiroContato(f.status)) {
    return { ...comum, bucket: "sla", filaInbox: "novos", motivo: motivoChegada(base.lead, agora) };
  }
  if (f.respondeu) {
    return {
      ...comum,
      bucket: "responder",
      filaInbox: "responder",
      motivo: "respondeu e aguarda o seu retorno",
    };
  }
  if (f.proximo_followup === null) {
    return {
      ...comum,
      bucket: ehFundo(f.status) ? "fundo" : "sem_acao",
      filaInbox: null,
      motivo: `sem próximo passo definido · toque ${f.tentativas + 1} da régua ainda não agendado`,
      prazo: null,
      vencidoMin: 0,
      venceHoje: false,
    };
  }
  return {
    ...comum,
    bucket: ehFundo(f.status) ? "fundo" : "followup",
    motivo: motivoDoToque(f),
    // A régua é a fonte de verdade do vencimento do toque; o toque de hoje
    // (minutos_vencido 0) é, por construção da RPC, de hoje.
    vencidoMin: f.minutos_vencido,
    venceHoje: f.minutos_vencido === 0,
  };
}

function itemSemAcao(r: SemAcaoRow, extra: LeadExtras | undefined, agora: Date): FilaUnicaItem {
  const lead: FilaLead = {
    id: r.id,
    nome: r.nome,
    telefone: r.telefone ?? "",
    email: null,
    status: r.status,
    temperatura: r.temperatura,
    ultima_interacao: r.ultima_interacao,
    proximo_followup: r.proximo_followup,
    projeto_nome: null,
    // Sem created_at na RPC: fica vazio até o hook enriquecer — nunca "agora".
    created_at: "",
    corretor_id: null,
    origem: "",
    renda_informada: null,
    entrada_disponivel: null,
    usa_fgts: null,
  };
  const base = baseDoItem(lead, extra, agora);
  if (ehPrimeiroContato(r.status)) {
    return {
      ...base,
      bucket: "sla",
      fonte: "sem_acao",
      filaInbox: "novos",
      motivo: motivoChegada(base.lead, agora),
    };
  }
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

const temTexto = (s: string | null | undefined) => !!s?.trim();

/** Empate no mesmo balde: a primeira fonte fica com o card (inbox, cujas
 *  contagens vêm do banco), mas o que só a outra fonte sabe não se perde — o
 *  texto livre do próximo passo, o projeto, a visita a confirmar, a pasta. Se
 *  a outra é a régua com toque marcado, o vencimento é dela: a RPC é a fonte
 *  de verdade de "quanto venceu". */
function fundirEmpate(vencedor: FilaUnicaItem, outro: FilaUnicaItem): FilaUnicaItem {
  const proximaAcao = temTexto(vencedor.lead.proxima_acao)
    ? vencedor.lead.proxima_acao
    : temTexto(outro.lead.proxima_acao)
      ? outro.lead.proxima_acao
      : (vencedor.lead.proxima_acao ?? outro.lead.proxima_acao ?? null);
  const proximoPasso = temTexto(vencedor.lead.proxima_acao)
    ? vencedor.proximoPasso
    : temTexto(outro.lead.proxima_acao)
      ? outro.proximoPasso
      : (vencedor.proximoPasso ?? outro.proximoPasso);
  const vencimentoDaRegua = outro.fonte === "regua" && outro.prazo !== null;
  return {
    ...vencedor,
    lead: {
      ...vencedor.lead,
      proxima_acao: proximaAcao,
      projeto_nome: vencedor.lead.projeto_nome ?? outro.lead.projeto_nome ?? null,
      corretor_id: vencedor.lead.corretor_id ?? outro.lead.corretor_id ?? null,
    },
    proximoPasso,
    prazo: vencimentoDaRegua ? outro.prazo : vencedor.prazo,
    vencidoMin: vencimentoDaRegua ? outro.vencidoMin : vencedor.vencidoMin,
    venceHoje: vencimentoDaRegua ? outro.venceHoje : vencedor.venceHoje,
    docsPendentes: Math.max(vencedor.docsPendentes, outro.docsPendentes),
    agendamentoId: vencedor.agendamentoId ?? outro.agendamentoId,
    visitaEm: vencedor.visitaEm ?? outro.visitaEm,
    valorEmJogo: vencedor.valorEmJogo ?? outro.valorEmJogo,
  };
}

function tempo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

function compararNoBalde(a: FilaUnicaItem, b: FilaUnicaItem): number {
  if (a.bucket === "fundo") {
    // Sem data conhecida = o mais negligenciado (espelha o NULLS FIRST da RPC).
    const da = a.diasParado ?? Infinity;
    const db = b.diasParado ?? Infinity;
    if (da !== db) return da === Infinity ? -1 : db === Infinity ? 1 : db - da;
  }
  if (a.bucket === "followup") {
    const d = b.vencidoMin - a.vencidoMin;
    if (d !== 0) return d;
    // Mesma ordem do hub: prazo mais cedo primeiro, depois quem chegou antes.
    const pa = tempo(a.prazo);
    const pb = tempo(b.prazo);
    if (pa !== null && pb !== null && pa !== pb) return pa - pb;
    const ca = tempo(a.lead.created_at);
    const cb = tempo(b.lead.created_at);
    if (ca !== null && cb !== null && ca !== cb) return ca - cb;
  }
  const s = b.score - a.score;
  if (s !== 0) return s;
  return a.lead.nome.localeCompare(b.lead.nome, "pt-BR");
}

export function buildFilaUnica(input: {
  inbox: AtendimentoInbox | null;
  regua: FilaFollowUp | null;
  semAcao: SemAcaoRow[];
  extras?: Map<string, LeadExtras>;
  agora?: Date;
  limite?: number;
}): FilaUnica {
  const agora = input.agora ?? new Date();
  const limite = input.limite ?? LIMITE_FILA;
  const extras = input.extras ?? new Map<string, LeadExtras>();

  const candidatos: FilaUnicaItem[] = [];
  let ocultosInbox = 0;

  if (input.inbox) {
    for (const fila of Object.keys(input.inbox.filas) as QueueKey[]) {
      // Com a régua disponível, a fila "followups" da inbox é ignorada —
      // fonte única com o hub Follow-Up (mesma regra de aplicarFilaRegua).
      if (fila === "followups" && input.regua) continue;
      const itens = input.inbox.filas[fila];
      ocultosInbox += Math.max(0, input.inbox.counts[fila] - itens.length);
      for (const q of itens) candidatos.push(itemDaInbox(fila, q, extras.get(q.lead.id), agora));
    }
  }
  if (input.regua) {
    for (const f of input.regua.itens) candidatos.push(itemDaRegua(f, extras.get(f.id), agora));
  }
  for (const r of input.semAcao) candidatos.push(itemSemAcao(r, extras.get(r.id), agora));

  // Dedup: um lead, um balde — o mais urgente vence; empate fica com a
  // primeira fonte (a inbox, cujas contagens vêm do banco), completada com o
  // que só a outra fonte trouxe.
  const porLead = new Map<string, FilaUnicaItem>();
  for (const c of candidatos) {
    if (ETAPAS_ENCERRADAS.includes(c.lead.status)) continue;
    const atual = porLead.get(c.lead.id);
    if (!atual || rank(c.bucket) < rank(atual.bucket)) porLead.set(c.lead.id, c);
    else if (rank(c.bucket) === rank(atual.bucket)) porLead.set(c.lead.id, fundirEmpate(atual, c));
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
  const itens = todos.slice(0, limite);

  return {
    itens,
    total: todos.length,
    porBucket,
    resumo: {
      vencidos: todos.filter((i) => i.vencidoMin > 0).length,
      hoje: todos.filter((i) => i.venceHoje && i.prazo !== null).length,
      semProximoPasso: porBucket.sem_acao,
      // O SLA conta a carteira inteira (contagem do banco), não só os cards.
      slaCorrendo: input.inbox?.counts.novos ?? porBucket.sla,
      fundoParado: porBucket.fundo,
      ocultosInbox,
      emJogo: itens.reduce((s, i) => s + (i.valorEmJogo ?? 0), 0),
    },
  };
}

/** "R$ 250 mil" / "R$ 1,2 mi" — o dinheiro em jogo no espaço de um número. */
export function formatarEmJogo(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: n >= 1_000_000 ? 1 : 0,
  }).format(n);
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
