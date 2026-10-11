// Folha em PDF dos simuladores "por linhas com teto" (Vibra, Mundo Apto): a
// mesma folha que os simuladores oficiais imprimem (dados do cliente, fluxo
// com o teto de cada parcela, total, status e notas), mais quanto custa
// esperar e o cronograma mês a mês. Padrão de PDF do CRM: A4 em HTML mandado
// à caixa de impressão ("Salvar como PDF"). Cada construtora monta os dados
// (vibra-pdf, mundo-apto-pdf); o HTML é um só.

import { escHtml } from "@/lib/pdf-print";
import { rotuloMes } from "@/lib/simuladores/fluxo";
import { brl } from "./estado";
import type { CenarioEsperaLinhas } from "./fluxo-linhas";

const C = {
  navy: "#0F1E3A",
  navy400: "#7386a8",
  gold: "#B89968",
  texto: "#16202e",
  suave: "#5b6577",
  linha: "#dfe4ec",
  fundo: "#f6f8fb",
  destaque: "#fbf6ec",
  verde: "#1f7a4d",
  verdeFundo: "#e9f6ef",
  vermelho: "#b42318",
  vermelhoFundo: "#fdecea",
} as const;

export interface FolhaFluxoLinhas {
  /** <title> = nome do arquivo. Sem travessão. */
  titulo: string;
  marca: string;
  h1: string;
  sub: string;
  /** Pares rótulo/valor do quadro de dados (o de índice `dadoForte` em destaque). */
  dados: [string, string][];
  dadoForte?: number;
  notaDados?: string;
  linhas: {
    rotulo: string;
    teto: string;
    qtd: number;
    valor: number;
    total: number;
    quando: string;
    tom: "ok" | "fora" | "off" | "";
  }[];
  totalFluxo: number;
  rodapeFluxo: { rotulo: string; valor: string; alerta?: boolean }[];
  status: { texto: string; tom: "fechou" | "pendente" | "" };
  notas: string[];
  /** Seção extra já em HTML escapado (a conferência da política, por exemplo). */
  secaoExtra?: string;
  cenarios: CenarioEsperaLinhas[];
  cronograma: { competencia: string; rotulo: string; valor: number; destaque: boolean }[];
  rodape: string;
  /** "Imobiliária / Corretor" e "Contato" para assinar, como no simulador oficial. */
  assinatura?: boolean;
}

