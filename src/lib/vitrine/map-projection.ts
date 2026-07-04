// Projeção do mapa da Vitrine de Empreendimentos.
//
// Hoje o mapa é ESQUEMÁTICO: um desenho de São Paulo dividido pelas zonas do CRM
// (`zona_smq`), com os pinos espalhados de forma determinística dentro do "blob"
// da sua zona. Não depende de coordenadas geográficas — que os projetos ainda
// não têm — mas já está estruturado para virar um mapa GEOGRÁFICO real:
//
//   • Toda a tela conversa com o mapa por uma única função `MapProjection`, que
//     recebe um projeto e devolve um ponto {x,y} em % (0–100) sobre a área do
//     mapa (ou null quando não dá pra posicionar).
//   • Trocar o esquemático pelo geográfico é trocar a projeção: quando os
//     projetos ganharem `lat`/`lng`, basta implementar `geographicProjection`
//     (esboço abaixo) e passá-la no lugar de `schematicProjection`.
//
// A coloração dos pinos por faixa de preço é compartilhada entre mapa e legenda.

/** Entrada mínima que a projeção precisa — estruturalmente compatível com ProjetoRow. */
export type MapProjetoInput = {
  id: string;
  zona_smq: string | null;
  preco_a_partir: number | null;
  /** Futuro: coordenadas reais para o mapa geográfico. */
  lat?: number | null;
  lng?: number | null;
};

export type MapPoint = { x: number; y: number };

/** Uma projeção mapeia um projeto para um ponto em % (0–100) na área do mapa. */
export type MapProjection = (p: MapProjetoInput) => MapPoint | null;

// ---------------------------------------------------------------------------
// Zonas do esquema (coordenadas em % sobre o viewBox 100×100 do SVG base)
// ---------------------------------------------------------------------------

export const MAP_ZONAS = ["Norte", "Oeste", "Centro", "Leste", "Sul"] as const;
export type MapZona = (typeof MAP_ZONAS)[number];

/** Centro e raio do "blob" de cada zona — onde os pinos daquela zona se espalham. */
type ZonaBlob = { cx: number; cy: number; rx: number; ry: number };

const ZONA_BLOBS: Record<MapZona, ZonaBlob> = {
  Norte: { cx: 42, cy: 22, rx: 20, ry: 9 },
  Oeste: { cx: 24, cy: 53, rx: 12, ry: 12 },
  Centro: { cx: 50, cy: 51, rx: 8, ry: 7 },
  Leste: { cx: 76, cy: 45, rx: 14, ry: 12 },
  Sul: { cx: 40, cy: 82, rx: 18, ry: 10 },
};

/** Posição dos rótulos de zona no SVG (mesma referência dos blobs). */
export const ZONA_LABELS: { zona: MapZona; x: number; y: number }[] = [
  { zona: "Norte", x: 42, y: 18 },
  { zona: "Oeste", x: 16, y: 54 },
  { zona: "Centro", x: 50, y: 54 },
  { zona: "Leste", x: 80, y: 40 },
  { zona: "Sul", x: 40, y: 88 },
];

/** Projetos sem zona reconhecida caem num "limbo" discreto fora dos clusters. */
const SEM_ZONA_BLOB: ZonaBlob = { cx: 88, cy: 88, rx: 6, ry: 6 };

const ZONA_ALIASES: Record<string, MapZona> = {
  norte: "Norte",
  sul: "Sul",
  leste: "Leste",
  oeste: "Oeste",
  centro: "Centro",
  central: "Centro",
};

export function normalizeZona(zona: string | null | undefined): MapZona | null {
  if (!zona) return null;
  const key = zona
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  return ZONA_ALIASES[key] ?? null;
}

// ---------------------------------------------------------------------------
// Espalhamento determinístico (sem Math.random, para pinos estáveis entre renders)
// ---------------------------------------------------------------------------

/** FNV-1a: hash estável de string → uint32. */
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Posiciona um projeto dentro do blob da sua zona de forma determinística:
 * o id vira um ângulo + raio (distribuição uniforme em disco via √), então
 * projetos da mesma zona se espalham sem colar todos no centro.
 */
export const schematicProjection: MapProjection = (p) => {
  const zona = normalizeZona(p.zona_smq);
  const blob = zona ? ZONA_BLOBS[zona] : SEM_ZONA_BLOB;

  const h = hashStr(p.id || "");
  const a = (h & 0xffff) / 0xffff; // 0..1
  const b = ((h >>> 16) & 0xffff) / 0xffff; // 0..1
  const theta = a * Math.PI * 2;
  const r = Math.sqrt(b); // uniforme no disco

  return {
    x: clamp(blob.cx + Math.cos(theta) * blob.rx * r, 3, 97),
    y: clamp(blob.cy + Math.sin(theta) * blob.ry * r, 4, 96),
  };
};

/**
 * ESBOÇO do mapa geográfico real (ativar quando os projetos tiverem lat/lng):
 * recebe os limites geográficos visíveis (bounding box) e converte lat/lng em %.
 * Basta trocar `schematicProjection` por `makeGeographicProjection(bounds)` na
 * Vitrine — o resto da tela não muda.
 */
export function makeGeographicProjection(bounds: {
  north: number;
  south: number;
  east: number;
  west: number;
}): MapProjection {
  const { north, south, east, west } = bounds;
  return (p) => {
    if (p.lat == null || p.lng == null) return null;
    const x = ((p.lng - west) / (east - west)) * 100;
    const y = ((north - p.lat) / (north - south)) * 100;
    return { x: clamp(x, 0, 100), y: clamp(y, 0, 100) };
  };
}

// ---------------------------------------------------------------------------
// Cor do pino por faixa de preço "a partir de" (compartilhada com a legenda)
// ---------------------------------------------------------------------------

export type FaixaPreco = {
  cor: string;
  label: string;
  /** Limite superior exclusivo (null = faixa aberta / "sob consulta"). */
  ate: number | null;
};

/** Faixas de preço da legenda, em ordem crescente; a última é "sob consulta". */
export const FAIXAS_PRECO: FaixaPreco[] = [
  { cor: "#87ACD1", label: "até R$ 210 mil", ate: 210_000 },
  { cor: "#4E7FB0", label: "R$ 210–270 mil", ate: 270_000 },
  { cor: "#2C588C", label: "R$ 270–330 mil", ate: 330_000 },
  { cor: "#0F2A4A", label: "acima de R$ 330 mil", ate: Infinity },
  { cor: "#AAB6C4", label: "sob consulta", ate: null },
];

const COR_SEM_PRECO = "#AAB6C4";

/** Cor do pino a partir do preço "a partir de" (null → cinza "sob consulta"). */
export function pinColor(preco: number | null | undefined): string {
  if (preco == null || !Number.isFinite(preco)) return COR_SEM_PRECO;
  for (const f of FAIXAS_PRECO) {
    if (f.ate != null && preco < f.ate) return f.cor;
  }
  return FAIXAS_PRECO[FAIXAS_PRECO.length - 2].cor; // acima de 330 mil
}
