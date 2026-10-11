// ============================================================================
// mundo-apto.ts — Fluxo de pagamento da MUNDO APTO (e Elevato)
// ----------------------------------------------------------------------------
// Regras da Política de Análise de Crédito de 09/04/2026 (Tabelão out/2026,
// tabela-mundo-apto.ts). Como na Vibra, cada TIPO de parcela tem teto pela
// renda (aqui, renda LÍQUIDA) e a política limita quanto do preço vai em cada
// grupo. O corretor monta o fluxo até a soma bater com o saldo:
//
//   Saldo com a construtora = valor − financiamento − subsídio − FGTS
//   (na tabela direta não há banco: o saldo é o valor do imóvel)
//
// Modalidades (página "Modalidades de pagamento"):
//
//   Parcela        Associativo (SICAQ)        SFH (banco)               Tabela direta
//   Ato            livre                      livre · mín. 6% do preço  ┐ ato + entradas
//   Entrada 30     livre                      100% da renda             │ = 30% do preço
//   Entrada 60/90  100% da renda              100% da renda             ┘
//   Mensal pré     30% da renda · máx. 12%*   30% da renda · mín. 24%   ┐ parcelas
//   Semestral      100% da renda              100% da renda             │ = 70% do preço
//   Anual          100% da renda · máx. 5%    100% da renda             │
//   Única          100% da renda              100% da renda             ┘
//   Mensal pós     10% da renda · máx. 8%,    R$ 100/mês só para        não tem
//                  até 42 meses               completar 36 meses
//   Financiamento  livre                      + FGTS até 70%            não tem
//
//   * os 12% podem ser ultrapassados se a renda comporta e o pró-soluto
//     total fica até 25% (observação 7).
//
// Regras gerais (página "Vencimentos e regras gerais"):
//   • pró-soluto até 25% do preço (associativo e SFH);
//   • prazo mínimo do contrato: 36 meses;
//   • nenhuma parcela abaixo de R$ 100;
//   • semestral OU anual, nunca as duas (a tela deixa escolher uma);
//   • a única cai no habite-se e a mensal pós começa no mês seguinte
//     (tabela de vencimentos por empreendimento); anual em dezembro.
//
// LEITURAS DA POLÍTICA (o que ela não diz com todas as letras):
//   • Pró-soluto = tudo o que é parcelado com a construtora MENOS o ato e as
//     entradas de 30/60/90 dias (o mesmo critério da Vibra, que exclui os atos).
//   • As mensais pré começam depois da entrada de 90 dias (5º mês) e vão até
//     o mês anterior ao habite-se. Por isso cada mês sem assinar é uma mensal
//     a menos.
//   • Semestrais em junho e dezembro (a política diz "livre"; o quadro da
//     campanha de adimplência põe a primeira em 30/12/2026).
//   • O prazo mínimo de 36 meses não é cobrado na tabela direta, que não tem
//     pós habite-se para completá-lo.
//
// Arquivo puro (sem React), testado em tests/simuladores-mundo-apto.test.ts.
// ============================================================================

import { centavos } from "@/lib/amortizacao";
import {
  competenciaDoIndice,
  indiceMes,
  rotuloMes,
  type Competencia,
} from "@/lib/simuladores/fluxo";
import {
  CONFERIDA_EM_MA,
  FONTE_POLITICA_MA,
  TABELAO,
  VENCIMENTOS_MUNDO_APTO,
  VERSAO_POLITICA,
  type VencimentosMundoApto,
} from "@/lib/simuladores/tabela-mundo-apto";

export { CONFERIDA_EM_MA, FONTE_POLITICA_MA, TABELAO, VERSAO_POLITICA };

export const PARCELA_MINIMA_MA = 100;
export const PRAZO_MINIMO_MA = 36;
/** Atos e entradas: no mês do ato e nos 3 seguintes (0, 30, 60, 90 dias). */
const MESES_DE_ENTRADA = 4;

// ----------------------------------------------------------------------------
// Modalidades
// ----------------------------------------------------------------------------

export type ModalidadeMA = "associativo" | "sfh" | "direta";
export type IntermediariaMA = "anual" | "semestral";

export type IdLinhaMA = "ato" | "e30" | "e60" | "e90" | "mensal" | "inter" | "unica" | "pos";
export const IDS_LINHAS_MA: readonly IdLinhaMA[] = [
  "ato",
  "e30",
  "e60",
  "e90",
  "mensal",
  "inter",
  "unica",
  "pos",
];
const ENTRADAS: readonly IdLinhaMA[] = ["ato", "e30", "e60", "e90"];

export type TipoLinhaMA =
  "ato" | "entrada" | "mensal" | "semestral" | "anual" | "unica" | "pos_chave";

