// Fonte única dos status de lead (rótulos e ordem do funil), reusada por
// leads, kanban e detalhe do lead para evitar duplicação.

export type LeadStatus =
  | "novo"
  | "aguardando_atendimento"
  | "aguardando_retorno"
  | "em_atendimento"
  | "qualificado"
  | "agendado"
  | "visita_realizada"
  | "proposta_enviada"
  | "analise_credito"
  | "contrato_fechado"
  | "pos_venda"
  | "perdido";

/** Ordem do funil do corretor, do topo ao fundo.
 *  `novo` (caixa de entrada não distribuída) e os status legados
 *  (`qualificado`, `proposta_enviada`, `pos_venda`) ficam fora do funil. */
export const LEAD_STATUS_ORDER: LeadStatus[] = [
  "aguardando_atendimento",
  "aguardando_retorno",
  "em_atendimento",
  "agendado",
  "visita_realizada",
  "analise_credito",
  "contrato_fechado",
  "perdido",
];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  novo: "Novo",
  aguardando_atendimento: "Aguardando atendimento",
  aguardando_retorno: "Aguardando retorno",
  em_atendimento: "Em atendimento",
  qualificado: "Qualificado",
  agendado: "Agendado",
  visita_realizada: "Visita realizada",
  proposta_enviada: "Proposta enviada",
  analise_credito: "Análise de crédito",
  contrato_fechado: "Venda",
  pos_venda: "Pós-venda",
  perdido: "Perdido",
};

/** Tom para badges (fundo + texto). */
export const LEAD_STATUS_BADGE_TONE: Record<LeadStatus, string> = {
  novo: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  aguardando_atendimento: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  aguardando_retorno: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
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

// ---------------------------------------------------------------------------
// Avanço no funil a partir dos cards (Kanban + lista)
// ---------------------------------------------------------------------------

/** Forma mínima de lead que as ações de etapa (menu + modais) precisam. */
export type StageLead = {
  id: string;
  nome: string;
  status: string;
  corretor_id: string | null;
  projeto_id?: string | null;
  projeto_nome?: string | null;
  observacoes?: string | null;
};

/** Etapas oferecidas como destino no menu "Mover para" (exclui `perdido`,
 *  que é tratado por uma ação dedicada). */
export const FUNNEL_STAGES: LeadStatus[] = LEAD_STATUS_ORDER.filter((s) => s !== "perdido");

/** Transições que exigem um modal para capturar dados antes de mudar o status. */
export type StageModal = "agendado" | "visita_realizada" | "analise_credito" | "contrato_fechado";

export const STAGE_MODAL: Partial<Record<LeadStatus, StageModal>> = {
  agendado: "agendado",
  visita_realizada: "visita_realizada",
  analise_credito: "analise_credito",
  contrato_fechado: "contrato_fechado",
};

export function stageRequiresModal(status: LeadStatus): boolean {
  return status in STAGE_MODAL;
}

/** Decisão única de roteamento, usada tanto pelo menu quanto pelo drop do Kanban. */
export type StageAction =
  | { kind: "direct" }
  | { kind: "modal"; modal: StageModal }
  | { kind: "perdido" };

export function resolveStageAction(target: LeadStatus): StageAction {
  if (target === "perdido") return { kind: "perdido" };
  const modal = STAGE_MODAL[target];
  return modal ? { kind: "modal", modal } : { kind: "direct" };
}

/** Ação sugerida ("botão inteligente") por etapa: o avanço mais provável do
 *  funil a partir do status atual. Não é o próximo linear — é o próximo passo
 *  comercial. Usado no card e na lista para reduzir cliques. */
export type ProximaAcao = { label: string; target: LeadStatus };

export const PROXIMA_ACAO: Partial<Record<LeadStatus, ProximaAcao>> = {
  novo: { label: "Iniciar atendimento", target: "em_atendimento" },
  aguardando_atendimento: { label: "Iniciar atendimento", target: "em_atendimento" },
  aguardando_retorno: { label: "Retomar atendimento", target: "em_atendimento" },
  em_atendimento: { label: "Agendar visita", target: "agendado" },
  agendado: { label: "Marcar visita realizada", target: "visita_realizada" },
  visita_realizada: { label: "Enviar p/ análise", target: "analise_credito" },
  analise_credito: { label: "Registrar venda", target: "contrato_fechado" },
};

/** Categorias de perda (espelham o `motivoPerdaCategoria` do CRM de origem). */
export const MOTIVO_PERDA_CATEGORIAS = [
  "sem_resposta",
  "sem_interesse",
  "sem_perfil_credito",
  "comprou_concorrente",
  "fora_regiao",
  "duplicado",
  "contato_invalido",
  "outro",
] as const;

export type MotivoPerdaCategoria = (typeof MOTIVO_PERDA_CATEGORIAS)[number];

export const MOTIVO_PERDA_LABEL: Record<MotivoPerdaCategoria, string> = {
  sem_resposta: "Sem resposta / não atende",
  sem_interesse: "Sem interesse",
  sem_perfil_credito: "Sem perfil de crédito",
  comprou_concorrente: "Comprou com concorrente",
  fora_regiao: "Fora da região de atuação",
  duplicado: "Lead duplicado",
  contato_invalido: "Contato inválido",
  outro: "Outro motivo",
};
