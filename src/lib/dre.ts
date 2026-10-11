/**
 * Módulo DRE — tipos, metadados da cascata, fetchers e formatação.
 *
 * O cálculo mora 100% no banco (RPC dre_calcular, migration dre_modulo): aqui
 * só se pivota o resultado (linha × mês) para a grade da tela e se formata.
 * Percentuais em dre_parametros são FRAÇÃO (0.04 = 4%); na UI eles entram e
 * saem como pontos percentuais ("4,00").
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { escHtml, imprimirHtml } from "@/lib/pdf-print";
import { estilosMarca, faixaMarca, MARCA, RODAPE_INTERNO } from "@/lib/pdf-marca";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type DreRegime = "competencia" | "caixa";
export type DreModoPct = "venda" | "parametro";

export type DreUnidade = Tables<"dre_unidades">;
export type DreParametro = Tables<"dre_parametros">;
export type DreCategoria = Tables<"dre_categorias_despesa">;
export type DreSocio = Tables<"dre_socios_participacao">;
export type DreMembro = Tables<"dre_unidade_membros">;

export type DreLinhaKey =
  | "vendas_qtd"
  | "vgv"
  | "faturamento"
  | "impostos"
  | "receita_liquida"
  | "consultor"
  | "gerente"
  | "socio_operador"
  | "margem_empresa"
  | "custos_fixos"
  | "ebitda"
  | "reinvestimento"
  | "reserva_expansao"
  | "lucro_distribuicao"
  | "resultado_mes"
  | "pro_labore"
  | "caixa_retido"
  | "caixa_acumulado";

export type DreLinhaDef = {
  key: DreLinhaKey;
  rotulo: string;
  /** Linha (=): negrito + fundo destacado. */
  subtotal?: boolean;
  /** false = contagem (vendas_qtd); default true = moeda. */
  moeda?: boolean;
  /** Célula clicável: abre o drawer com as vendas/despesas que compõem o número. */
  drill?: "vendas" | "despesas";
  /** Linha de dedução: no comparativo com orçado, gastar MENOS que o orçado é bom (Δ verde). */
  despesa?: boolean;
  /** Cabeçalho de seção renderizado antes desta linha. */
  secaoAntes?: string;
};

/** A cascata, na ordem exata da planilha (mesma ordem do RPC dre_calcular). */
export const DRE_LINHAS: DreLinhaDef[] = [
  { key: "vendas_qtd", rotulo: "Vendas no mês", moeda: false, drill: "vendas" },
  { key: "vgv", rotulo: "VGV do mês", drill: "vendas" },
  { key: "faturamento", rotulo: "Faturamento (comissão)", drill: "vendas" },
  { key: "impostos", rotulo: "(−) Impostos sobre faturamento", despesa: true },
  { key: "receita_liquida", rotulo: "(=) Receita Líquida", subtotal: true },
  { key: "consultor", rotulo: "(−) Consultor", drill: "vendas", despesa: true },
  { key: "gerente", rotulo: "(−) Gerente", drill: "vendas", despesa: true },
  { key: "socio_operador", rotulo: "(−) Sócio operador", drill: "vendas", despesa: true },
  { key: "margem_empresa", rotulo: "(=) Margem da Empresa", subtotal: true },
  {
    key: "custos_fixos",
    rotulo: "(−) Custos Fixos e Investimentos",
    drill: "despesas",
    despesa: true,
  },
  { key: "ebitda", rotulo: "(=) EBITDA", subtotal: true },
  { key: "reinvestimento", rotulo: "(−) Reinvestimento", despesa: true },
  { key: "reserva_expansao", rotulo: "(−) Reserva de expansão", despesa: true },
  { key: "lucro_distribuicao", rotulo: "(=) Lucro para Distribuição", subtotal: true },
  { key: "resultado_mes", rotulo: "Resultado do mês", secaoAntes: "Fluxo de caixa" },
  { key: "pro_labore", rotulo: "(−) Distribuição de pró-labore", despesa: true },
  { key: "caixa_retido", rotulo: "(=) Caixa retido no mês", subtotal: true },
  { key: "caixa_acumulado", rotulo: "Caixa acumulado (fim do mês)" },
];

export const DRE_LINHA_KEYS = DRE_LINHAS.map((l) => l.key);

export const MESES_CURTOS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

/** Grade pivotada: por linha, valores[0] = total do ano, [1..12] = meses. */
export type DreGrade = Record<DreLinhaKey, number[]>;

export type DreAvisos = {
  pendentes_qtd: number;
  pendentes_vgv: number;
  sem_recebimento_qtd: number;
  sem_recebimento_vgv: number;
  sem_unidade_qtd: number;
  sem_unidade_vgv: number;
};

export type DreDrillVenda = {
  venda_id: string;
  lead_id: string | null;
  unidade_nome: string;
  cliente: string | null;
  empreendimento: string | null;
  corretor_nome: string | null;
  data_assinatura: string;
  data_recebimento: string | null;
  vgv: number;
  faturamento: number;
  impostos: number;
  consultor: number;
  gerente: number;
  socio_operador: number;
};

