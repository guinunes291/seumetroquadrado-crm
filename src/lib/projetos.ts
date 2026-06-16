// Helpers para projetos / webhooks / catálogo

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function webhookUrl(origin: string, token: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/api/public/webhooks/lead/${token}`;
}

export function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 8) return "•".repeat(token.length);
  return `${token.slice(0, 4)}${"•".repeat(token.length - 8)}${token.slice(-4)}`;
}

// ---------- Format helpers ----------

export function formatBRL(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatM2Range(
  min: number | null | undefined,
  max: number | null | undefined,
): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    if (min === max) return `${fmtNum(min)} m²`;
    return `${fmtNum(min)} – ${fmtNum(max)} m²`;
  }
  return `${fmtNum((min ?? max)!)} m²`;
}

export function formatDormsRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    if (min === max) return `${min} ${min === 1 ? "dorm" : "dorms"}`;
    return `${min}–${max} dorms`;
  }
  const v = (min ?? max)!;
  return `${v} ${v === 1 ? "dorm" : "dorms"}`;
}

export function formatVagasRange(
  min: number | null | undefined,
  max: number | null | undefined,
  obs: string | null | undefined,
): string | null {
  if (min == null && max == null) {
    return obs?.trim() || null;
  }
  if (min != null && max != null) {
    if (min === max) {
      const v = min;
      return v === 0 ? (obs?.trim() || "Sem vaga") : `${v} vaga${v === 1 ? "" : "s"}`;
    }
    return `${min}–${max} vagas`;
  }
  const v = (min ?? max)!;
  return `${v} vaga${v === 1 ? "" : "s"}`;
}

export function formatEntrega(
  status: string | null | undefined,
  mes: number | null | undefined,
  ano: number | null | undefined,
): string | null {
  const parts: string[] = [];
  if (status) parts.push(status);
  if (ano) {
    const mm = mes ? String(mes).padStart(2, "0") + "/" : "";
    parts.push(`${mm}${ano}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

// ---------- Tipo extra (multivalor separado por vírgula) ----------

export function splitTipoExtra(text: string | null | undefined): string[] {
  if (!text) return [];
  return String(text)
    .split(/[,;|/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------- Buckets ----------

export type Bucket = "0" | "1" | "2" | "3+";

export function bucketize(n: number | null | undefined): Bucket | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (n <= 0) return "0";
  if (n === 1) return "1";
  if (n === 2) return "2";
  return "3+";
}

export function rangeOverlapsBuckets(
  min: number | null | undefined,
  max: number | null | undefined,
  selected: Bucket[],
  includeNull = false,
): boolean {
  if (selected.length === 0) return true;
  if (min == null && max == null) return includeNull;
  const lo = min ?? max!;
  const hi = max ?? min!;
  for (let n = lo; n <= Math.max(hi, lo); n++) {
    const b = bucketize(n);
    if (b && selected.includes(b)) return true;
    if (n > 100) break;
  }
  if (hi >= 3 && selected.includes("3+")) return true;
  return false;
}

// ---------- Presets para filtros de intervalo ----------

export type RangeOption = { value: number | null; label: string };

const QUALQUER: RangeOption = { value: null, label: "Qualquer" };

const fmtMil = (n: number) =>
  n >= 1_000_000
    ? `R$ ${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
    : `R$ ${(n / 1000).toLocaleString("pt-BR")} mil`;

export const PRECO_FROM_PRESETS: RangeOption[] = [
  QUALQUER,
  ...[150_000, 200_000, 300_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_000_000].map(
    (v) => ({ value: v, label: fmtMil(v) }),
  ),
];

export const PRECO_TO_PRESETS: RangeOption[] = [
  QUALQUER,
  ...[200_000, 300_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000].map(
    (v) => ({ value: v, label: fmtMil(v) }),
  ),
];

export const AREA_FROM_PRESETS: RangeOption[] = [
  QUALQUER,
  ...[20, 25, 30, 40, 50, 60, 80, 100, 150].map((v) => ({ value: v, label: `${v}m²` })),
];

export const AREA_TO_PRESETS: RangeOption[] = [
  QUALQUER,
  ...[30, 40, 50, 60, 80, 100, 150, 200, 300, 500].map((v) => ({ value: v, label: `${v}m²` })),
];

export function entregaYearPresets(): { from: RangeOption[]; to: RangeOption[] } {
  const y = new Date().getFullYear();
  const years = [-1, 0, 1, 2, 3, 4, 5].map((d) => y + d);
  return {
    from: [QUALQUER, ...years.map((v) => ({ value: v, label: String(v) }))],
    to: [QUALQUER, ...years.map((v) => ({ value: v, label: String(v) }))],
  };
}
