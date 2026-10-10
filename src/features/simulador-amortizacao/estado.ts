// Estado do formulário da planilha de amortização e as conversões puras entre
// o que o corretor digita e o que o motor (lib/amortizacao) recebe. Sem React
// de propósito: a tela só renderiza; as regras de conversão ficam testáveis.

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
  valorImovel: number;
  /** Recursos próprios + FGTS + subsídio. */
  entrada: number;
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

export function formInicial(
  prefill: { renda?: number; valor?: number; entrada?: number } = {},
): FormSimulador {
  return {
    visao: "comparar",
    valorImovel: prefill.valor ?? 250_000,
    entrada: prefill.entrada ?? 50_000,
    prazoMeses: 420,
    taxaAnual: 8.16,
    tipoTaxa: "nominal",
    modoCorrecao: "tr",
    correcaoPersonalizada: TR_MENSAL_REFERENCIA_2026,
    modoSeguro: "idade",
    proponentes: [{ idade: 30, participacao: 100 }],
    mipPropostaPct: 0.015,
    dfiPct: +(DFI_MENSAL_PADRAO * 100).toFixed(4),
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

export function valorFinanciadoDe(f: FormSimulador): number {
  return Math.max(0, (f.valorImovel || 0) - (f.entrada || 0));
}

export function correcaoDe(f: FormSimulador): number {
  if (f.modoCorrecao === "fixa") return 0;
  if (f.modoCorrecao === "tr") return TR_MENSAL_REFERENCIA_2026;
  return f.correcaoPersonalizada || 0;
}

/** Converte o formulário nos parâmetros do motor (sem o sistema). */
export function paramsDoForm(f: FormSimulador): Omit<ParametrosFinanciamento, "sistema"> {
  return {
    valorFinanciado: valorFinanciadoDe(f),
    valorImovel: f.valorImovel || 0,
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
          ? `${primeiro.competencia} – ${ultimo.competencia}`
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

/** Linhas da planilha prontas para o Excel (cabeçalhos em português). */
export function linhasParaExcel(linhas: LinhaPlanilha[]): Record<string, string | number>[] {
  return linhas.map((l) => ({
    Mês: l.mes,
    Competência: l.competencia ?? "",
    Fase: l.fase === "obra" ? "Obra" : "Amortização",
    Parcela: l.parcela ?? "",
    "Saldo inicial": l.saldoInicial,
    "Liberado (%)": l.liberado == null ? "" : +(l.liberado * 100).toFixed(2),
    Correção: l.correcao,
    "Saldo corrigido": l.saldoCorrigido,
    Juros: l.juros,
    Amortização: l.amortizacao,
    "Prestação (A+J)": l.prestacao,
    MIP: l.mip,
    DFI: l.dfi,
    "Taxa adm": l.taxaAdm,
    "Encargo total": l.encargoTotal,
    "Amortização extra": l.amortizacaoExtra,
    "Saldo final": l.saldoFinal,
  }));
}

export function resumoParaExcel(
  resultados: Partial<Record<"SAC" | "PRICE", ResultadoSimulacao>>,
  f: FormSimulador,
): Record<string, string | number>[] {
  const linhas: [string, (r: ResultadoSimulacao) => string | number][] = [
    ["1ª parcela (encargo total)", (r) => r.resumo.primeiraParcela],
    ["Última parcela", (r) => r.resumo.ultimaParcela],
    ["Maior parcela", (r) => r.resumo.maiorParcela],
    ["Parcelas pagas", (r) => r.resumo.parcelasPagas],
    ["Maior encargo na obra", (r) => r.resumo.maiorEncargoObra],
    ["Total de encargos na obra", (r) => r.resumo.totalEncargosObra],
    ["Total pago", (r) => r.resumo.totalPago],
    ["Total de juros", (r) => r.resumo.totalJuros],
    ["Total de correção (TR/índice)", (r) => r.resumo.totalCorrecao],
    ["Total de MIP", (r) => r.resumo.totalMip],
    ["Total de DFI", (r) => r.resumo.totalDfi],
    ["Total de taxa adm", (r) => r.resumo.totalTaxaAdm],
    ["Amortização extra", (r) => r.resumo.totalAmortizacaoExtra],
    [
      "CET estimado (% a.a.)",
      (r) => (r.resumo.cetAnual == null ? "" : +r.resumo.cetAnual.toFixed(2)),
    ],
    ["Renda mínima (30%)", (r) => r.resumo.rendaMinima],
  ];
  const cab: Record<string, string | number>[] = [
    { Item: "Valor do imóvel", SAC: f.valorImovel, PRICE: f.valorImovel },
    { Item: "Valor financiado", SAC: valorFinanciadoDe(f), PRICE: valorFinanciadoDe(f) },
    { Item: "Prazo (meses)", SAC: f.prazoMeses, PRICE: f.prazoMeses },
    {
      Item: `Taxa de juros (% a.a. ${f.tipoTaxa})`,
      SAC: f.taxaAnual,
      PRICE: f.taxaAnual,
    },
    { Item: "Correção (% a.m.)", SAC: correcaoDe(f), PRICE: correcaoDe(f) },
  ];
  return [
    ...cab,
    ...linhas.map(([item, fn]) => ({
      Item: item,
      SAC: resultados.SAC ? fn(resultados.SAC) : "",
      PRICE: resultados.PRICE ? fn(resultados.PRICE) : "",
    })),
  ];
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
    `Imóvel: ${brl(form.valorImovel).replace(",00", "")}`,
    `Financiado: ${brl(valorFinanciadoDe(form)).replace(",00", "")} em ${form.prazoMeses} meses`,
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
