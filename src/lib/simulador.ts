// Simulador rápido de financiamento (tabela Price) para o corretor qualificar o
// lead na hora — "esse cliente cabe nesse imóvel?". É uma ESTIMATIVA; não
// substitui a simulação oficial do banco. Funções puras e testáveis.

export type SimuladorInput = {
  valorImovel: number;
  entrada: number;
  /** Juros nominal ao ano, em % (ex.: 10.5). */
  jurosAnual: number;
  /** Prazo em meses (ex.: 360). */
  meses: number;
  rendaMensal?: number | null;
};

export type SimuladorResult = {
  valorFinanciado: number;
  parcela: number;
  totalPago: number;
  jurosMensal: number;
  /** parcela / renda (0..1+) ou null quando não há renda. */
  comprometimentoRenda: number | null;
  /** Renda necessária para a parcela caber no limite de comprometimento. */
  rendaMinima: number;
};

/** Bancos costumam limitar a parcela a ~30% da renda bruta familiar. */
export const COMPROMETIMENTO_MAX = 0.3;

/** Parcela pela tabela Price (sistema francês, parcelas fixas). */
export function parcelaPrice(valorFinanciado: number, jurosMensal: number, meses: number): number {
  if (meses <= 0 || valorFinanciado <= 0) return 0;
  if (jurosMensal <= 0) return valorFinanciado / meses;
  const f = Math.pow(1 + jurosMensal, meses);
  return (valorFinanciado * jurosMensal * f) / (f - 1);
}

export function simular(input: SimuladorInput): SimuladorResult {
  const valorFinanciado = Math.max(0, (input.valorImovel || 0) - (input.entrada || 0));
  const jurosMensal = Math.pow(1 + (input.jurosAnual || 0) / 100, 1 / 12) - 1;
  const parcela = parcelaPrice(valorFinanciado, jurosMensal, input.meses || 0);
  const totalPago = parcela * (input.meses || 0);
  const rendaMinima = COMPROMETIMENTO_MAX > 0 ? parcela / COMPROMETIMENTO_MAX : 0;
  const comprometimentoRenda =
    input.rendaMensal && input.rendaMensal > 0 ? parcela / input.rendaMensal : null;
  return { valorFinanciado, parcela, totalPago, jurosMensal, comprometimentoRenda, rendaMinima };
}

/**
 * Extrai um número de uma string em formato brasileiro/livre:
 * "R$ 3.500,00" → 3500 · "3.500" → 3500 · "3,5 mil" → 3.5 · "4500" → 4500.
 * Devolve null quando não há número.
 */
export function parseValorBR(s: string | null | undefined): number | null {
  if (s == null) return null;
  let t = String(s).replace(/[^\d.,]/g, "");
  if (!t) return null;

  if (t.includes(",") && t.includes(".")) {
    // ponto = milhar, vírgula = decimal
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (t.includes(",")) {
    t = t.replace(",", ".");
  } else if (t.includes(".")) {
    // só pontos: "3.500" (milhar) vs "3.5" (decimal). Se o último grupo tem 3
    // dígitos, tratamos como separador de milhar.
    const partes = t.split(".");
    const ultimo = partes[partes.length - 1];
    if (ultimo.length === 3) t = partes.join("");
  }

  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
