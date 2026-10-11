// ============================================================================
// fluxo.ts — Motor do FLUXO DE PAGAMENTO com a construtora (compra na planta)
// ----------------------------------------------------------------------------
// O que o cliente paga direto à construtora é o que sobra do valor do imóvel
// depois dos recursos que vêm do banco (financiamento + subsídio + FGTS):
//
//   Saldo com a construtora = Valor do imóvel − Financiamento − Subsídio − FGTS
//
// Esse saldo vira o fluxo: ATO (sinal na assinatura) + MENSAIS até a entrega +
// INTERMEDIÁRIAS (balões) + CHAVES (na entrega) + PÓS-CHAVES (se a construtora
// permitir, com juros).
//
// A REGRA QUE MOTIVOU ESTE MOTOR: o nº de mensais NÃO é fixo. Ele é a contagem
// de meses entre o mês seguinte ao ato e a última mensal (por padrão, o mês
// anterior à entrega). Cada mês que passa sem o cliente fechar, o produto
// "perde uma mensal" — o mesmo saldo dividido por menos parcelas — e a mensal
// sobe. Por isso tudo aqui é calculado a partir de `hoje`, nunca de uma
// quantidade de parcelas digitada.
//
// Exemplo real de conta (out/2026, entrega jun/2028, última mensal mai/2028):
//   mensais de nov/2026 a mai/2028 = 19 parcelas. Em nov/2026 serão 18.
//
// Arquivo puro (sem React): a tela só coleta os dados e formata o resultado;
// as regras ficam testáveis (tests/simuladores-fluxo.test.ts).
//
// IMPORTANTE: é simulação COMERCIAL. Os valores oficiais são os da tabela e
// do contrato da construtora; a projeção de INCC é estimativa.
// ============================================================================

import { centavos, pmt } from "@/lib/amortizacao";

// ----------------------------------------------------------------------------
// Meses ("competências" no formato YYYY-MM)
// ----------------------------------------------------------------------------

export type Competencia = string;

const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

/** Índice linear do mês (ano × 12 + mês − 1). NaN se o texto não for YYYY-MM. */
export function indiceMes(c: Competencia | null | undefined): number {
  const m = /^(\d{4})-(\d{2})$/.exec(c ?? "");
  if (!m) return NaN;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return NaN;
  return Number(m[1]) * 12 + (mes - 1);
}

