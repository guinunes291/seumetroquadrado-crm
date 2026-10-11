// Estimativa dos recursos do banco pela renda, para quando o cliente ainda não
// tem a aprovação da Caixa em mãos. Usa o MESMO motor da pré-qualificação do
// dossiê (orcamento.ts / tabela APROVE 2026) — o fluxo não inventa uma segunda
// regra de crédito.

import {
  calcularOrcamento,
  TETO_PARCELAMENTO_CONSTRUTORA,
  type ResultadoOrcamento,
} from "@/lib/orcamento";
import { centavos } from "@/lib/amortizacao";

export interface RecursosEstimados {
  enquadra: boolean;
  motivo?: string;
  financiamento: number;
  subsidio: number;
  /** Parcela do banco proporcional ao financiamento aplicado. */
  parcelaBanco: number;
  faixa: number;
  segmento: string;
  /** true quando o financiamento foi cortado em 80% do imóvel. */
  limitadoPeloImovel: boolean;
  orcamento: ResultadoOrcamento;
}

/**
 * Financiamento + subsídio que a tabela APROVE dá para a renda, aplicados a
 * ESTE imóvel. Mesma regra do avaliarAderencia: o banco financia o menor entre
 * o máximo da renda e 80% do valor do imóvel — num imóvel barato o
 * financiamento máximo não entra inteiro. A parcela acompanha o corte.
 */
export function estimarRecursosPelaRenda(dados: {
  renda: number;
  tem36MesesRegistro: boolean;
  temDependente: boolean;
  valorImovel: number;
}): RecursosEstimados {
  const orc = calcularOrcamento({
    renda: dados.renda,
    tem36MesesRegistro: dados.tem36MesesRegistro,
    temDependente: dados.temDependente,
  });
  if (!orc.enquadra) {
    return {
      enquadra: false,
      motivo: orc.motivoNaoEnquadra,
      financiamento: 0,
      subsidio: 0,
      parcelaBanco: 0,
      faixa: 0,
      segmento: "-",
      limitadoPeloImovel: false,
      orcamento: orc,
    };
  }
  const tetoPeloImovel = (1 - TETO_PARCELAMENTO_CONSTRUTORA) * Math.max(0, dados.valorImovel);
  const financiamento =
    dados.valorImovel > 0 ? Math.min(orc.financiamento, tetoPeloImovel) : orc.financiamento;
  const proporcao = orc.financiamento > 0 ? financiamento / orc.financiamento : 0;
  return {
    enquadra: true,
    financiamento: Math.round(financiamento),
    subsidio: orc.subsidio,
    parcelaBanco: centavos(orc.parcelaEstimada * proporcao),
    faixa: orc.faixa,
    segmento: orc.segmento,
    limitadoPeloImovel: financiamento < orc.financiamento,
    orcamento: orc,
  };
}
