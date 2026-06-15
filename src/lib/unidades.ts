// Helpers para Unidades (Fase 7 — Empreendimentos avançado)

export type UnidadeStatus = "disponivel" | "reservada" | "vendida" | "bloqueada";

export const UNIDADE_STATUS_LABEL: Record<UnidadeStatus, string> = {
  disponivel: "Disponível",
  reservada: "Reservada",
  vendida: "Vendida",
  bloqueada: "Bloqueada",
};

export const UNIDADE_STATUS_VARIANT: Record<
  UnidadeStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  disponivel: "default",
  reservada: "secondary",
  vendida: "outline",
  bloqueada: "destructive",
};

export function formatBRL(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function formatArea(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`;
}

export interface UnidadeStats {
  total: number;
  disponivel: number;
  reservada: number;
  vendida: number;
  bloqueada: number;
  vgvDisponivel: number;
  ticketMedio: number;
}

export function calcStats(unidades: Array<{ status: UnidadeStatus; valor: number | string | null }>): UnidadeStats {
  const stats: UnidadeStats = {
    total: unidades.length,
    disponivel: 0,
    reservada: 0,
    vendida: 0,
    bloqueada: 0,
    vgvDisponivel: 0,
    ticketMedio: 0,
  };
  let somaValores = 0;
  let countValores = 0;
  for (const u of unidades) {
    stats[u.status] += 1;
    const v = u.valor === null || u.valor === undefined ? 0 : Number(u.valor);
    if (Number.isFinite(v) && v > 0) {
      somaValores += v;
      countValores += 1;
      if (u.status === "disponivel") stats.vgvDisponivel += v;
    }
  }
  stats.ticketMedio = countValores > 0 ? somaValores / countValores : 0;
  return stats;
}

export function variacaoPercentual(anterior: number | null | undefined, novo: number): number | null {
  if (anterior === null || anterior === undefined || anterior === 0) return null;
  return ((novo - anterior) / anterior) * 100;
}
