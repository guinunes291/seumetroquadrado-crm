// ============================================================================
// longitude.ts — Fluxo de pagamento da LONGITUDE (regras do simulador oficial)
// ----------------------------------------------------------------------------
// Portado do código do simulador oficial (simulador.longitude.com.br,
// simulador.js), modo LINEAR. O fluxo é uma tabela de linhas:
//
//   Linha          Quantidade                         Teto de cada parcela
//   Ato            1                                  ≥ ato mínimo do empreendimento
//   FGTS/Subsídio/Financiamento (recursos do banco)   financiamento ≤ 80% da
//                                                     avaliação; os três ≤ avaliação
//   Pré-chaves     meses do ato até a entrega         comprometimento pré × renda
//   Anuais         dezembros até a entrega            100% da renda
//   Pós-chaves     total de parcelas − pré-chaves     comprometimento total × renda
//                                                     − 1ª parcela do financiamento
//   Outros         1 (sempre pede aprovação)          livre
//   Periodicidade  R$ 100 no 37º mês, se ato + pré + pós ≤ 36 parcelas
//   Adimplência    avaliação − tabela (fora do valor final da venda)
//
//   Valor final da venda = ato + recursos + pré + anuais + pós + periodicidade
//                          + outros
//   Desconto            = tabela − valor final (> 0 pede aprovação)
//
// Premissas práticas (as quatro do quadro do simulador oficial):
//   • comprometimento pré-chaves = parcela pré ÷ renda ≤ limite (erro)
//   • pró-soluto pós-chaves      = total pós ÷ valor final ≤ limite (aviso)
//   • comprometimento total pós  = (parcela pós + 1ª parcela) ÷ renda ≤ limite
//   • referência                 = (ato + recursos) ÷ valor final ≥ 60% (aviso)
// Sem erro e sem aviso: APTO PARA VENDA. Senão: NECESSÁRIO APROVAÇÃO.
//
// "CADA MÊS QUE PASSA O PRODUTO PERDE UMA MENSAL": o total de parcelas do
// pró-soluto é fixo por empreendimento; as pré-chaves são os meses até a
// entrega e o pós-chaves fica com o resto. Assinando um mês depois, sai uma
// pré-chaves (teto alto, % da renda) e entra uma pós-chaves (teto baixo,
// limitado também a % do valor). O código oficial faz a mesma conta
// (_calcParcelasAuto) quando o painel não tem as quantidades salvas.
//
// Fica de fora: o modo REGRESSIVO e as variações por score de crédito B2E
// (A a E), que dependem da consulta ao motor de crédito e da configuração do
// painel da Longitude. Testado em tests/simuladores-longitude.test.ts.
// ============================================================================

import { centavos } from "@/lib/amortizacao";
import {
  competenciaDoIndice,
  indiceMes,
  rotuloMes,
  type Competencia,
} from "@/lib/simuladores/fluxo";
import {
  CONFERIDA_EM_LONGITUDE,
  EMPREENDIMENTOS_LONGITUDE,
  FONTE_LONGITUDE,
  NOMES_NO_CATALOGO_LONGITUDE,
  OUTRO_EMPREENDIMENTO_LONGITUDE,
  PREMISSAS_PADRAO_LONGITUDE,
  type EmpreendimentoLongitude,
  type PremissasLongitude,
} from "@/lib/simuladores/tabela-longitude";

export {
  CONFERIDA_EM_LONGITUDE,
  EMPREENDIMENTOS_LONGITUDE,
  FONTE_LONGITUDE,
  OUTRO_EMPREENDIMENTO_LONGITUDE,
  PREMISSAS_PADRAO_LONGITUDE,
  type EmpreendimentoLongitude,
  type PremissasLongitude,
};

export const PERIODICIDADE_VALOR = 100;
/** Com ato + pré + pós até 36 parcelas, entra a periodicidade no 37º mês. */
export const PRAZO_PERIODICIDADE = 36;
/** A 1ª parcela do financiamento é limitada a 30% da renda no simulador. */
export const PRIMEIRA_PARCELA_MAX_RENDA = 0.3;
export const FINANCIAMENTO_MAX_AVALIACAO = 0.8;