export interface RegrasModalidadeMA {
  rotulo: string;
  descricao: string;
  /** Teto de CADA parcela em fração da renda líquida (null = livre). */
  tetoRenda: Record<IdLinhaMA, number | null>;
  /** Teto fixo de cada parcela de pós (SFH: R$ 100). */
  posValorFixo: number | null;
  posPermitido: boolean;
  posMaxParcelas: number;
  /** Teto das mensais pré em fração do preço (associativo: 12%, flexível). */
  mensalMax: number | null;
  /** Piso das mensais pré (SFH: 24%). */
  mensalMin: number | null;
  anualMax: number | null;
  posMax: number | null;
  atoMin: number | null;
  /** Piso de ato + entradas (tabela direta: 30%). */
  entradasMin: number | null;
  /** Teto de financiamento + FGTS (SFH: 70%). */
  financiamentoMax: number | null;
  proSolutoMax: number | null;
  temBanco: boolean;
  /** Cobra o prazo mínimo de 36 meses. */
  prazoMinimo: boolean;
  correcao: string;
}

const LIVRE = null;

export const MODALIDADES_MA: Record<ModalidadeMA, RegrasModalidadeMA> = {
  associativo: {
    rotulo: "Associativo",
    descricao: "Repasse associativo com SICAQ aprovado (MCMV na Caixa durante a obra)",
    tetoRenda: {
      ato: LIVRE,
      e30: LIVRE,
      e60: 1,
      e90: 1,
      mensal: 0.3,
      inter: 1,
      unica: 1,
      pos: 0.1,
    },
    posValorFixo: null,
    posPermitido: true,
    posMaxParcelas: 42,
    mensalMax: 0.12,
    mensalMin: null,
    anualMax: 0.05,
    posMax: 0.08,
    atoMin: null,
    entradasMin: null,
    financiamentoMax: null,
    proSolutoMax: 0.25,
    temBanco: true,
    prazoMinimo: true,
    correcao:
      "Ato e entradas fixos; parcelas da obra corrigidas pelo INCC-M até o habite-se; mensal pós por IPCA + 1%.",
  },
  sfh: {
    rotulo: "SFH",
    descricao: "Repasse SFH: financiamento bancário, até 70% do preço com o FGTS",
    tetoRenda: {
      ato: LIVRE,
      e30: 1,
      e60: 1,
      e90: 1,
      mensal: 0.3,
      inter: 1,
      unica: 1,
      pos: LIVRE,
    },
    posValorFixo: 100,
    posPermitido: true,
    posMaxParcelas: 42,
    mensalMax: null,
    mensalMin: 0.24,
    anualMax: null,
    posMax: null,
    atoMin: 0.06,
    entradasMin: null,
    financiamentoMax: 0.7,
    proSolutoMax: 0.25,
    temBanco: true,
    prazoMinimo: true,
    correcao:
      "Ato e entradas fixos; parcelas da obra corrigidas pelo INCC-M até o habite-se; financiamento e FGTS por INCC-M na obra e IPCA + 1% depois.",
  },
  direta: {
    rotulo: "Tabela direta",
    descricao: "Sem banco: 30% em ato e entradas, 70% em parcelas até o habite-se",
    tetoRenda: {
      ato: LIVRE,
      e30: LIVRE,
      e60: LIVRE,
      e90: LIVRE,
      mensal: LIVRE,
      inter: LIVRE,
      unica: LIVRE,
      pos: LIVRE,
    },
    posValorFixo: null,
    posPermitido: false,
    posMaxParcelas: 0,
    mensalMax: null,
    mensalMin: null,
    anualMax: null,
    posMax: null,
    atoMin: null,
    entradasMin: 0.3,
    financiamentoMax: null,
    proSolutoMax: null,
    temBanco: false,
    prazoMinimo: false,
    correcao: "Ato e entradas fixos; parcelas corrigidas pelo INCC-M até o habite-se.",
  },
};

// ----------------------------------------------------------------------------
// Empreendimentos
// ----------------------------------------------------------------------------

export interface EmpreendimentoMA {
  nome: string;
  vencimentos: VencimentosMundoApto;
  /** Fora da tabela da política: habite-se, única e pós pelo mês informado. */
  outro?: boolean;
}

export const EMPREENDIMENTOS_MA: readonly EmpreendimentoMA[] = Object.entries(
  VENCIMENTOS_MUNDO_APTO,
).map(([nome, vencimentos]) => ({ nome, vencimentos }));

export const OUTRO_EMPREENDIMENTO_MA: EmpreendimentoMA = {
  nome: "Outro empreendimento",
  vencimentos: { semestral: true, anual: true, unica: null, mensalPos: null },
  outro: true,
};

