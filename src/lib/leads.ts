// Fonte única dos status de lead (rótulos e ordem do funil), reusada por
// leads, kanban e detalhe do lead para evitar duplicação.

import { HUE_BADGE, HUE_COLUMN, type Hue } from "@/lib/status-tones";

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

/** Hue nominal de cada etapa — única atribuição de cor do funil. Badge (lista,
 *  busca, blitz) e coluna do kanban derivam daqui via lib/status-tones. */
export const LEAD_STATUS_HUE: Record<LeadStatus, Hue> = {
  novo: "blue",
  aguardando_atendimento: "amber",
  aguardando_retorno: "yellow",
  em_atendimento: "violet",
  qualificado: "cyan",
  agendado: "indigo",
  visita_realizada: "emerald",
  proposta_enviada: "teal",
  analise_credito: "orange",
  contrato_fechado: "green",
  pos_venda: "lime",
  perdido: "rose",
};

/** Tom para badges (fundo + texto). */
export const LEAD_STATUS_BADGE_TONE: Record<LeadStatus, string> = Object.fromEntries(
  (Object.keys(LEAD_STATUS_HUE) as LeadStatus[]).map((s) => [s, HUE_BADGE[LEAD_STATUS_HUE[s]]]),
) as Record<LeadStatus, string>;

/** Tom para colunas do kanban (fundo + borda), mesmo hue do badge. */
export const LEAD_STATUS_COLUMN_TONE: Record<LeadStatus, string> = Object.fromEntries(
  (Object.keys(LEAD_STATUS_HUE) as LeadStatus[]).map((s) => [s, HUE_COLUMN[LEAD_STATUS_HUE[s]]]),
) as Record<LeadStatus, string>;

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