// ----------------------------------------------------------------------------
// Empreendimentos
// ----------------------------------------------------------------------------

export function empreendimentoLongitude(
  nome: string | null | undefined,
): EmpreendimentoLongitude | null {
  if (nome === OUTRO_EMPREENDIMENTO_LONGITUDE.nome) return OUTRO_EMPREENDIMENTO_LONGITUDE;
  return EMPREENDIMENTOS_LONGITUDE.find((e) => e.nome === nome) ?? null;
}

/** "Longitude Estação Dom Bosco" → "estacao dom bosco"; "Cittá"/"Città" → "citta". */
export function normalizarNomeLongitude(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && t !== "longitude")
    .join(" ");
}

export function casaComCatalogoLongitude(emp: EmpreendimentoLongitude, nomeProjeto: string) {
  if (emp.outro) return false;
  const alvo = normalizarNomeLongitude(nomeProjeto);
  if (!alvo) return false;
  return [emp.nome, ...(NOMES_NO_CATALOGO_LONGITUDE[emp.nome] ?? [])].some(
    (n) => normalizarNomeLongitude(n) === alvo,
  );
}

export function empreendimentoLongitudeDoProjeto(nomeProjeto: string) {
  return EMPREENDIMENTOS_LONGITUDE.find((e) => casaComCatalogoLongitude(e, nomeProjeto)) ?? null;
}

// ----------------------------------------------------------------------------
// Quantidades pelo prazo
// ----------------------------------------------------------------------------

/**
 * A conta do simulador oficial (_calcParcelasAuto): pré-chaves = meses do
 * ato até a entrega (o mês da entrega entra, o do ato não), limitado ao
 * total; pós-chaves = o resto; anuais = os dezembros depois do ato até a
 * entrega.
 */
export function parcelasPorPrazo(
  hoje: Competencia,
  entrega: Competencia | "",
  parcelasMax: number,
): { pre: number; anuais: number; pos: number; mesesAteEntrega: number } {
  const iHoje = indiceMes(hoje);
  const iEntrega = indiceMes(entrega);
  const total = Math.max(0, Math.round(parcelasMax || 0));
  if (!Number.isFinite(iHoje) || !Number.isFinite(iEntrega)) {
    return { pre: 0, anuais: 0, pos: total, mesesAteEntrega: 0 };
  }
  const meses = Math.max(0, iEntrega - iHoje);
  const pre = Math.min(meses, total);
  let anuais = 0;
  for (let i = iHoje + 1; i <= iEntrega; i++) if (i % 12 === 11) anuais++;
  return { pre, anuais, pos: Math.max(0, total - pre), mesesAteEntrega: meses };
}

// ----------------------------------------------------------------------------
// Simulação
// ----------------------------------------------------------------------------

export type IdLinhaLongitude =
  "ato" | "pre" | "anuais" | "pos" | "outros" | "periodicidade" | "adimplencia";

export const IDS_LINHAS_LONGITUDE: readonly IdLinhaLongitude[] = [
  "ato",
  "pre",
  "anuais",
  "pos",
  "outros",
  "periodicidade",
  "adimplencia",
];

/** As linhas que o corretor preenche (as outras duas vêm da regra). */
export const LINHAS_EDITAVEIS_LONGITUDE: readonly IdLinhaLongitude[] = [
  "ato",
  "pre",
  "anuais",
  "pos",
  "outros",
];

export type TipoLinhaLongitude =
  "ato" | "mensal" | "anual" | "pos_chave" | "outros" | "periodicidade" | "adimplencia";

