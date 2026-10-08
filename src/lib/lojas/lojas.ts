// Mapa de Lojas — os stands de vendas das construtoras parceiras, para o
// atendimento ao cliente: "onde fica a loja da Cury mais perto de mim?", "me
// manda o endereço do decorado".
//
// É o par da Vitrine (Mapa de Mercado), mas responde outra pergunta: a Vitrine
// mostra ONDE ESTÁ O PRODUTO (o terreno do empreendimento); este mapa mostra
// ONDE O CLIENTE É ATENDIDO (o stand, que muitas vezes fica longe da obra e
// atende vários produtos). Por isso é página própria, e não uma camada da
// Vitrine: misturar os dois pinos no mesmo mapa faria o corretor mandar o
// cliente para um canteiro de obras.
//
// Mesmo desenho da Vitrine: o parsing da planilha mora aqui, puro e testável;
// quem busca a planilha é a rota de servidor `/api/lojas-planilha` (o gviz do
// Google não manda CORS, e o JSONP do mapa standalone não entra no app).

import { LOJAS_SEMENTE } from "@/lib/lojas/lojas-base";
import { mesmaConstrutora } from "@/lib/construtoras";
import { linkSeguro } from "@/lib/vitrine/planilha-mercado";

/** Planilha oficial dos stands (a mesma do mapa standalone public/mapa-lojas.html). */
export const PLANILHA_LOJAS = { id: "1TJo4t_WaZwt83ydgUL4OemVpbgRvxb0uTMxxa2BHi-0" } as const;

export type Loja = {
  /** Estável entre recargas: construtora + endereço (a planilha não tem id). */
  id: string;
  construtora: string;
  nome: string;
  endereco: string;
  bairro: string;
  zona: string;
  lat: number | null;
  lng: number | null;
  /** true = coordenada conferida (planilha ou endereço geocodificado); false =
   *  estimada — o pino aparece apagado e o popup avisa. */
  exata: boolean;
  fotoUrl: string | null;
  obs: string | null;
};

/** O que a base de segurança declara por stand (lojas-base.ts). */
export type LojaSemente = {
  construtora: string;
  nome: string;
  endereco: string;
  bairro: string;
  zona: string;
  lat: number;
  lng: number;
  obs?: string;
};

export type Ponto = { lat: number; lng: number };

