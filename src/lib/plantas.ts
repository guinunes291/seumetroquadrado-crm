// Plantas dos empreendimentos — regras puras (testadas em
// tests/plantas-extracao.test.ts).
//
// As plantas só existem dentro dos books (PDF no Drive). A extração roda no
// navegador (o deploy é Cloudflare: sem canvas no servidor para rasterizar PDF)
// e UMA vez por projeto, na tela de Materiais: a heurística daqui pré-marca as
// páginas prováveis e uma pessoa confirma. Book só-imagem (sem texto) não
// pré-marca nada — a grade de miniaturas continua lá para escolher à mão.

/** Uma planta salva em `projetos.plantas`. */
export type PlantaProjeto = {
  url: string;
  legenda: string | null;
  pagina: number | null;
};

export const PLANTAS_MAX = 12;

/** Bucket público do Storage onde as imagens das plantas ficam. */
export const PLANTAS_BUCKET = "projetos-plantas";

/**
 * Lê `projetos.plantas` (jsonb) de forma defensiva: descarta item sem URL
 * HTTPS e corta em PLANTAS_MAX. Dado estranho no banco não quebra o PDF.
 */
export function parsePlantas(raw: unknown): PlantaProjeto[] {
  if (!Array.isArray(raw)) return [];
  const out: PlantaProjeto[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const url = typeof r.url === "string" ? r.url.trim() : "";
    if (!/^https:\/\//i.test(url)) continue;
    const legenda = typeof r.legenda === "string" && r.legenda.trim() ? r.legenda.trim() : null;
    const pagina =
      typeof r.pagina === "number" && Number.isInteger(r.pagina) && r.pagina > 0 ? r.pagina : null;
    out.push({ url, legenda, pagina });
    if (out.length >= PLANTAS_MAX) break;
  }
  return out;
}

/** ID de arquivo do Google Drive (/file/d/ID, ?id=ID). null se não for Drive. */
export function idDoDrive(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (u.hostname !== "drive.google.com" && u.hostname !== "docs.google.com") return null;
    const id = u.searchParams.get("id") ?? u.pathname.match(/\/d\/([^/]+)/)?.[1] ?? null;
    return id && /^[\w-]{10,}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

const normalizar = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");

/**
 * Pontua o texto de uma página do book como "provável planta". Página de planta
 * tem o título ("planta", "tipo", "final") E números de área/dormitório; página
 * de lazer ou fachada costuma ter só um dos dois — por isso os sinais somam.
 */
export function pontuarPaginaPlanta(texto: string): number {
  const t = normalizar(texto);
  if (!t.trim()) return 0;
  let score = 0;
  if (/\bplantas?\b/.test(t)) score += 3;
  if (/\bplanta (tipo|humanizada|decorada)\b/.test(t)) score += 2;
  if (/\b(tipo|final|coluna)\s*\d/.test(t)) score += 1;
  if (/area (privativa|util|total)/.test(t)) score += 2;
  if (/\d+[.,]?\d*\s?m(²|2)(?![a-z0-9])/.test(t)) score += 2;
  if (/\b\d\s?(dorms?|dormitorios?|quartos?|suites?)\b/.test(t)) score += 1;
  // Cômodos típicos de planta: 2+ deles na mesma página é sinal forte.
  const comodos = ["sala", "cozinha", "banho", "terraco", "varanda", "a.s.", "area de servico"];
  if (comodos.filter((c) => t.includes(c)).length >= 2) score += 2;
  // Páginas de implantação/lazer mencionam "planta" mas não são de unidade.
  if (/implantacao|lazer|perspectiva ilustrada da fachada/.test(t)) score -= 2;
  return Math.max(0, score);
}

/** A partir de quanto a página já vem pré-marcada na curadoria. */
export const LIMIAR_PLANTA = 5;

export function ehProvavelPlanta(texto: string): boolean {
  return pontuarPaginaPlanta(texto) >= LIMIAR_PLANTA;
}

/**
 * Legenda sugerida a partir do texto da página: "2 dorms · 41,5 m²".
 * null quando não há dado suficiente — o curador escreve.
 */
export function legendaDaPlanta(texto: string): string | null {
  const t = normalizar(texto);
  const partes: string[] = [];
  const dorm = t.match(/\b(\d)\s?(?:dorms?|dormitorios?|quartos?)\b/);
  if (dorm) partes.push(`${dorm[1]} ${dorm[1] === "1" ? "dorm" : "dorms"}`);
  const area = t.match(/(\d{2,3}(?:[.,]\d{1,2})?)\s?m(?:²|2)(?![a-z0-9])/);
  if (area) partes.push(`${area[1].replace(".", ",")} m²`);
  // "tipo 2" é ambíguo ("planta tipo 2 dorms"); só "final" identifica a coluna.
  const final = t.match(/\bfinais?\s*(\d{1,2}(?:\s?(?:e|,)\s?\d{1,2})*)\b/);
  if (final && partes.length > 0) partes.push(`final ${final[1].replace(/\s+/g, " ")}`);
  return partes.length ? partes.join(" · ") : null;
}