export function empreendimentoMA(nome: string | null | undefined): EmpreendimentoMA | null {
  if (nome === OUTRO_EMPREENDIMENTO_MA.nome) return OUTRO_EMPREENDIMENTO_MA;
  return EMPREENDIMENTOS_MA.find((e) => e.nome === nome) ?? null;
}

/** "MA Estação Lapa", "MA Lapa" → "lapa"; "Estação SP Morumbi (F1/F2)" → "sp morumbi". */
export function normalizarNomeMA(nome: string): string {
  return nome
    .replace(/\([^)]*\)/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !["ma", "mundo", "apto", "estacao"].includes(t))
    .join(" ");
}

export function casaComCatalogoMA(emp: EmpreendimentoMA, nomeProjeto: string): boolean {
  if (emp.outro) return false;
  const alvo = normalizarNomeMA(nomeProjeto);
  return !!alvo && normalizarNomeMA(emp.nome) === alvo;
}

export function empreendimentoMADoProjeto(nomeProjeto: string): EmpreendimentoMA | null {
  return EMPREENDIMENTOS_MA.find((e) => casaComCatalogoMA(e, nomeProjeto)) ?? null;
}

// ----------------------------------------------------------------------------
// Linhas
// ----------------------------------------------------------------------------

export interface EntradaMA {
  empreendimento: EmpreendimentoMA | null;
  modalidade: ModalidadeMA;
  intermediaria: IntermediariaMA;
  /** Mês do ato (assinatura). */
  hoje: Competencia;
  /** Habite-se (fim das mensais pré). Vazio = o da política (mês da única). */
  habiteSe: Competencia | "";
  /** Renda LÍQUIDA familiar. */
  renda: number;
  valorImovel: number;
  financiamento: number;
  subsidio: number;
  fgts: number;
  /** Parcelas de mensal pós; null = automático (o mínimo para fechar 36 meses). */
  posParcelas: number | null;
  /** Valor de CADA parcela por linha. */
  parcelas: Partial<Record<IdLinhaMA, number>>;
}

export interface LinhaMA {
  id: IdLinhaMA;
  tipo: TipoLinhaMA;
  rotulo: string;
  meses: Competencia[];
  qtd: number;
  /** Fração da renda que limita cada parcela (null = livre ou teto fixo). */
  tetoRenda: number | null;
  tetoFixo: number | null;
  /** Por que a linha está vazia ("— na política", "depois do habite-se"). */
  indisponivel?: string;
}

/** O habite-se que vale: o informado ou o da política (mês da única). */
export function habiteSeMA(e: Pick<EntradaMA, "empreendimento" | "habiteSe">): Competencia | null {
  if (e.habiteSe) return e.habiteSe;
  return e.empreendimento?.vencimentos.unica ?? null;
}

const faixa = (de: number, ate: number, filtro: (i: number) => boolean = () => true) => {
  const out: Competencia[] = [];
  for (let i = de; i <= ate; i++) if (filtro(i)) out.push(competenciaDoIndice(i));
  return out;
};

/** Mensais de pós que fecham o prazo mínimo de 36 meses (a contar do ato). */
export function posAutomatico(iHoje: number, iInicioPos: number): number {
  return Math.max(0, iHoje + PRAZO_MINIMO_MA - 1 - iInicioPos + 1);
}

