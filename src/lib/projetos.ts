// Helpers para projetos / webhooks por token

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

// ---------- Parsing helpers para filtros do catálogo ----------

export function parsePrecoBRL(text: string | null | undefined): number | null {
  if (text == null) return null;
  const s = String(text).trim();
  if (!s) return null;
  // Remove R$, espaços e separadores de milhar; troca vírgula decimal por ponto
  const cleaned = s
    .replace(/r\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function formatBRL(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);
}

export function normalizeVagas(text: string | null | undefined): "0" | "1" | "2" | "3+" | null {
  if (text == null) return null;
  const s = String(text).trim();
  if (!s) return null;
  const m = s.match(/\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return "0";
  if (n === 1) return "1";
  if (n === 2) return "2";
  return "3+";
}

export function normalizeTipologia(text: string | null | undefined): string | null {
  if (text == null) return null;
  const s = String(text).trim().toLowerCase();
  if (!s) return null;
  if (/studio|stdio|kit/.test(s)) return "Studio";
  const m = s.match(/(\d+)\s*(dorm|quart|qto|q\b|d\b)/);
  if (m) {
    const n = Number(m[1]);
    return `${n} ${n === 1 ? "dorm" : "dorms"}`;
  }
  const lone = s.match(/^(\d+)$/);
  if (lone) {
    const n = Number(lone[1]);
    return `${n} ${n === 1 ? "dorm" : "dorms"}`;
  }
  // Fallback: capitaliza primeira letra
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function normalizeEntregaStatus(text: string | null | undefined): string | null {
  if (text == null) return null;
  const s = String(text).trim().toLowerCase();
  if (!s) return null;
  if (/lan[cç]/.test(s)) return "Lançamento";
  if (/obra|constru/.test(s)) return "Em obras";
  if (/pronto|entreg|hab/.test(s)) return "Pronto";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