export function competenciaDoIndice(i: number): Competencia {
  const ano = Math.floor(i / 12);
  const mes = (i % 12) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

export function somarMeses(c: Competencia, n: number): Competencia {
  return competenciaDoIndice(indiceMes(c) + n);
}

/** Mês corrente no fuso do navegador. */
export function competenciaAtual(agora: Date = new Date()): Competencia {
  return competenciaDoIndice(agora.getFullYear() * 12 + agora.getMonth());
}

/** "out/2026". */
export function rotuloMes(c: Competencia): string {
  const i = indiceMes(c);
  if (!Number.isFinite(i)) return "—";
  return `${MESES_CURTOS[i % 12]}/${Math.floor(i / 12)}`;
}

/** Competência a partir do mês/ano de entrega do cadastro do projeto. */
export function competenciaDeEntrega(
  mes: number | null | undefined,
  ano: number | null | undefined,
): Competencia | null {
  if (!ano || ano < 2000) return null;
  // Sem mês no cadastro, assume dezembro: é o último mês possível do ano
  // anunciado, e a tela avisa que o mês é suposição.
  const m = mes && mes >= 1 && mes <= 12 ? mes : 12;
  return `${ano}-${String(m).padStart(2, "0")}`;
}

// ----------------------------------------------------------------------------
// Regras da construtora
// ----------------------------------------------------------------------------

/**
 * Quando caem as intermediárias (balões):
 *   anual     → a cada 12 meses contados do ato
 *   semestral → a cada 6 meses contados do ato
 *   dezembro  → todo dezembro (o balão do 13º salário)
 */
export type Periodicidade = "nenhuma" | "anual" | "semestral" | "dezembro";

/** Em todas as regras numéricas, 0 significa "sem regra cadastrada". */
export interface RegrasFluxo {
  /** Ato mínimo em % do valor do imóvel. */
  atoMinimoPct: number;
  /** Ato mínimo em R$ (vale o MAIOR entre este e o percentual). */
  atoMinimoValor: number;
  /** Piso da mensal em R$. */
  mensalMinima: number;
  /** Última mensal = entrega − N meses (1 = mês anterior às chaves). */
  mesesAntesDaEntrega: number;
  intermediarias: Periodicidade;
  /** Teto do que é PARCELADO com a construtora (tudo menos o ato), em % do imóvel. */
  parceladoMaxPct: number;
  /** Teto de (mensal + parcela do banco) sobre a renda, em %. */
  comprometimentoMaxPct: number;
  posChavesPermitido: boolean;
  /** Teto de parcelas depois das chaves (0 = sem teto). */
  posChavesMaxParcelas: number;
  /** Juros das parcelas pós-chaves, % ao mês (Tabela Price), além da correção. */
  jurosPosChavesPct: number;
  /** Projeção do INCC (% ao ano) para estimar a correção durante a obra. */
  inccAnualPct: number;
}

// ----------------------------------------------------------------------------
// Entrada e saída
// ----------------------------------------------------------------------------

/**
 * fechar_nas_mensais → ato, intermediárias e chaves são digitados e o resto é
 *                      dividido igualmente nas mensais (o jeito da tabela).
 * mensal_fixa        → o corretor fixa a mensal que cabe no bolso do cliente e
 *                      o resto vai para as chaves.
 */
export type ModoFluxo = "fechar_nas_mensais" | "mensal_fixa";

export interface EntradaFluxo {
  /** Mês do ato (o mês em que o cliente assina com a construtora). */
  hoje: Competencia;
  /** Previsão de entrega das chaves. */
  entrega: Competencia;
  /** Força a última mensal (quando a tabela diz "mensais até mm/aaaa"). */
  ultimaMensal?: Competencia | null;
  valorImovel: number;
  financiamento: number;
  subsidio: number;
  fgts: number;
  ato: number;
  /** Valor de CADA intermediária (0 = sem intermediárias). */
  intermediariaValor: number;
  /** Parcela de chaves (ignorada no modo mensal_fixa, em que ela é calculada). */
  chaves: number;
  /** Quantas mensais depois das chaves (0 = fluxo termina nas chaves). */
  posChavesParcelas: number;
  modo: ModoFluxo;
  mensalFixa: number;
  /** Renda bruta familiar (0 = não informada). */
  renda: number;
  /** Parcela do financiamento no banco (0 = não informada). */
  parcelaBanco: number;
  regras: RegrasFluxo;
}

export type TipoParcela = "ato" | "mensal" | "intermediaria" | "chaves" | "pos_chaves";

export interface ParcelaFluxo {
  competencia: Competencia;
  tipo: TipoParcela;
  /** Posição dentro do tipo (1-based). */
  numero: number;
  totalDoTipo: number;
  /** Valor da tabela (nominal, na data-base). Pós-chaves já inclui os juros. */
  valor: number;
  /** Estimativa com a correção do INCC até o mês (ou até as chaves, no pós-chaves). */
  valorCorrigido: number;
}

export type NivelAlerta = "erro" | "aviso" | "info";

export interface AlertaFluxo {
  nivel: NivelAlerta;
  codigo:
    | "recursos_maior_que_valor"
    | "excedente"
    | "entrega_passou"
    | "sem_mensais"
    | "ultima_depois_da_entrega"
    | "ato_minimo"
    | "parcelado_maximo"
    | "mensal_minima"
    | "mensal_fixa_alta"
    | "pos_chaves_teto"
    | "pos_chaves_nao_permitido"
    | "comprometimento";
  texto: string;
}

export interface ResultadoFluxo {
  /** false quando falta o valor do imóvel ou as datas são inválidas. */
  valido: boolean;
  valorImovel: number;
  recursos: { financiamento: number; subsidio: number; fgts: number; total: number };
  /** Tudo o que o cliente paga direto à construtora, ato incluso (nominal). */
  saldoConstrutora: number;
  /** O que fica PARCELADO com a construtora (saldo − ato). */
  parcelado: number;
  /** % do imóvel parcelado com a construtora (0–100). */
  parceladoPct: number;
  ato: number;
  atoMinimo: number;
  mensais: {
    quantidade: number;
    /** Valor de cada mensal (a última pode diferir em centavos). */
    valor: number;
    primeira: Competencia | null;
    ultima: Competencia | null;
  };
  intermediarias: { quantidade: number; valor: number; meses: Competencia[] };
  chaves: { valor: number; competencia: Competencia };
  posChaves: {
    quantidade: number;
    valor: number;
    primeira: Competencia | null;
    ultima: Competencia | null;
    /** Saldo que atravessa as chaves e é financiado pela construtora. */
    saldoNasChaves: number;
    juros: number;
  };
  parcelas: ParcelaFluxo[];
  totalNominal: number;
  totalCorrigido: number;
  comprometimento: {
    /** Mensal da construtora ÷ renda (%). */
    mensalPct: number;
    /** (Mensal + parcela do banco) ÷ renda (%). */
    obraPct: number;
    /** (Parcela do banco + pós-chaves) ÷ renda (%) — 0 se não há pós-chaves. */
    posChavesPct: number;
  } | null;
  alertas: AlertaFluxo[];
}

// ----------------------------------------------------------------------------
// Utilitários
// ----------------------------------------------------------------------------

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct1 = (v: number) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const pos = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);

