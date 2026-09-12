// Leitura da planilha de mercado (Google Sheets) que alimenta o Mapa de Mercado.
//
// É a base viva que a operação mantém à mão — inclui empreendimentos de
// construtoras parceiras que ainda não viraram projeto no CRM. O mapa mescla as
// duas fontes (ver `mesclarMercado`), com o catálogo do CRM mandando no conflito.
//
// O parsing mora aqui, puro e testável; quem busca a planilha é a rota de
// servidor `/api/mercado-planilha` (o browser não consegue: o gviz do Google não
// manda CORS, e o mapa standalone contornava isso com JSONP — que não queremos
// dentro do app).

/** Planilha oficial do mapa de mercado (a mesma do public/mapa-mercado.html). */
export const PLANILHA_MERCADO = {
  id: "1KL0xWcBXaravUAVW_1OBYf8QuXzcbSGIq39If5Mhz9I",
  gid: "1832124720",
} as const;

export function gvizUrl(id: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/gviz/tq?gid=${encodeURIComponent(gid)}&headers=0&tqx=out:json`;
}

export type PlanilhaEmpreendimento = {
  construtora: string | null;
  nome: string;
  status: string | null;
  cidade: string | null;
  regiao: string | null;
  endereco: string | null;
  lat: number | null;
  lng: number | null;
  precoMin: number | null;
  precoMax: number | null;
  m2min: number | null;
  m2max: number | null;
  bookUrl: string | null;
  tabelaUrl: string | null;
  atualizadoEm: string | null;
};

type GvizCell = { v?: unknown } | null;
type GvizResponse = { table?: { rows?: { c?: GvizCell[] }[] } };

/**
 * Desembrulha a resposta do gviz, que vem embrulhada em JSONP mesmo com
 * `out:json`: um comentário de ruído seguido de
 * `google.visualization.Query.setResponse( ... );`. Pegamos do primeiro `{` ao
 * último `}` em vez de casar o invólucro, que o Google já mudou no passado.
 */
export function unwrapGviz(body: string): GvizResponse {
  const abre = body.indexOf("{");
  const fecha = body.lastIndexOf("}");
  if (abre === -1 || fecha <= abre) throw new SyntaxError("resposta_gviz_invalida");
  return JSON.parse(body.slice(abre, fecha + 1)) as GvizResponse;
}

/** Matriz de células crua — datas do Sheets viram "dd/mm/aaaa". */
export function gvizToRows(json: GvizResponse): string[][] {
  const rows = json?.table?.rows ?? [];
  return rows.map((row) =>
    (row.c ?? []).map((cell) => {
      const v = cell?.v;
      if (v == null) return "";
      if (typeof v === "string") {
        const data = v.match(/^Date\((\d+),(\d+),(\d+)\)$/);
        if (data) {
          const [, ano, mes, dia] = data;
          return `${dia.padStart(2, "0")}/${String(Number(mes) + 1).padStart(2, "0")}/${ano}`;
        }
      }
      return String(v);
    }),
  );
}

const texto = (v: string | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

const numero = (v: string | undefined): number | null => {
  const limpo = (v ?? "").replace(/[^\d.,-]/g, "").replace(",", ".");
  const n = Number.parseFloat(limpo);
  return Number.isFinite(n) ? n : null;
};

/**
 * Trava de segurança da planilha: nenhum imóvel MCMV custa menos de R$ 10 mil.
 * Valor menor é erro de formatação (o Sheets leu "285.000" como 285), então
 * assume-se que o real é 1000× maior — mesma regra do mapa standalone.
 */
export function normalizarPreco(v: number | null): number | null {
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  return v < 10_000 ? v * 1000 : v;
}

/** Só http(s) e sem credenciais embutidas — a planilha é editada por humanos. */
export function linkSeguro(v: string | undefined): string | null {
  const bruto = texto(v);
  if (!bruto || bruto.length > 2048) return null;
  try {
    const url = new URL(bruto);
    const ok =
      (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
    return ok ? url.toString() : null;
  } catch {
    return null;
  }
}

const COLUNAS = {
  construtora: 0,
  nome: 1,
  status: 2,
  cidade: 3,
  regiao: 4,
  endereco: 5,
  lat: 6,
  lng: 7,
  precoMin: 8,
  precoMax: 9,
  m2min: 10,
  m2max: 11,
  book: 12,
  tabela: 13,
  // 14 (Contato Comercial) e 15 (WhatsApp) são dados de pessoa e NÃO saem da
  // planilha — o mapa nunca precisou deles.
  atualizadoEm: 16,
} as const;

const coordenada = (v: string | undefined, limite: number): number | null => {
  const n = numero(v);
  return n != null && n !== 0 && Math.abs(n) <= limite ? n : null;
};

/**
 * Converte a matriz da planilha em empreendimentos. Devolve `null` quando não
 * acha o cabeçalho "Construtora" — sinal de que a aba mudou de forma e é melhor
 * falhar visivelmente do que servir lixo.
 */
export function rowsToEmpreendimentos(rows: string[][]): PlanilhaEmpreendimento[] | null {
  const cabecalho = rows.findIndex((r) => (r[COLUNAS.construtora] ?? "").trim() === "Construtora");
  if (cabecalho === -1) return null;

  return rows
    .slice(cabecalho + 1)
    .map((r) => ({
      construtora: texto(r[COLUNAS.construtora]),
      nome: (r[COLUNAS.nome] ?? "").trim(),
      status: texto(r[COLUNAS.status]),
      cidade: texto(r[COLUNAS.cidade]),
      regiao: texto(r[COLUNAS.regiao]),
      endereco: texto(r[COLUNAS.endereco]),
      lat: coordenada(r[COLUNAS.lat], 90),
      lng: coordenada(r[COLUNAS.lng], 180),
      precoMin: normalizarPreco(numero(r[COLUNAS.precoMin])),
      precoMax: normalizarPreco(numero(r[COLUNAS.precoMax])),
      m2min: numero(r[COLUNAS.m2min]),
      m2max: numero(r[COLUNAS.m2max]),
      bookUrl: linkSeguro(r[COLUNAS.book]),
      tabelaUrl: linkSeguro(r[COLUNAS.tabela]),
      atualizadoEm: texto(r[COLUNAS.atualizadoEm]),
    }))
    .filter((e) => e.nome !== "" && !e.nome.toLowerCase().includes("apagar antes de usar"));
}
