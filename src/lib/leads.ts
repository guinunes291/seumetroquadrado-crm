// Fonte única dos status de lead (rótulos e ordem do funil), reusada por
// leads, kanban e detalhe do lead para evitar duplicação.

export type LeadStatus =
  | "novo"
  | "aguardando_atendimento"
  | "em_atendimento"
  | "qualificado"
  | "agendado"
  | "visita_realizada"
  | "proposta_enviada"
  | "analise_credito"
  | "contrato_fechado"
  | "pos_venda"
  | "perdido";

/** Ordem do funil, do topo ao fundo. */
export const LEAD_STATUS_ORDER: LeadStatus[] = [
  "novo",
  "aguardando_atendimento",
  "em_atendimento",
  "qualificado",
  "agendado",
  "visita_realizada",
  "proposta_enviada",
  "analise_credito",
  "contrato_fechado",
  "pos_venda",
  "perdido",
];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  novo: "Novo",
  aguardando_atendimento: "Aguardando atendimento",
  em_atendimento: "Em atendimento",
  qualificado: "Qualificado",
  agendado: "Agendado",
  visita_realizada: "Visita realizada",
  proposta_enviada: "Proposta enviada",
  analise_credito: "Análise de crédito",
  contrato_fechado: "Contrato fechado",
  pos_venda: "Pós-venda",
  perdido: "Perdido",
};

/** Tom para badges (fundo + texto). */
export const LEAD_STATUS_BADGE_TONE: Record<LeadStatus, string> = {
  novo: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  aguardando_atendimento: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  em_atendimento: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  qualificado: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  agendado: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  visita_realizada: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  proposta_enviada: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  analise_credito: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  contrato_fechado: "bg-green-600/20 text-green-800 dark:text-green-300",
  pos_venda: "bg-lime-500/15 text-lime-700 dark:text-lime-300",
  perdido: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

export function leadStatusLabel(status: string): string {
  return LEAD_STATUS_LABEL[status as LeadStatus] ?? status;
}
