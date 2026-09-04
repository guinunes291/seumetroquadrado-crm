// Papel SDR (pré-venda) — vocabulário e regras PURAS, espelho testável do que
// vive no banco (migrations 20260904*). A decisão real é sempre do Postgres:
// o trigger sdr_guarda_qualificado barra o "qualificado" sem os campos, e as
// RPCs agendar_visita_sdr / entregar_lead_sdr aplicam a régua de etapa. Aqui
// é a mesma régua para a UI explicar ANTES de bater na RPC — nunca uma
// segunda fonte de verdade.

import type { LeadStatus } from "@/lib/leads";

/** Etapas em que o lead ainda está "na mão" do SDR (funil reutilizado). */
export const SDR_ETAPAS_BASE = [
  "aguardando_atendimento",
  "em_atendimento",
  "aguardando_retorno",
  "qualificado",
] as const satisfies readonly LeadStatus[];

export type SdrEtapa = (typeof SDR_ETAPAS_BASE)[number];

export const SDR_ETAPA_LABEL: Record<SdrEtapa, string> = {
  aguardando_atendimento: "Sem contato",
  em_atendimento: "Em conversa",
  aguardando_retorno: "Aguardando retorno",
  qualificado: "Qualificado",
};

export type LeadParaQualificar = {
  renda_informada?: string | null;
  renda_estimada?: number | null;
  tipo_renda?: string | null;
  decisor?: string | null;
  sdr_interesse_confirmado?: boolean | null;
};

/**
 * O que ainda falta para o SDR marcar o lead como qualificado (decisão:
 * campos + interesse confirmado). Lista vazia = pode qualificar. Mesma ordem
 * das mensagens do trigger sdr_guarda_qualificado.
 */
export function requisitosQualificado(lead: LeadParaQualificar): string[] {
  const faltam: string[] = [];
  if (!lead.sdr_interesse_confirmado) faltam.push("Interesse confirmado");
  const temRenda = (lead.renda_informada ?? "").trim() !== "" || (lead.renda_estimada ?? 0) > 0;
  if (!temRenda) faltam.push("Renda");
  if ((lead.tipo_renda ?? "").trim() === "") faltam.push("Tipo de renda");
  if ((lead.decisor ?? "").trim() === "") faltam.push("Quem decide");
  return faltam;
}

/** Lead encerrado não é agendado nem entregue pelo SDR. */
const ENCERRADOS: readonly string[] = ["perdido", "contrato_fechado", "pos_venda"];

/** Agendar visita: qualquer etapa viva antes da entrega (a RPC passa a caixa
 *  de entrada por em_atendimento sozinha). */
export function podeAgendarSdr(status: string, entregueEm: string | null | undefined): boolean {
  if (entregueEm) return false;
  return !ENCERRADOS.includes(status);
}

/** Entrega manual com motivo: só depois do primeiro contato. */
export function podeEntregarSdr(status: string, entregueEm: string | null | undefined): boolean {
  if (entregueEm) return false;
  if (ENCERRADOS.includes(status)) return false;
  return !["novo", "aguardando_corretor", "aguardando_atendimento"].includes(status);
}

/** Motivo da entrega manual: mesmo mínimo da RPC (5 caracteres). */
export function motivoEntregaValido(motivo: string): boolean {
  return motivo.trim().length >= 5;
}

/** Regras do motor, para a timeline e o histórico dizerem o que aconteceu. */
export const SDR_REGRA_LABEL: Record<string, string> = {
  roleta_sdr: "Roleta de agendados do SDR",
  sdr_prioridade_corretor_original: "Prioridade do corretor original",
  espelho_adicionado: "Espelho adicionado pelo admin",
  espelho_substituido: "Dono substituído pelo admin",
  "base_sdr:estoque": "Estoque sem dono → base do SDR",
  "base_sdr:perdido": "Perdido reciclado → base do SDR",
  "sdr_devolucao:no_show": "Devolvido ao SDR (não compareceu)",
  "sdr_devolucao:posse_sdr": "Devolvido ao SDR (corretor parado)",
  "sdr_devolucao:manual_admin": "Devolvido ao SDR (admin)",
};

export function sdrRegraLabel(regra: string | null | undefined): string {
  if (!regra) return "—";
  return SDR_REGRA_LABEL[regra] ?? regra;
}

/** Situação do lead na visão do SDR (badge da base e da ficha). */
export type SituacaoSdr = "na_base" | "reaquecendo" | "entregue" | "devolvido";

export function situacaoSdr(lead: {
  corretor_id: string | null;
  sdr_entregue_em: string | null;
  sdr_devolvido_em?: string | null;
}): SituacaoSdr {
  if (lead.sdr_entregue_em) return "entregue";
  if (lead.corretor_id) return "reaquecendo";
  if (lead.sdr_devolvido_em) return "devolvido";
  return "na_base";
}

export const SITUACAO_SDR_LABEL: Record<SituacaoSdr, string> = {
  na_base: "Na base",
  reaquecendo: "Reaquecendo (lead de corretor)",
  entregue: "Entregue ao corretor",
  devolvido: "Devolvido para você",
};

/** Percentual de comparecimento a partir do Raio-X (null sem amostra). */
export function comparecimentoPct(realizadas: number, noShow: number): number | null {
  const total = realizadas + noShow;
  if (total <= 0) return null;
  return Math.round((1000 * realizadas) / total) / 10;
}
