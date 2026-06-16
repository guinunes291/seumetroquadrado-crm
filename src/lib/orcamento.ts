// ============================================================================
// orcamento.ts  —  Motor de ORÇAMENTO do cliente (poder de compra)
// ----------------------------------------------------------------------------
// AQUI mora TODA a regra de negócio. O arquivo aprove2026.ts é só o DADO.
//
// O que este motor faz, em 4 passos:
//   1. CONSULTA a tabela APROVE 2026 pela renda (degrau igual ou inferior).
//   2. Escolhe o FINANCIAMENTO: com redutor (36 meses de registro) ou sem.
//   3. Soma os RECURSOS PRÓPRIOS do cliente: subsídio (só F1) + FGTS + entrada.
//   4. Aplica a REGRA 80/20 (Interpretação A) para achar o TETO de imóvel:
//
//        Teto = (Financiamento + Subsídio + FGTS + Entrada) / 0,80
//
//      Lógica: o financiamento da Caixa cobre ATÉ 80% do imóvel; os 20%
//      restantes o cliente parcela com a construtora. Subsídio, FGTS e entrada
//      são recursos que também entram na conta dos "80% não-construtora" e
//      empurram o teto pra cima (ou reduzem o quanto vai pra construtora).
//
//   5. Por fim, limita o teto pelo VALOR DE AVALIAÇÃO do segmento (teto duro
//      do programa: F1=275k, HIS2/F3=400k, HMP/F4=600k, SBPE/R2V=750k).
//
// IMPORTANTE (responsabilidade técnica):
//   - Isto é uma ESTIMATIVA COMERCIAL de pré-qualificação. NÃO é simulação
//     oficial da Caixa nem garantia de aprovação. A aprovação depende de
//     análise formal (score, restrições, avaliação do imóvel etc.).
// ============================================================================

import {
  TABELA_APROVE_2026,
  RENDA_MIN_APROVE,
  RENDA_MAX_APROVE,
  type LinhaAprove,
} from "./aprove2026";

// Percentual máximo do imóvel que a CONSTRUTORA parcela (os "20%").
// Em Interpretação A, os recursos não-construtora precisam cobrir (1 - este valor).
export const TETO_PARCELAMENTO_CONSTRUTORA = 0.20; // 20%

// ----------------------------------------------------------------------------
// Entrada do cálculo: o que sabemos do cliente.
// ----------------------------------------------------------------------------
export interface DadosCliente {
  renda: number;              // renda BRUTA familiar (composição), em R$
  tem36MesesRegistro: boolean; // true => usa coluna COM REDUTOR (taxa menor)
  temDependente: boolean;      // true => subsídio "com dependente" (só F1)
  fgts?: number;               // saldo de FGTS disponível (opcional)
  entrada?: number;            // recursos próprios / entrada (opcional)
}

// ----------------------------------------------------------------------------
// Saída do cálculo: o orçamento pronto pra alimentar o Match e a UI.
// ----------------------------------------------------------------------------
export interface ResultadoOrcamento {
  enquadra: boolean;          // false => renda fora da tabela (abaixo do mínimo)
  motivoNaoEnquadra?: string;

  // Dados da linha consultada
  rendaConsultada: number;    // o degrau de renda usado (igual ou inferior)
  faixa: number;              // 1..4 | 5 (SBPE/R2V)
  segmento: string;           // HIS1 | HIS2 | HMP | R2V
  parcelaEstimada: number;    // parcela PRICE da Caixa (~30% da renda)
  taxaEfetiva: string;        // a taxa usada (com ou sem redutor)

  // Composição do poder de compra
  financiamento: number;      // valor de financiamento (com/sem redutor)
  subsidio: number;           // subsídio aplicado (0 fora da F1)
  fgts: number;               // FGTS considerado
  entrada: number;            // entrada considerada
  recursosNaoConstrutora: number; // financiamento + subsídio + fgts + entrada

  // Resultado final
  tetoAvaliacaoSegmento: number;  // teto duro do programa (avaliação)
  tetoImovel: number;             // TETO final de compra (já limitado pela avaliação)
  usouRedutor: boolean;
}

// ----------------------------------------------------------------------------
// 1) Consulta a tabela: pega o degrau de renda IGUAL OU IMEDIATAMENTE INFERIOR.
//    (Decisão confirmada: arredondar pra baixo = mais conservador.)
// ----------------------------------------------------------------------------
export function consultarLinhaAprove(renda: number): LinhaAprove | null {
  if (renda < RENDA_MIN_APROVE) return null; // abaixo do mínimo da tabela

  // Acima do máximo: usa o último degrau (teto da tabela).
  const rendaBusca = Math.min(renda, RENDA_MAX_APROVE);

  // A tabela está ordenada por renda crescente. Pegamos a maior linha cujo
  // degrau de renda seja <= renda do cliente.
  let escolhida: LinhaAprove | null = null;
  for (const linha of TABELA_APROVE_2026) {
    if (linha.renda <= rendaBusca) escolhida = linha;
    else break;
  }
  return escolhida;
}

