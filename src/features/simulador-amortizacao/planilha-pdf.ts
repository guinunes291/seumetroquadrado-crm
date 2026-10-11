// PDF da planilha de amortização. ÚNICO formato de exportação da tela
// (decisão do dono, 2026-10-11): o material vai para o cliente, e PDF é o que
// ele abre no celular sem mexer nos números. Padrão do repo (relatorios-pdf,
// comparativo-pdf): documento A4 em HTML auto-contido, paleta fixa, mandado à
// caixa de impressão do navegador ("Salvar como PDF"). Sem lib de PDF no
// bundle; carregado em lazy só no clique.
//
// Duas versões:
//  - resumido: contrato, comparativo, leitura para o cliente e evolução ano a
//    ano (cabe em 2 a 3 páginas, retrato);
//  - completo: o mesmo + a planilha mês a mês de cada sistema (paisagem).

import { escHtml, imprimirHtml } from "@/lib/pdf-print";
import type { LinhaPlanilha, ResultadoSimulacao } from "@/lib/amortizacao";
import {
  agruparPorAno,
  baseDfiDe,
  correcaoDe,
  leituraComercial,
  linhasComparativo,
  valorFinanciadoDe,
  type FormSimulador,
  type Trecho,
} from "@/features/simulador-amortizacao/estado";

const C = {
  navy: "#0F1E3A",
  navy400: "#7386a8",
  gold: "#B89968",
  texto: "#16202e",
  suave: "#5b6577",
  linha: "#dfe4ec",
  fundo: "#f6f8fb",
  obra: "#fbf6ec",
  extra: "#eaf6ee",
} as const;

type Sistema = "SAC" | "PRICE";
export type Resultados = Partial<Record<Sistema, ResultadoSimulacao>>;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number, casas = 2) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

function trechosHtml(frase: Trecho[]): string {
  return frase
    .map((t) => (t.forte ? `<strong>${escHtml(t.texto)}</strong>` : escHtml(t.texto)))
    .join("");
}

