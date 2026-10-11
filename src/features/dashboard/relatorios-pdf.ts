// Exportar PDF dos Relatórios — padrão do repo (raio-x-pdf, dre): documento
// A4 auto-contido (HTML puro, paleta fixa) mandado à caixa de impressão do
// navegador; "Salvar como PDF" gera o arquivo com o nome do <title>. Sem lib
// de PDF no bundle, e carregado em lazy só no clique do botão.
//
// Telefone NUNCA entra no documento: o PDF é material de reunião
// (apresentação), e a regra da página é contato oculto em apresentação.

import { escHtml, imprimirHtml } from "@/lib/pdf-print";
import { capaMarca, estilosMarca, MARCA, RODAPE_INTERNO } from "@/lib/pdf-marca";

// ---------------------------------------------------------------------------
// Paleta (hex fixo: o PDF não herda o tema do app e precisa imprimir igual)
// ---------------------------------------------------------------------------

// Visual da marca (kit lib/pdf-marca, 2026-10-11): mesma identidade da
// planilha de amortização e dos demais PDFs do CRM.
const C = {
  navy: MARCA.navy,
  navy400: MARCA.navySuave,
  gold: MARCA.gold,
  texto: MARCA.texto,
  suave: MARCA.suave,
  linha: MARCA.linha,
  fundo: MARCA.cremeClaro,
  branco: MARCA.branco,
} as const;

export type CelulaPdf = string | number | null | undefined;
export type BlocoPdf = { titulo: string; sub?: string; html: string };
export type DocumentoRelatorio = {
  /** Ex.: "Relatório de Vendas". Vira o <title> (e o nome do arquivo). */
  titulo: string;
  /** Rótulo do período filtrado, ex.: "01/08/2026 – 31/08/2026". */
  periodo: string;
  blocos: BlocoPdf[];
  /** Nota extra do rodapé (metodologia, avisos). */
  rodape?: string;
  /** Origem das fontes self-hosted (padrão: a do app; "" em testes). */
  origem?: string;
};

export const escPdf = escHtml;

/** Rótulo do período do filtro para o cabeçalho do documento. */
export function periodoLabelPdf(range: { di: string | null; df: string | null }): string {
  const dia = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };
  if (!range.di || !range.df) return "Todo o período";
  return `${dia(range.di)} – ${dia(range.df)}`;
}

// ---------------------------------------------------------------------------
// Blocos (puros — testados em tests/relatorios-pdf.test.ts)
// ---------------------------------------------------------------------------

/**
 * Tabela do documento. `direita` marca os índices de coluna alinhados à
 * direita (números). Toda célula passa pelo escape — nome de cliente com
 * "<" ou "&" não vira HTML.
 */
export function tabelaPdf(
  colunas: string[],
  linhas: CelulaPdf[][],
  opts: { direita?: number[] } = {},
): string {
  if (linhas.length === 0) {
    return `<p class="vazio">Sem dados neste período.</p>`;
  }
  const direita = new Set(opts.direita ?? []);
  const th = colunas
    .map((c, i) => `<th style="text-align:${direita.has(i) ? "right" : "left"}">${escPdf(c)}</th>`)
    .join("");
  const tds = (l: CelulaPdf[]) =>
    l
      .map(
        (v, i) =>
          `<td style="text-align:${direita.has(i) ? "right" : "left"}">${escPdf(v ?? "—")}</td>`,
      )
      .join("");
  const trs = linhas.map((l) => `<tr>${tds(l)}</tr>`).join("");
  return `<table class="tabela"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

/** Fileira de KPIs (label em cima, valor grande, hint embaixo). */
export function kpisPdf(itens: Array<{ label: string; valor: string; hint?: string }>): string {
  const cards = itens
    .map(
      (k) => `<div class="kpi">
        <div class="kpi-label">${escPdf(k.label)}</div>
        <div class="kpi-valor">${escPdf(k.valor)}</div>
        ${k.hint ? `<div class="kpi-hint">${escPdf(k.hint)}</div>` : ""}
      </div>`,
    )
    .join("");
  return `<div class="kpis">${cards}</div>`;
}

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

export function montarHtmlRelatorio(doc: DocumentoRelatorio): string {
  const geradoEm = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const secoes = doc.blocos
    .map(
      (b) => `<section>
      <div class="secao-titulo">
        <h2>${escPdf(b.titulo)}</h2>
        ${b.sub ? `<span>${escPdf(b.sub)}</span>` : ""}
      </div>
      ${b.html}
    </section>`,
    )
    .join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${escPdf(doc.titulo)} — ${escPdf(doc.periodo)}</title>
<style>${estilosMarca({ rodape: RODAPE_INTERNO, origem: doc.origem })}
  section { margin-bottom: 16px; break-inside: avoid; }
  .secao-titulo { display: flex; align-items: baseline; gap: 8px; margin-bottom: 7px; }
  .secao-titulo h2 { font-size: 12pt; font-weight: 800; margin: 0; color: ${C.navy}; }
  .secao-titulo span { font-size: 8pt; color: ${C.suave}; }
  .kpis { display: flex; gap: 8px; flex-wrap: wrap; }
  .kpi {
    flex: 1 1 110px; border: 1px solid ${MARCA.borda}; border-radius: 10px;
    padding: 9px 11px; background: ${C.branco};
  }
  .kpi-label { font-size: 7.5pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: ${C.suave}; }
  .kpi-valor { font-family: Montserrat, Inter, sans-serif; font-size: 14pt; font-weight: 800; color: ${C.navy}; }
  .kpi-hint { font-size: 7.5pt; color: ${C.suave}; }
  .tabela { border-collapse: collapse; width: 100%; font-size: 8.5pt; font-variant-numeric: tabular-nums; }
  .tabela thead { display: table-header-group; }
  .tabela tr { break-inside: avoid; }
  .tabela thead th {
    padding: 6px 7px; background: ${C.navy}; color: ${MARCA.creme};
    font-size: 7.5pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
  }
  .tabela tbody td { padding: 4px 7px; border-bottom: 1px solid ${C.linha}; vertical-align: top; background: ${C.branco}; }
  .tabela tbody tr:nth-child(even) td { background: ${C.fundo}; }
  .vazio { font-size: 9pt; color: ${C.suave}; }
  .rodape {
    margin-top: 14px; padding-top: 6px; border-top: 2px solid ${C.gold};
    font-size: 7.5pt; color: ${C.suave};
  }
</style></head><body>
${capaMarca({
  sobre: "RELATÓRIO DE GESTÃO",
  tituloHtml: escPdf(doc.titulo),
  subtituloHtml: `Período: ${escPdf(doc.periodo)} · gerado em ${escPdf(geradoEm)}`,
  linhaMarca: "Inteligência comercial",
})}
${secoes}
<div class="rodape">
  ${doc.rodape ? `${escPdf(doc.rodape)}<br>` : ""}
  Telefones de clientes ficam fora deste documento (material de apresentação).
  Documento interno e confidencial · Seu Metro Quadrado · ${escPdf(geradoEm)}
</div>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Impressão (mesmo mecanismo do raio-x-pdf: iframe oculto, aba como fallback)
// ---------------------------------------------------------------------------

export function imprimirRelatorio(doc: DocumentoRelatorio): Promise<void> {
  return imprimirHtml(montarHtmlRelatorio(doc), { tituloIframe: "Relatório para impressão" });
}