// ----------------------------------------------------------------------------
// 2-5) Calcula o orçamento completo do cliente.
// ----------------------------------------------------------------------------
export function calcularOrcamento(dados: DadosCliente): ResultadoOrcamento {
  const linha = consultarLinhaAprove(dados.renda);

  // Não enquadra: renda abaixo do mínimo coberto pela tabela.
  if (!linha) {
    return {
      enquadra: false,
      motivoNaoEnquadra:
        `Renda de R$ ${dados.renda.toLocaleString("pt-BR")} está abaixo do mínimo ` +
        `da tabela (R$ ${RENDA_MIN_APROVE.toLocaleString("pt-BR")}). ` +
        `Avaliar composição de renda ou outras condições.`,
      rendaConsultada: 0, faixa: 0, segmento: "-", parcelaEstimada: 0,
      taxaEfetiva: "-", financiamento: 0, subsidio: 0, fgts: 0, entrada: 0,
      recursosNaoConstrutora: 0, tetoAvaliacaoSegmento: 0, tetoImovel: 0,
      usouRedutor: false,
    };
  }

  // 2) Financiamento: com redutor (36 meses) ou sem.
  const usouRedutor = dados.tem36MesesRegistro;
  const financiamento = usouRedutor ? linha.finCom : linha.finSem;
  const taxaEfetiva = usouRedutor ? linha.taxaCom : linha.taxaSem;

  // 3) Subsídio (só existe na Faixa 1; null => 0). Escolhe com/sem dependente.
  const subsidioBruto = dados.temDependente ? linha.subComDep : linha.subSemDep;
  const subsidio = subsidioBruto ?? 0;

  const fgts = Math.max(0, dados.fgts ?? 0);
  const entrada = Math.max(0, dados.entrada ?? 0);

  // 4) Regra 80/20 (Interpretação A).
  //    Recursos não-construtora precisam cobrir (1 - 20%) = 80% do imóvel.
  const recursosNaoConstrutora = financiamento + subsidio + fgts + entrada;
  const fatorNaoConstrutora = 1 - TETO_PARCELAMENTO_CONSTRUTORA; // 0,80
  const tetoBruto = recursosNaoConstrutora / fatorNaoConstrutora;

  // 5) Limita pelo valor de avaliação (teto duro do segmento).
  const tetoImovel = Math.min(tetoBruto, linha.avaliacao);

  return {
    enquadra: true,
    rendaConsultada: linha.renda,
    faixa: linha.faixa,
    segmento: linha.segmento,
    parcelaEstimada: linha.parcela,
    taxaEfetiva,
    financiamento,
    subsidio,
    fgts,
    entrada,
    recursosNaoConstrutora,
    tetoAvaliacaoSegmento: linha.avaliacao,
    tetoImovel: Math.round(tetoImovel),
    usouRedutor,
  };
}

// ----------------------------------------------------------------------------
// Helper para o MATCH: dado um imóvel, ele cabe no orçamento do cliente?
// Retorna a aderência + quanto iria pra construtora (os "20%").
// ----------------------------------------------------------------------------
export interface AderenciaImovel {
  cabe: boolean;                 // imóvel <= teto E <= avaliação do segmento
  dentroDaAvaliacao: boolean;    // imóvel <= teto duro do segmento
  valorParcelarConstrutora: number; // quanto sobra p/ parcelar (pode ser 0)
  percentualConstrutora: number; // % do imóvel que vai pra construtora
  estouraParcelamento: boolean;  // true se precisaria parcelar > 20%
  folga: number;                 // teto - preço (negativo = acima do teto)
}

export function avaliarAderencia(
  precoImovel: number,
  orc: ResultadoOrcamento,
): AderenciaImovel {
  const dentroDaAvaliacao = precoImovel <= orc.tetoAvaliacaoSegmento;

  // Quanto o cliente teria que parcelar com a construtora = preço - recursos.
  const valorParcelarConstrutora = Math.max(0, precoImovel - orc.recursosNaoConstrutora);
  const percentualConstrutora = precoImovel > 0
    ? valorParcelarConstrutora / precoImovel
    : 0;

  // Estoura se precisar parcelar MAIS de 20% (regra do negócio).
  // Tolerância de 0,5 ponto % para não reprovar por arredondamento.
  const estouraParcelamento =
    percentualConstrutora > TETO_PARCELAMENTO_CONSTRUTORA + 0.005;

  const cabe = dentroDaAvaliacao && !estouraParcelamento;

  return {
    cabe,
    dentroDaAvaliacao,
    valorParcelarConstrutora: Math.round(valorParcelarConstrutora),
    percentualConstrutora: Math.round(percentualConstrutora * 1000) / 10, // 1 casa
    estouraParcelamento,
    folga: Math.round(orc.tetoImovel - precoImovel),
  };
}

// ----------------------------------------------------------------------------
// Formatação em R$ (utilitário para a UI).
// ----------------------------------------------------------------------------
export function brl(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
