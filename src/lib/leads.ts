// Fonte única dos status de lead (rótulos e ordem do funil), reusada por
// leads, kanban e detalhe do lead para evitar duplicação.

import { HUE_BADGE, HUE_COLUMN, type Hue } from "@/lib/status-tones";

export type LeadStatus =
  | "novo"
  | "aguardando_corretor"
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
  aguardando_corretor: "Aguardando corretor",
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
  aguardando_corretor: "slate",
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

// ---------------------------------------------------------------------------
// Máquina de estados do funil — espelho fiel de public.transicao_lead_permitida
// (migration 20260715191457). O banco é a autoridade: a RPC transicionar_lead
// rejeita qualquer transição fora deste mapa. O espelho existe para a UI só
// OFERECER destinos válidos (menu, stepper, drag do Kanban) em vez de deixar o
// corretor tentar e receber erro. Ao alterar a função SQL, atualize aqui junto.
// ---------------------------------------------------------------------------

const TRANSICOES: Record<LeadStatus, LeadStatus[]> = {
  aguardando_corretor: ["novo", "aguardando_atendimento", "em_atendimento", "perdido"],
  novo: ["aguardando_atendimento", "em_atendimento", "qualificado", "perdido"],
  aguardando_atendimento: ["em_atendimento", "qualificado", "perdido"],
  em_atendimento: [
    "aguardando_retorno",
    "qualificado",
    "agendado",
    "visita_realizada",
    "analise_credito",
    "perdido",
  ],
  aguardando_retorno: [
    "em_atendimento",
    "qualificado",
    "agendado",
    "visita_realizada",
    "analise_credito",
    "perdido",
  ],
  qualificado: [
    "em_atendimento",
    "aguardando_retorno",
    "agendado",
    "visita_realizada",
    "proposta_enviada",
    "analise_credito",
    "perdido",
  ],
  agendado: [
    "em_atendimento",
    "aguardando_retorno",
    "visita_realizada",
    "analise_credito",
    "contrato_fechado",
    "perdido",
  ],
  visita_realizada: [
    "em_atendimento",
    "aguardando_retorno",
    "agendado",
    "proposta_enviada",
    "analise_credito",
    "contrato_fechado",
    "perdido",
  ],
  proposta_enviada: [
    "em_atendimento",
    "aguardando_retorno",
    "analise_credito",
    "contrato_fechado",
    "perdido",
  ],
  analise_credito: [
    "em_atendimento",
    "aguardando_retorno",
    "visita_realizada",
    "proposta_enviada",
    "contrato_fechado",
    "perdido",
  ],
  // Etapas terminais: só gestão movimenta, e apenas para os destinos abaixo.
  contrato_fechado: ["pos_venda", "analise_credito"],
  perdido: ["em_atendimento", "aguardando_retorno"],
  pos_venda: ["em_atendimento", "aguardando_retorno"],
};

/** Etapas cuja SAÍDA exige papel de gestão (admin/gestor/superintendente). */
const SAIDA_EXIGE_GESTAO = new Set<LeadStatus>(["contrato_fechado", "perdido", "pos_venda"]);

/** `true` se o banco aceitaria mover o lead de `de` para `para`. */
export function transicaoLeadPermitida(de: string, para: LeadStatus, gestao: boolean): boolean {
  if (de === para) return true;
  const origem = de as LeadStatus;
  if (SAIDA_EXIGE_GESTAO.has(origem) && !gestao) return false;
  return TRANSICOES[origem]?.includes(para) ?? false;
}

/** Mensagem curta para explicar um destino bloqueado (toast do Kanban). */
export function motivoTransicaoBloqueada(de: string, para: LeadStatus, gestao: boolean): string {
  const origem = de as LeadStatus;
  if (SAIDA_EXIGE_GESTAO.has(origem) && !gestao) {
    return `Só a gestão pode mover um lead que está em "${leadStatusLabel(de)}".`;
  }
  if (origem === "aguardando_atendimento") {
    return `Inicie o atendimento antes: mova para "${LEAD_STATUS_LABEL.em_atendimento}" e depois para "${LEAD_STATUS_LABEL[para]}".`;
  }
  return `O funil não permite mover de "${leadStatusLabel(de)}" direto para "${LEAD_STATUS_LABEL[para]}".`;
}

/** Categorias oficiais de perda (11 valores, alinhadas ao CHECK do banco).
 *  Ordem = ordem de exibição no dropdown. */
export const MOTIVO_PERDA_CATEGORIAS = [
  "sem_contato",
  "sumiu_pos_proposta",
  "credito_score",
  "credito_renda",
  "estourou_teto",
  "ja_possui_imovel",
  "preco_parcela",
  "comprou_concorrente",
  "timing_adiou",
  "sem_perfil",
  "outro",
] as const;

export type MotivoPerdaCategoria = (typeof MOTIVO_PERDA_CATEGORIAS)[number];

export const MOTIVO_PERDA_LABEL: Record<MotivoPerdaCategoria, string> = {
  sem_contato: "Sumiu / não responde",
  sumiu_pos_proposta: "Esfriou depois da proposta/visita",
  credito_score: "Crédito: score/negativado",
  credito_renda: "Crédito: renda (insuficiente/informal)",
  estourou_teto: "Renda acima do teto MCMV",
  ja_possui_imovel: "Já tem imóvel / usou FGTS",
  preco_parcela: "Achou caro / parcela não cabe",
  comprou_concorrente: "Comprou com concorrente",
  timing_adiou: "Adiou a decisão",
  sem_perfil: "Sem perfil / curioso / lead errado",
  outro: "Outro (descrever)",
};

export function motivoPerdaLabel(cat: string | null | undefined): string | null {
  if (!cat) return null;
  return MOTIVO_PERDA_LABEL[cat as MotivoPerdaCategoria] ?? cat;
}
