// Estado do formulário da planilha de amortização e as conversões puras entre
// o que o corretor digita e o que o motor (lib/amortizacao) recebe. Sem React
// de propósito: a tela só renderiza; as regras de conversão ficam testáveis.
//
// Entrada (decisão do dono, 2026-10-11): o corretor digita SÓ os três dados do
// contrato — valor do financiamento, taxa de juros a.a. e prazo. Todo o resto
// tem padrão e é calculado sozinho (TR, seguros, taxa adm, base do DFI); os
// ajustes ficam recolhidos para quem tiver a proposta do banco em mãos.

import {
  DFI_MENSAL_PADRAO,
  LIMITE_COMPROMETIMENTO_PADRAO,
  TAXA_ADM_PADRAO,
  TR_MENSAL_REFERENCIA_2026,
  type LinhaPlanilha,
  type ModoAmortizacaoExtra,
  type ParametrosFinanciamento,
  type ResultadoSimulacao,
  type TipoTaxa,
} from "@/lib/amortizacao";

export type VisaoSistema = "comparar" | "SAC" | "PRICE";
export type ModoCorrecao = "tr" | "fixa" | "personalizada";
export type ModoSeguro = "idade" | "proposta";

export interface ProponenteForm {
  idade: number;
  /** Participação em % (0–100). */
  participacao: number;
}

export interface ExtraForm {
  parcela: number;
  valor: number;
  modo: ModoAmortizacaoExtra;
  /** 0 = uma vez só. */
  repetirACada: number;
  /** 0 = até o fim. */
  vezes: number;
}

export interface FormSimulador {
  visao: VisaoSistema;
  /** Valor do financiamento do contrato (o que o banco empresta). */
  valorFinanciamento: number;
  prazoMeses: number;
  taxaAnual: number;
  tipoTaxa: TipoTaxa;
  modoCorrecao: ModoCorrecao;
  /** % ao mês, usado quando modoCorrecao = "personalizada". */
  correcaoPersonalizada: number;
  modoSeguro: ModoSeguro;
  proponentes: ProponenteForm[];
  /** % ao mês sobre o saldo (proposta). */
  mipPropostaPct: number;
  /** % ao mês sobre o imóvel. */
  dfiPct: number;
  /**
   * Valor de avaliação do imóvel (base do DFI). 0 = estimado a partir do
   * financiamento (ver avaliacaoEstimada).
   */
  valorAvaliacao: number;
  taxaAdm: number;
  renda: number;
  despesasIniciais: number;
  obraAtiva: boolean;
  obraMeses: number;
  /** % liberado na assinatura. */
  obraLiberacaoInicial: number;
  obraPagaCorrecao: boolean;
  extras: ExtraForm[];
  /** "AAAA-MM" da 1ª cobrança. */
  inicio: string;
}

