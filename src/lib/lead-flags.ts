// Flags visuais de um lead na lista/tabela/kanban/modo foco — lógica PURA e
// testável. Cada flag mapeia para um Intent do design system; a UI decide o
// formato (chip, borda de linha, pulso). Regras documentadas por flag.
//
// RÉGUA ÚNICA (docs/revisao-pagina-leads.md §4.5): estes limiares são a única
// fonte de verdade de "lead esfriando" no cliente. Antes havia três réguas
// divergentes (flags 5d/10d, InatividadeBadge 2d/5d, kanban 2d/5d) exibidas
// lado a lado; agora badge, chips e kanban derivam daqui, e o chip carrega os
// dias exatos ("Parado · 12d") — um sinal só por linha.

import type { Intent } from "@/lib/status-tones";

export type LeadFlag =
  | "novo"
  | "quente"
  | "atrasado"
  | "followup_vencido"
  | "followup_hoje"
  | "sem_contato"
  | "com_visita"
  | "em_risco"
  | "parado";

export type LeadFlagInput = {
  status: string;
  temperatura: string | null;
  created_at: string;
  ultima_interacao: string | null;
  tem_followup?: boolean;
  /** Só na RPC v3: data do próximo follow-up aberto (espelho de tarefas). */
  proximo_followup?: string | null;
};

/** Limiares da régua única de esfriamento (em dias, salvo indicação). */
export const LIMIARES = {
  /** Lead aguardando atendimento é "novo" por até 24h; depois vira "atrasado". */
  NOVO_HORAS: 24,
  /** Quente sem interação há N dias = "em risco" (dinheiro esfriando). */
  EM_RISCO_DIAS: 3,
  /** A partir daqui a inatividade aparece em tom de atenção (badge/kanban). */
  ATENCAO_DIAS: 2,
  /** Sem interação há N dias em status ativo = chip "Sem contato". */
  SEM_CONTATO_DIAS: 5,
  /** Sem interação há N dias = chip "Parado" (absorve "Sem contato"). */
  PARADO_DIAS: 10,
} as const;

export const FLAG_META: Record<LeadFlag, { label: string; intent: Intent }> = {
  novo: { label: "Novo", intent: "info" },
  quente: { label: "Quente", intent: "danger" },
  atrasado: { label: "Atrasado", intent: "danger" },
  followup_vencido: { label: "Follow-up vencido", intent: "danger" },
  followup_hoje: { label: "Follow-up hoje", intent: "warning" },
  sem_contato: { label: "Sem contato", intent: "warning" },
  em_risco: { label: "Em risco", intent: "danger" },
  parado: { label: "Parado", intent: "warning" },
  com_visita: { label: "Visita marcada", intent: "success" },
};

const DIA = 86_400_000;
const FINALIZADOS = new Set(["contrato_fechado", "pos_venda", "perdido"]);

/**
 * Dias inteiros desde a última interação (ou desde a criação, se nunca houve
 * contato). Compartilhado por chips, badge e kanban — a mesma conta em todo
 * lugar. Retorna null só se nem created_at existir.
 */
export function diasSemContato(
  lead: Pick<LeadFlagInput, "ultima_interacao" | "created_at">,
  now: Date = new Date(),
): number | null {
  const ref = lead.ultima_interacao ?? lead.created_at;
  if (!ref) return null;
  const t = new Date(ref).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / DIA));
}

export type LeadFlagDetalhada = { flag: LeadFlag; label: string };

/**
 * Deriva as flags de um lead COM o rótulo final (dias embutidos onde fizer
 * sentido). Ordem de retorno = ordem de exibição.
 *
 * Regras:
 *  - novo:             criado há < 24h, ainda aguardando primeiro atendimento
 *  - atrasado:         aguardando primeiro atendimento há 24h+ (fila estourada)
 *  - followup_vencido: follow-up aberto com data no passado (status ativo)
 *  - quente:           temperatura quente (funil ativo)
 *  - em_risco:         quente E sem interação há 3d+ (dinheiro esfriando)
 *  - followup_hoje:    follow-up aberto para hoje, ainda não vencido
 *  - com_visita:       status agendado (tem compromisso à frente)
 *  - parado:           sem interação há 10d+ em status ativo (absorve sem_contato)
 *  - sem_contato:      sem interação há 5d+ em status ativo
 */
