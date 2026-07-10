import {
  Phone,
  MessageCircle,
  Mail,
  MessageSquare,
  MapPin,
  Users,
  StickyNote,
  RefreshCw,
  FileText,
  CircleDot,
  type LucideIcon,
} from "lucide-react";
import { HUE_BADGE, INTENT_BADGE } from "@/lib/status-tones";

export type InteracaoTipo =
  | "ligacao"
  | "whatsapp"
  | "email"
  | "sms"
  | "visita"
  | "reuniao"
  | "nota"
  | "mudanca_status"
  | "proposta"
  | "outro";

export type InteracaoDirecao = "entrada" | "saida" | "interna";

export const INTERACAO_LABEL: Record<InteracaoTipo, string> = {
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
  email: "E-mail",
  sms: "SMS",
  visita: "Visita",
  reuniao: "Reunião",
  nota: "Anotação",
  mudanca_status: "Mudança de status",
  proposta: "Proposta",
  outro: "Outro",
};

export const INTERACAO_ICON: Record<InteracaoTipo, LucideIcon> = {
  ligacao: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  sms: MessageSquare,
  visita: MapPin,
  reuniao: Users,
  nota: StickyNote,
  mudanca_status: RefreshCw,
  proposta: FileText,
  outro: CircleDot,
};

export const INTERACAO_TONE: Record<InteracaoTipo, string> = {
  ligacao: HUE_BADGE.blue,
  whatsapp: HUE_BADGE.emerald,
  email: HUE_BADGE.violet,
  sms: HUE_BADGE.cyan,
  visita: HUE_BADGE.amber,
  reuniao: HUE_BADGE.indigo,
  nota: INTENT_BADGE.neutral,
  mudanca_status: HUE_BADGE.slate,
  proposta: HUE_BADGE.orange,
  outro: INTENT_BADGE.neutral,
};

export const DIRECAO_LABEL: Record<InteracaoDirecao, string> = {
  entrada: "Entrada",
  saida: "Saída",
  interna: "Interna",
};

export function isContactInteraction(tipo: InteracaoTipo): boolean {
  return ["ligacao", "whatsapp", "email", "sms", "visita", "reuniao", "proposta"].includes(tipo);
}

export type NotaSistemaInput = {
  leadId: string;
  titulo: string;
  conteudo: string;
  autorId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Monta o objeto de insert de uma NOTA DE SISTEMA (interna) na timeline do lead.
 * Puro — o chamador insere com `supabase` (cliente) ou `supabaseAdmin` (server).
 * Serve para dar rastro consistente às ações que hoje não geram histórico
 * (mudança de temperatura em lote, transferência em lote, lixeira/restauração).
 */
export function notaSistemaPayload(input: NotaSistemaInput) {
  return {
    lead_id: input.leadId,
    autor_id: input.autorId ?? null,
    tipo: "nota" as const,
    direcao: "interna" as const,
    titulo: input.titulo,
    conteudo: input.conteudo,
    metadata: { fonte: "sistema", ...(input.metadata ?? {}) },
  };
}

export function describeInteracao(tipo: InteracaoTipo, direcao: InteracaoDirecao): string {
  const base = INTERACAO_LABEL[tipo];
  if (tipo === "nota" || tipo === "mudanca_status") return base;
  if (direcao === "entrada") return `${base} recebida`;
  if (direcao === "saida") return `${base} enviada`;
  return base;
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diff = now.getTime() - date.getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "agora mesmo";
  const min = Math.round(sec / 60);
  if (min < 60) return `há ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `há ${hr} h`;
  const day = Math.round(hr / 24);
  if (day < 30) return `há ${day} d`;
  const month = Math.round(day / 30);
  if (month < 12) return `há ${month} ${month > 1 ? "meses" : "mês"}`;
  const year = Math.round(month / 12);
  return `há ${year} ano${year > 1 ? "s" : ""}`;
}