export interface EntradaLongitude {
  empreendimento: EmpreendimentoLongitude | null;
  /** Premissas em uso (as do empreendimento, ou ajustadas pelo corretor). */
  premissas: PremissasLongitude;
  /** Mês do ato. */
  hoje: Competencia;
  /** Previsão de entrega (YYYY-MM ou ""). */
  entrega: Competencia | "";
  /** Renda total dos proponentes. */
  renda: number;
  valorTabela: number;
  /** Valor de avaliação da Caixa (0 = igual ao de tabela). */
  valorAvaliacao: number;
  financiamento: number;
  subsidio: number;
  fgts: number;
  /** 1ª parcela do financiamento no banco. */
  primeiraParcela: number;
  /** Parcelas de pós-chaves; null = o máximo (total − pré). */
  posParcelas: number | null;
  /** Valor de CADA parcela das linhas editáveis. */
  parcelas: Partial<Record<IdLinhaLongitude, number>>;
}

export interface LinhaLongitude {
  id: IdLinhaLongitude;
  tipo: TipoLinhaLongitude;
  rotulo: string;
  meses: Competencia[];
  qtd: number;
  /** Teto de cada parcela em R$ (null = livre ou sem renda). */
  teto: number | null;
  /** Periodicidade e adimplência: valor pela regra, não editável. */
  travada: boolean;
  valor: number;
  total: number;
  excedeu: boolean;
  indisponivel?: string;
}

export interface ConferenciaLongitude {
  id: string;
  rotulo: string;
  atual: string;
  limite: string;
  ok: boolean;
  /** erro = o simulador oficial marca em vermelho; aviso = pede aprovação. */
  nivel: "erro" | "aviso";
}

export type StatusLongitude = "incompleto" | "apto" | "aprovacao";

export interface AlertaLongitude {
  nivel: "erro" | "aviso" | "info";
  codigo: "recursos_maior_que_valor" | "sem_entrega" | "entrega_passou" | "financiamento_cortado";
  texto: string;
}

export interface ParcelaLongitude {
  competencia: Competencia;
  id: IdLinhaLongitude;
  tipo: TipoLinhaLongitude;
  rotulo: string;
  valor: number;
}

export interface ResultadoLongitude {
  valido: boolean;
  linhas: LinhaLongitude[];
  valorAvaliacao: number;
  recursos: number;
  /** Tabela − recursos do banco: o que o fluxo com a construtora precisa somar. */
  saldo: number;
  valorFinal: number;
  /** Tabela − valor final: > 0 desconto (pede aprovação), < 0 ganho de preço. */
  diferenca: number;
  proSoluto: { valor: number; pct: number };
  premissas: {
    comprometimentoPre: number;
    proSolutoPos: number;
    comprometimentoTotalPos: number;
    referencia: number;
  };
  conferencias: ConferenciaLongitude[];
  status: StatusLongitude;
  /** O que pede aprovação, na ordem do quadro (desconto primeiro). */
  pendencias: string[];
  capacidadeParcelado: number;
  atosMinimos: number;
  mensais: number;
  qtd: { pre: number; anuais: number; pos: number; posMax: number };
  cronograma: ParcelaLongitude[];
  alertas: AlertaLongitude[];
}

const pos0 = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct2 = (v: number) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const centavosAbaixo = (v: number) => Math.floor(v * 100 + 1e-6) / 100;
const EPS = 0.005;