export function linhasMA(e: EntradaMA): LinhaMA[] {
  const iHoje = indiceMes(e.hoje);
  if (!Number.isFinite(iHoje) || !e.empreendimento) return [];
  const regras = MODALIDADES_MA[e.modalidade];
  const v = e.empreendimento.vencimentos;
  const outro = !!e.empreendimento.outro;
  const livre = iHoje + MESES_DE_ENTRADA;
  const habite = habiteSeMA(e);
  const iHabite = indiceMes(habite);
  const temHabite = Number.isFinite(iHabite);

  const linha = (
    id: IdLinhaMA,
    tipo: TipoLinhaMA,
    rotulo: string,
    meses: Competencia[],
    indisponivel?: string,
  ): LinhaMA => ({
    id,
    tipo,
    rotulo,
    meses,
    qtd: meses.length,
    tetoRenda: regras.tetoRenda[id],
    tetoFixo: id === "pos" ? regras.posValorFixo : null,
    indisponivel: meses.length === 0 ? indisponivel : undefined,
  });

  const semHabite = "informe o habite-se";
  const mensais = temHabite ? faixa(livre, iHabite - 1) : [];

  const anual = e.intermediaria === "anual";
  const interPermitida = outro || (anual ? v.anual : v.semestral);
  const inter =
    interPermitida && temHabite
      ? faixa(livre, iHabite - 1, (i) => (anual ? i % 12 === 11 : i % 12 === 5 || i % 12 === 11))
      : [];

  const unicaPermitida = outro || v.unica != null;
  const unica = unicaPermitida && temHabite && iHabite >= livre ? [habite as Competencia] : [];

  // Pós: associativo pela tabela da política; SFH só os R$ 100 do prazo.
  const posPermitido =
    regras.posPermitido && temHabite && (e.modalidade === "sfh" || outro || v.mensalPos != null);
  let pos: Competencia[] = [];
  if (posPermitido) {
    const inicio = Math.max(iHabite + 1, livre);
    const qtd = Math.min(
      regras.posMaxParcelas,
      Math.max(0, Math.round(e.posParcelas ?? posAutomatico(iHoje, inicio))),
    );
    pos = faixa(inicio, inicio + qtd - 1);
  }

  return [
    linha("ato", "ato", "Ato (assinatura)", [e.hoje]),
    linha("e30", "entrada", "Entrada 30 dias", [competenciaDoIndice(iHoje + 1)]),
    linha("e60", "entrada", "Entrada 60 dias", [competenciaDoIndice(iHoje + 2)]),
    linha("e90", "entrada", "Entrada 90 dias", [competenciaDoIndice(iHoje + 3)]),
    linha(
      "mensal",
      "mensal",
      "Mensais durante a obra",
      mensais,
      temHabite ? "o habite-se cai no período das entradas" : semHabite,
    ),
    linha(
      "inter",
      anual ? "anual" : "semestral",
      anual ? "Anuais (dezembro)" : "Semestrais (junho e dezembro)",
      inter,
      !interPermitida
        ? "sem na política deste empreendimento"
        : temHabite
          ? "nenhuma até o habite-se"
          : semHabite,
    ),
    linha(
      "unica",
      "unica",
      "Parcela única (habite-se)",
      unica,
      !unicaPermitida
        ? "sem na política deste empreendimento"
        : temHabite
          ? "o habite-se cai no período das entradas"
          : semHabite,
    ),
    linha(
      "pos",
      "pos_chave",
      e.modalidade === "sfh" ? "Pós habite-se (para completar 36 meses)" : "Mensal pós habite-se",
      pos,
      !regras.posPermitido
        ? "não tem nesta modalidade"
        : !temHabite
          ? semHabite
          : e.modalidade !== "sfh" && !outro && v.mensalPos == null
            ? "sem na política deste empreendimento"
            : "o prazo já passa de 36 meses",
    ),
  ];
}

// ----------------------------------------------------------------------------
// Simulação
// ----------------------------------------------------------------------------

export interface LinhaResultadoMA extends LinhaMA {
  valor: number;
  total: number;
  teto: number | null;
  excedeu: boolean;
}

/** Uma regra da política conferida contra o fluxo montado. */
export interface ConferenciaMA {
  id: string;
  rotulo: string;
  /** "9,6% do preço", "38 meses". */
  atual: string;
  limite: string;
  ok: boolean;
  /** false = só informa (não tira o FECHOU): regra de leitura a confirmar. */
  bloqueia: boolean;
  /** Nota: exceção aplicada (os 12% da observação 7) ou leitura a confirmar. */
  nota?: string;
}

export type StatusMA = "incompleto" | "fechou" | "fechou_fora_da_politica" | "falta" | "sobra";

export interface AlertaMA {
  nivel: "erro" | "aviso" | "info";
  codigo:
    | "recursos_maior_que_valor"
    | "sem_habite_se"
    | "habite_se_passou"
    | "unica_com_anual"
    | "mensais_perdidas";
  texto: string;
}

export interface ParcelaMA {
  competencia: Competencia;
  id: IdLinhaMA;
  tipo: TipoLinhaMA;
  rotulo: string;
  valor: number;
}

export interface ResultadoMA {
  valido: boolean;
  modalidade: ModalidadeMA;
  linhas: LinhaResultadoMA[];
  habiteSe: Competencia | null;
  /** Valor − financiamento − subsídio − FGTS (direta: o valor). */
  saldoConstrutora: number;
  totalFluxo: number;
  /** Ato + entradas de 30, 60 e 90 dias. */
  totalEntradas: number;
  proSoluto: { valor: number; pct: number; teto: number | null; excedeu: boolean };
  prazoMeses: number;
  mensais: number;
  conferencias: ConferenciaMA[];
  /** O que passa do limite (linhas acima do teto e regras da política). */
  foraDaPolitica: string[];
  diferenca: number;
  status: StatusMA;
  capacidadeParcelado: number;
  /** O mínimo que ato + entradas precisam somar para fechar. */
  atosMinimos: number;
  cronograma: ParcelaMA[];
  alertas: AlertaMA[];
}

const pos = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct1 = (v: number) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const centavosAbaixo = (v: number) => Math.floor(v * 100 + 1e-6) / 100;
const EPS = 0.005;

