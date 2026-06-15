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
  ligacao: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  whatsapp: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  email: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  sms: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  visita: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  reuniao: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  nota: "bg-muted text-muted-foreground",
  mudanca_status: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  proposta: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  outro: "bg-muted text-muted-foreground",
};

export const DIRECAO_LABEL: Record<InteracaoDirecao, string> = {
  entrada: "Entrada",
  saida: "Saída",
  interna: "Interna",
};

export function isContactInteraction(tipo: InteracaoTipo): boolean {
  return ["ligacao", "whatsapp", "email", "sms", "visita", "reuniao", "proposta"].includes(tipo);
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
  if (month < 12) return `há ${month} mês${month > 1 ? "es" : ""}`;
  const year = Math.round(month / 12);
  return `há ${year} ano${year > 1 ? "s" : ""}`;
}
