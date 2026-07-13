// Vocabulário da Agenda — tipo/status do agendamento com labels, tons e
// ícones, compartilhado entre a rota /agendamentos, o calendário, a timeline
// e o formulário. Extraído da rota na Fase 7: mesmos valores, zero mudança de
// regra.

import { AlarmClock, CalendarDays, MapPinned, Phone, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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

/** Ícone por tipo — timeline e legendas. */
export const TIPO_ICON: Record<string, LucideIcon> = {
  visita: MapPinned,
  reuniao: Users,
  ligacao: Phone,
  follow_up: AlarmClock,
  outro: CalendarDays,
};

/** Tom do ícone da timeline — mesmos hues dos dots (status-tones). */
export const TIPO_ICON_TONE: Record<string, string> = {
  visita: "text-blue-600 dark:text-blue-400",
  reuniao: "text-violet-600 dark:text-violet-400",
  ligacao: "text-emerald-600 dark:text-emerald-400",
  follow_up: "text-amber-600 dark:text-amber-400",
  outro: "text-slate-500 dark:text-slate-400",
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