function tetoDaParcela(l: LinhaMA, renda: number): number | null {
  if (l.tetoFixo != null) return l.tetoFixo;
  if (l.tetoRenda == null || renda <= 0) return null;
  return centavos(renda * l.tetoRenda);
}

/** Quanto a linha comporta no total pelas regras (teto × qtd e o teto do grupo). */
function maxDaLinha(
  l: LinhaResultadoMA,
  regras: RegrasModalidadeMA,
  valor: number,
  ignorarMensalMax: boolean,
): number {
  if (l.qtd === 0) return 0;
  let max = l.teto == null ? Infinity : centavos(l.teto * l.qtd);
  if (l.id === "mensal" && regras.mensalMax != null && !ignorarMensalMax) {
    max = Math.min(max, valor * regras.mensalMax);
  }
  if (l.tipo === "anual" && regras.anualMax != null) max = Math.min(max, valor * regras.anualMax);
  if (l.id === "pos" && regras.posMax != null) max = Math.min(max, valor * regras.posMax);
  return max;
}

export function simularMA(e: EntradaMA): ResultadoMA {
  const regras = MODALIDADES_MA[e.modalidade];
  const renda = pos(e.renda);
  const valorImovel = pos(e.valorImovel);
  const financiamento = regras.temBanco ? pos(e.financiamento) : 0;
  const subsidio = regras.temBanco ? pos(e.subsidio) : 0;
  const fgts = regras.temBanco ? pos(e.fgts) : 0;
  const saldoConstrutora =
    valorImovel > 0 ? centavos(valorImovel - financiamento - subsidio - fgts) : 0;

  const linhas: LinhaResultadoMA[] = linhasMA(e).map((l) => {
    const valor = l.qtd > 0 ? centavos(pos(e.parcelas[l.id] ?? 0)) : 0;
    const teto = tetoDaParcela(l, renda);
    return {
      ...l,
      valor,
      total: centavos(valor * l.qtd),
      teto,
      excedeu: teto != null && valor > teto + EPS,
    };
  });
  const porId = (id: IdLinhaMA) => linhas.find((l) => l.id === id);
  const soma = (f: (l: LinhaResultadoMA) => boolean) =>
    centavos(linhas.filter(f).reduce((s, l) => s + l.total, 0));

  const totalFluxo = soma(() => true);
  const totalEntradas = soma((l) => ENTRADAS.includes(l.id));
  const proSolutoValor = centavos(totalFluxo - totalEntradas);
  const pctDe = (v: number) => (valorImovel > 0 ? (v / valorImovel) * 100 : 0);
  const proSoluto = {
    valor: proSolutoValor,
    pct: pctDe(proSolutoValor),
    teto: regras.proSolutoMax != null ? centavos(valorImovel * regras.proSolutoMax) : null,
    excedeu:
      regras.proSolutoMax != null && pctDe(proSolutoValor) > regras.proSolutoMax * 100 + 0.05,
  };

  const comValor = linhas.filter((l) => l.valor > 0 && l.qtd > 0);
  const iHoje = indiceMes(e.hoje);
  const iUltimo = Math.max(...comValor.flatMap((l) => l.meses.map(indiceMes)), iHoje);
  const prazoMeses = comValor.length > 0 ? iUltimo - iHoje + 1 : 0;
  const mensais = porId("mensal")?.qtd ?? 0;
  const habiteSe = e.empreendimento ? habiteSeMA(e) : null;

  // Conferência da política, regra a regra.
  const conferencias: ConferenciaMA[] = [];
  const confPct = (
    id: string,
    rotulo: string,
    valor: number,
    limite: number,
    tipo: "max" | "min",
  ) => {
    const p = pctDe(valor);
    const ok = tipo === "max" ? p <= limite * 100 + 0.05 : p + 0.05 >= limite * 100;
    conferencias.push({
      id,
      rotulo,
      atual: `${pct1(p)} do preço`,
      limite: `${tipo === "max" ? "até" : "no mínimo"} ${pct1(limite * 100)}`,
      ok,
      bloqueia: true,
    });
  };
  const mensal = porId("mensal");
  if (regras.mensalMax != null && mensal && mensal.qtd > 0) {
    confPct("mensal", "Mensais durante a obra", mensal.total, regras.mensalMax, "max");
    const c = conferencias[conferencias.length - 1];
    // Observação 7: os 12% podem ser ultrapassados se a renda comporta (cada
    // mensal dentro dos 30%) e o pró-soluto total fica até 25%.
    if (!c.ok && !mensal.excedeu && !proSoluto.excedeu) {
      c.ok = true;
      c.nota = "acima de 12%, permitido: a renda comporta e o pró-soluto fica até 25%";
    }
  }
  if (regras.mensalMin != null) {
    confPct("mensal_min", "Mensais durante a obra", mensal?.total ?? 0, regras.mensalMin, "min");
    // A política imprime "24% (mín.)", mas com ato mínimo de 6% e
    // financiamento de até 70% não sobra espaço para entradas, intermediárias
    // e o pós de R$ 100 que ela mesma permite. Fica visível, sem tirar o
    // FECHOU, até o gerente confirmar a leitura.
    const c = conferencias[conferencias.length - 1];
    c.bloqueia = false;
    c.nota = "leitura a confirmar com o gerente: não tira o FECHOU";
  }
  const inter = porId("inter");
  if (regras.anualMax != null && inter?.tipo === "anual" && inter.total > 0) {
    confPct("anual", "Anuais", inter.total, regras.anualMax, "max");
  }
  const posL = porId("pos");
  if (regras.posMax != null && posL && posL.total > 0) {
    confPct("pos", "Mensal pós habite-se", posL.total, regras.posMax, "max");
  }
  if (regras.atoMin != null) {
    confPct("ato", "Ato", porId("ato")?.total ?? 0, regras.atoMin, "min");
  }
  if (regras.entradasMin != null) {
    confPct("entradas", "Ato + entradas", totalEntradas, regras.entradasMin, "min");
  }
  if (regras.financiamentoMax != null) {
    confPct(
      "financiamento",
      "Financiamento + FGTS",
      financiamento + fgts,
      regras.financiamentoMax,
      "max",
    );
  }
  if (regras.proSolutoMax != null) {
    conferencias.push({
      id: "pro_soluto",
      rotulo: "Pró-soluto (sem ato e entradas)",
      atual: `${pct1(proSoluto.pct)} do preço`,
      limite: `até ${pct1(regras.proSolutoMax * 100)}`,
      ok: !proSoluto.excedeu,
      bloqueia: true,
    });
  }
  if (regras.prazoMinimo) {
    conferencias.push({
      id: "prazo",
      rotulo: "Prazo do contrato",
      atual: prazoMeses > 0 ? `${prazoMeses} meses` : "-",
      limite: `no mínimo ${PRAZO_MINIMO_MA} meses`,
      ok: prazoMeses >= PRAZO_MINIMO_MA,
      bloqueia: true,
    });
  }
  const pequenas = comValor.filter((l) => l.valor + EPS < PARCELA_MINIMA_MA);
  conferencias.push({
    id: "parcela_minima",
    rotulo: "Parcela mínima",
    atual: pequenas.length > 0 ? `${pequenas[0].rotulo}: ${brl(pequenas[0].valor)}` : "ok",
    limite: `nenhuma abaixo de ${brl(PARCELA_MINIMA_MA)}`,
    ok: pequenas.length === 0,
    bloqueia: true,
  });

  const foraDaPolitica = [
    ...linhas.filter((l) => l.excedeu).map((l) => `${l.rotulo} (máx. ${brl(l.teto ?? 0)} cada)`),
    ...conferencias
      .filter((c) => !c.ok && c.bloqueia)
      .map((c) => `${c.rotulo} (${c.atual}, ${c.limite})`),
  ];

  // Capacidade: o máximo que o fluxo SEM ato e entradas comporta.
  const parcelaveis = linhas.filter((l) => !ENTRADAS.includes(l.id));
  const somaMax = parcelaveis.reduce((s, l) => s + maxDaLinha(l, regras, valorImovel, true), 0);
  const tetoGrupo =
    regras.proSolutoMax != null
      ? valorImovel * regras.proSolutoMax
      : regras.entradasMin != null
        ? valorImovel * (1 - regras.entradasMin)
        : Infinity;
  const capacidadeParcelado = centavos(Math.min(somaMax, tetoGrupo, Math.max(0, saldoConstrutora)));
  const pisoEntradas = Math.max(
    regras.atoMin != null ? valorImovel * regras.atoMin : 0,
    regras.entradasMin != null ? valorImovel * regras.entradasMin : 0,
  );
  const atosMinimos = centavos(
    Math.min(
      Math.max(0, saldoConstrutora),
      Math.max(pisoEntradas, saldoConstrutora - capacidadeParcelado),
    ),
  );

  const diferenca = centavos(saldoConstrutora - totalFluxo);
  const valido = !!e.empreendimento && valorImovel > 0;
  const status: StatusMA =
    !valido || (regras.temBanco && renda <= 0)
      ? "incompleto"
      : Math.abs(diferenca) < EPS
        ? foraDaPolitica.length > 0
          ? "fechou_fora_da_politica"
          : "fechou"
        : diferenca > 0
          ? "falta"
          : "sobra";

  // Cronograma.
  const cronograma: ParcelaMA[] = [];
  for (const l of comValor) {
    l.meses.forEach((m, k) => {
      const n = `${k + 1}/${l.qtd}`;
      const rotulo =
        l.tipo === "ato"
          ? "Ato"
          : l.tipo === "entrada"
            ? l.rotulo
            : l.tipo === "mensal"
              ? `Mensal ${n}`
              : l.tipo === "anual"
                ? l.qtd > 1
                  ? `Anual ${n}`
                  : "Anual"
                : l.tipo === "semestral"
                  ? l.qtd > 1
                    ? `Semestral ${n}`
                    : "Semestral"
                  : l.tipo === "unica"
                    ? "Parcela única"
                    : `Pós ${n}`;
      cronograma.push({ competencia: m, id: l.id, tipo: l.tipo, rotulo, valor: l.valor });
    });
  }
  cronograma.sort(
    (a, b) =>
      indiceMes(a.competencia) - indiceMes(b.competencia) ||
      IDS_LINHAS_MA.indexOf(a.id) - IDS_LINHAS_MA.indexOf(b.id),
  );

  const alertas: AlertaMA[] = [];
  if (valorImovel > 0 && saldoConstrutora < 0) {
    alertas.push({
      nivel: "erro",
      codigo: "recursos_maior_que_valor",
      texto: `Financiamento + subsídio + FGTS passam do preço em ${brl(-saldoConstrutora)}. Confira os valores do banco.`,
    });
  }
  if (e.empreendimento && !habiteSe) {
    alertas.push({
      nivel: "aviso",
      codigo: "sem_habite_se",
      texto: `A política não traz vencimentos para ${e.empreendimento.outro ? "este empreendimento" : e.empreendimento.nome}: informe o habite-se para as mensais da obra (sem ele, o fluxo fica só com ato e entradas).`,
    });
  }
  if (habiteSe && indiceMes(habiteSe) < iHoje + MESES_DE_ENTRADA) {
    alertas.push({
      nivel: "info",
      codigo: "habite_se_passou",
      texto: `O habite-se (${rotuloMes(habiteSe)}) cai antes do fim das entradas: não há mensais durante a obra nem parcela única.`,
    });
  }
  if (inter?.tipo === "anual" && inter.total > 0 && (porId("unica")?.total ?? 0) > 0) {
    alertas.push({
      nivel: "info",
      codigo: "unica_com_anual",
      texto:
        "Com anuais no fluxo, a parcela única pede capacidade de pagamento comprovada (observação 1 da política).",
    });
  }

  return {
    valido,
    modalidade: e.modalidade,
    linhas,
    habiteSe,
    saldoConstrutora,
    totalFluxo,
    totalEntradas,
    proSoluto,
    prazoMeses,
    mensais,
    conferencias,
    foraDaPolitica,
    diferenca,
    status,
    capacidadeParcelado,
    atosMinimos,
    cronograma,
    alertas,
  };
}