export function simularLongitude(e: EntradaLongitude): ResultadoLongitude {
  const pr = e.premissas;
  const renda = pos0(e.renda);
  const valorTabela = pos0(e.valorTabela);
  const valorAvaliacao = pos0(e.valorAvaliacao) || valorTabela;
  const financiamento = pos0(e.financiamento);
  const subsidio = pos0(e.subsidio);
  const fgts = pos0(e.fgts);
  const recursos = centavos(financiamento + subsidio + fgts);
  const saldo = centavos(valorTabela - recursos);
  const primeira = pos0(e.primeiraParcela);

  const iHoje = indiceMes(e.hoje);
  const temEntrega = Number.isFinite(indiceMes(e.entrega));
  const prazo = parcelasPorPrazo(e.hoje, e.entrega, pr.parcelasMax);
  const preQtd = temEntrega ? prazo.pre : 0;
  const posMax = temEntrega ? prazo.pos : 0;
  const posQtd = temEntrega ? Math.max(0, Math.round(e.posParcelas ?? posMax)) : 0;
  const anuaisQtd = temEntrega ? prazo.anuais : 0;

  const faixa = (de: number, qtd: number) =>
    Array.from({ length: Math.max(0, qtd) }, (_, k) => competenciaDoIndice(de + k));
  const dezembros: Competencia[] = [];
  if (temEntrega) {
    for (let i = iHoje + 1; i <= indiceMes(e.entrega); i++) {
      if (i % 12 === 11) dezembros.push(competenciaDoIndice(i));
    }
  }

  const tetoPre = renda > 0 ? centavos(renda * pr.comprometimentoPre) : null;
  const tetoAnual = renda > 0 ? centavos(renda) : null;
  const tetoPos =
    renda > 0 ? centavos(Math.max(0, renda * pr.comprometimentoTotal - primeira)) : null;

  const periodicidadeAtiva =
    temEntrega && Number.isFinite(iHoje) && 1 + preQtd + posQtd <= PRAZO_PERIODICIDADE;
  const adimplencia = centavos(Math.max(0, valorAvaliacao - valorTabela));

  const semEntrega = "informe a previsão de entrega";
  const linha = (
    id: IdLinhaLongitude,
    tipo: TipoLinhaLongitude,
    rotulo: string,
    meses: Competencia[],
    teto: number | null,
    travada: boolean,
    valorRegra: number | null,
    indisponivel?: string,
  ): LinhaLongitude => {
    const qtd = meses.length;
    const valor =
      qtd === 0 ? 0 : centavos(valorRegra != null ? valorRegra : pos0(e.parcelas[id] ?? 0));
    return {
      id,
      tipo,
      rotulo,
      meses,
      qtd,
      teto,
      travada,
      valor,
      total: centavos(valor * qtd),
      excedeu: teto != null && valor > teto + EPS,
      indisponivel: qtd === 0 ? indisponivel : undefined,
    };
  };

  const linhas: LinhaLongitude[] = Number.isFinite(iHoje)
    ? [
        linha("ato", "ato", "Ato", [e.hoje], null, false, null),
        linha(
          "pre",
          "mensal",
          "Pré-chaves",
          faixa(iHoje + 1, preQtd),
          tetoPre,
          false,
          null,
          temEntrega ? "a entrega já chegou" : semEntrega,
        ),
        linha(
          "anuais",
          "anual",
          "Anuais (dezembro)",
          dezembros.slice(0, anuaisQtd),
          tetoAnual,
          false,
          null,
          temEntrega ? "nenhum dezembro até a entrega" : semEntrega,
        ),
        linha(
          "pos",
          "pos_chave",
          "Pós-chaves",
          faixa(iHoje + 1 + preQtd, posQtd),
          tetoPos,
          false,
          null,
          temEntrega ? "zero parcelas" : semEntrega,
        ),
        linha("outros", "outros", "Outros (pede aprovação)", [e.hoje], null, false, null),
        linha(
          "periodicidade",
          "periodicidade",
          "Periodicidade (37º mês)",
          periodicidadeAtiva ? [competenciaDoIndice(iHoje + PRAZO_PERIODICIDADE)] : [],
          null,
          true,
          PERIODICIDADE_VALOR,
          "só quando o fluxo tem até 36 parcelas",
        ),
        linha(
          "adimplencia",
          "adimplencia",
          "Adimplência (avaliação − tabela)",
          adimplencia > 0 ? [temEntrega ? (e.entrega as Competencia) : e.hoje] : [],
          null,
          true,
          adimplencia,
          "avaliação igual à tabela",
        ),
      ]
    : [];
  const porId = (id: IdLinhaLongitude) => linhas.find((l) => l.id === id);
  const total = (id: IdLinhaLongitude) => porId(id)?.total ?? 0;

  const valorFinal = centavos(
    recursos +
      total("ato") +
      total("pre") +
      total("anuais") +
      total("pos") +
      total("periodicidade") +
      total("outros"),
  );
  const diferenca = centavos(valorTabela - valorFinal);
  // Pró-soluto pela definição da operação: tudo o que sobra depois do banco e
  // do ato (o simulador oficial deixa os R$ 100 da periodicidade de fora do
  // número exibido; aqui eles entram, porque também são parcela pós-obra).
  const proSolutoValor = centavos(
    total("pre") + total("anuais") + total("pos") + total("outros") + total("periodicidade"),
  );
  const base = valorFinal > 0 ? valorFinal : valorTabela;
  const sobre = (v: number, b: number) => (b > 0 ? (v / b) * 100 : 0);

  const premissas = {
    comprometimentoPre: sobre(porId("pre")?.valor ?? 0, renda),
    proSolutoPos: sobre(total("pos"), base),
    comprometimentoTotalPos: sobre((porId("pos")?.valor ?? 0) + primeira, renda),
    referencia: sobre(recursos + total("ato"), base),
  };

  // As validações do simulador oficial (validateSimulation), na mesma ordem.
  const conferencias: ConferenciaLongitude[] = [];
  const conf = (
    id: string,
    rotulo: string,
    atual: string,
    limite: string,
    ok: boolean,
    nivel: "erro" | "aviso",
  ) => conferencias.push({ id, rotulo, atual, limite, ok, nivel });

  const maxFin = centavos(valorAvaliacao * FINANCIAMENTO_MAX_AVALIACAO);
  conf(
    "financiamento",
    "Financiamento",
    brl(financiamento),
    `até 80% da avaliação (${brl(maxFin)})`,
    financiamento <= maxFin + 0.01,
    "erro",
  );
  conf(
    "composicao",
    "FGTS + subsídio + financiamento",
    brl(recursos),
    `até a avaliação (${brl(valorAvaliacao)})`,
    recursos <= valorAvaliacao + 0.01,
    "erro",
  );
  if (renda > 0) {
    conf(
      "pre",
      "Comprometimento pré-chaves",
      pct2(premissas.comprometimentoPre),
      `até ${pct2(pr.comprometimentoPre * 100)} da renda`,
      premissas.comprometimentoPre <= pr.comprometimentoPre * 100 + 1e-4,
      "erro",
    );
    conf(
      "total_pos",
      "Comprometimento total pós-chaves",
      pct2(premissas.comprometimentoTotalPos),
      `até ${pct2(pr.comprometimentoTotal * 100)} da renda (pós + 1ª parcela do banco)`,
      premissas.comprometimentoTotalPos <= pr.comprometimentoTotal * 100 + 1e-4,
      "erro",
    );
  }
  conf(
    "pro_soluto_pos",
    "Pró-soluto pós-chaves",
    pct2(premissas.proSolutoPos),
    `até ${pct2(pr.proSolutoPosMax * 100)} do valor final`,
    premissas.proSolutoPos <= pr.proSolutoPosMax * 100 + 1e-4,
    "aviso",
  );
  conf(
    "referencia",
    "Referência (ato + banco)",
    pct2(premissas.referencia),
    `no mínimo ${pct2(pr.referenciaMinima * 100)} do valor final`,
    premissas.referencia + 1e-4 >= pr.referenciaMinima * 100,
    "aviso",
  );
  const anuaisL = porId("anuais");
  if (anuaisL && anuaisL.total > 0) {
    conf(
      "anuais",
      "Anuais",
      brl(anuaisL.valor),
      "até 100% da renda cada",
      !anuaisL.excedeu,
      "erro",
    );
  }
  if (pr.atoMinimo > 0) {
    conf(
      "ato",
      "Ato",
      brl(total("ato")),
      `no mínimo ${brl(pr.atoMinimo)}`,
      total("ato") + EPS >= pr.atoMinimo,
      "erro",
    );
  }
  if (posQtd > posMax) {
    conf(
      "pos_qtd",
      "Quantidade de pós-chaves",
      `${posQtd}`,
      `até ${posMax} (total ${pr.parcelasMax} − ${preQtd} pré-chaves)`,
      false,
      "aviso",
    );
  }
  if (total("outros") > 0) {
    conf("outros", "Outros", brl(total("outros")), "pede aprovação", false, "aviso");
  }
  conf(
    "desconto",
    "Desconto",
    diferenca > 0 ? brl(diferenca) : "sem desconto",
    "o fluxo precisa chegar ao valor de tabela",
    diferenca <= EPS,
    "aviso",
  );

  const valido = !!e.empreendimento && valorTabela > 0;
  const linhasAcima = linhas.filter((l) => l.excedeu && l.id !== "anuais");
  const falhas = conferencias.filter((c) => !c.ok);
  const pendencias = [
    ...(diferenca > EPS ? [`desconto de ${brl(diferenca)} (o fluxo soma menos que a tabela)`] : []),
    ...falhas
      .filter((c) => c.id !== "desconto")
      .map((c) => `${c.rotulo.toLowerCase()} (${c.atual}, ${c.limite})`),
    ...linhasAcima
      .filter((l) => !(l.id === "pre" && falhas.some((c) => c.id === "pre")))
      .filter((l) => !(l.id === "pos" && falhas.some((c) => c.id === "total_pos")))
      .map((l) => `${l.rotulo} acima do teto (máx. ${brl(l.teto ?? 0)} cada)`),
  ];
  const status: StatusLongitude =
    !valido || renda <= 0 ? "incompleto" : pendencias.length === 0 ? "apto" : "aprovacao";

  // Capacidade: o máximo do fluxo SEM o ato dentro das premissas (com o fluxo
  // fechado, o valor final é a tabela: referência ≥ 60% ⇒ parcelado ≤ 40%).
  const cap = (l: LinhaLongitude | undefined) =>
    l && l.teto != null ? centavos(l.teto * l.qtd) : 0;
  const capPos = Math.min(cap(porId("pos")), valorTabela * pr.proSolutoPosMax);
  const capacidadeParcelado = centavos(
    Math.max(
      0,
      Math.min(
        cap(porId("pre")) + cap(porId("anuais")) + capPos + total("periodicidade"),
        valorTabela * (1 - pr.referenciaMinima),
        Math.max(0, saldo),
      ),
    ),
  );
  const atosMinimos = centavos(
    Math.min(Math.max(0, saldo), Math.max(pr.atoMinimo, saldo - capacidadeParcelado)),
  );

  // Cronograma.
  const cronograma: ParcelaLongitude[] = [];
  for (const l of linhas) {
    if (l.valor <= 0) continue;
    l.meses.forEach((m, k) => {
      const n = `${k + 1}/${l.qtd}`;
      const rotulo =
        l.tipo === "mensal"
          ? `Pré-chaves ${n}`
          : l.tipo === "anual"
            ? l.qtd > 1
              ? `Anual ${n}`
              : "Anual"
            : l.tipo === "pos_chave"
              ? `Pós-chaves ${n}`
              : l.tipo === "ato"
                ? "Ato"
                : l.tipo === "outros"
                  ? "Outros"
                  : l.tipo === "periodicidade"
                    ? "Periodicidade"
                    : "Adimplência";
      cronograma.push({ competencia: m, id: l.id, tipo: l.tipo, rotulo, valor: l.valor });
    });
  }
  cronograma.sort(
    (a, b) =>
      indiceMes(a.competencia) - indiceMes(b.competencia) ||
      IDS_LINHAS_LONGITUDE.indexOf(a.id) - IDS_LINHAS_LONGITUDE.indexOf(b.id),
  );

  const alertas: AlertaLongitude[] = [];
  if (valorTabela > 0 && saldo < 0) {
    alertas.push({
      nivel: "erro",
      codigo: "recursos_maior_que_valor",
      texto: `FGTS + subsídio + financiamento passam do valor de tabela em ${brl(-saldo)}.`,
    });
  }
  if (e.empreendimento && !temEntrega) {
    alertas.push({
      nivel: "aviso",
      codigo: "sem_entrega",
      texto:
        "Informe a previsão de entrega: as pré-chaves são os meses até ela e o pós-chaves fica com o resto das parcelas.",
    });
  }
  if (temEntrega && prazo.mesesAteEntrega === 0) {
    alertas.push({
      nivel: "info",
      codigo: "entrega_passou",
      texto: `A entrega (${rotuloMes(e.entrega as Competencia)}) não está mais no futuro: todo o parcelamento vai para o pós-chaves.`,
    });
  }

  return {
    valido,
    linhas,
    valorAvaliacao,
    recursos,
    saldo,
    valorFinal,
    diferenca,
    proSoluto: { valor: proSolutoValor, pct: sobre(proSolutoValor, base) },
    premissas,
    conferencias,
    status,
    pendencias,
    capacidadeParcelado,
    atosMinimos,
    mensais: preQtd,
    qtd: { pre: preQtd, anuais: anuaisQtd, pos: posQtd, posMax },
    cronograma,
    alertas,
  };
}

