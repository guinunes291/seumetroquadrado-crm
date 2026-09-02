// Estimativa comercial MCMV para a prateleira — decisão 19 de 2026-09-02
// (docs/revisao-projetos-foco.md). Espelha as regras da skill
// analise-credito-mcmv (v2, CCFGTS 24/03/2026): cenário PRICE, 30% sobre a
// PRESTAÇÃO TOTAL (amortização + juros + MIP + DFI + taxa de administração),
// prazo padrão de 420 meses.
//
// É uma ESTIMATIVA para orientar a conversa ("cabe" / "não cabe"), nunca
// aprovação — a UI que usar isto mostra o aviso. Taxas usadas são o TETO de
// cada faixa (conservador: erra para "não cabe", não para promessa). Subsídio
// e FGTS não são presumidos; entram só se o corretor informar a entrada.

export type FaixaMCMV = "F1" | "F2" | "F3" | "F4" | "SBPE";

export type FaixaInfo = {
  faixa: FaixaMCMV;
  /** Renda bruta familiar mensal até este valor (inclusive). */
  rendaAte: number;
  /** Taxa nominal anual usada na estimativa (teto da faixa). */
  taxaAnual: number;
  /** Teto do imóvel, quando fixo em regra nacional. F1/F2 variam por município. */
  tetoImovel: number | null;
  rotulo: string;
};

export const FAIXAS_MCMV: readonly FaixaInfo[] = [
  { faixa: "F1", rendaAte: 3_200, taxaAnual: 4.5, tetoImovel: null, rotulo: "Faixa 1" },
  { faixa: "F2", rendaAte: 5_000, taxaAnual: 7.0, tetoImovel: null, rotulo: "Faixa 2" },
  { faixa: "F3", rendaAte: 9_600, taxaAnual: 8.16, tetoImovel: 400_000, rotulo: "Faixa 3" },
  { faixa: "F4", rendaAte: 13_000, taxaAnual: 10.5, tetoImovel: 600_000, rotulo: "Faixa 4" },
] as const;

/** Acima da F4 o financiamento sai do MCMV (SBPE); estimativa genérica. */
export const FAIXA_SBPE: FaixaInfo = {
  faixa: "SBPE",
  rendaAte: Infinity,
  taxaAnual: 11.5,
  tetoImovel: 2_250_000,
  rotulo: "Fora do MCMV",
};

export const PRAZO_PADRAO_MESES = 420;
export const COMPROMETIMENTO_MAXIMO = 0.3;
/** Taxa de administração mensal (R$). */
export const TAXA_ADM_MENSAL = 25;
/** DFI mensal sobre o valor do imóvel. */
export const DFI_MENSAL = 0.000038;
/** MIP mensal sobre o saldo financiado — faixa etária 31–40 anos (padrão). */
export const MIP_MENSAL_PADRAO = 0.00015;

export function faixaPorRenda(renda: number): FaixaInfo {
  return FAIXAS_MCMV.find((f) => renda <= f.rendaAte) ?? FAIXA_SBPE;
}

const taxaMensal = (taxaAnual: number) => taxaAnual / 100 / 12;

/** Parcela PRICE (amortização + juros), constante. */
export function parcelaPrice(valorFinanciado: number, taxaAnual: number, meses: number): number {
  if (valorFinanciado <= 0) return 0;
  const i = taxaMensal(taxaAnual);
  if (i === 0) return valorFinanciado / meses;
  return (valorFinanciado * i) / (1 - Math.pow(1 + i, -meses));
}

/** Fator que transforma valor financiado em parcela PRICE (PMT = PV × fator). */
function fatorPrice(taxaAnual: number, meses: number): number {
  const i = taxaMensal(taxaAnual);
  return i === 0 ? 1 / meses : i / (1 - Math.pow(1 + i, -meses));
}

export type OpcoesEstimativa = {
  /** Entrada disponível (recursos próprios + FGTS + subsídio já conhecido). */
  entrada?: number;
  meses?: number;
  mipMensal?: number;
};

/**
 * Quanto a renda financia, em PRICE, já descontando MIP (proporcional ao saldo),
 * DFI (proporcional ao imóvel) e taxa de administração da folga de 30%.
 * Resolve a equação linear: disponível = PV × (fator + mip) + DFI(imóvel) + adm.
 */