export function textoStatusMA(r: ResultadoMA): string {
  switch (r.status) {
    case "incompleto":
      return r.modalidade === "direta"
        ? "Preencha o empreendimento e o valor da unidade"
        : "Preencha o empreendimento, a renda líquida e os valores da unidade";
    case "fechou":
      return "FECHOU! O fluxo atende a política da Mundo Apto.";
    case "fechou_fora_da_politica":
      return `A conta fecha, mas fora da política: ${r.foraDaPolitica.join("; ")}.`;
    case "falta":
      return `FALTA INCLUIR ${brl(r.diferenca)} no fluxo de pagamento`;
    case "sobra":
      return `SOBRA ${brl(-r.diferenca)} no fluxo (reduza algum valor)`;
  }
}

// ----------------------------------------------------------------------------
// Preencher pela política
// ----------------------------------------------------------------------------

/**
 * Monta um fluxo que fecha dentro da política, ponto de partida para o
 * corretor ajustar. Antes de tudo, R$ 100 em cada parcela de pós (é o que
 * fecha os 36 meses de prazo). Depois:
 *   associativo → mensais até 12% do preço, anual/semestral, única, mensal
 *                 pós até o teto e, só se ainda faltar, mensais acima dos 12%
 *                 (exceção da observação 7), tudo até 25% de pró-soluto;
 *   SFH         → mensais, anual/semestral e única;
 *   direta      → 70% nas parcelas (mensais; sem mensais, na única).
 * O resto vai para ato e entradas em partes iguais, respeitando o teto das
 * entradas pela renda (o excedente fica no ato) e o ato mínimo do SFH.
 * Parcela que ficaria abaixo de R$ 100 não entra.
 */
