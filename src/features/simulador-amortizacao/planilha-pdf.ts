// PDF da planilha de amortização. ÚNICO formato de exportação da tela
// (decisão do dono, 2026-10-11): o material vai para o cliente, e PDF é o que
// ele abre no celular sem mexer nos números. Padrão do repo (relatorios-pdf,
// comparativo-pdf): documento A4 em HTML auto-contido mandado à caixa de
// impressão do navegador ("Salvar como PDF"). Sem lib de PDF no bundle;
// carregado em lazy só no clique.
//
// Visual (2026-10-11): desenhado no Claude Design ("PDF Simulação de
// Financiamento SMQ") na identidade da SMQ: Azul Marinho #0F1E3A, Dourado
// Aurum #B89968, Creme #F5F1EA, Montserrat nos títulos e Inter no texto (as
// mesmas fontes self-hosted de /fonts/aurum). Logo redesenhado em vetor.
//
// Páginas: capa e resumo · efeito das amortizações (se houver) · leitura e
// próximo passo · evolução ano a ano por sistema · (completo) mês a mês por
// sistema em paisagem. Rodapé com página X de Y nas margens da folha.

import { escHtml, imprimirHtml } from "@/lib/pdf-print";
import {
  capaMarca,
  dataPorExtensoMarca,
  estilosMarca,
  faixaMarca,
  MARCA,
  RODAPE_CLIENTE,
} from "@/lib/pdf-marca";
import type { AnaliseAmortizacoes, LinhaPlanilha, ResultadoSimulacao } from "@/lib/amortizacao";
import {
  agruparPorAno,
  baseDfiDe,
  correcaoDe,
  leituraComercial,
  linhasComparativo,
  valorFinanciadoDe,
  type AnalisesPorSistema,
  type FormSimulador,
  type Trecho,
} from "@/features/simulador-amortizacao/estado";

const C = { ...MARCA, areia: MARCA.goldClaro } as const;

type Sistema = "SAC" | "PRICE";
export type Resultados = Partial<Record<Sistema, ResultadoSimulacao>>;