/** Taxa mensal equivalente a uma anual em % (composta). */
export function taxaMensalEquivalente(anualPct: number): number {
  if (!Number.isFinite(anualPct) || anualPct === 0) return 0;
  return Math.pow(1 + anualPct / 100, 1 / 12) - 1;
}

/** Ato mínimo exigido: o maior entre o piso em R$ e o percentual do imóvel. */
export function atoMinimoDe(regras: RegrasFluxo, valorImovel: number): number {
  return centavos(
    Math.max(pos(regras.atoMinimoValor), (pos(regras.atoMinimoPct) / 100) * valorImovel),
  );
}

/** Meses em que caem as intermediárias entre o mês seguinte ao ato e a última mensal. */
export function mesesDasIntermediarias(
  periodicidade: Periodicidade,
  iHoje: number,
  iUltima: number,
): Competencia[] {
  if (periodicidade === "nenhuma") return [];
  const meses: Competencia[] = [];
  for (let i = iHoje + 1; i <= iUltima; i++) {
    const desdeAto = i - iHoje;
    const cai =
      periodicidade === "anual"
        ? desdeAto % 12 === 0
        : periodicidade === "semestral"
          ? desdeAto % 6 === 0
          : i % 12 === 11; // dezembro
    if (cai) meses.push(competenciaDoIndice(i));
  }
  return meses;
}

function resultadoVazio(e: EntradaFluxo): ResultadoFluxo {
  return {
    valido: false,
    valorImovel: pos(e.valorImovel),
    recursos: { financiamento: 0, subsidio: 0, fgts: 0, total: 0 },
    saldoConstrutora: 0,
    parcelado: 0,
    parceladoPct: 0,
    ato: 0,
    atoMinimo: 0,
    mensais: { quantidade: 0, valor: 0, primeira: null, ultima: null },
    intermediarias: { quantidade: 0, valor: 0, meses: [] },
    chaves: { valor: 0, competencia: e.entrega },
    posChaves: {
      quantidade: 0,
      valor: 0,
      primeira: null,
      ultima: null,
      saldoNasChaves: 0,
      juros: 0,
    },
    parcelas: [],
    totalNominal: 0,
    totalCorrigido: 0,
    comprometimento: null,
    alertas: [],
  };
}

// ----------------------------------------------------------------------------
// O fluxo
// ----------------------------------------------------------------------------