export type DreDrillDespesa = {
  id: string;
  descricao: string;
  valor: number;
  competencia: string;
  data_pagamento: string | null;
  fornecedor: string | null;
  recorrente: boolean;
  categoria: { nome: string } | null;
  unidade: { nome: string } | null;
};

// ---------------------------------------------------------------------------
// Fetchers (React Query chama estes; RLS/guardas valem no banco)
// ---------------------------------------------------------------------------

export async function fetchDreUnidades(): Promise<DreUnidade[]> {
  const { data, error } = await supabase
    .from("dre_unidades")
    .select("*")
    .order("ordem")
    .order("nome");
  if (error) throw error;
  return data ?? [];
}

export async function fetchDreGrade(
  unidadeId: string | null,
  ano: number,
  regime: DreRegime,
  modoPct: DreModoPct,
): Promise<DreGrade> {
  const { data, error } = await supabase.rpc("dre_calcular", {
    p_unidade_id: unidadeId as string,
    p_ano: ano,
    p_regime: regime,
    p_modo_pct: modoPct,
  });
  if (error) throw error;
  const grade = Object.fromEntries(
    DRE_LINHA_KEYS.map((k) => [k, Array.from({ length: 13 }, () => 0)]),
  ) as DreGrade;
  for (const row of data ?? []) {
    const serie = grade[row.linha as DreLinhaKey];
    if (serie && row.mes >= 0 && row.mes <= 12) serie[row.mes] = Number(row.valor) || 0;
  }
  return grade;
}

export async function fetchDreAvisos(unidadeId: string | null, ano: number): Promise<DreAvisos> {
  const { data, error } = await supabase.rpc("dre_avisos", {
    p_unidade_id: unidadeId as string,
    p_ano: ano,
  });
  if (error) throw error;
  const row = data?.[0];
  return {
    pendentes_qtd: Number(row?.pendentes_qtd) || 0,
    pendentes_vgv: Number(row?.pendentes_vgv) || 0,
    sem_recebimento_qtd: Number(row?.sem_recebimento_qtd) || 0,
    sem_recebimento_vgv: Number(row?.sem_recebimento_vgv) || 0,
    sem_unidade_qtd: Number(row?.sem_unidade_qtd) || 0,
    sem_unidade_vgv: Number(row?.sem_unidade_vgv) || 0,
  };
}

export async function fetchDreDrillVendas(
  unidadeId: string | null,
  ano: number,
  mes: number,
  regime: DreRegime,
  modoPct: DreModoPct,
): Promise<DreDrillVenda[]> {
  const { data, error } = await supabase.rpc("dre_drill_vendas", {
    p_unidade_id: unidadeId as string,
    p_ano: ano,
    p_mes: mes,
    p_regime: regime,
    p_modo_pct: modoPct,
  });
  if (error) throw error;
  return (data ?? []) as DreDrillVenda[];
}

