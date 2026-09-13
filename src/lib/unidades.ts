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

// Cores semânticas para o status da unidade (disponível=verde, reservada=âmbar,
// vendida=azul, bloqueada=vermelho). Usado em badges e indicadores.
export const UNIDADE_STATUS_TONE: Record<UnidadeStatus, string> = {
  disponivel: "bg-emerald-500/15 text-emerald-700 border-emerald-500/40",
  reservada: "bg-amber-500/15 text-amber-700 border-amber-500/40",
  vendida: "bg-sky-500/15 text-sky-700 border-sky-500/40",
  bloqueada: "bg-rose-500/15 text-rose-700 border-rose-500/40",
};

// Cor sólida do "ponto" indicador (usado no Select do gestor).
export const UNIDADE_STATUS_DOT: Record<UnidadeStatus, string> = {
  disponivel: "bg-emerald-500",
  reservada: "bg-amber-500",
  vendida: "bg-sky-500",
  bloqueada: "bg-rose-500",
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

export function calcStats(
  unidades: Array<{ status: UnidadeStatus; valor: number | string | null }>,
): UnidadeStats {
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

export function variacaoPercentual(
  anterior: number | null | undefined,
  novo: number,
): number | null {
  if (anterior === null || anterior === undefined || anterior === 0) return null;
  return ((novo - anterior) / anterior) * 100;
}

// ---------------------------------------------------------------------------
// Disponibilidade por tipologia — a leitura de espelho que o corretor precisa
// na página de produto ("tem 2 dorms de 45 m² disponível? a partir de quanto?")
// sem abrir a grade unidade a unidade. Agrupa por tipologia + dormitórios; a
// área e o menor valor consideram só o que está disponível para venda.
// ---------------------------------------------------------------------------

export type UnidadeParaResumo = {
  tipologia: string | null;
  dormitorios: number | null;
  area_privativa: number | string | null;
  valor: number | string | null;
  status: UnidadeStatus;
};

export interface ResumoTipologia {
  /** Chave estável do grupo (tipologia|dormitórios). */
  chave: string;
  tipologia: string | null;
  dormitorios: number | null;
  total: number;
  disponiveis: number;
  reservadas: number;
  vendidas: number;
  bloqueadas: number;
  /** Faixa de área das unidades DISPONÍVEIS (null quando nenhuma tem área). */
  areaMin: number | null;
  areaMax: number | null;
  /** Menor valor entre as disponíveis (null quando nenhuma tem valor). */
  valorMinDisponivel: number | null;
}

function numeroOuNulo(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function resumoPorTipologia(unidades: readonly UnidadeParaResumo[]): ResumoTipologia[] {
  const grupos = new Map<string, ResumoTipologia>();
  for (const u of unidades) {
    const tipologia = u.tipologia?.trim() || null;
    const chave = `${tipologia ?? ""}|${u.dormitorios ?? ""}`;
    let g = grupos.get(chave);
    if (!g) {
      g = {
        chave,
        tipologia,
        dormitorios: u.dormitorios ?? null,
        total: 0,
        disponiveis: 0,
        reservadas: 0,
        vendidas: 0,
        bloqueadas: 0,
        areaMin: null,
        areaMax: null,
        valorMinDisponivel: null,
      };
      grupos.set(chave, g);
    }
    g.total += 1;
    if (u.status === "disponivel") g.disponiveis += 1;
    else if (u.status === "reservada") g.reservadas += 1;
    else if (u.status === "vendida") g.vendidas += 1;
    else if (u.status === "bloqueada") g.bloqueadas += 1;

    if (u.status === "disponivel") {
      const area = numeroOuNulo(u.area_privativa);
      if (area !== null) {
        g.areaMin = g.areaMin === null ? area : Math.min(g.areaMin, area);
        g.areaMax = g.areaMax === null ? area : Math.max(g.areaMax, area);
      }
      const valor = numeroOuNulo(u.valor);
      if (valor !== null) {
        g.valorMinDisponivel =
          g.valorMinDisponivel === null ? valor : Math.min(g.valorMinDisponivel, valor);
      }
    }
  }
  // Dormitórios crescentes (sem dado por último), depois menor área, depois nome.
  return [...grupos.values()].sort((a, b) => {
    const da = a.dormitorios ?? Number.POSITIVE_INFINITY;
    const db = b.dormitorios ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    const aa = a.areaMin ?? Number.POSITIVE_INFINITY;
    const ab = b.areaMin ?? Number.POSITIVE_INFINITY;
    if (aa !== ab) return aa - ab;
    return (a.tipologia ?? "").localeCompare(b.tipologia ?? "", "pt-BR");
  });
}

/** "2 dorms · 45–52 m²" / "Studio · 28 m²" / "Sem tipologia". */
export function descreverTipologia(r: ResumoTipologia): string {
  const partes: string[] = [];
  if (r.tipologia) partes.push(r.tipologia);
  if (r.dormitorios != null && !/dorm|quarto|studio|st[uú]dio/i.test(r.tipologia ?? "")) {
    partes.push(`${r.dormitorios} dorm${r.dormitorios === 1 ? "" : "s"}`);
  }
  if (r.areaMin != null) {
    const min = r.areaMin.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    const max = (r.areaMax ?? r.areaMin).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    partes.push(r.areaMax != null && r.areaMax !== r.areaMin ? `${min}–${max} m²` : `${min} m²`);
  }
  return partes.length > 0 ? partes.join(" · ") : "Sem tipologia";
}