export function leadFlagsDetalhadas(
  lead: LeadFlagInput,
  opts: { now?: Date } = {},
): LeadFlagDetalhada[] {
  const nowDate = opts.now ?? new Date();
  const now = nowDate.getTime();
  const out: LeadFlagDetalhada[] = [];
  const push = (flag: LeadFlag, label?: string) =>
    out.push({ flag, label: label ?? FLAG_META[flag].label });

  const criadoHa = now - new Date(lead.created_at).getTime();
  const ui = lead.ultima_interacao ? new Date(lead.ultima_interacao).getTime() : null;
  const semInteracaoHa = ui == null ? Infinity : now - ui;
  const ativo = !FINALIZADOS.has(lead.status);
  const aguardando = lead.status === "aguardando_atendimento";
  const quente = lead.temperatura === "quente";

  // Follow-up: usa o espelho proximo_followup (RPC v3); sem ele, sem chip —
  // o booleano tem_followup não diz SE está vencido, então não vira sinal.
  const fu = lead.proximo_followup ? new Date(lead.proximo_followup) : null;
  const fuValido = fu != null && !Number.isNaN(fu.getTime());
  const fuVencido = fuValido && fu.getTime() < now;
  const fuHoje =
    fuValido &&
    !fuVencido &&
    fu.getFullYear() === nowDate.getFullYear() &&
    fu.getMonth() === nowDate.getMonth() &&
    fu.getDate() === nowDate.getDate();

  if (aguardando && criadoHa < LIMIARES.NOVO_HORAS * 3_600_000) push("novo");
  if (aguardando && criadoHa >= LIMIARES.NOVO_HORAS * 3_600_000) push("atrasado");
  if (ativo && fuVencido) push("followup_vencido");
  if (quente && ativo) push("quente");
  if (quente && ativo && semInteracaoHa >= LIMIARES.EM_RISCO_DIAS * DIA) push("em_risco");
  if (ativo && fuHoje) push("followup_hoje");
  if (lead.status === "agendado") push("com_visita");
  if (ativo && !aguardando) {
    const dias = ui == null ? diasSemContato(lead, nowDate) : Math.floor(semInteracaoHa / DIA);
    const sufixo = dias != null && Number.isFinite(dias) ? ` · ${dias}d` : "";
    if (semInteracaoHa >= LIMIARES.PARADO_DIAS * DIA) {
      push("parado", `${FLAG_META.parado.label}${sufixo}`);
    } else if (semInteracaoHa >= LIMIARES.SEM_CONTATO_DIAS * DIA) {
      push("sem_contato", `${FLAG_META.sem_contato.label}${sufixo}`);
    }
  }

  return out;
}

/** Só as flags, na ordem de exibição — para quem não precisa dos rótulos. */
export function leadFlags(lead: LeadFlagInput, opts: { now?: Date } = {}): LeadFlag[] {
  return leadFlagsDetalhadas(lead, opts).map((f) => f.flag);
}

/** Intent dominante (para borda/realce da linha): pior flag vence. */
export function leadRowIntent(flags: LeadFlag[]): Intent | null {
  if (
    flags.includes("em_risco") ||
    flags.includes("atrasado") ||
    flags.includes("followup_vencido")
  )
    return "danger";
  if (flags.includes("quente")) return "danger";
  if (flags.includes("parado") || flags.includes("sem_contato") || flags.includes("followup_hoje"))
    return "warning";
  if (flags.includes("novo")) return "info";
  if (flags.includes("com_visita")) return "success";
  return null;
}