/** Limites [ini, fim) do mês, como date strings. */
export function dreMesBounds(ano: number, mes: number): { ini: string; fim: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ini = `${ano}-${pad(mes)}-01`;
  const fim = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${pad(mes + 1)}-01`;
  return { ini, fim };
}

export async function fetchDreDrillDespesas(
  unidadeId: string | null,
  ano: number,
  mes: number,
  regime: DreRegime,
): Promise<DreDrillDespesa[]> {
  const { ini, fim } = dreMesBounds(ano, mes);
  const campo = regime === "caixa" ? "data_pagamento" : "competencia";
  let query = supabase
    .from("dre_despesas")
    .select(
      "id, descricao, valor, competencia, data_pagamento, fornecedor, recorrente, categoria:dre_categorias_despesa(nome), unidade:dre_unidades(nome)",
    )
    .gte(campo, ini)
    .lt(campo, fim)
    .order("valor", { ascending: false });
  if (unidadeId) query = query.eq("unidade_id", unidadeId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DreDrillDespesa[];
}

/**
 * Orçado do ano pivotado por linha (valores[1..12]; [0] = soma do ano).
 * unidadeId null = consolidado (soma das unidades).
 */
export async function fetchDreOrcamento(
  unidadeId: string | null,
  ano: number,
): Promise<Partial<DreGrade>> {
  let query = supabase.from("dre_orcamento").select("linha, mes, valor").eq("ano", ano);
  if (unidadeId) query = query.eq("unidade_id", unidadeId);
  const { data, error } = await query;
  if (error) throw error;
  const grade: Partial<DreGrade> = {};
  for (const row of data ?? []) {
    const key = row.linha as DreLinhaKey;
    if (!DRE_LINHA_KEYS.includes(key)) continue;
    const serie = grade[key] ?? Array.from({ length: 13 }, () => 0);
    serie[row.mes] += Number(row.valor) || 0;
    serie[0] += Number(row.valor) || 0;
    grade[key] = serie;
  }
  return grade;
}

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

const brlFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const brlFmt2 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Moeda da grade: sem centavos (densidade), negativo entre parênteses. */
export function dreMoeda(v: number): string {
  const arredondado = Math.round(v);
  if (arredondado < 0) return `(${brlFmt.format(Math.abs(arredondado))})`;
  return brlFmt.format(arredondado);
}

/** Moeda com centavos (drawer/exportação), negativo entre parênteses. */
export function dreMoeda2(v: number): string {
  if (v < 0) return `(${brlFmt2.format(Math.abs(v))})`;
  return brlFmt2.format(v);
}

export function dreValor(def: DreLinhaDef, v: number): string {
  if (def.moeda === false) return String(Math.round(v));
  return dreMoeda(v);
}

/** Data ISO (yyyy-mm-dd) → dd/mm/aaaa, sem fuso. */
export function dreData(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Fração (0.0400) ↔ pontos percentuais ("4,00") para os formulários. */
export function fracaoParaPontos(f: number): string {
  return (f * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function pontosParaFracao(texto: string): number | null {
  const t = texto.trim().replace(/\./g, "").replace(",", ".");
  if (t === "" || !/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n / 100;
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

export function downloadCsv(fileName: string, rows: Array<Record<string, unknown>>): void {
  if (rows.length === 0) return;
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(";"),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(";")),
  ].join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".csv") ? fileName : `${fileName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * HTML do "Exportar PDF" do DRE, no visual da marca (kit lib/pdf-marca,
 * 2026-10-11): folha A4 paisagem, faixa azul, tabela com cabeçalho
 * azul-marinho e subtotais destacados. Puro para poder ser testado.
 */
export function montarHtmlDre(opts: {
  titulo: string;
  subtitulo: string;
  grade: DreGrade;
  geradoEm?: Date;
  origem?: string;
}): string {
  const { titulo, subtitulo, grade } = opts;
  const esc = escHtml;
  const celula = (def: DreLinhaDef, v: number) => {
    const texto = def.moeda === false ? String(Math.round(v)) : dreMoeda2(v);
    return `<td class="n${v < 0 ? " neg" : ""}">${esc(texto)}</td>`;
  };
  const linhas = DRE_LINHAS.map((def) => {
    const serie = grade[def.key];
    const secao = def.secaoAntes
      ? `<tr class="secao"><td colspan="14">${esc(def.secaoAntes)}</td></tr>`
      : "";
    return `${secao}<tr${def.subtotal ? ' class="sub"' : ""}>
      <td>${esc(def.rotulo)}</td>
      ${serie
        .slice(1)
        .map((v) => celula(def, v))
        .join("")}
      ${celula(def, serie[0])}
    </tr>`;
  }).join("");
  const geradoEm = (opts.geradoEm ?? new Date()).toLocaleDateString("pt-BR");
  const M = MARCA;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(titulo)}</title>
<style>${estilosMarca({ paisagem: true, rodape: RODAPE_INTERNO, origem: opts.origem })}
  h1 { font-size: 17pt; font-weight: 800; margin: 0 0 2px; color: ${M.navy}; }
  p.sub { margin: 0 0 12px; color: ${M.suave}; font-size: 9.5pt; }
  table { border-collapse: collapse; width: 100%; font-size: 8pt; font-variant-numeric: tabular-nums; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  thead th { text-align: right; padding: 6px 6px; background: ${M.navy}; color: ${M.creme}; font-size: 7.5pt; font-weight: 600; letter-spacing: 0.04em; }
  thead th:first-child { text-align: left; }
  td { padding: 3.5px 6px; border-bottom: 1px solid ${M.linha}; background: ${M.branco}; white-space: nowrap; }
  td.n { text-align: right; }
  td.neg { color: ${M.perigo}; }
  tr.sub td { font-weight: 700; background: ${M.goldClaro}; color: ${M.navy}; }
  tr.sub td.neg { color: ${M.perigo}; }
  tr.secao td { background: transparent; border-bottom: 0; padding: 10px 6px 4px; font-family: Montserrat, Inter, sans-serif; font-weight: 700; text-transform: uppercase; font-size: 7.5pt; letter-spacing: 0.12em; color: ${M.goldEscuro}; }
</style></head><body>
${faixaMarca({ rotuloHtml: "DRE", direitaHtml: `gerado em ${esc(geradoEm)}` })}
<h1>${esc(titulo)}</h1>
<p class="sub">${esc(subtitulo)}</p>
<table>
  <thead><tr><th>Linha</th>${MESES_CURTOS.map((m) => `<th>${m}</th>`).join("")}<th>Total</th></tr></thead>
  <tbody>${linhas}</tbody>
</table>
</body></html>`;
}

/**
 * "Exportar PDF" no padrão do repo: documento HTML paisagem na caixa de
 * impressão do browser (mesmo mecanismo de todos os PDFs, lib/pdf-print, que
 * espera as fontes da marca) — "Salvar como PDF" gera o arquivo.
 */
export function imprimirDrePdf(opts: { titulo: string; subtitulo: string; grade: DreGrade }): void {
  void imprimirHtml(montarHtmlDre(opts), { tituloIframe: "DRE para impressão" });
}
