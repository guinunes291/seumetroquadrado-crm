// Filtros rápidos + visões salvas da lista de leads. Persistência em localStorage
// por usuário (sem backend). Helpers puros para serem testáveis.

export type LeadFiltros = {
  status: string;
  origem: string;
  corretor: string;
  temperatura: string;
  periodo: string; // faixa por created_at (PERIODO_OPTIONS)
  dataInicio?: string;
  dataFim?: string;
  contato: string; // filtro rápido por última interação / follow-up
};

export const FILTRO_PADRAO: LeadFiltros = {
  status: "all",
  origem: "all",
  corretor: "all",
  temperatura: "all",
  periodo: "all",
  contato: "all",
};

/** Botões de filtro rápido (por última interação e follow-up). */
export const CONTATO_OPCOES = [
  { value: "contato_ontem", label: "Contato ontem" },
  { value: "contato_7d", label: "Contato 7 dias" },
  { value: "contato_30d", label: "Contato 30 dias" },
  { value: "com_followup", label: "Com follow-up" },
  { value: "sem_contato_5d", label: "Sem contato 5+ dias" },
] as const;

export type SavedView = { id: string; nome: string; filtros: LeadFiltros };

/** Visões prontas (sempre disponíveis, não removíveis). */
export const VISOES_PADRAO: SavedView[] = [
  { id: "preset-quentes", nome: "🔥 Quentes", filtros: { ...FILTRO_PADRAO, temperatura: "quente" } },
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
  { id: "preset-hoje", nome: "Criados hoje", filtros: { ...FILTRO_PADRAO, periodo: "hoje" } },
];

const STATUS_FINALIZADOS = ["contrato_fechado", "pos_venda", "perdido"];

/** Aplica o filtro rápido de contato a um lead (lado cliente). */
export function passaContato(
  contato: string,
  args: { ultimaInteracao: string | null; status: string; temFollowup: boolean },
): boolean {
  if (!contato || contato === "all") return true;
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
    default:
      return true;
  }
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
  return readJSON<LeadFiltros | null>(filtroKey(uid), null);
}

export function saveUltimoFiltro(uid: string, f: LeadFiltros): void {
  writeJSON(filtroKey(uid), f);
}