export function simularFluxo(e: EntradaFluxo): ResultadoFluxo {
  const iHoje = indiceMes(e.hoje);
  const iEntrega = indiceMes(e.entrega);
  const valorImovel = pos(e.valorImovel);
  if (!valorImovel || !Number.isFinite(iHoje) || !Number.isFinite(iEntrega)) {
    return resultadoVazio(e);
  }

  const { regras } = e;
  const alertas: AlertaFluxo[] = [];

  // 1) Recursos de fora da construtora e o saldo que sobra para ela.
  const financiamento = pos(e.financiamento);
  const subsidio = pos(e.subsidio);
  const fgts = pos(e.fgts);
  const recursosTotal = centavos(financiamento + subsidio + fgts);
  let saldoConstrutora = centavos(valorImovel - recursosTotal);
  if (saldoConstrutora < 0) {
    alertas.push({
      nivel: "erro",
      codigo: "recursos_maior_que_valor",
      texto: `Financiamento + subsídio + FGTS (${brl(recursosTotal)}) passam do valor do imóvel em ${brl(-saldoConstrutora)}. O banco nunca libera mais que o imóvel: reduza o financiamento ou o FGTS.`,
    });
    saldoConstrutora = 0;
  }

  // 2) Linha do tempo. As chaves caem na entrega; se a entrega já passou (ou é
  //    este mês), caem agora.
  const iChaves = Math.max(iEntrega, iHoje);
  if (iEntrega <= iHoje) {
    alertas.push({
      nivel: "aviso",
      codigo: "entrega_passou",
      texto: `A entrega prevista (${rotuloMes(e.entrega)}) não está mais no futuro: não há meses de obra para parcelar. Confira a data com a construtora: imóvel pronto costuma ter outra tabela.`,
    });
  }
  const iUltimaInformada = indiceMes(e.ultimaMensal);
  const iUltima = Number.isFinite(iUltimaInformada)
    ? iUltimaInformada
    : iEntrega - Math.max(0, Math.round(regras.mesesAntesDaEntrega || 0));
  if (Number.isFinite(iUltimaInformada) && iUltimaInformada > iEntrega) {
    alertas.push({
      nivel: "info",
      codigo: "ultima_depois_da_entrega",
      texto: `A última mensal (${rotuloMes(e.ultimaMensal!)}) está depois da entrega (${rotuloMes(e.entrega)}). Confirme na tabela da construtora.`,
    });
  }
  const iPrimeira = iHoje + 1;
  const qtdMensais = Math.max(0, iUltima - iPrimeira + 1);

  // 3) Intermediárias que ainda cabem no prazo (também diminuem com o tempo).
  const intermediariaValor = centavos(pos(e.intermediariaValor));
  const mesesInter =
    intermediariaValor > 0 ? mesesDasIntermediarias(regras.intermediarias, iHoje, iUltima) : [];
  const totalInter = centavos(intermediariaValor * mesesInter.length);

  // 4) Pós-chaves: respeita a permissão e o teto da construtora.
  let qtdPos = Math.max(0, Math.round(e.posChavesParcelas || 0));
  if (qtdPos > 0 && !regras.posChavesPermitido) {
    alertas.push({
      nivel: "aviso",
      codigo: "pos_chaves_nao_permitido",
      texto: "Esta construtora não parcela depois das chaves: o pós-chaves foi ignorado.",
    });
    qtdPos = 0;
  }
  if (qtdPos > 0 && regras.posChavesMaxParcelas > 0 && qtdPos > regras.posChavesMaxParcelas) {
    alertas.push({
      nivel: "aviso",
      codigo: "pos_chaves_teto",
      texto: `O teto da construtora é de ${regras.posChavesMaxParcelas} parcelas depois das chaves, e a simulação usou ${regras.posChavesMaxParcelas}.`,
    });
    qtdPos = regras.posChavesMaxParcelas;
  }

  // 5) Distribuição do saldo.
  const ato = centavos(pos(e.ato));
  const slots = qtdMensais + qtdPos;
  let chaves: number;
  let resto: number; // o que vai para mensais (obra + pós-chaves), nominal

  if (e.modo === "mensal_fixa") {
    const disponivel = centavos(saldoConstrutora - ato - totalInter);
    const mensalFixa = centavos(pos(e.mensalFixa));
    if (slots === 0 || disponivel <= 0) {
      // Sem meses para parcelar, tudo vai nas chaves. Saldo já tomado pelo ato
      // e pelas intermediárias: o alerta de excedente (abaixo) explica.
      resto = 0;
      chaves = slots === 0 ? disponivel : 0;
    } else if (mensalFixa * slots > disponivel) {
      const maxima = Math.floor((disponivel / slots) * 100) / 100;
      alertas.push({
        nivel: "aviso",
        codigo: "mensal_fixa_alta",
        texto: `Com ${brl(mensalFixa)} por mês o saldo fecha antes das chaves. A mensal máxima neste prazo é ${brl(maxima)}: a simulação usou esse valor e deixou as chaves zeradas.`,
      });
      resto = Math.max(0, disponivel);
      chaves = 0;
    } else {
      resto = centavos(mensalFixa * slots);
      chaves = centavos(disponivel - resto);
    }
  } else {
    chaves = centavos(pos(e.chaves));
    resto = centavos(saldoConstrutora - ato - totalInter - chaves);
    if (resto > 0 && slots === 0) {
      alertas.push({
        nivel: "aviso",
        codigo: "sem_mensais",
        texto: `Não há mais meses de mensal até a entrega: os ${brl(resto)} que sobraram foram para as chaves.`,
      });
      chaves = centavos(chaves + resto);
      resto = 0;
    }
  }

  const excedente = centavos(ato + totalInter + chaves + Math.max(0, resto) - saldoConstrutora);
  if (resto < 0 || chaves < 0 || excedente > 0.01) {
    const passa = Math.max(-resto, -chaves, excedente);
    alertas.push({
      nivel: "erro",
      codigo: "excedente",
      texto: `Ato + intermediárias + chaves passam do saldo com a construtora em ${brl(passa)}. Reduza um deles.`,
    });
    resto = Math.max(0, resto);
    chaves = Math.max(0, chaves);
  }

  // 6) Mensais da obra (a última absorve o resíduo de centavos quando não há
  //    pós-chaves) e o saldo que atravessa as chaves.
  const mensalBase = slots > 0 ? centavos(resto / slots) : 0;
  let saldoNasChaves = 0;
  const valoresMensais: number[] = [];
  if (qtdMensais > 0) {
    for (let k = 0; k < qtdMensais; k++) valoresMensais.push(mensalBase);
    if (qtdPos === 0) {
      valoresMensais[qtdMensais - 1] = centavos(resto - mensalBase * (qtdMensais - 1));
    }
  }
  const somaMensais = centavos(valoresMensais.reduce((s, v) => s + v, 0));
  if (qtdPos > 0) saldoNasChaves = centavos(resto - somaMensais);

  const jurosPos = (pos(regras.jurosPosChavesPct) || 0) / 100;
  const parcelaPos = qtdPos > 0 ? centavos(pmt(saldoNasChaves, jurosPos, qtdPos)) : 0;
  const jurosTotaisPos = qtdPos > 0 ? centavos(parcelaPos * qtdPos - saldoNasChaves) : 0;

  // 7) Cronograma com a projeção do INCC (corrige até as chaves).
  const incc = taxaMensalEquivalente(regras.inccAnualPct || 0);
  const fator = (i: number) => Math.pow(1 + incc, Math.max(0, Math.min(i, iChaves) - iHoje));
  const parcelas: ParcelaFluxo[] = [];
  const add = (i: number, tipo: TipoParcela, numero: number, total: number, valor: number) => {
    if (valor <= 0) return;
    parcelas.push({
      competencia: competenciaDoIndice(i),
      tipo,
      numero,
      totalDoTipo: total,
      valor,
      valorCorrigido: centavos(valor * fator(i)),
    });
  };

  add(iHoje, "ato", 1, 1, ato);
  valoresMensais.forEach((v, k) => add(iPrimeira + k, "mensal", k + 1, qtdMensais, v));
  mesesInter.forEach((m, k) =>
    add(indiceMes(m), "intermediaria", k + 1, mesesInter.length, intermediariaValor),
  );
  add(iChaves, "chaves", 1, 1, chaves);
  for (let k = 0; k < qtdPos; k++) add(iChaves + 1 + k, "pos_chaves", k + 1, qtdPos, parcelaPos);

  const ordemTipo: Record<TipoParcela, number> = {
    ato: 0,
    mensal: 1,
    intermediaria: 2,
    chaves: 3,
    pos_chaves: 4,
  };
  parcelas.sort(
    (a, b) =>
      indiceMes(a.competencia) - indiceMes(b.competencia) || ordemTipo[a.tipo] - ordemTipo[b.tipo],
  );

  const totalNominal = centavos(parcelas.reduce((s, p) => s + p.valor, 0));
  const totalCorrigido = centavos(parcelas.reduce((s, p) => s + p.valorCorrigido, 0));

  // 8) Regras da construtora.
  const parcelado = centavos(Math.max(0, saldoConstrutora - ato));
  const parceladoPct = (parcelado / valorImovel) * 100;
  const atoMinimo = atoMinimoDe(regras, valorImovel);
  if (atoMinimo > 0 && ato + 0.005 < atoMinimo) {
    alertas.push({
      nivel: "erro",
      codigo: "ato_minimo",
      texto: `Ato de ${brl(ato)} abaixo do mínimo da construtora (${brl(atoMinimo)}).`,
    });
  }
  // Tolerância de 0,05 ponto percentual para não reprovar por arredondamento.
  if (regras.parceladoMaxPct > 0 && parceladoPct > regras.parceladoMaxPct + 0.05) {
    const teto = (regras.parceladoMaxPct / 100) * valorImovel;
    alertas.push({
      nivel: "erro",
      codigo: "parcelado_maximo",
      texto: `O cliente parcelaria ${brl(parcelado)} (${pct1(parceladoPct)} do imóvel) com a construtora, e o teto é ${pct1(regras.parceladoMaxPct)} (${brl(teto)}). Faltam ${brl(parcelado - teto)}: aumente o ato, use mais FGTS ou busque um financiamento maior.`,
    });
  }
  const mensalReferencia = qtdMensais > 0 ? mensalBase : 0;
  if (regras.mensalMinima > 0 && qtdMensais > 0 && mensalReferencia + 0.005 < regras.mensalMinima) {
    alertas.push({
      nivel: "aviso",
      codigo: "mensal_minima",
      texto: `Mensal de ${brl(mensalReferencia)} abaixo do piso da construtora (${brl(regras.mensalMinima)}). Leve parte das chaves ou das intermediárias para as mensais.`,
    });
  }

  let comprometimento: ResultadoFluxo["comprometimento"] = null;
  const renda = pos(e.renda);
  if (renda > 0) {
    const banco = pos(e.parcelaBanco);
    comprometimento = {
      mensalPct: (mensalReferencia / renda) * 100,
      obraPct: ((mensalReferencia + banco) / renda) * 100,
      posChavesPct: qtdPos > 0 ? ((banco + parcelaPos) / renda) * 100 : 0,
    };
    const pior = Math.max(comprometimento.obraPct, comprometimento.posChavesPct);
    if (regras.comprometimentoMaxPct > 0 && pior > regras.comprometimentoMaxPct + 0.05) {
      alertas.push({
        nivel: "aviso",
        codigo: "comprometimento",
        texto: `Banco + construtora comprometem ${pct1(pior)} da renda, acima do limite de ${pct1(regras.comprometimentoMaxPct)} da construtora.`,
      });
    }
  }

  return {
    valido: true,
    valorImovel,
    recursos: { financiamento, subsidio, fgts, total: recursosTotal },
    saldoConstrutora,
    parcelado,
    parceladoPct,
    ato,
    atoMinimo,
    mensais: {
      quantidade: qtdMensais,
      valor: mensalReferencia,
      primeira: qtdMensais > 0 ? competenciaDoIndice(iPrimeira) : null,
      ultima: qtdMensais > 0 ? competenciaDoIndice(iPrimeira + qtdMensais - 1) : null,
    },
    intermediarias: {
      quantidade: mesesInter.length,
      valor: mesesInter.length > 0 ? intermediariaValor : 0,
      meses: mesesInter,
    },
    chaves: { valor: chaves, competencia: competenciaDoIndice(iChaves) },
    posChaves: {
      quantidade: qtdPos,
      valor: parcelaPos,
      primeira: qtdPos > 0 ? competenciaDoIndice(iChaves + 1) : null,
      ultima: qtdPos > 0 ? competenciaDoIndice(iChaves + qtdPos) : null,
      saldoNasChaves,
      juros: jurosTotaisPos,
    },
    parcelas,
    totalNominal,
    totalCorrigido,
    comprometimento,
    alertas,
  };
}