export function textoStatusLongitude(r: ResultadoLongitude): string {
  if (r.status === "incompleto")
    return "Preencha o empreendimento, a renda e os valores da unidade";
  if (r.status === "apto") return "APTO PARA VENDA! O fluxo atende as premissas da Longitude.";
  return `NECESSÁRIO APROVAÇÃO: ${r.pendencias.join("; ")}.`;
}

// ----------------------------------------------------------------------------
// Preencher pelas premissas
// ----------------------------------------------------------------------------

/**
 * Monta um fluxo APTO PARA VENDA, ponto de partida para o corretor ajustar:
 * pré-chaves, anuais e pós-chaves no teto de cada parcela, nessa ordem, até
 * cobrir o saldo ou bater o limite da referência (parcelado até 40% do
 * valor); o resto vai para o ato (respeitando o ato mínimo). Outros fica
 * zerado (sempre pede aprovação).
 */
export function sugestaoPelasPremissas(e: EntradaLongitude): Record<IdLinhaLongitude, number> {
  const out = Object.fromEntries(IDS_LINHAS_LONGITUDE.map((id) => [id, 0])) as Record<
    IdLinhaLongitude,
    number
  >;
  const r = simularLongitude({ ...e, parcelas: {} });
  if (!r.valido || r.saldo <= 0) return out;
  const periodicidade = r.linhas.find((l) => l.id === "periodicidade")?.total ?? 0;
  let orcamento = centavos(
    Math.max(0, Math.min(r.capacidadeParcelado, r.saldo - e.premissas.atoMinimo) - periodicidade),
  );
  const tetoPosTotal = pos0(e.valorTabela) * e.premissas.proSolutoPosMax;
  for (const id of ["pre", "anuais", "pos"] as const) {
    const l = r.linhas.find((x) => x.id === id);
    if (!l || l.qtd === 0 || l.teto == null || orcamento <= 0) continue;
    const max = id === "pos" ? Math.min(l.teto * l.qtd, tetoPosTotal) : l.teto * l.qtd;
    const parcela = centavosAbaixo(Math.min(max, orcamento) / l.qtd);
    out[id] = parcela;
    orcamento = centavos(orcamento - parcela * l.qtd);
  }
  const qtd = (id: IdLinhaLongitude) => r.linhas.find((x) => x.id === id)?.qtd ?? 0;
  const parcelado =
    out.pre * qtd("pre") + out.anuais * qtd("anuais") + out.pos * qtd("pos") + periodicidade;
  out.ato = centavos(Math.max(0, r.saldo - parcelado));
  return out;
}

// ----------------------------------------------------------------------------
// Quanto custa esperar
// ----------------------------------------------------------------------------

export interface CenarioEsperaLongitude {
  hoje: Competencia;
  mensais: number;
  capacidadeParcelado: number;
  atosMinimos: number;
  diferenca: number;
}

export function cenariosEsperaLongitude(e: EntradaLongitude, meses = 4): CenarioEsperaLongitude[] {
  const iHoje = indiceMes(e.hoje);
  if (!Number.isFinite(iHoje)) return [];
  const out: CenarioEsperaLongitude[] = [];
  for (let k = 0; k < meses; k++) {
    const hoje = competenciaDoIndice(iHoje + k);
    const r = simularLongitude({ ...e, hoje });
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

/** Atalho: as premissas do código para um empreendimento (ou o padrão). */
export function premissasDe(emp: EmpreendimentoLongitude | null): PremissasLongitude {
  return { ...(emp?.premissas ?? PREMISSAS_PADRAO_LONGITUDE) };
}
