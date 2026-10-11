// Kit de PDF da marca SMQ: o MESMO visual em todo PDF exportável do CRM
// (decisão do dono, 2026-10-11). Nasceu do PDF da planilha de amortização,
// desenhado no Claude Design ("PDF Simulação de Financiamento SMQ").
//
// Identidade: Azul Marinho #0F1E3A, Dourado Aurum #B89968, Creme #F5F1EA;
// Montserrat nos títulos e Inter no texto (self-hosted em /fonts/aurum, sem
// depender do Google); logo redesenhado em vetor; fundo creme até a borda da
// folha; rodapé com "página X de Y" nas margens (@page margin boxes, Chrome
// 131+; em navegador sem suporte, o rodapé só não aparece).
//
// Puro (sem React, sem window obrigatório): cada gerador monta o próprio
// conteúdo e usa daqui a casca — estilos de página, capa, faixa e logo.

export const MARCA = {
  navy: "#0F1E3A",
  navyMedio: "#24365C",
  navySuave: "#6B7A99",
  gold: "#B89968",
  goldEscuro: "#8C6E40",
  goldClaro: "#EFE5D2",
  creme: "#F5F1EA",
  cremeClaro: "#FAF7F1",
  texto: "#1B2333",
  suave: "#5A6275",
  medio: "#4A5265",
  linha: "#EEE7DA",
  borda: "#E2D9C7",
  claroSobreNavy: "#CFC6B4",
  textoSobreNavy: "#E4DCCB",
  branco: "#FFFFFF",
  sucesso: "#2F6B4F",
  sucessoFundo: "#E7F1EA",
  alerta: "#9A5B00",
  alertaFundo: "#FBF0DC",
  perigo: "#A33A2C",
  perigoFundo: "#F8E6E2",
} as const;

/** Rodapé de material que vai para o cliente. */
export const RODAPE_CLIENTE = "Seu Metro Quadrado · @seumetroquadrado_oficial";
/** Rodapé de documento interno (relatórios de gestão, DRE, raio-x). */
export const RODAPE_INTERNO = "Seu Metro Quadrado · documento interno e confidencial";

export type OpcoesPagina = {
  /** Retrato (padrão) ou paisagem para o documento inteiro. */
  paisagem?: boolean;
  /** Texto à esquerda do rodapé. */
  rodape?: string;
  /** Origem das fontes self-hosted (padrão: a do app; "" em testes). */
  origem?: string;
  /** Margens da folha (CSS). */
  margem?: string;
};

function origemPadrao(): string {
  return typeof window !== "undefined" && window.location ? window.location.origin : "";
}

/** Escapa texto para dentro de content: "…" do CSS. */
function cssString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Estilos de página e tipografia da marca: @font-face, @page (folha creme,
 * rodapé com página X de Y), uma página nomeada `paisagem` para trechos
 * deitados (`.m-paisagem`), corpo em Inter e títulos em Montserrat, e as
 * peças comuns (capa, faixa, eyebrow, quebra de página).
 */
export function estilosMarca(opts: OpcoesPagina = {}): string {
  const M = MARCA;
  const origem = opts.origem ?? origemPadrao();
  const rodape = cssString(opts.rodape ?? RODAPE_CLIENTE);
  const margem = opts.margem ?? (opts.paisagem ? "10mm 12mm 14mm" : "12mm 12mm 16mm");
  const caixas = `
    @bottom-left { content: "${rodape}"; font-family: Inter, sans-serif; font-size: 8pt; color: ${M.suave}; }
    @bottom-right { content: "página " counter(page) " de " counter(pages); font-family: Inter, sans-serif; font-size: 8pt; color: ${M.suave}; }`;
  return `
  @font-face { font-family: Montserrat; font-weight: 100 900; src: url("${origem}/fonts/aurum/montserrat-latin-wght-normal.woff2") format("woff2"); }
  @font-face { font-family: Inter; font-weight: 100 900; src: url("${origem}/fonts/aurum/inter-latin-wght-normal.woff2") format("woff2"); }
  @page { size: A4 ${opts.paisagem ? "landscape" : "portrait"}; margin: ${margem}; background: ${M.creme};${caixas}
  }
  @page paisagem { size: A4 landscape; margin: 10mm 12mm 14mm; background: ${M.creme};${caixas}
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: ${M.creme}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font: 10pt/1.45 Inter, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: ${M.texto}; }
  h1, h2, h3, h4 { font-family: Montserrat, Inter, sans-serif; }
  b, strong { font-weight: 600; }
  .quebra { break-before: page; }
  .m-paisagem { page: paisagem; }

  .m-capa { background: ${M.navy}; color: ${M.creme}; border-radius: 14px; padding: 26px 30px 24px; display: flex; flex-direction: column; gap: 20px; margin-bottom: 16px; break-inside: avoid; }
  .m-capa-linha { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
  .m-capa-marca { display: flex; align-items: center; gap: 14px; }
  .m-capa-marca div { display: flex; flex-direction: column; gap: 2px; }
  .m-capa-marca b { font-family: Montserrat, Inter, sans-serif; font-weight: 800; font-size: 11pt; letter-spacing: 0.04em; }
  .m-capa-marca span, .m-capa-data { font-size: 8.5pt; color: ${M.claroSobreNavy}; }
  .m-capa-titulo { display: flex; flex-direction: column; gap: 7px; }
  .m-sobre { font-family: Montserrat, Inter, sans-serif; font-weight: 700; font-size: 8.5pt; letter-spacing: 0.18em; text-transform: uppercase; color: ${M.gold}; }
  .m-sobre.escuro { color: ${M.goldEscuro}; }
  .m-capa h1 { margin: 0; font-weight: 800; font-size: 21pt; line-height: 1.15; letter-spacing: -0.01em; color: ${M.creme}; }
  .m-capa h1 span { color: ${M.gold}; }
  .m-capa-sub { font-size: 10pt; color: ${M.textoSobreNavy}; }
  .m-capa-sub strong { color: ${M.creme}; }
  .m-capa-extra { display: flex; flex-direction: column; gap: 10px; }

  .m-faixa { background: ${M.navy}; color: ${M.creme}; border-radius: 10px; padding: 10px 18px; display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 8.5pt; margin-bottom: 14px; break-inside: avoid; }
  .m-faixa > span { color: ${M.claroSobreNavy}; }
  .m-faixa-marca { display: flex; align-items: center; gap: 9px; }
  .m-faixa-marca b { font-family: Montserrat, Inter, sans-serif; font-weight: 800; font-size: 9pt; letter-spacing: 0.06em; }
  .m-faixa-marca em { font-style: normal; color: ${M.gold}; font-weight: 600; margin-left: 8px; }
  `;
}

