// Filtros rápidos + visões salvas da lista de leads. Persistência em localStorage
// por usuário (sem backend). Helpers puros para serem testáveis.

import { vendaRegistrada } from "@/lib/priority";

export type LeadFiltros = {
  status: string;
  origem: string;
  corretor: string;
  temperatura: string;
  periodo: string; // faixa por created_at (PERIODO_OPTIONS)
  dataInicio?: string;
  dataFim?: string;
  contato: string; // filtro rápido por última interação / follow-up
  // "parado há X+ dias" paramétrico (item 2.11): "all" ou um valor de
  // PARADO_OPCOES. String para viajar em URL/localStorage como os demais.
  paradoDias: string;
  // Resultado da ÚLTIMA análise de crédito (item 3.1b): "all" ou um valor de
  // ANALISE_FILTRO_OPCOES. Servido pela leads_filtered_v5.
  analise: string;
};

export const FILTRO_PADRAO: LeadFiltros = {
  status: "all",
  origem: "all",
  corretor: "all",
  temperatura: "all",
  periodo: "all",
  contato: "all",
  paradoDias: "all",
  analise: "all",
};

/** Recortes pelo resultado da última análise de crédito (RPC v5). */
export const ANALISE_FILTRO_OPCOES = [
  { value: "em_andamento", label: "Análise em andamento" },
  { value: "aprovada", label: "Análise aprovada" },
  { value: "aprovada_condicionada", label: "Aprovada com condição" },
  { value: "reprovada", label: "Análise reprovada" },
  // Agregado: tem análise e a última NÃO é aprovação (nem condicionada) —
  // enviada/pendente/reprovada num recorte só (retrabalho + espera).
  { value: "nao_aprovada", label: "Com análise, não aprovada" },
] as const;

/** Botões de filtro rápido (por última interação e follow-up). */
export const CONTATO_OPCOES = [
  { value: "contato_ontem", label: "Contato ontem" },
  { value: "contato_7d", label: "Contato 7 dias" },
  { value: "contato_30d", label: "Contato 30 dias" },
  { value: "com_followup", label: "Com follow-up" },
  { value: "sem_contato_5d", label: "Sem contato 5+ dias" },
  // Rotina de higiene: candidatos a descarte com motivo (RPC v3; nos
  // fallbacks v1/v2 a página filtra no cliente).
  { value: "sem_contato_30d", label: "Sem contato 30+ dias" },
] as const;

/** Faixas do filtro de período (por created_at; em Venda o servidor usa
 *  data_assinatura). Vivia em leads.index.tsx; movido para cá no item 2.7b
 *  para /leads e o modo Consulta de Atender lerem o MESMO vocabulário. */
export const PERIODO_OPTIONS = [
  { value: "all", label: "Qualquer período" },
  { value: "hoje", label: "Hoje" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "custom", label: "Intervalo personalizado" },
] as const;

export type Periodo = (typeof PERIODO_OPTIONS)[number]["value"];

function periodoStart(p: Periodo): Date | null {
  const now = new Date();
  if (p === "hoje") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (p === "7d") return new Date(now.getTime() - 7 * 86400000);
  if (p === "30d") return new Date(now.getTime() - 30 * 86400000);
  if (p === "90d") return new Date(now.getTime() - 90 * 86400000);
  return null;
}