export function sugestaoPelaPolitica(e: EntradaMA): Record<IdLinhaMA, number> {
  const out = Object.fromEntries(IDS_LINHAS_MA.map((id) => [id, 0])) as Record<IdLinhaMA, number>;
  const r = simularMA({ ...e, parcelas: {} });
  if (!r.valido || r.saldoConstrutora <= 0) return out;
  const regras = MODALIDADES_MA[e.modalidade];
  const valor = pos(e.valorImovel);
  const linha = (id: IdLinhaMA) => r.linhas.find((l) => l.id === id);

  const pisoEntradas = Math.max(
    regras.atoMin != null ? valor * regras.atoMin : 0,
    regras.entradasMin != null ? valor * regras.entradasMin : 0,
  );
  let orcamento = centavos(
    Math.min(r.capacidadeParcelado, Math.max(0, r.saldoConstrutora - pisoEntradas)),
  );

  const por = (id: IdLinhaMA, maxTotal: number) => {
    const l = linha(id);
    if (!l || l.qtd === 0 || orcamento <= 0) return;
    const ja = out[id] * l.qtd;
    const alvo = Math.min(maxTotal, ja + orcamento);
    let parcela = centavosAbaixo(alvo / l.qtd);
    if (parcela < PARCELA_MINIMA_MA) parcela = ja > 0 ? out[id] : 0;
    orcamento = centavos(orcamento - (parcela * l.qtd - ja));
    out[id] = parcela;
  };
  const max = (id: IdLinhaMA, ignorarMensalMax = false) => {
    const l = linha(id);
    return l ? maxDaLinha(l, regras, valor, ignorarMensalMax) : 0;
  };

  // Pós primeiro com R$ 100 por parcela: é o que fecha o prazo mínimo de 36
  // meses (sem ele, o contrato sai fora da política).
  if (regras.posPermitido)
    por("pos", Math.min(max("pos"), PARCELA_MINIMA_MA * (linha("pos")?.qtd ?? 0)));
  if (e.modalidade === "associativo") {
    por("mensal", max("mensal"));
    por("inter", max("inter"));
    por("unica", max("unica"));
    por("pos", max("pos"));
    por("mensal", max("mensal", true));
  } else if (e.modalidade === "sfh") {
    por("mensal", max("mensal"));
    por("inter", max("inter"));
    por("unica", max("unica"));
  } else {
    por("mensal", Infinity);
    por("unica", Infinity);
  }

  const parcelado = IDS_LINHAS_MA.filter((id) => !ENTRADAS.includes(id)).reduce(
    (s, id) => s + out[id] * (linha(id)?.qtd ?? 0),
    0,
  );
  let restante = centavos(r.saldoConstrutora - parcelado);

  // Ato mínimo do SFH primeiro; o resto em partes iguais, com o teto das
  // entradas pela renda (o que passa fica no ato, que é livre).
  if (regras.atoMin != null) {
    const ato = Math.min(restante, centavos(valor * regras.atoMin));
    out.ato = ato;
    restante = centavos(restante - ato);
  }
  const tetoEntrada = (id: IdLinhaMA) => linha(id)?.teto ?? Infinity;
  let livres = [...ENTRADAS];
  for (;;) {
    const parte = restante / livres.length;
    const presas = livres.filter((id) => id !== "ato" && tetoEntrada(id) < parte);
    if (presas.length === 0) break;
    for (const id of presas) {
      out[id] = tetoEntrada(id);
      restante = centavos(restante - tetoEntrada(id));
    }
    livres = livres.filter((id) => !presas.includes(id));
  }
  const parte = centavosAbaixo(restante / livres.length);
  if (parte < PARCELA_MINIMA_MA) {
    out.ato = centavos(out.ato + restante);
  } else {
    for (const id of livres) if (id !== "ato") out[id] = parte;
    out.ato = centavos(out.ato + restante - parte * (livres.length - 1));
  }
  return out;
}

// ----------------------------------------------------------------------------
// Quanto custa esperar
// ----------------------------------------------------------------------------

export interface CenarioEsperaMA {
  hoje: Competencia;
  mensais: number;
  capacidadeParcelado: number;
  atosMinimos: number;
  diferenca: number;
}

export function cenariosEsperaMA(e: EntradaMA, meses = 4): CenarioEsperaMA[] {
  const iHoje = indiceMes(e.hoje);
  if (!Number.isFinite(iHoje)) return [];
  const out: CenarioEsperaMA[] = [];
  for (let k = 0; k < meses; k++) {
    const hoje = competenciaDoIndice(iHoje + k);
    const r = simularMA({ ...e, hoje });
    if (!r.valido) break;
    out.push({
      hoje,
      mensais: r.mensais,
      capacidadeParcelado: r.capacidadeParcelado,
      atosMinimos: r.atosMinimos,
      diferenca: centavos(r.atosMinimos - (out[0]?.atosMinimos ?? r.atosMinimos)),
    });
  }
  return out;
}