/** Quem preparou a simulação (perfil do corretor logado). */
export type ConsultorPdf = {
  nome?: string | null;
  telefone?: string | null;
  creci?: string | null;
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");
/** Sem o "R$" — tabelas densas avisam "valores em R$" no topo. */
const num = (v: number) => brl(v).replace("R$ ", "");
const pct = (v: number, casas = 2) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
const mil = (v: number) =>
  v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : brl(v);
const e = escHtml;

/** Faixa azul do topo das páginas internas (kit da marca). */
function faixa(f: FormSimulador, extra = ""): string {
  return faixaMarca({
    rotuloHtml: extra ? e(extra) : undefined,
    direitaHtml: `Simulação de financiamento · ${e(mil(valorFinanciadoDe(f)))} em ${f.prazoMeses} meses`,
  });
}

function trechos(frase: Trecho[]): string {
  return frase.map((t) => (t.forte ? `<strong>${e(t.texto)}</strong>` : e(t.texto))).join("");
}

// ---------------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------------

function capa(args: {
  f: FormSimulador;
  resultados: Resultados;
  analises: AnalisesPorSistema;
  sistemas: Sistema[];
  geradoEm: Date;
  consultor?: ConsultorPdf;
  cliente?: string | null;
}): string {
  const { f, resultados, analises, sistemas, geradoEm, consultor, cliente } = args;
  const r0 = resultados[sistemas[0]!]!.resumo;
  const para = [
    cliente ? `Preparada para <strong>${e(cliente)}</strong>` : "",
    consultor?.nome ? `por <strong>${e(consultor.nome)}</strong>` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const kpi = (rotulo: string, valor: string, sub: string) =>
    `<div class="kpi"><span class="kpi-r">${e(rotulo)}</span><span class="kpi-v">${e(valor)}</span><span class="kpi-s">${e(sub)}</span></div>`;
  const correcao = correcaoDe(f);
  const kpis = [
    kpi("FINANCIAMENTO", brl(valorFinanciadoDe(f)).replace(",00", ""), "valor do contrato"),
    kpi(
      "TAXA DE JUROS",
      `${pct(r0.taxaNominalAnual)} a.a.`,
      `nominal · efetiva ${pct(r0.taxaEfetivaAnual)}`,
    ),
    kpi(
      "PRAZO",
      `${f.prazoMeses} meses`,
      `${(f.prazoMeses / 12).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} anos${
        r0.mesesObra ? ` + ${r0.mesesObra} de obra` : ""
      }`,
    ),
    kpi(
      "CORREÇÃO",
      correcao ? `${f.modoCorrecao === "tr" ? "TR " : ""}${pct(correcao)} a.m.` : "Sem correção",
      f.modoCorrecao === "tr" ? "projeção média 2026" : correcao ? "índice informado" : "taxa fixa",
    ),
  ].join("");

  const destaque = (s: Sistema, escuro: boolean) => {
    const r = resultados[s]!.resumo;
    const sobe = r.ultimaParcela > r.primeiraParcela * 1.05;
    const cai = r.ultimaParcela < r.primeiraParcela * 0.95;
    const comportamento = cai
      ? `Cai mês a mês e termina em ${brl(r.ultimaParcela)}`
      : sobe
        ? `Sobe com a ${f.modoCorrecao === "fixa" ? "correção" : "TR"} e termina em ${brl(r.ultimaParcela)}`
        : `Fica estável e termina em ${brl(r.ultimaParcela)}`;
    const obra = r.mesesObra
      ? `<span class="dest-s">Na obra: até ${e(brl(r.maiorEncargoObra))} por mês</span>`
      : "";
    return `<div class="dest ${escuro ? "dest-escuro" : ""}">
      <span class="dest-t">${s}</span>
      <span class="dest-s">1ª parcela</span>
      <span class="dest-v">${e(brl(r.primeiraParcela))}</span>
      <span class="dest-s">${e(comportamento)}</span>${obra}
    </div>`;
  };

  const extraTotal = sistemas.map((s) => analises[s]?.total.valorAmortizado ?? 0)[0] ?? 0;
  // A capa fica numa folha: 1ª e última parcela já estão nos destaques, o
  // detalhe das amortizações tem página própria e seguros + taxa viram uma
  // linha (como no design).
  const temAnalise = sistemas.some((s) => analises[s]);
  const ocultas = new Set([
    "1ª parcela",
    "Última parcela",
    "Total de seguros (MIP + DFI)",
    "Total de taxa adm",
    ...(temAnalise
      ? ["Amortização extra", "Parcelas tiradas pela amortização", "Novo prazo do contrato"]
      : []),
  ]);
  const seguroETaxa = {
    item: "Seguros (MIP + DFI) e taxa adm",
    SAC: resultados.SAC
      ? brl(
          resultados.SAC.resumo.totalMip +
            resultados.SAC.resumo.totalDfi +
            resultados.SAC.resumo.totalTaxaAdm,
        )
      : "",
    PRICE: resultados.PRICE
      ? brl(
          resultados.PRICE.resumo.totalMip +
            resultados.PRICE.resumo.totalDfi +
            resultados.PRICE.resumo.totalTaxaAdm,
        )
      : "",
  };
  const todas = linhasComparativo(resultados, f, analises);
  const posTaxa = todas.findIndex((l) => l.item === "Total de taxa adm");
  const linhas = todas
    .flatMap((l, i) => (i === posTaxa ? [l, seguroETaxa] : [l]))
    .filter((l) => !ocultas.has(l.item));
  const destacar = new Set(["Juros economizados", "Total pago"]);
  const tabela = `<table class="cmp"><thead><tr><th>ITEM</th>${sistemas
    .map((s) => `<th class="n">${s}</th>`)
    .join("")}</tr></thead><tbody>${linhas
    .map(
      (l) =>
        `<tr${destacar.has(l.item) ? ' class="forte"' : ""}><td>${e(l.item)}</td>${sistemas
          .map((s) => `<td class="n">${e(l[s])}</td>`)
          .join("")}</tr>`,
    )
    .join("")}</tbody></table>`;

  return `<section class="pagina">
    ${capaMarca({
      sobre: "SIMULAÇÃO DE FINANCIAMENTO",
      tituloHtml: "Planilha de amortização",
      destaqueHtml: e(sistemas.join(" x ")),
      subtituloHtml: para || undefined,
      direitaHtml: e(dataPorExtensoMarca(geradoEm)),
    })}
    <div class="kpis">${kpis}</div>
    <div class="dests dests-${sistemas.length}">${sistemas.map((s, i) => destaque(s, i === 0)).join("")}</div>
    <div class="bloco">
      <div class="bloco-cab"><h2>Resumo ${sistemas.length > 1 ? "comparativo" : `· ${sistemas[0]}`}</h2>${
        extraTotal ? `<span>com ${e(brl(extraTotal))} de amortização extra</span>` : ""
      }</div>
      ${tabela}
    </div>
  </section>`;
}

function tabelaEfeito(s: Sistema, a: AnaliseAmortizacoes): string {
  const t = a.total;
  const linhas = a.eventos
    .map(
      (ev) =>
        `<tr><td>${ev.parcela}</td><td>${e(ev.competencia ?? "")}</td><td class="n">${e(
          brl(ev.valor),
        )}</td><td>${ev.modo === "reduzir_prazo" ? "Reduzir prazo" : "Reduzir parcela"}</td><td class="n b">${
          ev.parcelasTiradas
        }</td><td class="n">${ev.prazoRestanteAntes} → ${ev.prazoRestanteDepois}</td><td class="n">${e(
          brl(ev.jurosEconomizados),
        )}</td></tr>`,
    )
    .join("");
  return `<div class="bloco">
    <span class="sub-t">${s} · amortização por amortização</span>
    <table class="tab"><thead><tr><th>PARCELA</th><th>MÊS</th><th class="n">VALOR</th><th>MODO</th><th class="n">PARCELAS TIRADAS</th><th class="n">FALTAVAM → FALTAM</th><th class="n">JUROS ECONOMIZADOS</th></tr></thead>
    <tbody>${linhas}<tr class="total"><td colspan="2">Total</td><td class="n">${e(
      brl(t.valorAmortizado),
    )}</td><td></td><td class="n">${t.parcelasTiradas}</td><td class="n">${t.prazoOriginal} → ${
      t.novoPrazo
    }</td><td class="n">${e(brl(t.jurosEconomizados))}</td></tr></tbody></table>
  </div>`;
}

function paginaEfeito(f: FormSimulador, analises: AnalisesPorSistema, sistemas: Sistema[]): string {
  const com = sistemas.filter((s) => analises[s]);
  if (!com.length) return "";
  const modos = new Set(f.extras.filter((x) => x.valor > 0).map((x) => x.modo));
  const explica =
    modos.size === 1 && modos.has("reduzir_prazo")
      ? "No modo reduzir prazo a parcela continua parecida e o contrato acaba antes."
      : modos.size === 1 && modos.has("reduzir_parcela")
        ? "No modo reduzir parcela o prazo se mantém e a parcela cai."
        : "Cada amortização reduz o prazo ou a parcela, conforme o modo escolhido.";
  const total = analises[com[0]!]!.total.valorAmortizado;
  const cartao = (s: Sistema) => {
    const t = analises[s]!.total;
    const termino = t.novoTermino ? t.novoTermino.replace(/\/20(\d\d)$/, "/$1") : "";
    return `<div class="efc">
      <span class="dest-t">${s}</span>
      <div class="efc-grade">
        <div><span>Parcelas tiradas</span><b>${t.parcelasTiradas}</b></div>
        <div><span>Novo prazo</span><b>${t.novoPrazo}</b></div>
        <div><span>Termina em</span><b>${e(termino || "n/d")}</b></div>
      </div>
      <div class="efc-rodape"><span>Juros economizados</span><b>${e(brl(t.jurosEconomizados))}</b></div>
    </div>`;
  };
  return `<section class="pagina quebra">
    ${faixa(f)}
    <div class="titulo-pag">
      <span class="sobre escuro">FGTS E AMORTIZAÇÃO EXTRA</span>
      <h2 class="grande">Cada amortização tira parcelas do seu contrato</h2>
      <p>Amortizando ${e(brl(total))} no total, o contrato fica mais curto e você paga menos juros. ${e(explica)}</p>
    </div>
    <div class="dests dests-${com.length}">${com.map(cartao).join("")}</div>
    ${com.map((s) => tabelaEfeito(s, analises[s]!)).join("")}
  </section>`;
}

function paginaLeitura(args: {
  f: FormSimulador;
  resultados: Resultados;
  sistemas: Sistema[];
  consultor?: ConsultorPdf;
}): string {
  const { f, resultados, sistemas, consultor } = args;
  const r0 = resultados[sistemas[0]!]!.resumo;
  const leitura =
    resultados.SAC && resultados.PRICE
      ? `<div class="leitura">${leituraComercial(resultados.SAC, resultados.PRICE)
          .map(
            (frase, i) =>
              `<div class="item"><span class="bola">${i + 1}</span><p>${trechos(frase)}</p></div>`,
          )
          .join("")}</div>`
      : "";
  const correcao = correcaoDe(f);
  const premissas = [
    `Juros nominais de ${pct(r0.taxaNominalAnual)} a.a. (${pct(r0.taxaMensal * 100, 4)} ao mês)`,
    correcao
      ? `${f.modoCorrecao === "tr" ? "TR projetada" : "Correção"} em ${pct(correcao)} ao mês${
          f.modoCorrecao === "tr" ? " (média de 2026)" : ""
        }`
      : "Sem correção monetária (taxa fixa)",
    f.modoSeguro === "proposta"
      ? `Seguro MIP de ${pct(f.mipPropostaPct, 4)} a.m. sobre o saldo (proposta)`
      : `Seguro MIP estimado por idade (${f.proponentes.map((p) => `${p.idade} anos`).join(" + ")})`,
    `Seguro DFI de ${pct(f.dfiPct, 4)} a.m. sobre ${brl(baseDfiDe(f))}${
      f.valorAvaliacao > 0 ? "" : " (avaliação estimada)"
    }`,
    `Taxa de administração de ${brl(f.taxaAdm)} por mês`,
    ...(r0.mesesObra ? [`${r0.mesesObra} meses de obra antes da 1ª parcela`] : []),
    ...(f.renda > 0 ? [`Renda familiar considerada: ${brl(f.renda)}`] : []),
  ];
  const glossario = [
    ["SAC", "parcela começa maior e cai todo mês"],
    ["PRICE", "parcela começa menor e sobe com a TR"],
    ["TR", "índice que corrige o saldo todo mês"],
    ["Amortizar", "abater parte da dívida"],
    ["CET", "custo total, com seguros e taxas"],
  ];
  const nome = consultor?.nome?.trim();
  const tel = consultor?.telefone?.trim();
  return `<section class="pagina quebra">
    ${faixa(f)}
    <div class="titulo-pag">
      <span class="sobre escuro">${leitura ? "O QUE ESSES NÚMEROS QUEREM DIZER" : "COMO A CONTA FOI FEITA"}</span>
      <h2 class="grande">${leitura ? "Leitura da sua simulação" : "Premissas da simulação"}</h2>
    </div>
    ${leitura}
    <div class="dests dests-2">
      <div class="caixa"><b>Premissas da conta</b><ul>${premissas.map((p) => `<li>${e(p)}</li>`).join("")}</ul></div>
      <div class="caixa"><b>Termos em uma linha</b><ul>${glossario
        .map(([t, d]) => `<li><strong>${t}:</strong> ${d}</li>`)
        .join("")}</ul></div>
    </div>
    <div class="cta">
      <div>
        <span class="sobre">PRÓXIMO PASSO</span>
        <b>Vamos confirmar esses números na análise de crédito?</b>
        <span class="cta-s">Fale com seu consultor para simular no banco e agendar a visita.</span>
      </div>
      ${
        nome
          ? `<div class="cta-c"><span>Seu consultor</span><b>${e(nome)}</b>${
              tel ? `<em>${e(tel)}</em>` : ""
            }${consultor?.creci ? `<span>CRECI ${e(consultor.creci)}</span>` : ""}</div>`
          : ""
      }
    </div>
    <p class="aviso">Simulação comercial com valores estimados. A TR futura é uma projeção e os seguros podem variar conforme a seguradora e a proposta. Não substitui a simulação oficial do banco nem garante aprovação de crédito.</p>
  </section>`;
}

function paginaAnual(f: FormSimulador, s: Sistema, linhas: LinhaPlanilha[]): string {
  const anos = agruparPorAno(linhas);
  const curto = (c: string) => c.replace(/\/20(\d\d)/g, "/$1");
  const corpo = anos
    .map((a) => {
      const [ini, fim] = a.rotulo.split(" a ");
      const periodo = fim
        ? `<strong>Ano ${a.ano}</strong><br><span class="d">${e(curto(ini!))} a ${e(curto(fim))}</span>`
        : `<strong>${e(a.rotulo)}</strong>`;
      return `<tr><td>${periodo}</td><td class="n">${num(a.encargoMedio)}</td><td class="n">${num(
        a.juros,
      )}</td><td class="n">${num(a.amortizacao)}</td><td class="n">${num(a.correcao)}</td><td class="n">${num(
        a.seguros,
      )}</td><td class="n">${num(a.taxaAdm)}</td><td class="n b">${
        a.amortizacaoExtra ? num(a.amortizacaoExtra) : ""
      }</td><td class="n">${num(a.totalPago)}</td><td class="n">${num(a.saldoFinal)}</td></tr>`;
    })
    .join("");
  return `<section class="pagina quebra">
    ${faixa(f)}
    <div class="titulo-pag linha">
      <div><span class="sobre escuro">${s} · ANO A ANO</span><h2 class="grande">Evolução do contrato</h2></div>
      <span class="nota">valores em R$ · amortizações extras em negrito</span>
    </div>
    <table class="tab ev"><thead><tr><th>PERÍODO</th><th class="n">PARCELA<br>MÉDIA</th><th class="n">JUROS</th><th class="n">AMORTI-<br>ZAÇÃO</th><th class="n">CORREÇÃO<br>(TR)</th><th class="n">SEGUROS</th><th class="n">TAXA<br>ADM</th><th class="n">EXTRA</th><th class="n">TOTAL<br>PAGO</th><th class="n">SALDO<br>NO FIM</th></tr></thead>
    <tbody>${corpo}</tbody></table>
  </section>`;
}

function paginaMensal(f: FormSimulador, s: Sistema, linhas: LinhaPlanilha[]): string {
  const corpo = linhas
    .map((l) => {
      const classe = l.fase === "obra" ? "obra" : l.amortizacaoExtra > 0 ? "fgts" : "";
      const parcela =
        l.fase === "obra"
          ? `Obra${l.liberado != null ? ` (${pct(l.liberado * 100, 0)})` : ""}`
          : String(l.parcela ?? "");
      return `<tr${classe ? ` class="${classe}"` : ""}><td>${e(l.competencia ?? String(l.mes))}</td><td>${e(
        parcela,
      )}</td><td class="n">${num(l.saldoInicial)}</td><td class="n">${num(l.correcao)}</td><td class="n">${num(
        l.juros,
      )}</td><td class="n">${num(l.amortizacao)}</td><td class="n">${num(l.mip + l.dfi)}</td><td class="n">${num(
        l.taxaAdm,
      )}</td><td class="n b">${num(l.encargoTotal)}</td><td class="n">${
        l.amortizacaoExtra ? num(l.amortizacaoExtra) : ""
      }</td><td class="n">${num(l.saldoFinal)}</td></tr>`;
    })
    .join("");
  return `<section class="pagina paisagem quebra">
    ${faixa(f, `${s} · Planilha mês a mês`)}
    <p class="nota topo">valores em R$ · amortizações extras e meses de obra destacados</p>
    <table class="tab mm"><thead><tr><th>MÊS</th><th>PARCELA</th><th class="n">SALDO INICIAL</th><th class="n">CORREÇÃO (TR)</th><th class="n">JUROS</th><th class="n">AMORTIZAÇÃO</th><th class="n">SEGUROS</th><th class="n">TAXA ADM</th><th class="n">ENCARGO TOTAL</th><th class="n">EXTRA</th><th class="n">SALDO FINAL</th></tr></thead>
    <tbody>${corpo}</tbody></table>
  </section>`;
}

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

/** Nome do arquivo (vira o <title>): sem travessão. */
export function tituloPdf(f: FormSimulador): string {
  const milhar = Math.round(valorFinanciadoDe(f) / 1000);
  return `Simulação de financiamento R$ ${milhar} mil em ${f.prazoMeses} meses`;
}

function estilos(origem: string, completo: boolean): string {
  return `${estilosMarca({ origem, rodape: RODAPE_CLIENTE })}
  h2, .kpi-v, .dest-v, .dest-t, .sobre, .sub-t, .efc b, .caixa > b, .cta b { font-family: Montserrat, Inter, sans-serif; }
  .paisagem { page: paisagem; }
  .pagina .m-capa, .pagina .m-faixa { margin-bottom: 0; }
  .pagina { display: flex; flex-direction: column; gap: 16px; }

  .sobre { font-weight: 700; font-size: 8.5pt; letter-spacing: 0.18em; color: ${C.gold}; }
  .sobre.escuro { color: ${C.goldEscuro}; }

  .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .kpi { background: ${C.branco}; border: 1px solid ${C.borda}; border-radius: 10px; padding: 11px 13px; display: flex; flex-direction: column; gap: 3px; }
  .kpi-r { font-size: 7.5pt; font-weight: 600; letter-spacing: 0.08em; color: ${C.suave}; }
  .kpi-v { font-weight: 800; font-size: 14pt; color: ${C.navy}; }
  .kpi-s { font-size: 8pt; color: ${C.suave}; }

  .dests { display: grid; gap: 10px; }
  .dests-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dests-1 { grid-template-columns: minmax(0, 1fr); }
  .dest { background: ${C.branco}; border: 1.5px solid ${C.navy}; border-radius: 12px; padding: 14px 18px; display: flex; flex-direction: column; gap: 4px; }
  .dest-escuro { background: ${C.navy}; color: ${C.creme}; border-color: ${C.navy}; }
  .dest-t { font-weight: 700; font-size: 9pt; letter-spacing: 0.14em; color: ${C.goldEscuro}; }
  .dest-escuro .dest-t { color: ${C.gold}; }
  .dest-s { font-size: 9pt; color: ${C.suave}; }
  .dest-escuro .dest-s { color: #E4DCCB; }
  .dest-v { font-weight: 800; font-size: 22pt; color: ${C.navy}; }
  .dest-escuro .dest-v { color: ${C.creme}; }

  .bloco { display: flex; flex-direction: column; gap: 7px; }
  .bloco-cab { display: flex; justify-content: space-between; align-items: baseline; }
  h2 { margin: 0; font-weight: 800; font-size: 12.5pt; color: ${C.navy}; }
  h2.grande { font-size: 19pt; line-height: 1.2; }
  .bloco-cab span, .nota { font-size: 8pt; color: ${C.suave}; }
  .nota.topo { margin: -6px 0 0; }
  .sub-t { font-weight: 800; font-size: 10pt; color: ${C.navy}; }

  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th { background: ${C.navy}; color: ${C.creme}; font-weight: 600; font-size: 7.5pt; letter-spacing: 0.05em; text-align: left; padding: 6px 8px; line-height: 1.25; }
  td { padding: 4px 8px; border-bottom: 1px solid ${C.linha}; background: ${C.branco}; }
  tbody tr:nth-child(even) td { background: ${C.cremeClaro}; }
  .n { text-align: right; }
  .b { font-weight: 600; color: ${C.navy}; }
  .cmp { font-size: 9.5pt; }
  .cmp td { padding: 5px 12px; }
  .cmp th { padding: 7px 12px; }
  .cmp tr.forte td { font-weight: 600; color: ${C.navy}; }
  .tab { font-size: 8.5pt; }
  .tab td { white-space: nowrap; padding: 3px 8px; }
  .tab th { padding: 5px 8px; }
  .tab tr.total td { font-weight: 700; color: ${C.navy}; border-top: 1.5px solid ${C.navy}; background: ${C.branco}; }
  .ev { font-size: ${completo ? "8pt" : "8pt"}; }
  .ev td { padding: 3px 5px; line-height: 1.3; }
  .ev th { padding: 6px 5px; }
  .ev .d { font-size: 7pt; color: ${C.suave}; }
  .mm { font-size: 8pt; }
  .mm td { padding: 2.5px 7px; }
  .mm tr.fgts td { background: ${C.areia}; font-weight: 600; }
  .mm tr.obra td { background: #F7F0E2; }

  .titulo-pag { display: flex; flex-direction: column; gap: 5px; }
  .titulo-pag.linha { flex-direction: row; justify-content: space-between; align-items: flex-end; }
  .titulo-pag p { margin: 0; font-size: 10pt; color: ${C.medio}; }

  .efc { background: ${C.branco}; border: 1px solid ${C.borda}; border-radius: 12px; padding: 13px 16px; display: flex; flex-direction: column; gap: 9px; }
  .efc-grade { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .efc-grade div { display: flex; flex-direction: column; gap: 1px; }
  .efc-grade span, .efc-rodape span { font-size: 8pt; color: ${C.suave}; }
  .efc-grade b { font-weight: 800; font-size: 16pt; color: ${C.navy}; }
  .efc-rodape { border-top: 1px solid ${C.linha}; padding-top: 8px; display: flex; justify-content: space-between; align-items: baseline; }
  .efc-rodape b { font-weight: 800; font-size: 13pt; color: ${C.navy}; border-bottom: 3px solid ${C.gold}; }

  .leitura { display: flex; flex-direction: column; gap: 9px; }
  .item { background: ${C.branco}; border-radius: 12px; padding: 12px 16px; display: flex; gap: 14px; align-items: flex-start; break-inside: avoid; }
  .bola { flex-shrink: 0; width: 24px; height: 24px; border-radius: 12px; background: ${C.navy}; color: ${C.creme}; font-family: Montserrat, sans-serif; font-weight: 800; font-size: 9.5pt; display: flex; align-items: center; justify-content: center; }
  .item p { margin: 0; font-size: 10pt; line-height: 1.55; }
  .caixa { border: 1px solid ${C.borda}; border-radius: 12px; padding: 13px 16px; display: flex; flex-direction: column; gap: 6px; }
  .caixa > b { font-weight: 800; font-size: 10pt; color: ${C.navy}; }
  .caixa ul { margin: 0; padding-left: 15px; font-size: 8.5pt; line-height: 1.65; color: ${C.medio}; }
  .cta { background: ${C.navy}; color: ${C.creme}; border-radius: 14px; padding: 18px 22px; display: flex; justify-content: space-between; align-items: center; gap: 18px; break-inside: avoid; }
  .cta > div:first-child { display: flex; flex-direction: column; gap: 5px; }
  .cta b { font-weight: 800; font-size: 14pt; line-height: 1.25; }
  .cta-s { font-size: 9.5pt; color: #E4DCCB; }
  .cta-c { flex-shrink: 0; display: flex; flex-direction: column; gap: 3px; align-items: flex-end; text-align: right; }
  .cta-c span { font-size: 8pt; color: ${C.claroSobreNavy}; }
  .cta-c b { font-size: 11.5pt; }
  .cta-c em { font-style: normal; color: ${C.gold}; font-weight: 600; font-size: 10pt; }
  .aviso { margin: 0; font-size: 8pt; line-height: 1.55; color: ${C.suave}; }
  `;
}

export function montarHtmlPlanilha(args: {
  form: FormSimulador;
  resultados: Resultados;
  analises?: AnalisesPorSistema;
  completo: boolean;
  geradoEm?: Date;
  consultor?: ConsultorPdf;
  cliente?: string | null;
  /** Origem das fontes self-hosted (padrão: a do app). */
  origem?: string;
}): string {
  const { form: f, resultados, completo } = args;
  const analises = args.analises ?? {};
  const sistemas = (["SAC", "PRICE"] as const).filter((s) => resultados[s]);
  const geradoEm = args.geradoEm ?? new Date();
  const origem =
    args.origem ?? (typeof window !== "undefined" && window.location ? window.location.origin : "");

  const paginas = [
    capa({
      f,
      resultados,
      analises,
      sistemas,
      geradoEm,
      consultor: args.consultor,
      cliente: args.cliente,
    }),
    paginaEfeito(f, analises, sistemas),
    paginaLeitura({ f, resultados, sistemas, consultor: args.consultor }),
    ...sistemas.map((s) => paginaAnual(f, s, resultados[s]!.linhas)),
    ...(completo ? sistemas.map((s) => paginaMensal(f, s, resultados[s]!.linhas)) : []),
  ].join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${e(tituloPdf(f))}</title>
<style>${estilos(origem, completo)}</style></head><body>${paginas}</body></html>`;
}

export function imprimirPlanilha(args: {
  form: FormSimulador;
  resultados: Resultados;
  analises?: AnalisesPorSistema;
  completo: boolean;
  consultor?: ConsultorPdf;
  cliente?: string | null;
}): Promise<void> {
  return imprimirHtml(montarHtmlPlanilha(args), { tituloIframe: "Planilha de amortização" });
}