/** Logo da SMQ em vetor: moldura, telhado duplo (dourado e creme) e m². */
export function logoMarca(tamanho: number, opts: { rotulo?: boolean; cor?: string } = {}): string {
  const cor = opts.cor ?? MARCA.creme;
  const aria = opts.rotulo ? `role="img" aria-label="Seu Metro Quadrado"` : `aria-hidden="true"`;
  return `<svg width="${tamanho}" height="${tamanho}" viewBox="0 0 100 100" ${aria}>
    <rect x="5" y="5" width="90" height="90" fill="none" stroke="${cor}" stroke-width="7"/>
    <path d="M27 52 V39 L50 18 L73 39 V62" fill="none" stroke="${MARCA.gold}" stroke-width="7"/>
    <path d="M37 54 L51 40 L67 56 V82" fill="none" stroke="${cor}" stroke-width="8"/>
    <text x="20" y="82" font-family="Montserrat, sans-serif" font-weight="800" font-size="30" fill="${cor}">m</text>
    <text x="45" y="68" font-family="Montserrat, sans-serif" font-weight="800" font-size="17" fill="${cor}">2</text>
  </svg>`;
}

export type CapaMarca = {
  /** Eyebrow dourado em caixa alta (ex.: "SIMULAÇÃO DE FINANCIAMENTO"). */
  sobre: string;
  /** Título; `destaque` sai em dourado logo depois. Já escapados. */
  tituloHtml: string;
  destaqueHtml?: string;
  /** Linha abaixo do título (HTML já escapado). */
  subtituloHtml?: string;
  /** Texto à direita do logo (ex.: a data por extenso). Já escapado. */
  direitaHtml?: string;
  /** Bloco livre no fim da capa (chips, mensagem). HTML já escapado. */
  extraHtml?: string;
  /** Linha abaixo do nome da marca. */
  linhaMarca?: string;
};

/** Capa azul-marinho com logo, eyebrow e título (primeira página). */
export function capaMarca(c: CapaMarca): string {
  return `<header class="m-capa">
    <div class="m-capa-linha">
      <div class="m-capa-marca">${logoMarca(48, { rotulo: true })}<div><b>SEU METRO QUADRADO</b><span>${
        c.linhaMarca ?? "Imóveis na planta e Minha Casa Minha Vida"
      }</span></div></div>
      ${c.direitaHtml ? `<span class="m-capa-data">${c.direitaHtml}</span>` : ""}
    </div>
    <div class="m-capa-titulo">
      <span class="m-sobre">${c.sobre}</span>
      <h1>${c.tituloHtml}${c.destaqueHtml ? ` <span>${c.destaqueHtml}</span>` : ""}</h1>
      ${c.subtituloHtml ? `<span class="m-capa-sub">${c.subtituloHtml}</span>` : ""}
    </div>
    ${c.extraHtml ? `<div class="m-capa-extra">${c.extraHtml}</div>` : ""}
  </header>`;
}

/** Faixa azul do topo das páginas internas. Textos já escapados. */
export function faixaMarca(opts: { direitaHtml?: string; rotuloHtml?: string } = {}): string {
  return `<div class="m-faixa">
    <div class="m-faixa-marca">${logoMarca(26)}<b>SEU METRO QUADRADO</b>${
      opts.rotuloHtml ? `<em>${opts.rotuloHtml}</em>` : ""
    }</div>
    ${opts.direitaHtml ? `<span>${opts.direitaHtml}</span>` : ""}
  </div>`;
}

/** "11 de outubro de 2026". */
export function dataPorExtensoMarca(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}