function periodoEnd(p: Periodo): Date | null {
  if (p !== "hoje") return null;
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function customDateStart(value: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function customDateEnd(value: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Intervalo [start, end] de um período selecionado (custom usa as datas). */
export function rangeDoPeriodo(
  periodo: Periodo,
  dataInicio: string,
  dataFim: string,
): { start: Date | null; end: Date | null } {
  if (periodo === "custom") {
    return { start: customDateStart(dataInicio), end: customDateEnd(dataFim) };
  }
  return { start: periodoStart(periodo), end: periodoEnd(periodo) };
}

/** Réguas oferecidas no filtro "parado há X+ dias" (a RPC v4 aceita 1..365). */
export const PARADO_OPCOES = [
  { value: "3", label: "3+ dias" },
  { value: "7", label: "7+ dias" },
  { value: "15", label: "15+ dias" },
  { value: "30", label: "30+ dias" },
  { value: "60", label: "60+ dias" },
  { value: "90", label: "90+ dias" },
  { value: "180", label: "180+ dias" },
] as const;

export type SavedView = { id: string; nome: string; filtros: LeadFiltros };

/** Visões prontas (sempre disponíveis, não removíveis). */
export const VISOES_PADRAO: SavedView[] = [
  {
    id: "preset-quentes",
    nome: "🔥 Quentes",
    filtros: { ...FILTRO_PADRAO, temperatura: "quente" },
  },
  {
    id: "preset-followup",
    nome: "Com follow-up",
    filtros: { ...FILTRO_PADRAO, contato: "com_followup" },
  },
  {
    id: "preset-parados",
    nome: "Sem contato 5+ dias",
    filtros: { ...FILTRO_PADRAO, contato: "sem_contato_5d" },
  },
  {
    id: "preset-higiene",
    nome: "Sem contato 30+ dias (descartar?)",
    filtros: { ...FILTRO_PADRAO, contato: "sem_contato_30d" },
  },
  { id: "preset-hoje", nome: "Criados hoje", filtros: { ...FILTRO_PADRAO, periodo: "hoje" } },
];

const STATUS_FINALIZADOS = ["contrato_fechado", "pos_venda", "perdido"];

/** Aplica o filtro rápido de contato a um lead (lado cliente).
 *  Lead com venda registrada encerrou o processo: fica fora de TODO recorte
 *  de atendimento (espelho de leads_filtered_v3). */
export function passaContato(
  contato: string,
  args: {
    ultimaInteracao: string | null;
    status: string;
    temFollowup: boolean;
    dataVenda?: string | null;
  },
): boolean {
  if (!contato || contato === "all") return true;
  if (vendaRegistrada(args)) return false;
  const ui = args.ultimaInteracao ? new Date(args.ultimaInteracao).getTime() : null;
  const now = Date.now();
  const DIA = 86_400_000;
  switch (contato) {
    case "contato_ontem": {
      const hoje0 = new Date();
      hoje0.setHours(0, 0, 0, 0);
      return ui != null && ui >= hoje0.getTime() - DIA && ui < hoje0.getTime();
    }
    case "contato_7d":
      return ui != null && ui >= now - 7 * DIA;
    case "contato_30d":
      return ui != null && ui >= now - 30 * DIA;
    case "com_followup":
      return args.temFollowup;
    case "sem_contato_5d":
      return (ui == null || ui < now - 5 * DIA) && !STATUS_FINALIZADOS.includes(args.status);
    case "sem_contato_30d":
      return (ui == null || ui < now - 30 * DIA) && !STATUS_FINALIZADOS.includes(args.status);
    default:
      // Valor desconhecido NÃO passa — o espelho do fim do ELSE true na v4:
      // recorte que o código não conhece jamais devolve tudo em silêncio.
      return false;
  }
}

/** Aplica o recorte "parado há X+ dias" a um lead (fallback client-side da v4). */
export function passaParado(
  paradoDias: string,
  args: { ultimaInteracao: string | null; status: string; dataVenda?: string | null },
): boolean {
  if (!paradoDias || paradoDias === "all") return true;
  if (vendaRegistrada(args)) return false;
  const dias = Number(paradoDias);
  if (!Number.isFinite(dias) || dias < 1) return false;
  const ui = args.ultimaInteracao ? new Date(args.ultimaInteracao).getTime() : null;
  const DIA = 86_400_000;
  return (ui == null || ui < Date.now() - dias * DIA) && !STATUS_FINALIZADOS.includes(args.status);
}

// ---------------------------------------------------------------------------
// Drill-through: filtros na URL (?status=…&corretor=…)
// ---------------------------------------------------------------------------

/** Chaves de LeadFiltros que viajam na URL para drill-through das telas de gestão. */
export const FILTRO_URL_KEYS = [
  "status",
  "origem",
  "corretor",
  "temperatura",
  "periodo",
  "dataInicio",
  "dataFim",
  "contato",
  "paradoDias",
  "analise",
] as const;

export type LeadSearchFiltros = Partial<Pick<LeadFiltros, (typeof FILTRO_URL_KEYS)[number]>>;

/** Lê os filtros presentes na search da URL (ignora vazios e não-string). */
export function searchParaFiltros(search: Record<string, unknown>): LeadSearchFiltros {
  const out: LeadSearchFiltros = {};
  for (const k of FILTRO_URL_KEYS) {
    const v = search[k];
    if (typeof v === "string" && v !== "" && v !== "all") out[k] = v;
  }
  return out;
}

/** Converte filtros em search params de URL, omitindo defaults ("all"/vazio). */
export function filtrosParaSearch(f: Partial<LeadFiltros>): LeadSearchFiltros {
  const out: LeadSearchFiltros = {};
  for (const k of FILTRO_URL_KEYS) {
    const v = f[k];
    if (typeof v === "string" && v !== "" && v !== "all") out[k] = v;
  }
  return out;
}

/** True quando a URL carrega ao menos um filtro de drill (URL vence localStorage). */
export function temFiltrosNaUrl(search: Record<string, unknown>): boolean {
  return Object.keys(searchParaFiltros(search)).length > 0;
}

const PERIODOS_VALIDOS = ["all", "hoje", "7d", "30d", "90d", "custom"];
const TEMPERATURAS_VALIDAS = ["quente", "morno", "frio"];

/**
 * Mescla filtros da URL sobre o padrão, saneando valores que a UI não
 * conhece (um valor inválido em Select quebraria o controle). Datas soltas
 * (dataInicio/dataFim sem periodo) ativam o modo "custom"; quem não gerencia
 * não filtra por corretor.
 */
export function mesclarFiltrosDaUrl(url: LeadSearchFiltros, canManage: boolean): LeadFiltros {
  const f: LeadFiltros = { ...FILTRO_PADRAO, ...url };
  if (!PERIODOS_VALIDOS.includes(f.periodo)) f.periodo = "all";
  if ((url.dataInicio || url.dataFim) && f.periodo === "all") f.periodo = "custom";
  if (f.temperatura !== "all" && !TEMPERATURAS_VALIDAS.includes(f.temperatura)) {
    f.temperatura = "all";
  }
  if (f.contato !== "all" && !CONTATO_OPCOES.some((o) => o.value === f.contato)) {
    f.contato = "all";
  }
  if (f.paradoDias !== "all" && !PARADO_OPCOES.some((o) => o.value === f.paradoDias)) {
    f.paradoDias = "all";
  }
  if (!canManage) f.corretor = "all";
  return f;
}

// ---------------------------------------------------------------------------
// Persistência (localStorage por usuário)
// ---------------------------------------------------------------------------

const viewsKey = (uid: string) => `smq:leads-views:${uid}`;
const filtroKey = (uid: string) => `smq:leads-filtros:${uid}`;

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* cota cheia / modo privado: ignora */
  }
}

export function loadViews(uid: string): SavedView[] {
  return readJSON<SavedView[]>(viewsKey(uid), []);
}

export function saveViews(uid: string, views: SavedView[]): void {
  writeJSON(viewsKey(uid), views);
}

export function loadUltimoFiltro(uid: string): LeadFiltros | null {
  const raw = readJSON<LeadFiltros | null>(filtroKey(uid), null);
  if (!raw) return null;
  // Nunca restaura recorte por período: leads (principalmente
  // "aguardando atendimento") acumulam ao longo do tempo, e um filtro
  // persistido de 7/30/90d escondia silenciosamente leads antigos do
  // corretor (aparecia "1" em vez de dezenas).
  return { ...raw, periodo: "all", dataInicio: "", dataFim: "" };
}

export function saveUltimoFiltro(uid: string, f: LeadFiltros): void {
  // Persiste tudo menos o período — ver loadUltimoFiltro.
  writeJSON(filtroKey(uid), { ...f, periodo: "all", dataInicio: "", dataFim: "" });
}