// ---------------------------------------------------------------------------
// Identidade
// ---------------------------------------------------------------------------

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function slug(s: string): string {
  return semAcento(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Dá id às lojas; dois stands no mesmo endereço da mesma construtora ganham sufixo. */
function comIds(lojas: Omit<Loja, "id">[]): Loja[] {
  const usados = new Map<string, number>();
  return lojas.map((l) => {
    const base = slug(`${l.construtora} ${l.endereco}`) || "loja";
    const n = (usados.get(base) ?? 0) + 1;
    usados.set(base, n);
    return { ...l, id: n === 1 ? base : `${base}-${n}` };
  });
}

/** Os 45 stands do mapa standalone, com posição estimada. */
export const LOJAS_BASE: readonly Loja[] = comIds(
  LOJAS_SEMENTE.map((s) => ({
    construtora: s.construtora,
    nome: s.nome,
    endereco: s.endereco,
    bairro: s.bairro,
    zona: s.zona,
    lat: s.lat,
    lng: s.lng,
    exata: false,
    fotoUrl: null,
    obs: s.obs ?? null,
  })),
);

// ---------------------------------------------------------------------------
// Planilha
// ---------------------------------------------------------------------------

/**
 * Colunas da aba, na ordem do mapa standalone: Construtora · Nome do stand ·
 * Endereço · Bairro · Zona · Latitude · Longitude · Foto (link) · Ativo · Obs.
 * "Ativo" = "não" tira o stand do mapa sem apagar a linha.
 */
const COLUNAS = {
  construtora: 0,
  nome: 1,
  endereco: 2,
  bairro: 3,
  zona: 4,
  lat: 5,
  lng: 6,
  foto: 7,
  ativo: 8,
  obs: 9,
} as const;

const celula = (r: string[], i: number): string => (r[i] ?? "").trim();

/** "-23,5465" e "-23.5465" valem; 0, vazio e fora da faixa não. */
function coordenada(v: string, limite: number): number | null {
  const n = Number.parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n !== 0 && Math.abs(n) <= limite ? n : null;
}

/** Comparação de endereço tolerante a "Av."/"Avenida", acento e espaço. */
function chaveEndereco(endereco: string): string {
  return semAcento(normalizarEndereco(endereco))
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Converte a matriz da planilha em lojas. A linha de cabeçalho (coluna A =
 * "Construtora") é pulada; linha sem construtora ou sem endereço também — o
 * mapa não tem o que mostrar. Sem coordenada na planilha, a loja herda a
 * posição ESTIMADA do mesmo endereço na base; sem par na base, fica só na lista
 * até o navegador achar o endereço.
 */
export function rowsToLojas(rows: string[][], base: readonly Loja[] = LOJAS_BASE): Loja[] {
  const daBase = new Map(base.map((l) => [chaveEndereco(l.endereco), l]));
  const lojas: Omit<Loja, "id">[] = [];

  for (const r of rows) {
    const construtora = celula(r, COLUNAS.construtora);
    const endereco = celula(r, COLUNAS.endereco);
    if (!construtora || !endereco) continue;
    if (semAcento(construtora) === "construtora") continue;
    if (/^n[aã]o$/i.test(celula(r, COLUNAS.ativo))) continue;

    const bairro = celula(r, COLUNAS.bairro);
    const lat = coordenada(celula(r, COLUNAS.lat), 90);
    const lng = coordenada(celula(r, COLUNAS.lng), 180);
    const temCoordenada = lat != null && lng != null;
    const par = temCoordenada ? null : daBase.get(chaveEndereco(endereco));

    lojas.push({
      construtora,
      nome: celula(r, COLUNAS.nome) || bairro || endereco,
      endereco,
      bairro,
      zona: celula(r, COLUNAS.zona) || "Outras",
      lat: temCoordenada ? lat : (par?.lat ?? null),
      lng: temCoordenada ? lng : (par?.lng ?? null),
      exata: temCoordenada || (par?.exata ?? false),
      fotoUrl: linkSeguro(celula(r, COLUNAS.foto)),
      obs: celula(r, COLUNAS.obs) || null,
    });
  }

  return comIds(lojas);
}

// ---------------------------------------------------------------------------
// Filtros e ordenação
// ---------------------------------------------------------------------------

export type FiltrosLojas = {
  q: string;
  /** null = todas. */
  construtora: string | null;
  /** null = todas. */
  zona: string | null;
};

export const filtrosLojasVazios: FiltrosLojas = { q: "", construtora: null, zona: null };

/** A busca ignora acento e caixa: "agua branca" acha "Água Branca". */
export function filtrarLojas(lojas: readonly Loja[], f: FiltrosLojas): Loja[] {
  const termo = semAcento(f.q.trim());
  return lojas.filter((l) => {
    if (f.construtora && l.construtora !== f.construtora) return false;
    if (f.zona && l.zona !== f.zona) return false;
    if (!termo) return true;
    return semAcento(`${l.construtora} ${l.nome} ${l.endereco} ${l.bairro} ${l.zona}`).includes(
      termo,
    );
  });
}

/** Construtoras com a contagem de stands, em ordem alfabética. */
export function construtorasDasLojas(
  lojas: readonly Loja[],
): { construtora: string; total: number }[] {
  const contagem = new Map<string, number>();
  for (const l of lojas) contagem.set(l.construtora, (contagem.get(l.construtora) ?? 0) + 1);
  return [...contagem.entries()]
    .map(([construtora, total]) => ({ construtora, total }))
    .sort((a, b) => a.construtora.localeCompare(b.construtora, "pt-BR"));
}

/** Ordem dos chips do mapa standalone; zona fora da lista entra no fim. */
const ORDEM_ZONAS = ["Zona Norte", "Zona Leste", "Zona Sul", "Zona Oeste", "Centro", "Grande SP"];

export function zonasDasLojas(lojas: readonly Loja[]): string[] {
  const presentes = new Set(lojas.map((l) => l.zona).filter(Boolean));
  const conhecidas = ORDEM_ZONAS.filter((z) => presentes.has(z));
  const outras = [...presentes]
    .filter((z) => !ORDEM_ZONAS.includes(z))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  return [...conhecidas, ...outras];
}

/** Distância em linha reta (haversine), em km. */
export function distanciaKm(a: Ponto, b: Ponto): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function distanciaDaLoja(loja: Loja, origem: Ponto | null): number | null {
  if (!origem || loja.lat == null || loja.lng == null) return null;
  return distanciaKm(origem, { lat: loja.lat, lng: loja.lng });
}

/** Com origem: mais perto primeiro, sem posição por último. Sem origem: a ordem da planilha. */
export function ordenarPorDistancia(lojas: readonly Loja[], origem: Ponto | null): Loja[] {
  if (!origem) return [...lojas];
  const d = (l: Loja) => distanciaDaLoja(l, origem) ?? Number.POSITIVE_INFINITY;
  return [...lojas].sort((a, b) => d(a) - d(b));
}

/** "850 m" até 1 km; "2,3 km" daí em diante; "15 km" acima de 10. */
export function formatarDistancia(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  if (km < 10) return `${km.toFixed(1).replace(".", ",")} km`;
  return `${Math.round(km)} km`;
}

// ---------------------------------------------------------------------------
// Cor e iniciais do pino
// ---------------------------------------------------------------------------

/** As cores do mapa standalone, para o pino não mudar de cor na migração. */
const CORES_CONSTRUTORA: readonly { nome: string; cor: string }[] = [
  { nome: "Cavazani", cor: "#1f77b4" },
  { nome: "Vitta", cor: "#8e44ad" },
  { nome: "Cury", cor: "#e67e22" },
  { nome: "Emccamp", cor: "#16a085" },
  { nome: "Econ", cor: "#c0392b" },
  { nome: "Direcional", cor: "#2c3e50" },
  { nome: "Riva", cor: "#d81b8a" },
  { nome: "Longitude", cor: "#6d4c41" },
  { nome: "Mundo Apto", cor: "#2e86c1" },
  { nome: "Trisul", cor: "#6c3483" },
];

const CORES_EXTRAS = ["#7f8c8d", "#b8860b", "#117a65", "#a04000", "#5d6d7e", "#1a5276"];

/**
 * Construtora nova na planilha ganha cor por hash do nome — determinística, ao
 * contrário do standalone (que dava cor pela ordem de chegada e trocava a cor
 * de uma marca quando outra entrava antes dela).
 */
export function corDaConstrutora(construtora: string): string {
  const fixa = CORES_CONSTRUTORA.find((c) => mesmaConstrutora(construtora, c.nome));
  if (fixa) return fixa.cor;
  let h = 0;
  for (const ch of semAcento(construtora)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CORES_EXTRAS[h % CORES_EXTRAS.length];
}

/** "Longitude Incorporadora" → "LI"; "Cury" → "CU". */
export function iniciaisDaConstrutora(construtora: string): string {
  const palavras = construtora.trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return "?";
  if (palavras.length === 1) return palavras[0].slice(0, 2).toUpperCase();
  return palavras
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Links para o cliente
// ---------------------------------------------------------------------------

/** Endereço para o Google: a capital por padrão; na Grande SP o bairro já traz a cidade. */
export function enderecoCompleto(loja: Pick<Loja, "endereco" | "bairro" | "zona">): string {
  const cidade = loja.zona === "Grande SP" ? "SP" : "São Paulo, SP";
  return [loja.endereco, loja.bairro, cidade].filter(Boolean).join(", ");
}

/** Rota até o endereço (não até o pino: o pino pode ser estimado, o endereço não). */
export function linkComoChegar(loja: Pick<Loja, "endereco" | "bairro" | "zona">): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(enderecoCompleto(loja))}`;
}

/** Busca do stand no Google Maps — é onde ficam as fotos e o horário de funcionamento. */
export function linkFotosGoogle(loja: Loja): string {
  const q = `${loja.construtora} stand de vendas ${enderecoCompleto(loja)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Street View só com coordenada — sem ela não há para onde apontar a câmera. */
export function linkStreetView(loja: Loja): string | null {
  if (loja.lat == null || loja.lng == null) return null;
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${loja.lat},${loja.lng}`;
}

// ---------------------------------------------------------------------------
// Refinamento de posição pelo endereço (OpenStreetMap / Nominatim)
// ---------------------------------------------------------------------------
// As coordenadas da base são estimadas. O mapa standalone já resolvia isso no
// navegador: geocodifica o endereço, aceita o resultado só se ele cair perto
// da estimativa e guarda no localStorage — cada endereço custa uma consulta
// por navegador, uma vez. As regras ficam aqui; o hook só agenda as consultas.

/** A MESMA chave e o mesmo formato do standalone (public/mapa-lojas.html): o
 *  endereço achado por um dos dois mapas já vale para o outro no navegador. */
export const CHAVE_CACHE_GEO = "smq_stands_geo";

export type CacheGeo = Record<string, [number, number]>;

export function chaveGeo(loja: Pick<Loja, "endereco" | "bairro">): string {
  return `${loja.endereco}|${loja.bairro}`;
}

/** "Av. X, 10 – Shopping Y" → "Avenida X, 10": o Nominatim erra com abreviação e complemento. */
export function normalizarEndereco(endereco: string): string {
  return endereco
    .replace(/\s+/g, " ")
    .replace(/\s+[–—-]\s+.*$/, "")
    .replace(/^R\.\s*/i, "Rua ")
    .replace(/^Av\.?\s+/i, "Avenida ")
    .replace(/^Estr\.\s*/i, "Estrada ")
    .trim();
}

export function urlGeocodificacao(loja: Pick<Loja, "endereco" | "bairro" | "zona">): string {
  const cidade = loja.zona === "Grande SP" ? "SP" : "São Paulo";
  const q = [normalizarEndereco(loja.endereco), loja.bairro, cidade].filter(Boolean).join(", ");
  return `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`;
}

/** Mancha da Grande SP: resultado fora dela é homônimo de outra cidade. */
const LIMITES_GRANDE_SP = { latMin: -24.1, latMax: -23.2, lngMin: -47, lngMax: -46.2 };
/** Raio de confiança em torno da estimativa — a mesma regra do standalone. */
const RAIO_ACEITE_KM = 5;

export function aceitarGeocodificacao(loja: Loja, resultado: Ponto): boolean {
  const { lat, lng } = resultado;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (loja.lat == null || loja.lng == null) {
    const b = LIMITES_GRANDE_SP;
    return lat > b.latMin && lat < b.latMax && lng > b.lngMin && lng < b.lngMax;
  }
  return distanciaKm({ lat: loja.lat, lng: loja.lng }, resultado) < RAIO_ACEITE_KM;
}

/** Aplica as posições já achadas; coordenada vinda da planilha nunca é sobrescrita. */
export function aplicarCacheGeo(lojas: readonly Loja[], cache: CacheGeo): Loja[] {
  return lojas.map((l) => {
    if (l.exata) return l;
    const c = cache[chaveGeo(l)];
    return c ? { ...l, lat: c[0], lng: c[1], exata: true } : l;
  });
}

/** Lê o cache tolerando lixo: entrada malformada é ignorada, não derruba o mapa. */
export function lerCacheGeo(bruto: string | null): CacheGeo {
  if (!bruto) return {};
  try {
    const obj = JSON.parse(bruto) as unknown;
    if (!obj || typeof obj !== "object") return {};
    const out: CacheGeo = {};
    for (const [k, v] of Object.entries(obj)) {
      if (
        Array.isArray(v) &&
        v.length === 2 &&
        typeof v[0] === "number" &&
        typeof v[1] === "number"
      ) {
        out[k] = [v[0], v[1]];
      }
    }
    return out;
  } catch {
    return {};
  }
}