export function financiamentoMaximo(
  renda: number,
  taxaAnual: number,
  opts: OpcoesEstimativa & { valorImovel?: number } = {},
): number {
  const meses = opts.meses ?? PRAZO_PADRAO_MESES;
  const mip = opts.mipMensal ?? MIP_MENSAL_PADRAO;
  const dfi = (opts.valorImovel ?? 0) * DFI_MENSAL;
  const disponivel = renda * COMPROMETIMENTO_MAXIMO - TAXA_ADM_MENSAL - dfi;
  if (disponivel <= 0) return 0;
  return disponivel / (fatorPrice(taxaAnual, meses) + mip);
}

export type AvaliacaoRenda = {
  faixa: FaixaInfo;
  /** Valor financiado considerado (preço − entrada). */
  valorFinanciado: number;
  parcela: number;
  /** Parcela + MIP + DFI + taxa de administração — o que a Caixa compara aos 30%. */
  prestacaoTotal: number;
  /** prestacaoTotal / renda. */
  comprometimento: number;
  /** Maior preço de imóvel que esta renda e entrada suportam (estimativa). */
  precoMaximo: number;
  cabe: boolean;
  motivo: "ok" | "comprometimento" | "acima_teto_faixa";
};

/**
 * "Cabe na renda?" para um preço "a partir de". Cabe quando a prestação total
 * fica dentro dos 30% E o preço respeita o teto da faixa (quando há teto fixo).
 */
export function avaliarRenda(
  renda: number,
  preco: number,
  opts: OpcoesEstimativa = {},
): AvaliacaoRenda {
  const faixa = faixaPorRenda(renda);
  const meses = opts.meses ?? PRAZO_PADRAO_MESES;
  const mip = opts.mipMensal ?? MIP_MENSAL_PADRAO;
  const entrada = Math.max(0, opts.entrada ?? 0);
  const valorFinanciado = Math.max(0, preco - entrada);

  const parcela = parcelaPrice(valorFinanciado, faixa.taxaAnual, meses);
  const prestacaoTotal = parcela + valorFinanciado * mip + preco * DFI_MENSAL + TAXA_ADM_MENSAL;
  const comprometimento = renda > 0 ? prestacaoTotal / renda : Infinity;

  // Preço máximo: financia o que a renda permite (com DFI sobre o próprio
  // preço máximo, aproximado em duas passadas) + a entrada.
  const pv1 = financiamentoMaximo(renda, faixa.taxaAnual, { meses, mipMensal: mip });
  const pv2 = financiamentoMaximo(renda, faixa.taxaAnual, {
    meses,
    mipMensal: mip,
    valorImovel: pv1 + entrada,
  });
  const precoMaximo = Math.max(0, pv2 + entrada);

  const acimaDoTeto = faixa.tetoImovel != null && preco > faixa.tetoImovel;
  const dentroDos30 = comprometimento <= COMPROMETIMENTO_MAXIMO;

  return {
    faixa,
    valorFinanciado,
    parcela,
    prestacaoTotal,
    comprometimento,
    precoMaximo,
    cabe: dentroDos30 && !acimaDoTeto,
    motivo: acimaDoTeto ? "acima_teto_faixa" : dentroDos30 ? "ok" : "comprometimento",
  };
}

/** Prestação arredondada para múltiplo de R$ 10 — nunca ao centavo para o cliente. */
export function arredondaPrestacao(valor: number): number {
  return Math.round(valor / 10) * 10;
}

/** Renda mínima aproximada para um preço (o inverso de avaliarRenda, por busca). */
export function rendaMinimaEstimada(preco: number, opts: OpcoesEstimativa = {}): number {
  // Busca binária na renda: monotônica (mais renda → menor comprometimento).
  let lo = 500;
  let hi = 200_000;
  if (avaliarRenda(hi, preco, opts).comprometimento > COMPROMETIMENTO_MAXIMO) return hi;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (avaliarRenda(mid, preco, opts).comprometimento <= COMPROMETIMENTO_MAXIMO) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi / 50) * 50;
}
