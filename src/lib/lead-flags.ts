// Flags visuais de um lead na lista/tabela/kanban/modo foco — lógica PURA e
// testável. Cada flag mapeia para um Intent do design system; a UI decide o
// formato (chip, borda de linha, pulso). Regras documentadas por flag.

import type { Intent } from "@/lib/status-tones";

export type LeadFlag =
  | "novo"
  | "quente"
  | "atrasado"
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
};

export const FLAG_META: Record<LeadFlag, { label: string; intent: Intent }> = {
  novo: { label: "Novo", intent: "info" },
  quente: { label: "Quente", intent: "danger" },
  atrasado: { label: "Atrasado", intent: "danger" },
  sem_contato: { label: "Sem contato 5d+", intent: "warning" },
  em_risco: { label: "Em risco", intent: "danger" },
  parado: { label: "Parado 10d+", intent: "warning" },
  com_visita: { label: "Visita marcada", intent: "success" },
};

const DIA = 86_400_000;
const FINALIZADOS = new Set(["contrato_fechado", "pos_venda", "perdido"]);

/**
 * Deriva as flags de um lead. Ordem de retorno = ordem de exibição.
 *
 * Regras:
 *  - novo:        criado há < 24h, ainda aguardando primeiro atendimento
 *  - atrasado:    aguardando primeiro atendimento há 24h+ (fila estourada)
 *  - quente:      temperatura quente (funil ativo)
 *  - em_risco:    quente E sem interação há 3d+ (dinheiro esfriando)
 *  - com_visita:  status agendado (tem compromisso à frente)
 *  - parado:      sem interação há 10d+ em status ativo (absorve sem_contato)
 *  - sem_contato: sem interação há 5d+ em status ativo
 */
export function leadFlags(lead: LeadFlagInput, opts: { now?: Date } = {}): LeadFlag[] {
  const now = (opts.now ?? new Date()).getTime();
  const flags: LeadFlag[] = [];
  const criadoHa = now - new Date(lead.created_at).getTime();
  const ui = lead.ultima_interacao ? new Date(lead.ultima_interacao).getTime() : null;
  const semInteracaoHa = ui == null ? Infinity : now - ui;
  const ativo = !FINALIZADOS.has(lead.status);
  const aguardando = lead.status === "aguardando_atendimento";
  const quente = lead.temperatura === "quente";

  if (aguardando && criadoHa < DIA) flags.push("novo");
  if (aguardando && criadoHa >= DIA) flags.push("atrasado");
  if (quente && ativo) flags.push("quente");
  if (quente && ativo && semInteracaoHa >= 3 * DIA) flags.push("em_risco");
  if (lead.status === "agendado") flags.push("com_visita");
  if (ativo && !aguardando) {
    if (semInteracaoHa >= 10 * DIA) flags.push("parado");
    else if (semInteracaoHa >= 5 * DIA) flags.push("sem_contato");
  }

  return flags;
}

/** Intent dominante (para borda/realce da linha): pior flag vence. */
export function leadRowIntent(flags: LeadFlag[]): Intent | null {
  if (flags.includes("em_risco") || flags.includes("atrasado")) return "danger";
  if (flags.includes("quente")) return "danger";
  if (flags.includes("parado") || flags.includes("sem_contato")) return "warning";
  if (flags.includes("novo")) return "info";
  if (flags.includes("com_visita")) return "success";
  return null;
}
