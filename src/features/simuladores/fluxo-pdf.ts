// PDF do fluxo da construtora. Mesmo padrão da planilha de amortização
// (decisão do dono, 2026-10-11: o material vai para o cliente, e PDF é o que
// ele abre no celular sem mexer nos números): documento A4 em HTML
// auto-contido, paleta fixa, mandado à caixa de impressão do navegador
// ("Salvar como PDF"). Sem lib de PDF no bundle; carregado em lazy no clique.
//
// Uma página em retrato na maioria dos fluxos: recursos, fluxo com a
// construtora, quanto custa esperar e o cronograma mês a mês.

import { escHtml, imprimirHtml } from "@/lib/pdf-print";
import { rotuloMes, type RegrasFluxo, type ResultadoFluxo } from "@/lib/simuladores/fluxo";
import {
  brl,
  linhasDoFluxo,
  pct,
  rotuloParcela,
  type CenarioEspera,
  type FormFluxo,
} from "@/features/simuladores/estado";

const C = {
  navy: "#0F1E3A",
  navy400: "#7386a8",
  gold: "#B89968",
  texto: "#16202e",
  suave: "#5b6577",
  linha: "#dfe4ec",
  fundo: "#f6f8fb",
  destaque: "#fbf6ec",
} as const;

export interface DadosPdfFluxo {
  construtora: string;
  projeto: string | null;
  form: FormFluxo;
  resultado: ResultadoFluxo;
  regras: RegrasFluxo;
  cenarios: CenarioEspera[];
  geradoEm?: Date;
}

/** Nome do arquivo (vira o <title>): sem travessão, sem acento problemático. */
export function tituloPdfFluxo(d: Pick<DadosPdfFluxo, "construtora" | "projeto" | "form">): string {
  const alvo = d.projeto ? `${d.construtora} ${d.projeto}` : d.construtora;
  return `Fluxo de pagamento ${alvo} ${rotuloMes(d.form.hoje).replace("/", " ")}`;
}