export function montarHtmlFolha(d: FolhaFluxoLinhas): string {
  const dados = d.dados
    .map(
      ([k, v], i) =>
        `<div class="dado${i === d.dadoForte ? " forte" : ""}"><span>${escHtml(k)}</span><b>${escHtml(v)}</b></div>`,
    )
    .join("");

  const linhas = d.linhas
    .map((l) => {
      const ativa = l.tom !== "off";
      return `<tr class="${l.tom}">
        <td>${escHtml(l.rotulo)}<div class="teto">${escHtml(l.teto)}</div></td>
        <td class="num">${ativa ? l.qtd : "-"}</td>
        <td class="num">${ativa && l.valor > 0 ? escHtml(brl(l.valor)) : "-"}</td>
        <td class="num">${ativa && l.total > 0 ? escHtml(brl(l.total)) : "-"}</td>
        <td>${escHtml(l.quando)}</td>
      </tr>`;
    })
    .join("");

  const rodapeFluxo = d.rodapeFluxo
    .map(
      (r) =>
        `<div class="prosoluto"><span>${escHtml(r.rotulo)}</span><b class="${r.alerta ? "fora" : ""}">${escHtml(r.valor)}</b></div>`,
    )
    .join("");

  const espera =
    d.cenarios.length > 1 && d.cenarios[0].mensais > 0
      ? `<section><h2>Quanto custa esperar</h2>
        <table class="tabela"><thead><tr><th>Assinando em</th><th class="num">Mensais</th>
        <th class="num">Parcelado máx.</th><th class="num">Entrada mínima</th></tr></thead><tbody>
        ${d.cenarios
          .map(
            (c, i) =>
              `<tr class="${i === 0 ? "destaque" : ""}"><td>${escHtml(rotuloMes(c.hoje))}${i === 0 ? " (agora)" : ""}</td>
              <td class="num">${c.mensais}</td><td class="num">${escHtml(brl(c.capacidadeParcelado))}</td>
              <td class="num">${escHtml(brl(c.atosMinimos))}</td></tr>`,
          )
          .join("")}</tbody></table></section>`
      : "";

  let acumulado = 0;
  const cronograma =
    d.cronograma.length > 0
      ? `<section class="cronograma"><h2>Cronograma mês a mês</h2>
        <table class="tabela"><thead><tr><th>Mês</th><th>Parcela</th><th class="num">Valor</th>
        <th class="num">Acumulado</th></tr></thead><tbody>
        ${d.cronograma
          .map((p) => {
            acumulado += p.valor;
            return `<tr class="${p.destaque ? "destaque" : ""}"><td>${escHtml(rotuloMes(p.competencia))}</td>
              <td>${escHtml(p.rotulo)}</td><td class="num">${escHtml(brl(p.valor))}</td>
              <td class="num">${escHtml(brl(acumulado))}</td></tr>`;
          })
          .join("")}</tbody></table></section>`
      : "";

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${escHtml(d.titulo)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm 11mm; }
  * { box-sizing: border-box; }
  body {
    font: 9.5pt/1.45 -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    color: ${C.texto}; margin: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  header { border-bottom: 3px solid ${C.gold}; padding-bottom: 8px; margin-bottom: 10px; }
  .marca { font-size: 7.5pt; letter-spacing: 0.14em; text-transform: uppercase; color: ${C.navy400}; }
  h1 { font-size: 17pt; margin: 2px 0; color: ${C.navy}; }
  h2 { font-size: 11pt; margin: 0 0 6px; color: ${C.navy}; }
  .sub { font-size: 8.5pt; color: ${C.suave}; }
  section { margin-bottom: 12px; break-inside: avoid; }
  .dados { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 14px; margin-bottom: 4px; }
  .dado { display: flex; justify-content: space-between; gap: 8px; border-bottom: 0.5px solid ${C.linha}; padding: 2px 0; }
  .dado span { color: ${C.suave}; }
  .dado.forte b { color: ${C.navy}; font-size: 11pt; }
  .nota { font-size: 7.5pt; color: ${C.suave}; margin: 4px 0 10px; }
  .tabela { border-collapse: collapse; width: 100%; font-size: 8.5pt; }
  .tabela thead { display: table-header-group; }
  .tabela th {
    padding: 4px 5px; border-bottom: 1.5px solid ${C.navy}; text-align: left;
    font-size: 7pt; text-transform: uppercase; letter-spacing: 0.04em; color: ${C.navy};
  }
  .tabela td { padding: 3px 5px; border-bottom: 0.5px solid ${C.linha}; vertical-align: top; }
  .tabela tr { break-inside: avoid; }
  .tabela tr.destaque td { background: ${C.destaque}; }
  .tabela tr.ok td.num { background: ${C.verdeFundo}; color: ${C.verde}; }
  .tabela tr.fora td.num { background: ${C.vermelhoFundo}; color: ${C.vermelho}; }
  .tabela tr.off td { color: ${C.suave}; }
  .tabela tfoot td { border-top: 1.5px solid ${C.navy}; font-weight: 700; }
  .tabela td.falhou { color: ${C.vermelho}; font-weight: 700; }
  .tabela td.passou { color: ${C.verde}; font-weight: 700; }
  .teto { font-size: 7pt; color: ${C.suave}; }
  .num { text-align: right !important; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .prosoluto { display: flex; justify-content: space-between; margin: 4px 0; font-size: 9pt; }
  .prosoluto b.fora { color: ${C.vermelho}; }
  .status { padding: 8px 10px; border-radius: 6px; font-weight: 700; text-align: center; margin: 8px 0; background: ${C.fundo}; }
  .status.fechou { background: ${C.verdeFundo}; color: ${C.verde}; }
  .status.pendente { background: ${C.vermelhoFundo}; color: ${C.vermelho}; }
  .cronograma { break-inside: auto; }
  .assinatura { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 18px; font-size: 8.5pt; }
  .assinatura .linha { border-bottom: 1px solid ${C.texto}; height: 18px; }
  .rodape { margin-top: 12px; border-top: 1px solid ${C.linha}; padding-top: 6px; font-size: 7.5pt; color: ${C.suave}; }
</style></head><body>
<header>
  <div class="marca">${escHtml(d.marca)}</div>
  <h1>${escHtml(d.h1)}</h1>
  <div class="sub">${escHtml(d.sub)}</div>
</header>
<section><div class="dados">${dados}</div>
${d.notaDados ? `<div class="nota">${escHtml(d.notaDados)}</div>` : ""}</section>
<section>
  <table class="tabela"><thead><tr><th>Parcelas (com o valor máximo permitido)</th><th class="num">Qtd</th>
  <th class="num">Valor da parcela</th><th class="num">Total das parcelas</th><th>Quando</th></tr></thead>
  <tbody>${linhas}</tbody>
  <tfoot><tr><td>Total do fluxo</td><td></td><td></td><td class="num">${escHtml(brl(d.totalFluxo))}</td><td></td></tr></tfoot>
  </table>
  ${rodapeFluxo}
  <div class="status ${d.status.tom}">${escHtml(d.status.texto)}</div>
  ${d.notas.map((n) => `<div class="nota">${escHtml(n)}</div>`).join("")}
</section>
${d.secaoExtra ?? ""}
${espera}
${cronograma}
${
  d.assinatura
    ? `<div class="assinatura">
  <div>Imobiliária / Corretor<div class="linha"></div></div>
  <div>Contato<div class="linha"></div></div>
</div>`
    : ""
}
<div class="rodape">${escHtml(d.rodape)}</div>
</body></html>`;
}

/** Uma regra conferida contra o fluxo (a tabela "Conferência" da folha). */
export interface ItemConferenciaPdf {
  rotulo: string;
  atual: string;
  limite: string;
  situacao: "atende" | "não atende" | "pede aprovação" | "a confirmar";
  nota?: string;
}

/** Seção "Conferência ..." da folha, já em HTML escapado (para `secaoExtra`). */
export function secaoConferencia(titulo: string, itens: ItemConferenciaPdf[]): string {
  const linhas = itens
    .map(
      (
        c,
      ) => `<tr><td>${escHtml(c.rotulo)}${c.nota ? `<div class="teto">${escHtml(c.nota)}</div>` : ""}</td>
        <td>${escHtml(c.atual)}</td><td>${escHtml(c.limite)}</td>
        <td class="${c.situacao === "atende" ? "passou" : c.situacao === "a confirmar" ? "" : "falhou"}">${escHtml(c.situacao)}</td></tr>`,
    )
    .join("");
  return `<section><h2>${escHtml(titulo)}</h2>
    <table class="tabela"><thead><tr><th>Regra</th><th>No fluxo</th><th>Limite</th><th>Situação</th></tr></thead>
    <tbody>${linhas}</tbody></table></section>`;
}
