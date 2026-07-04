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

// Cada zona ocupa uma FAIXA ampla do mapa (retângulo em %), e os pinos daquela
// zona se distribuem uniformemente dentro dela. Faixas grandes + distribuição
// uniforme evitam o amontoado que aparece quando há centenas de projetos.
type Band = { x0: number; y0: number; x1: number; y1: number };

const ZONA_BANDS: Record<MapZona, Band> = {
  Norte: { x0: 10, y0: 7, x1: 90, y1: 30 },
  Oeste: { x0: 5, y0: 33, x1: 33, y1: 71 },
  Centro: { x0: 36, y0: 37, x1: 64, y1: 65 },
  Leste: { x0: 66, y0: 32, x1: 95, y1: 70 },
  Sul: { x0: 10, y0: 72, x1: 90, y1: 93 },
};

// Projetos sem zona reconhecida (a maioria hoje) se espalham pelo mapa TODO em
// vez de amontoar num canto — assim a visão continua legível até que mais
// projetos ganhem zona/coordenada.
const DEFAULT_BAND: Band = { x0: 5, y0: 7, x1: 95, y1: 93 };

/** Posição dos rótulos de zona no SVG. */
export const ZONA_LABELS: { zona: MapZona; x: number; y: number }[] = [
  { zona: "Norte", x: 50, y: 15 },
  { zona: "Oeste", x: 14, y: 52 },
  { zona: "Centro", x: 50, y: 51 },
  { zona: "Leste", x: 83, y: 40 },
  { zona: "Sul", x: 50, y: 89 },
];

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
  const k = zona
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  // Correspondência exata primeiro; depois por substring, para casar valores
  // como "Zona Sul", "Sul (SP)" ou "Centro-Sul" → Centro (checado antes de Sul).
  if (ZONA_ALIASES[k]) return ZONA_ALIASES[k];
  if (k.includes("centro") || k.includes("central")) return "Centro";
  if (k.includes("norte")) return "Norte";
  if (k.includes("sul")) return "Sul";
  if (k.includes("leste")) return "Leste";
  if (k.includes("oeste")) return "Oeste";
  return null;
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

/** Fração 0..1 estável a partir de um hash uint32. */
const frac = (h: number) => (h & 0xffffff) / 0x1000000;

/**
 * Posiciona um projeto dentro da faixa da sua zona de forma determinística e
 * UNIFORME: dois hashes independentes (x e y) espalham os pinos por toda a
 * faixa, sem concentrar no centro. Projetos sem zona reconhecida usam a faixa
 * padrão (o mapa inteiro), evitando o amontoado num canto.
 */
export const schematicProjection: MapProjection = (p) => {
  const zona = normalizeZona(p.zona_smq);
  const band = zona ? ZONA_BANDS[zona] : DEFAULT_BAND;
  const id = p.id || "";
  const fx = frac(hashStr(id));
  const fy = frac(hashStr(id + "#y"));
  return {
    x: band.x0 + fx * (band.x1 - band.x0),
    y: band.y0 + fy * (band.y1 - band.y0),
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