function tabela(
  colunas: string[],
  linhas: { celulas: string[]; classe?: string }[],
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

export function montarHtmlFluxo(d: DadosPdfFluxo): string {
  const { form: f, resultado: r } = d;
  const geradoEm = (d.geradoEm ?? new Date()).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const titulo = d.projeto ?? d.construtora;

  const mensal =
    r.mensais.quantidade > 0 && r.mensais.valor > 0
      ? `${r.mensais.quantidade}x ${brl(r.mensais.valor)}`
      : "Sem mensais";
  const kpis = [
    { label: "Valor do imóvel", valor: brl(r.valorImovel), hint: f.rotuloUnidade },
    {
      label: "Com a construtora",
      valor: brl(r.saldoConstrutora),
      hint: `${pct((r.saldoConstrutora / r.valorImovel) * 100)} do imóvel`,
    },
    {
      label: "Mensais",
      valor: mensal,
      hint:
        r.mensais.primeira && r.mensais.ultima
          ? `${rotuloMes(r.mensais.primeira)} a ${rotuloMes(r.mensais.ultima)}`
          : "",
    },
    {
      label: "Chaves",
      valor: r.chaves.valor > 0 ? brl(r.chaves.valor) : "Sem parcela",
      hint: rotuloMes(r.chaves.competencia),
    },
  ]
    .map(
      (k) => `<div class="kpi"><div class="kpi-label">${escHtml(k.label)}</div>
        <div class="kpi-valor">${escHtml(k.valor)}</div>
        ${k.hint ? `<div class="kpi-hint">${escHtml(k.hint)}</div>` : ""}</div>`,
    )
    .join("");

  const recursos = tabela(
    ["Origem", "Valor", "% do imóvel"],
    [
      ["Financiamento", r.recursos.financiamento],
      ["Subsídio", r.recursos.subsidio],
      ["FGTS", r.recursos.fgts],
      ["Com a construtora", r.saldoConstrutora],
    ]
      .filter(([, v]) => Number(v) > 0)
      .map(([nome, v]) => ({
        celulas: [String(nome), brl(Number(v)), pct((Number(v) / r.valorImovel) * 100)],
      })),
  );

  const espera =
    d.cenarios.length > 1 && d.cenarios[0].mensais > 0
      ? `<section><h2>Quanto custa esperar</h2>${tabela(
          ["Assinando em", "Mensais", "Mensal", "Chaves"],
          d.cenarios.map((c, i) => ({
            classe: i === 0 ? "destaque" : "",
            celulas: [
              `${rotuloMes(c.hoje)}${i === 0 ? " (agora)" : ""}`,
              String(c.mensais),
              c.mensal > 0 ? brl(c.mensal) : "Sem mensal",
              c.chaves > 0 ? brl(c.chaves) : "Sem parcela",
            ],
          })),
        )}</section>`
      : "";

  let acumulado = 0;
  const cronograma = tabela(
    ["Mês", "Parcela", "Valor (tabela)", "Com INCC (estimativa)", "Acumulado"],
    r.parcelas.map((p) => {
      acumulado += p.valor;
      return {
        classe: p.tipo === "mensal" ? "" : "destaque",
        celulas: [
          rotuloMes(p.competencia),
          rotuloParcela(p),
          brl(p.valor),
          brl(p.valorCorrigido),
          brl(acumulado),
        ],
      };
    }),
    2,
  );

  const premissas = [
    `Simulado para assinatura em ${rotuloMes(f.hoje)}, entrega prevista em ${rotuloMes(r.chaves.competencia)}.`,
    `As mensais vão do mês seguinte ao ato até a última mensal: a cada mês sem assinar, o fluxo perde uma mensal e o valor de cada uma sobe.`,
    `Coluna "com INCC": projeção de ${pct(d.regras.inccAnualPct, 2)} ao ano até as chaves, só para referência.`,
    ...(r.posChaves.quantidade > 0
      ? [
          `Pós-chaves: ${brl(r.posChaves.saldoNasChaves)} financiados pela construtora a ${pct(d.regras.jurosPosChavesPct, 2)} ao mês (Price), mais a correção do contrato.`,
        ]
      : []),
  ];

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${escHtml(tituloPdfFluxo(d))}</title>
<style>
  @page { size: A4 portrait; margin: 12mm 11mm; }
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
  section { margin-bottom: 12px; break-inside: avoid; }
  .kpis { display: flex; gap: 8px; margin-bottom: 12px; }
  .kpi { flex: 1 1 0; border: 1px solid ${C.linha}; border-radius: 6px; padding: 7px 9px; background: ${C.fundo}; }
  .kpi-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.06em; color: ${C.suave}; }
  .kpi-valor { font-size: 13pt; font-weight: 700; color: ${C.navy}; }
  .kpi-hint { font-size: 7pt; color: ${C.suave}; }
  .fluxo { border-left: 3px solid ${C.gold}; background: ${C.fundo}; padding: 8px 12px; margin: 0; list-style: none; }
  .fluxo li { margin: 2px 0; }
  .tabela { border-collapse: collapse; width: 100%; font-size: 8.5pt; }
  .tabela thead { display: table-header-group; }
  .tabela th {
    padding: 4px 5px; border-bottom: 1.5px solid ${C.navy}; text-align: left;
    font-size: 7pt; text-transform: uppercase; letter-spacing: 0.04em; color: ${C.navy};
  }
  .tabela td { padding: 2.5px 5px; border-bottom: 0.5px solid ${C.linha}; white-space: nowrap; }
  .tabela tr { break-inside: avoid; }
  .tabela tr.destaque td { background: ${C.destaque}; font-weight: 600; }
  .num { text-align: right !important; font-variant-numeric: tabular-nums; }
  .cronograma { break-inside: auto; }
  .premissas { font-size: 8pt; color: ${C.suave}; margin: 0; padding-left: 16px; }
  .rodape { margin-top: 12px; border-top: 1px solid ${C.linha}; padding-top: 6px; font-size: 7.5pt; color: ${C.suave}; }
</style></head><body>
<header>
  <div class="marca">Seu Metro Quadrado · Fluxo de pagamento · ${escHtml(d.construtora)}</div>
  <h1>${escHtml(titulo)}</h1>
  <div class="sub">Gerado em ${escHtml(geradoEm)}</div>
</header>
<div class="kpis">${kpis}</div>
<section><h2>De onde vem o dinheiro</h2>${recursos}</section>
<section><h2>Fluxo com a construtora</h2><ul class="fluxo">${linhasDoFluxo(r)
    .map((l) => `<li>${escHtml(l)}</li>`)
    .join("")}</ul></section>
${espera}
<section class="cronograma"><h2>Cronograma mês a mês</h2>${cronograma}</section>
<section><h2>Premissas</h2><ul class="premissas">${premissas
    .map((p) => `<li>${escHtml(p)}</li>`)
    .join("")}</ul></section>
<div class="rodape">
  Simulação comercial. Os valores oficiais são os da tabela vigente e do contrato da construtora,
  e os recursos do banco dependem da aprovação de crédito.
</div>
</body></html>`;
}

export function imprimirFluxo(d: DadosPdfFluxo): Promise<void> {
  return imprimirHtml(montarHtmlFluxo(d), { tituloIframe: "Fluxo de pagamento" });
}
