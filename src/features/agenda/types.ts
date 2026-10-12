// Vocabulário da Agenda — tipo/status do agendamento com labels e tons,
// compartilhado entre a rota /agendamentos, o calendário, a timeline
// e o formulário. Extraído da rota na Fase 7: mesmos valores, zero mudança de
// regra.

import { HUE_BADGE, HUE_DOT, INTENT_BADGE } from "@/lib/status-tones";

export const TIPO_OPTIONS = ["visita", "reuniao", "ligacao", "follow_up", "outro"] as const;
export const STATUS_OPTIONS = [
  "agendado",
  "confirmado",
  "realizado",
  "cancelado",
  "nao_compareceu",
  "remarcado",
] as const;

export const TIPO_LABEL: Record<string, string> = {
  visita: "Visita",
  reuniao: "Reunião",
  ligacao: "Ligação",
  follow_up: "Follow-up",
  outro: "Outro",
};

export const STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  realizado: "Realizado",
  cancelado: "Cancelado",
  nao_compareceu: "Não compareceu",
  remarcado: "Remarcado",
};

export const STATUS_TONE: Record<string, string> = {
  agendado: INTENT_BADGE.info,
  confirmado: INTENT_BADGE.success,
  realizado: HUE_BADGE.green,
  cancelado: INTENT_BADGE.danger,
  nao_compareceu: INTENT_BADGE.warning,
  remarcado: HUE_BADGE.violet,
};

export const TIPO_DOT: Record<string, string> = {
  visita: HUE_DOT.blue,
  reuniao: HUE_DOT.violet,
  ligacao: HUE_DOT.emerald,
  follow_up: HUE_DOT.amber,
  outro: HUE_DOT.slate,
};

export type Agendamento = {
  id: string;
  lead_id: string | null;
  corretor_id: string;
  criado_por_id: string | null;
  tipo: (typeof TIPO_OPTIONS)[number];
  status: (typeof STATUS_OPTIONS)[number];
  titulo: string;
  descricao: string | null;
  local: string | null;
  data_inicio: string;
  data_fim: string;
  timezone: string;
  lembrete_minutos: number;
  motivo_cancelamento: string | null;
  realizado_em: string | null;
};

export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Ponto do compromisso na Agenda (padrão Lançamento): cor só por intenção —
 *  a validar acende (warning), visita em navy, os demais tipos em neutro e o
 *  que já foi encerrado em cinza claro. Chaves = PontoDoCompromisso
 *  (agenda-do-dia.ts). */
export const PONTO_CLASSE: Record<"validar" | "encerrado" | "visita" | "outro", string> = {
  validar: "bg-warning",
  encerrado: "bg-border",
  visita: "bg-primary",
  outro: "bg-muted-foreground/50",
};
