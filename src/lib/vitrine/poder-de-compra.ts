// Poder de compra do cliente no Mapa de Mercado.
//
// Camada fina sobre o motor oficial do CRM (`orcamento.ts` + tabela APROVE
// 2026). NÃO existe tabela de financiamento aqui de propósito: o mapa standalone
// (public/mapa-mercado.html) carrega uma cópia própria, de outra data, e ter duas
// no app faria o CRM responder duas coisas diferentes sobre o mesmo cliente — o
// dossiê do lead dizendo uma e o mapa dizendo outra.
//
// O motor do CRM também é mais correto que o do mapa standalone num ponto que
// muda resultado: ele limita o financiamento à fração do valor DAQUELE imóvel,
// em vez de somar sempre o financiamento máximo da renda. Num apartamento mais
// barato o mapa antigo dava "fecha" com folga inexistente.
//
// Dois cenários convivem, por decisão comercial:
//   • PADRÃO (80/20)  — a construtora parcela até 20% do imóvel na obra. É a
//     regra do resto do CRM e o corte que vale para "fecha".
//   • OTIMISTA (75/25) — a construtora banca 25%. Não é "fecha", é "fecharia se
//     a construtora esticar o parcelamento"; aparece marcado à parte.

import {
  avaliarAderencia,
  calcularOrcamento,
  tetoParaParcelamento,
  TETO_PARCELAMENTO_CONSTRUTORA,
  type ResultadoOrcamento,
} from "@/lib/orcamento";
import { RENDA_MIN_APROVE } from "@/lib/aprove2026";

/** Regra do CRM: a construtora parcela no máximo 20% do imóvel. */
export const PARCELAMENTO_PADRAO = TETO_PARCELAMENTO_CONSTRUTORA;
/** Cenário otimista do Mapa de Mercado: construtora esticando para 25%. */
export const PARCELAMENTO_OTIMISTA = 0.25;

/** Renda mínima coberta pela tabela APROVE — abaixo disso não há enquadramento. */
export const RENDA_MINIMA = RENDA_MIN_APROVE;

/** O que o corretor preenche na barra do simulador, fora do mapa. */
export type PerfilCliente = {
  /** Renda bruta familiar. `null` = simulação desligada. */
  renda: number | null;
  temDependente: boolean;
  /** Carteira assinada há mais de 3 anos → juros com redutor. */
  carteira3anos: boolean;
  fgts: number;
  entrada: number;
  /** 13º, restituição de IR etc. — recurso próprio que entra uma vez por ano. */
  reforcoAnual: number;
};

export const perfilClienteVazio: PerfilCliente = {
  renda: null,
  temDependente: false,
  carteira3anos: false,
  fgts: 0,
  entrada: 0,
  reforcoAnual: 0,
};

export type PoderDeCompra = {
  perfil: PerfilCliente;
  orcamento: ResultadoOrcamento;
  /** Teto de imóvel na regra padrão (80/20). */
  teto: number;
  /** Teto no cenário otimista (75/25) — sempre >= `teto`. */
  tetoOtimista: number;
};

const positivo = (v: number | null | undefined): number =>
  v != null && Number.isFinite(v) && v > 0 ? v : 0;

/**
 * Converte o perfil em poder de compra. Devolve `null` quando não há renda —
 * é o estado "simulação desligada", em que o mapa volta a colorir por situação.
 * Quando a renda existe mas não enquadra (abaixo da tabela), devolve o resultado
 * mesmo assim: o corretor precisa VER o motivo, não um mapa que não reage.
 */
export function calcularPoderDeCompra(perfil: PerfilCliente): PoderDeCompra | null {
  const renda = positivo(perfil.renda);
  if (renda === 0) return null;

  const orcamento = calcularOrcamento({
    renda,
    tem36MesesRegistro: perfil.carteira3anos,
    temDependente: perfil.temDependente,
    fgts: positivo(perfil.fgts),
    // O reforço anual (13º, restituição) é recurso próprio do cliente e entra na
    // conta exatamente como a entrada — o motor não precisa saber a origem.
    entrada: positivo(perfil.entrada) + positivo(perfil.reforcoAnual),
  });

  return {
    perfil,
    orcamento,
    teto: tetoParaParcelamento(orcamento, PARCELAMENTO_PADRAO),
    tetoOtimista: tetoParaParcelamento(orcamento, PARCELAMENTO_OTIMISTA),
  };
}

export type Enquadramento =
  /** Cabe na regra 80/20 do CRM. */
  | "fecha"
  /** Só cabe se a construtora parcelar 25% — cenário otimista. */
  | "otimista"
  /** Não cabe nem no otimista. */
  | "nao-fecha"
  /** Sem preço na base: não dá para afirmar nada. */
  | "sem-preco";

/** Classifica um empreendimento contra o poder de compra do cliente. */
export function classificar(
  precoMin: number | null | undefined,
  poder: PoderDeCompra | null,
): Enquadramento {
  if (!poder || !poder.orcamento.enquadra) return "nao-fecha";
  if (precoMin == null || !Number.isFinite(precoMin) || precoMin <= 0) return "sem-preco";
  if (avaliarAderencia(precoMin, poder.orcamento, PARCELAMENTO_PADRAO).cabe) return "fecha";
  if (avaliarAderencia(precoMin, poder.orcamento, PARCELAMENTO_OTIMISTA).cabe) return "otimista";
  return "nao-fecha";
}

/** Vale mostrar no grupo "fecha ou quase"? */
export function alcancavel(enquadramento: Enquadramento): boolean {
  return enquadramento === "fecha" || enquadramento === "otimista";
}

/**
 * Quanto do valor do imóvel os recursos do cliente cobrem, em %. É a leitura que
 * ordena a lista: quem cobre mais é para quem o corretor liga primeiro. `null`
 * sem preço ou sem simulação.
 */
export function coberturaPercentual(
  precoMin: number | null | undefined,
  poder: PoderDeCompra | null,
): number | null {
  if (!poder || !poder.orcamento.enquadra) return null;
  if (precoMin == null || !Number.isFinite(precoMin) || precoMin <= 0) return null;
  const aderencia = avaliarAderencia(precoMin, poder.orcamento, PARCELAMENTO_PADRAO);
  return Math.round(100 - aderencia.percentualConstrutora);
}

/** Quanto sobraria para parcelar direto com a construtora, em R$ e em %. */
export function parcelamentoConstrutora(
  precoMin: number | null | undefined,
  poder: PoderDeCompra | null,
): { valor: number; percentual: number } | null {
  if (!poder || !poder.orcamento.enquadra) return null;
  if (precoMin == null || !Number.isFinite(precoMin) || precoMin <= 0) return null;
  const a = avaliarAderencia(precoMin, poder.orcamento, PARCELAMENTO_PADRAO);
  return { valor: a.valorParcelarConstrutora, percentual: a.percentualConstrutora };
}
