// Helpers puros de formatação e comparação do analytics (testados em
// tests/dashboard-format.test.ts). Mantidos sem dependência de React para
// permitir teste isolado.

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const BRL_COMPACT = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const INT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** R$ inteiro (sem centavos): 1234567 → "R$ 1.234.567". */
export function fmtBRL(v: number | null | undefined): string {
  return BRL.format(Number(v) || 0);
}

/** R$ compacto p/ cards: 1234567 → "R$ 1,2 mi". */
export function fmtBRLCompact(v: number | null | undefined): string {
  return BRL_COMPACT.format(Number(v) || 0);
}

export function fmtInt(v: number | null | undefined): string {
  return INT.format(Number(v) || 0);
}

/** Minutos → rótulo curto: 95 → "1h35"; 45 → "45min". */
export function fmtMinutos(min: number | null | undefined): string {
  const m = Math.max(0, Math.round(Number(min) || 0));
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h < 48) return r > 0 ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** Horas → rótulo curto: 1.5 → "1h30"; 50 → "2d 2h". */
export function fmtHoras(horas: number | null | undefined): string {
  return fmtMinutos((Number(horas) || 0) * 60);
}

export type Delta = {
  /** Variação percentual arredondada (ex.: 12 = +12%). Null quando não comparável. */
  pct: number | null;
  direction: "up" | "down" | "flat";
};

/**
 * Delta percentual atual vs anterior. Regras:
 * - anterior nulo/indefinido → não comparável (pct null, flat);
 * - anterior 0 e atual 0 → 0% flat; anterior 0 e atual >0 → não comparável
 *   (evita "+∞%" enganoso — o card mostra só o valor).
 */
export function deltaPct(
  atual: number | null | undefined,
  anterior: number | null | undefined,
): Delta {
  if (anterior === null || anterior === undefined) return { pct: null, direction: "flat" };
  const a = Number(atual) || 0;
  const b = Number(anterior) || 0;
  if (b === 0) return a === 0 ? { pct: 0, direction: "flat" } : { pct: null, direction: "flat" };
  const pct = Math.round(((a - b) / b) * 100);
  return { pct, direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
}

/** % de conversão entre etapas consecutivas do funil (base = etapa anterior). */
export function conversaoEtapas(
  data: Array<{ etapa: string; quantidade: number }>,
): Array<{ etapa: string; quantidade: number; pctAnterior: number | null }> {
  return data.map((d, i) => {
    if (i === 0) return { ...d, pctAnterior: null };
    const prev = data[i - 1].quantidade;
    return { ...d, pctAnterior: prev > 0 ? Math.round((d.quantidade / prev) * 1000) / 10 : null };
  });
}

/** % geral (0-100, 1 casa) com denominador seguro. */
export function pctSeguro(
  parte: number | null | undefined,
  todo: number | null | undefined,
): number | null {
  const t = Number(todo) || 0;
  if (t <= 0) return null;
  return Math.round(((Number(parte) || 0) / t) * 1000) / 10;
}
