// Exportar PDF dos Relatórios — padrão do repo (raio-x-pdf, dre): documento
// A4 auto-contido (HTML puro, paleta fixa) mandado à caixa de impressão do
// navegador; "Salvar como PDF" gera o arquivo com o nome do <title>. Sem lib
// de PDF no bundle, e carregado em lazy só no clique do botão.
//
// Telefone NUNCA entra no documento: o PDF é material de reunião
// (apresentação), e a regra da página é contato oculto em apresentação.

// ---------------------------------------------------------------------------
// Paleta (hex fixo: o PDF não herda o tema do app e precisa imprimir igual)
// ---------------------------------------------------------------------------

const C = {
  navy: "#1b2a4a",
  navy400: "#7386a8",
  gold: "#c69a2e",
  texto: "#16202e",
  suave: "#5b6577",
  linha: "#dfe4ec",
  fundo: "#f6f8fb",
  branco: "#ffffff",
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
};

export const escPdf = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

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
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body {
    font: 10pt/1.5 -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    color: ${C.texto}; margin: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  header { border-bottom: 3px solid ${C.gold}; padding-bottom: 10px; margin-bottom: 14px; }
  .marca { font-size: 8pt; letter-spacing: 0.14em; text-transform: uppercase; color: ${C.navy400}; }
  h1 { font-size: 19pt; margin: 2px 0 2px; color: ${C.navy}; }
  .sub { font-size: 9pt; color: ${C.suave}; }
  section { margin-bottom: 14px; break-inside: avoid; }
  .secao-titulo { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
  .secao-titulo h2 { font-size: 11.5pt; margin: 0; color: ${C.navy}; }
  .secao-titulo span { font-size: 8pt; color: ${C.suave}; }
  .kpis { display: flex; gap: 8px; flex-wrap: wrap; }
  .kpi {
    flex: 1 1 110px; border: 1px solid ${C.linha}; border-radius: 6px;
    padding: 7px 9px; background: ${C.fundo};
  }
  .kpi-label { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em; color: ${C.suave}; }
  .kpi-valor { font-size: 14pt; font-weight: 700; color: ${C.navy}; }
  .kpi-hint { font-size: 7.5pt; color: ${C.suave}; }
  .tabela { border-collapse: collapse; width: 100%; font-size: 8.5pt; }
  .tabela thead th {
    padding: 4px 6px; border-bottom: 1.5px solid ${C.navy};
    font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.05em; color: ${C.navy};
  }
  .tabela tbody td { padding: 3.5px 6px; border-bottom: 0.5px solid ${C.linha}; vertical-align: top; }
  .tabela tbody tr:nth-child(even) td { background: ${C.fundo}; }
  .vazio { font-size: 9pt; color: ${C.suave}; }
  .rodape {
    margin-top: 16px; border-top: 1px solid ${C.linha}; padding-top: 6px;
    font-size: 7.5pt; color: ${C.suave};
  }
</style></head><body>
<header>
  <div class="marca">Seu Metro Quadrado · Relatórios</div>
  <h1>${escPdf(doc.titulo)}</h1>
  <div class="sub">Período: ${escPdf(doc.periodo)} · gerado em ${escPdf(geradoEm)}</div>
</header>
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

export function imprimirRelatorio(doc: DocumentoRelatorio): void {
  const html = montarHtmlRelatorio(doc);
  const iframe = document.createElement("iframe");
  if (!("srcdoc" in iframe)) {
    abrirEmAba(html);
    return;
  }
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", "Relatório para impressão");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0";

  let encerrado = false;
  const limpar = () => {
    if (encerrado) return;
    encerrado = true;
    // Um tick depois do print para o Safari não abortar o job.
    window.setTimeout(() => iframe.remove(), 1000);
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      iframe.remove();
      abrirEmAba(html);
      return;
    }
    win.addEventListener("afterprint", limpar, { once: true });
    win.focus();
    win.print();
    // Rede de segurança para browsers que não emitem afterprint.
    window.setTimeout(limpar, 60_000);
  };

  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}

function abrirEmAba(html: string): void {
  const win = window.open("", "_blank");
  if (!win) throw new Error("Bloqueio de pop-up: libere pop-ups para gerar o PDF.");
  win.document.write(html);
  win.document.close();
  win.focus();
  win.setTimeout(() => win.print(), 300);
}