function tabela(
  colunas: string[],
  linhas: { celulas: (string | number)[]; classe?: string }[],
  direitaDesde = 1,
): string {
  const th = colunas
    .map((c, i) => `<th class="${i >= direitaDesde ? "num" : ""}">${escHtml(c)}</th>`)
    .join("");
  const trs = linhas
    .map(
      (l) =>
        `<tr class="${l.classe ?? ""}">${l.celulas
          .map((v, i) => `<td class="${i >= direitaDesde ? "num" : ""}">${escHtml(v)}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<table class="tabela"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

function tabelaAnual(linhas: LinhaPlanilha[]): string {
  return tabela(
    [
      "Período",
      "Parcela média",
      "Juros",
      "Amortização",
      "Correção",
      "Seguros",
      "Taxa adm",
      "Amort. extra",
      "Total pago",
      "Saldo no fim",
    ],
    agruparPorAno(linhas).map((a) => ({
      celulas: [
        a.rotulo,
        brl(a.encargoMedio),
        brl(a.juros),
        brl(a.amortizacao),
        brl(a.correcao),
        brl(a.seguros),
        brl(a.taxaAdm),
        a.amortizacaoExtra ? brl(a.amortizacaoExtra) : "",
        brl(a.totalPago),
        brl(a.saldoFinal),
      ],
    })),
  );
}

function tabelaMensal(linhas: LinhaPlanilha[]): string {
  return tabela(
    [
      "Mês",
      "Parcela",
      "Saldo inicial",
      "Correção",
      "Juros",
      "Amortização",
      "Seguros",
      "Taxa adm",
      "Encargo total",
      "Amort. extra",
      "Saldo final",
    ],
    linhas.map((l) => ({
      classe: l.fase === "obra" ? "obra" : l.amortizacaoExtra > 0 ? "extra" : "",
      celulas: [
        l.competencia ?? String(l.mes),
        l.fase === "obra"
          ? `Obra${l.liberado != null ? ` (${pct(l.liberado * 100, 0)})` : ""}`
          : String(l.parcela ?? ""),
        brl(l.saldoInicial),
        brl(l.correcao),
        brl(l.juros),
        brl(l.amortizacao),
        brl(l.mip + l.dfi),
        brl(l.taxaAdm),
        brl(l.encargoTotal),
        l.amortizacaoExtra ? brl(l.amortizacaoExtra) : "",
        brl(l.saldoFinal),
      ],
    })),
    2,
  );
}

/** Nome do arquivo (vira o <title>): sem travessão, sem acento problemático. */
export function tituloPdf(f: FormSimulador): string {
  const mil = Math.round(valorFinanciadoDe(f) / 1000);
  return `Simulação de financiamento R$ ${mil} mil em ${f.prazoMeses} meses`;
}

export function montarHtmlPlanilha(args: {
  form: FormSimulador;
  resultados: Resultados;
  completo: boolean;
  geradoEm?: Date;
}): string {
  const { form: f, resultados, completo } = args;
  const sistemas = (["SAC", "PRICE"] as const).filter((s) => resultados[s]);
  const r0 = resultados[sistemas[0]!]!.resumo;
  const geradoEm = (args.geradoEm ?? new Date()).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const kpis = [
    { label: "Valor do financiamento", valor: brl(valorFinanciadoDe(f)), hint: "" },
    {
      label: "Taxa de juros",
      valor: `${pct(r0.taxaNominalAnual)} a.a.`,
      hint: `nominal · efetiva ${pct(r0.taxaEfetivaAnual)} a.a. · ${pct(r0.taxaMensal * 100, 4)} a.m.`,
    },
    {
      label: "Prazo",
      valor: `${f.prazoMeses} meses`,
      hint: `${(f.prazoMeses / 12).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} anos${
        r0.mesesObra ? ` + ${r0.mesesObra} meses de obra` : ""
      }`,
    },
    {
      label: "Correção do saldo",
      valor: correcaoDe(f) ? `${pct(correcaoDe(f))} a.m.` : "Sem correção",
      hint: f.modoCorrecao === "tr" ? "TR projetada (média de 2026)" : "",
    },
  ]
    .map(
      (k) => `<div class="kpi"><div class="kpi-label">${escHtml(k.label)}</div>
        <div class="kpi-valor">${escHtml(k.valor)}</div>
        ${k.hint ? `<div class="kpi-hint">${escHtml(k.hint)}</div>` : ""}</div>`,
    )
    .join("");

  const comparativo = tabela(
    ["Item", ...sistemas],
    linhasComparativo(resultados, f).map((l) => ({
      celulas: [l.item, ...sistemas.map((s) => l[s])],
    })),
  );

  const leitura =
    resultados.SAC && resultados.PRICE
      ? `<section class="leitura"><h2>Leitura para o cliente</h2>${leituraComercial(
          resultados.SAC,
          resultados.PRICE,
        )
          .map((frase) => `<p>${trechosHtml(frase)}</p>`)
          .join("")}</section>`
      : "";

  const premissas = [
    `MIP: ${
      f.modoSeguro === "proposta"
        ? `${pct(f.mipPropostaPct, 4)} a.m. sobre o saldo (proposta)`
        : `estimado por idade (${f.proponentes.map((p) => `${p.idade} anos`).join(" + ")})`
    }`,
    `DFI: ${pct(f.dfiPct, 4)} a.m. sobre ${brl(baseDfiDe(f))}${
      f.valorAvaliacao > 0 ? "" : " (avaliação estimada)"
    }`,
    `Taxa de administração: ${brl(f.taxaAdm)} por mês`,
    ...(f.renda > 0 ? [`Renda familiar considerada: ${brl(f.renda)}`] : []),
  ];

  const porSistema = sistemas
    .map((s) => {
      const r = resultados[s]!;
      return `<section class="quebra">
        <h2>Evolução ano a ano · ${s}</h2>
        ${tabelaAnual(r.linhas)}
      </section>
      ${
        completo
          ? `<section class="quebra"><h2>Planilha mês a mês · ${s}</h2>${tabelaMensal(r.linhas)}</section>`
          : ""
      }`;
    })
    .join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${escHtml(tituloPdf(f))}</title>
<style>
  @page { size: A4 ${completo ? "landscape" : "portrait"}; margin: 12mm 11mm; }
  * { box-sizing: border-box; }
  body {
    font: 9.5pt/1.45 -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    color: ${C.texto}; margin: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  header { border-bottom: 3px solid ${C.gold}; padding-bottom: 8px; margin-bottom: 12px; }
  .marca { font-size: 7.5pt; letter-spacing: 0.14em; text-transform: uppercase; color: ${C.navy400}; }
  h1 { font-size: 18pt; margin: 2px 0; color: ${C.navy}; }
  h2 { font-size: 11pt; margin: 0 0 6px; color: ${C.navy}; }
  .sub { font-size: 8.5pt; color: ${C.suave}; }
  section { margin-bottom: 12px; }
  .quebra { break-before: page; }
  .kpis { display: flex; gap: 8px; margin-bottom: 12px; }
  .kpi { flex: 1 1 0; border: 1px solid ${C.linha}; border-radius: 6px; padding: 7px 9px; background: ${C.fundo}; }
  .kpi-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.06em; color: ${C.suave}; }
  .kpi-valor { font-size: 13pt; font-weight: 700; color: ${C.navy}; }
  .kpi-hint { font-size: 7pt; color: ${C.suave}; }
  .tabela { border-collapse: collapse; width: 100%; font-size: ${completo ? "7.5pt" : "8.5pt"}; }
  .tabela thead { display: table-header-group; }
  .tabela th {
    padding: 4px 5px; border-bottom: 1.5px solid ${C.navy}; text-align: left;
    font-size: 7pt; text-transform: uppercase; letter-spacing: 0.04em; color: ${C.navy};
  }
  .tabela td { padding: 2.5px 5px; border-bottom: 0.5px solid ${C.linha}; white-space: nowrap; }
  .tabela tr { break-inside: avoid; }
  .tabela tbody tr:nth-child(even) td { background: ${C.fundo}; }
  .tabela tr.obra td { background: ${C.obra}; }
  .tabela tr.extra td { background: ${C.extra}; }
  .num { text-align: right !important; font-variant-numeric: tabular-nums; }
  .leitura { border-left: 3px solid ${C.gold}; background: ${C.fundo}; padding: 8px 12px; break-inside: avoid; }
  .leitura p { margin: 3px 0; }
  .premissas { font-size: 8pt; color: ${C.suave}; margin: 0; padding-left: 16px; }
  .rodape { margin-top: 12px; border-top: 1px solid ${C.linha}; padding-top: 6px; font-size: 7.5pt; color: ${C.suave}; }
</style></head><body>
<header>
  <div class="marca">Seu Metro Quadrado · Simulação de financiamento</div>
  <h1>Planilha de amortização ${escHtml(sistemas.join(" x "))}</h1>
  <div class="sub">Gerado em ${escHtml(geradoEm)}</div>
</header>
<div class="kpis">${kpis}</div>
<section><h2>Resumo</h2>${comparativo}</section>
${leitura}
<section><h2>Premissas</h2><ul class="premissas">${premissas
    .map((p) => `<li>${escHtml(p)}</li>`)
    .join("")}</ul></section>
<div class="rodape">
  Simulação comercial com valores estimados. A correção futura (TR) é uma projeção e os seguros podem variar
  conforme a seguradora e a proposta. Não substitui a simulação oficial do banco nem garante aprovação de crédito.
</div>
${porSistema}
</body></html>`;
}

export function imprimirPlanilha(args: {
  form: FormSimulador;
  resultados: Resultados;
  completo: boolean;
}): Promise<void> {
  return imprimirHtml(montarHtmlPlanilha(args), { tituloIframe: "Planilha de amortização" });
}
