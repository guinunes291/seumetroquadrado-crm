// PDF da simulação Vibra: a mesma folha do simulador oficial do canal (dados
// do cliente, fluxo com o teto de cada parcela, total, pró-soluto, status e as
// notas da Caixa), no padrão de PDF do CRM (A4 em HTML, "Salvar como PDF").
// Acrescenta o que o oficial não tem: quanto custa esperar e o cronograma
// mês a mês. Carregado em lazy no clique.

import { escHtml, imprimirHtml } from "@/lib/pdf-print";
import { rotuloMes } from "@/lib/simuladores/fluxo";
import {
  textoStatusVibra,
  VIGENCIA_VIBRA,
  type CenarioEsperaVibra,
  type ResultadoVibra,
} from "@/lib/simuladores/vibra";
import { brl, pct } from "./estado";
import { notaCaixa, notaRetencao, quandoLinha, tetoLinha, type FormVibra } from "./vibra-estado";

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

export interface DadosPdfVibra {
  form: FormVibra;
  resultado: ResultadoVibra;
  cenarios: CenarioEsperaVibra[];
  geradoEm?: Date;
}

export function tituloPdfVibra(f: Pick<FormVibra, "empreendimento" | "hoje">): string {
  const alvo = ["Vibra", f.empreendimento].filter(Boolean).join(" ");
  return `Fluxo de pagamento ${alvo} ${rotuloMes(f.hoje).replace("/", " ")}`;
}

export function montarHtmlVibra(d: DadosPdfVibra): string {
  const { form: f, resultado: r } = d;
  const geradoEm = (d.geradoEm ?? new Date()).toLocaleDateString("pt-BR");

  const dados = [
    ["Renda mensal", brl(f.renda)],
    ["Valor total do imóvel", brl(f.valorImovel)],
    ["Financiado pelo banco", brl(f.financiamento)],
    ["Subsídio + FGTS", brl(f.subsidioFgts)],
    ["Financiamento líquido *", brl(r.financiamentoLiquido)],
    ["Total a pagar até a entrega", brl(r.totalAteEntrega)],
    ["Parcela possível depois da entrega (morando)", brl(r.potencialMorando)],
    ["Previsão de entrega", r.entrega ? rotuloMes(r.entrega) : "a confirmar"],
  ]
    .map(
      ([k, v], i) =>
        `<div class="dado${i === 5 ? " forte" : ""}"><span>${escHtml(k)}</span><b>${escHtml(v)}</b></div>`,
    )
    .join("");

  const linhas = r.linhas
    .map((l) => {
      const ativa = l.qtd > 0;
      const cls = !ativa ? "off" : l.excedeu ? "fora" : l.teto != null && l.valor > 0 ? "ok" : "";
      return `<tr class="${cls}">
        <td>${escHtml(l.rotulo)}<div class="teto">${escHtml(tetoLinha(l, r))}</div></td>
        <td class="num">${ativa ? l.qtd : "-"}</td>
        <td class="num">${ativa && l.valor > 0 ? escHtml(brl(l.valor)) : "-"}</td>
        <td class="num">${ativa && l.total > 0 ? escHtml(brl(l.total)) : "-"}</td>
        <td>${ativa ? escHtml(quandoLinha(l)) : "não tem"}</td>
      </tr>`;
    })
    .join("");

  const statusCls = r.status === "fechou" ? "fechou" : r.status === "incompleto" ? "" : "pendente";

  const espera =
    f.renda > 0 && d.cenarios.length > 1
      ? `<section><h2>Quanto custa esperar</h2>
        <table class="tabela"><thead><tr><th>Assinando em</th><th class="num">Mensais</th>
        <th class="num">Parcelado máx.</th><th class="num">Atos no mínimo</th></tr></thead><tbody>
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
    r.cronograma.length > 0
      ? `<section class="cronograma"><h2>Cronograma mês a mês</h2>
        <table class="tabela"><thead><tr><th>Mês</th><th>Parcela</th><th class="num">Valor</th>
        <th class="num">Acumulado</th></tr></thead><tbody>
        ${r.cronograma
          .map((p) => {
            acumulado += p.valor;
            return `<tr class="${p.tipo === "mensal" ? "" : "destaque"}"><td>${escHtml(rotuloMes(p.competencia))}</td>
              <td>${escHtml(p.rotulo)}</td><td class="num">${escHtml(brl(p.valor))}</td>
              <td class="num">${escHtml(brl(acumulado))}</td></tr>`;
          })
          .join("")}</tbody></table></section>`
      : "";

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${escHtml(tituloPdfVibra(f))}</title>
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
  .teto { font-size: 7pt; color: ${C.suave}; }
  .num { text-align: right !important; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .prosoluto { display: flex; justify-content: space-between; margin: 6px 0; font-size: 9pt; }
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
  <div class="marca">Vibra Residencial · Simulação de pagamento</div>
  <h1>${escHtml(f.empreendimento ?? "Vibra")}</h1>
  <div class="sub">Vibra Parcerias · ${f.rotuloUnidade ? `${escHtml(f.rotuloUnidade)} · ` : ""}assinatura em ${escHtml(rotuloMes(f.hoje))} · gerado em ${escHtml(geradoEm)}</div>
</header>
<section><div class="dados">${dados}</div>
<div class="nota">* ${escHtml(notaRetencao(r))}</div></section>
<section>
  <table class="tabela"><thead><tr><th>Parcelas (com o valor máximo permitido)</th><th class="num">Qtd</th>
  <th class="num">Valor da parcela</th><th class="num">Total das parcelas</th><th>Quando</th></tr></thead>
  <tbody>${linhas}</tbody>
  <tfoot><tr><td>Total do fluxo</td><td></td><td></td><td class="num">${escHtml(brl(r.totalFluxo))}</td><td></td></tr></tfoot>
  </table>
  <div class="prosoluto"><span>Pró-soluto comprometido na proposta (máximo 15%)</span>
  <b class="${r.proSoluto.excedeu ? "fora" : ""}">${escHtml(pct(r.proSoluto.pct))}</b></div>
  <div class="status ${statusCls}">${escHtml(textoStatusVibra(r))}</div>
  <div class="nota">${escHtml(notaCaixa(f.documentacao))}</div>
</section>
${espera}
${cronograma}
<div class="assinatura">
  <div>Imobiliária / Corretor<div class="linha"></div></div>
  <div>Contato<div class="linha"></div></div>
</div>
<div class="rodape">
  Esta simulação não tem valor contratual. Valores sujeitos à aprovação bancária, à disponibilidade
  da unidade e a alteração sem aviso prévio. Regras do simulador do canal Vibra Parcerias (tabela de
  ${escHtml(rotuloMes(VIGENCIA_VIBRA))}), com as mensais contadas para a assinatura em ${escHtml(rotuloMes(f.hoje))}.
</div>
</body></html>`;
}

export function imprimirVibra(d: DadosPdfVibra): Promise<void> {
  return imprimirHtml(montarHtmlVibra(d), { tituloIframe: "Fluxo de pagamento Vibra" });
}