// ----------------------------------------------------------------------------
// "Se fechar só no mês que vem": o argumento de urgência em números
// ----------------------------------------------------------------------------

export interface EfeitoDoTempo {
  atual: ResultadoFluxo;
  mesQueVem: ResultadoFluxo;
  /** Quantas mensais se perdem esperando um mês (normalmente 1). */
  mensaisPerdidas: number;
  /** Quanto a mensal sobe (fechar_nas_mensais) — 0 se não há mensais. */
  aumentoMensal: number;
  /** Quanto as chaves sobem (mensal_fixa). */
  aumentoChaves: number;
}

/**
 * Mesmo cliente, mesmo imóvel, assinando um mês depois. A última mensal não
 * muda (ela é presa à entrega), então o primeiro mês some — e o saldo se
 * espreme nas parcelas que sobram.
 */
export function efeitoDoProximoMes(e: EntradaFluxo): EfeitoDoTempo {
  const atual = simularFluxo(e);
  const mesQueVem = simularFluxo({ ...e, hoje: somarMeses(e.hoje, 1) });
  return {
    atual,
    mesQueVem,
    mensaisPerdidas: Math.max(0, atual.mensais.quantidade - mesQueVem.mensais.quantidade),
    aumentoMensal:
      atual.mensais.quantidade > 0 && mesQueVem.mensais.quantidade > 0
        ? centavos(mesQueVem.mensais.valor - atual.mensais.valor)
        : 0,
    aumentoChaves: centavos(mesQueVem.chaves.valor - atual.chaves.valor),
  };
}
