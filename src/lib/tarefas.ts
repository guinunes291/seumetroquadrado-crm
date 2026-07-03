import { INTENT_OUTLINE } from "@/lib/status-tones";

export const TAREFA_STATUS = ["pendente", "em_andamento", "concluida", "cancelada"] as const;
export const TAREFA_TIPOS = ["ligacao", "whatsapp", "email", "visita", "follow_up", "documentacao", "outro"] as const;
export const TAREFA_PRIORIDADES = ["baixa", "media", "alta", "urgente"] as const;

export type TarefaStatus = (typeof TAREFA_STATUS)[number];
export type TarefaTipo = (typeof TAREFA_TIPOS)[number];
export type TarefaPrioridade = (typeof TAREFA_PRIORIDADES)[number];

export const STATUS_LABEL: Record<TarefaStatus, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const TIPO_LABEL: Record<TarefaTipo, string> = {
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
  email: "E-mail",
  visita: "Visita",
  follow_up: "Follow-up",
  documentacao: "Documentação",
  outro: "Outro",
};

export const PRIORIDADE_LABEL: Record<TarefaPrioridade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

export type TarefaLike = {
  status: string;
  data_vencimento?: string | null;
};

export function isAtrasada(t: TarefaLike): boolean {
  if (!t.data_vencimento) return false;
  if (t.status === "concluida" || t.status === "cancelada") return false;
  return new Date(t.data_vencimento).getTime() < Date.now();
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "pendente": return INTENT_OUTLINE.warning;
    case "em_andamento": return INTENT_OUTLINE.info;
    case "concluida": return INTENT_OUTLINE.success;
    case "cancelada": return INTENT_OUTLINE.neutral;
    default: return "";
  }
}

export function prioridadeBadgeClass(prio: string): string {
  switch (prio) {
    case "urgente": return INTENT_OUTLINE.danger;
    case "alta": return "border-orange-500 text-orange-700";
    case "media": return INTENT_OUTLINE.warning;
    case "baixa": return INTENT_OUTLINE.neutral;
    default: return "";
  }
}