export function mesSeguinte(hoje = new Date()): string {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** O que dá para chegar pronto na URL (dossiê do lead, aprovação de crédito). */
export interface PrefillSimulador {
  financiamento?: number;
  taxa?: number;
  prazo?: number;
  sistema?: "SAC" | "PRICE";
  renda?: number;
  avaliacao?: number;
}

export function formInicial(prefill: PrefillSimulador = {}): FormSimulador {
  return {
    // Com o sistema do contrato informado, abre nele; sem, compara os dois.
    visao: prefill.sistema ?? "comparar",
    // Os três dados do contrato começam VAZIOS: são do contrato do cliente,
    // não um exemplo — número inventado na tela vira número na conversa.
    valorFinanciamento: prefill.financiamento ?? 0,
    prazoMeses: prefill.prazo ?? 0,
    taxaAnual: prefill.taxa ?? 0,
    tipoTaxa: "nominal",
    modoCorrecao: "tr",
    correcaoPersonalizada: TR_MENSAL_REFERENCIA_2026,
    modoSeguro: "idade",
    proponentes: [{ idade: 30, participacao: 100 }],
    mipPropostaPct: 0.015,
    dfiPct: +(DFI_MENSAL_PADRAO * 100).toFixed(4),
    valorAvaliacao: prefill.avaliacao ?? 0,
    taxaAdm: TAXA_ADM_PADRAO,
    renda: prefill.renda ?? 0,
    despesasIniciais: 0,
    obraAtiva: false,
    obraMeses: 24,
    obraLiberacaoInicial: 0,
    obraPagaCorrecao: true,
    extras: [],
    inicio: mesSeguinte(),
  };
}

/** Cota de financiamento usada para estimar o imóvel quando não há avaliação. */
export const COTA_FINANCIAMENTO_ESTIMADA = 0.8;

export function valorFinanciadoDe(f: FormSimulador): number {
  return Math.max(0, f.valorFinanciamento || 0);
}

/**
 * Base do DFI quando o corretor não informa a avaliação: financiamento ÷ 0,8
 * (o banco financia até 80% do imóvel na regra geral). O DFI é pequeno — em
 * 200 mil financiados, R$ 9,50 por mês — então a estimativa mexe centavos na
 * parcela, e quem tiver a avaliação da proposta informa nos ajustes.
 */
export function avaliacaoEstimada(f: FormSimulador): number {
  return Math.round(valorFinanciadoDe(f) / COTA_FINANCIAMENTO_ESTIMADA / 100) * 100;
}

export function baseDfiDe(f: FormSimulador): number {
  return f.valorAvaliacao > 0 ? f.valorAvaliacao : avaliacaoEstimada(f);
}

export function correcaoDe(f: FormSimulador): number {
  if (f.modoCorrecao === "fixa") return 0;
  if (f.modoCorrecao === "tr") return TR_MENSAL_REFERENCIA_2026;
  return f.correcaoPersonalizada || 0;
}

/**
 * Uma linha com o que está sendo calculado sozinho — fica no cabeçalho dos
 * ajustes recolhidos, para o corretor saber o que entrou na conta sem abrir.
 */
export function resumoAjustes(f: FormSimulador): string {
  const num = (v: number, casas = 2) =>
    v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const correcao =
    f.modoCorrecao === "fixa"
      ? "sem correção"
      : f.modoCorrecao === "tr"
        ? `TR ${num(TR_MENSAL_REFERENCIA_2026)}% a.m.`
        : `correção ${num(f.correcaoPersonalizada)}% a.m.`;
  const mip =
    f.modoSeguro === "proposta"
      ? "seguros da proposta"
      : `seguros estimados (${f.proponentes.map((p) => `${p.idade} anos`).join(" + ")})`;
  const partes = [correcao, mip, `taxa adm R$ ${num(f.taxaAdm, 0)}`];
  if (f.obraAtiva) partes.push(`obra ${f.obraMeses} meses`);
  if (f.extras.length) partes.push(`${f.extras.length} amortização extra`);
  return partes.join(" · ");
}

/** Converte o formulário nos parâmetros do motor (sem o sistema). */
export function paramsDoForm(f: FormSimulador): Omit<ParametrosFinanciamento, "sistema"> {
  return {
    valorFinanciado: valorFinanciadoDe(f),
    valorImovel: baseDfiDe(f),
    prazoMeses: f.prazoMeses || 0,
    taxaJurosAnual: f.taxaAnual || 0,
    tipoTaxa: f.tipoTaxa,
    correcaoMensal: correcaoDe(f),
    mip:
      f.modoSeguro === "proposta"
        ? { modo: "taxa", taxaMensal: (f.mipPropostaPct || 0) / 100 }
        : {
            modo: "tabela",
            proponentes: f.proponentes
              .filter((p) => p.idade > 0)
              .map((p) => ({ idade: p.idade, participacao: (p.participacao || 0) / 100 })),
          },
    dfiTaxaMensal: (f.dfiPct || 0) / 100,
    taxaAdministracao: f.taxaAdm || 0,
    despesasIniciais: f.despesasIniciais || 0,
    rendaFamiliar: f.renda || undefined,
    limiteComprometimento: LIMITE_COMPROMETIMENTO_PADRAO,
    inicio: f.inicio || undefined,
    faseObra: f.obraAtiva
      ? {
          meses: f.obraMeses || 0,
          liberacaoInicial: (f.obraLiberacaoInicial || 0) / 100,
          pagarAtualizacaoMonetaria: f.obraPagaCorrecao,
        }
      : undefined,
    amortizacoesExtras: f.extras
      .filter((e) => e.valor > 0 && e.parcela >= 1)
      .map((e) => ({
        parcela: e.parcela,
        valor: e.valor,
        modo: e.modo,
        repetirACada: e.repetirACada > 0 ? e.repetirACada : undefined,
        vezes: e.repetirACada > 0 && e.vezes > 0 ? e.vezes : undefined,
      })),
  };
}

/** Uma linha por ano (12 meses) — a visão "anual" da planilha. */
export interface LinhaAnual {
  ano: number;
  rotulo: string;
  meses: number;
  encargoMedio: number;
  juros: number;
  amortizacao: number;
  correcao: number;
  seguros: number;
  taxaAdm: number;
  amortizacaoExtra: number;
  totalPago: number;
  saldoFinal: number;
}

export function agruparPorAno(linhas: LinhaPlanilha[]): LinhaAnual[] {
  const out: LinhaAnual[] = [];
  for (let k = 0; k < linhas.length; k += 12) {
    const bloco = linhas.slice(k, k + 12);
    const s = (fn: (l: LinhaPlanilha) => number) => bloco.reduce((t, l) => t + fn(l), 0);
    const ano = k / 12 + 1;
    const total = s((l) => l.encargoTotal);
    const primeiro = bloco[0];
    const ultimo = bloco[bloco.length - 1];
    out.push({
      ano,
      rotulo:
        primeiro?.competencia && ultimo?.competencia
          ? `${primeiro.competencia} a ${ultimo.competencia}`
          : `Ano ${ano}`,
      meses: bloco.length,
      encargoMedio: total / bloco.length,
      juros: s((l) => l.juros),
      amortizacao: s((l) => l.amortizacao),
      correcao: s((l) => l.correcao),
      seguros: s((l) => l.mip + l.dfi),
      taxaAdm: s((l) => l.taxaAdm),
      amortizacaoExtra: s((l) => l.amortizacaoExtra),
      totalPago: total + s((l) => l.amortizacaoExtra),
      saldoFinal: ultimo?.saldoFinal ?? 0,
    });
  }
  return out;
}

/** Um trecho de frase; `forte` sai em negrito (tela e PDF). */
export type Trecho = { texto: string; forte?: boolean };

const brlT = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pctT = (v: number, casas = 2) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

/**
 * A leitura que o corretor usa com o cliente quando compara SAC e PRICE. Pura
 * para a tela e o PDF dizerem exatamente a mesma coisa.
 */
export function leituraComercial(sac: ResultadoSimulacao, price: ResultadoSimulacao): Trecho[][] {
  const difEntrada = sac.resumo.primeiraParcela - price.resumo.primeiraParcela;
  const economia = price.resumo.totalPago - sac.resumo.totalPago;
  const am = (r: ResultadoSimulacao) => r.linhas.filter((l) => l.fase === "amortizacao");
  const sA = am(sac);
  const pA = am(price);
  // Parcela em que o SAC fica menor que o PRICE.
  const cruzamento = sA.findIndex((l, k) => pA[k] && l.encargoTotal <= pA[k]!.encargoTotal);
  // Com correção, o saldo do PRICE pode SUBIR antes de cair: a amortização do
  // começo é menor que a correção do mês.
  const saldoInicialPrice = pA[0]?.saldoInicial ?? 0;
  const picoPrice = pA.length ? Math.max(...pA.map((l) => l.saldoFinal)) : 0;
  const voltaAbaixo = pA.findIndex((l) => l.saldoFinal < saldoInicialPrice);
  const anos = (parcela: number) => Math.ceil(parcela / 12);

  const out: Trecho[][] = [
    [
      { texto: "O SAC começa " },
      { texto: brlT(difEntrada), forte: true },
      { texto: " mais caro por mês e exige renda mínima de " },
      { texto: brlT(sac.resumo.rendaMinima), forte: true },
      { texto: ` (no PRICE, ${brlT(price.resumo.rendaMinima)}).` },
    ],
  ];
  if (cruzamento > 0) {
    out.push([
      { texto: "A partir da parcela " },
      { texto: String(cruzamento + 1), forte: true },
      {
        texto: ` (cerca de ${anos(cruzamento + 1)} anos) a parcela do SAC fica menor que a do PRICE e continua caindo.`,
      },
    ]);
  }
  if (picoPrice > saldoInicialPrice + 1 && voltaAbaixo > 0) {
    out.push([
      { texto: "Atenção ao PRICE: com a correção, o saldo devedor " },
      { texto: "sobe", forte: true },
      { texto: " até " },
      { texto: brlT(picoPrice), forte: true },
      { texto: " e só volta a ficar abaixo do valor financiado na parcela " },
      { texto: String(voltaAbaixo + 1), forte: true },
      { texto: ` (cerca de ${anos(voltaAbaixo + 1)} anos). No SAC ele cai desde o 1º mês.` },
    ]);
  }
  const final: Trecho[] = [
    { texto: "No contrato inteiro, o SAC custa " },
    { texto: brlT(economia), forte: true },
    { texto: " a menos." },
  ];
  if (price.resumo.ultimaParcela > price.resumo.primeiraParcela * 1.05) {
    final.push({
      texto: ` Com a correção, a parcela do PRICE não fica fixa: sai de ${brlT(price.resumo.primeiraParcela)} e termina em ${brlT(price.resumo.ultimaParcela)}.`,
    });
  }
  out.push(final);
  return out;
}

/** Linha do comparativo já formatada (Item | SAC | PRICE) — usada no PDF. */
export type LinhaComparativo = { item: string; SAC: string; PRICE: string };

export function linhasComparativo(
  resultados: Partial<Record<"SAC" | "PRICE", ResultadoSimulacao>>,
  f: FormSimulador,
): LinhaComparativo[] {
  const algum = resultados.SAC ?? resultados.PRICE;
  const temObra = (algum?.resumo.mesesObra ?? 0) > 0;
  const temExtra = (algum?.resumo.totalAmortizacaoExtra ?? 0) > 0;
  const itens: [string, (r: ResultadoSimulacao) => string][] = [
    ...(temObra
      ? ([
          [
            `Maior encargo na obra (${algum!.resumo.mesesObra} meses)`,
            (r) => brlT(r.resumo.maiorEncargoObra),
          ],
        ] as [string, (r: ResultadoSimulacao) => string][])
      : []),
    ["1ª parcela", (r) => brlT(r.resumo.primeiraParcela)],
    ["Última parcela", (r) => brlT(r.resumo.ultimaParcela)],
    ["Maior parcela", (r) => brlT(r.resumo.maiorParcela)],
    [
      "Parcelas pagas",
      (r) =>
        r.resumo.parcelasPagas === r.resumo.prazoContratado
          ? String(r.resumo.parcelasPagas)
          : `${r.resumo.parcelasPagas} de ${r.resumo.prazoContratado}`,
    ],
    ["Renda mínima (30%)", (r) => brlT(r.resumo.rendaMinima)],
    ...(f.renda > 0
      ? ([["Comprometimento da renda", (r) => pctT((r.resumo.comprometimento ?? 0) * 100, 1)]] as [
          string,
          (r: ResultadoSimulacao) => string,
        ][])
      : []),
    ["Total de juros", (r) => brlT(r.resumo.totalJuros)],
    ["Total de correção (TR)", (r) => brlT(r.resumo.totalCorrecao)],
    ["Total de seguros (MIP + DFI)", (r) => brlT(r.resumo.totalMip + r.resumo.totalDfi)],
    ["Total de taxa adm", (r) => brlT(r.resumo.totalTaxaAdm)],
    ...(temExtra
      ? ([["Amortização extra", (r) => brlT(r.resumo.totalAmortizacaoExtra)]] as [
          string,
          (r: ResultadoSimulacao) => string,
        ][])
      : []),
    ["Total pago", (r) => brlT(r.resumo.totalPago)],
    [
      "CET estimado",
      (r) => (r.resumo.cetAnual == null ? "n/d" : `${pctT(r.resumo.cetAnual)} a.a.`),
    ],
  ];
  return itens.map(([item, fn]) => ({
    item,
    SAC: resultados.SAC ? fn(resultados.SAC) : "",
    PRICE: resultados.PRICE ? fn(resultados.PRICE) : "",
  }));
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** Texto para o WhatsApp do cliente (sem travessão, valores redondos). */
export function textoResumo(
  form: FormSimulador,
  resultados: Partial<Record<"SAC" | "PRICE", ResultadoSimulacao>>,
): string {
  const r10 = (v: number) => brl(Math.round(v / 10) * 10).replace(",00", "");
  const linhas = [
    `Simulação de financiamento`,
    `Financiamento: ${brl(valorFinanciadoDe(form)).replace(",00", "")} em ${form.prazoMeses} meses`,
    `Juros: ${pct(form.taxaAnual)} ao ano (${form.tipoTaxa})`,
    "",
  ];
  for (const s of ["SAC", "PRICE"] as const) {
    const r = resultados[s];
    if (!r) continue;
    linhas.push(`*${s}*`);
    if (r.resumo.mesesObra > 0) {
      linhas.push(`Durante a obra: até ${r10(r.resumo.maiorEncargoObra)} por mês`);
    }
    linhas.push(`1ª parcela: ${r10(r.resumo.primeiraParcela)}`);
    linhas.push(`Última parcela: ${r10(r.resumo.ultimaParcela)}`);
    linhas.push(`Renda mínima: ${r10(r.resumo.rendaMinima)}`);
    linhas.push("");
  }
  linhas.push(
    "Valores estimados, incluem seguros e taxa de administração. Sujeito à análise do banco.",
  );
  return linhas.join("\n");
}

/** Lê decimal digitado com vírgula OU ponto ("8,16", "8.16", "0,0038"). */
export function lerDecimal(t: string): number | null {
  const limpo = t.replace(/[^\d.,-]/g, "").replace(",", ".");
  if (!limpo || limpo === "." || limpo === "-") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}
