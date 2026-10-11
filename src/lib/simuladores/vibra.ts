// ============================================================================
// vibra.ts — Fluxo de pagamento da VIBRA (regras do simulador oficial do canal)
// ----------------------------------------------------------------------------
// A Vibra não divide o saldo em mensais iguais (o modelo genérico de
// fluxo.ts). Ela dá a cada TIPO de parcela um teto pela RENDA do cliente, e o
// corretor monta o fluxo até a soma bater com o que falta pagar:
//
//   Financiamento líquido = financiado × retenção (0,99 ou 0,985: a Vibra
//                           retém 1% ou 1,5% para o INCC até a Caixa)
//   Total até a entrega   = valor do imóvel − financiamento líquido
//                           − subsídio − FGTS
//
//   Parcela                 Quando                          Teto de cada uma
//   4 atos                  mês do ato e os 3 seguintes     livre
//   Mensais 1 (g1)          a partir do 5º mês, seguidas    28% da renda
//   Mensais 2 (g2)          logo depois das Mensais 1       22% da renda
//   Mensais 3 (g3)          logo depois das Mensais 2       18% da renda
//   Anuais                  dezembro (data da tabela)       100% da renda
//   Única                   data da tabela                  unicaPct × renda
//   Pós-chave               a partir de posChaveIni         10% da renda, e
//                                                           5% do imóvel no total
//
//   Pró-soluto (tudo menos os atos) ≤ 15% do valor do imóvel.
//   FECHOU quando a soma do fluxo = total até a entrega.
//
// "CADA MÊS QUE PASSA O PRODUTO PERDE UMA MENSAL": a tabela oficial é
// publicada para quem assina no mês-base (atoData, out/2026 nesta versão). As
// faixas de mensais são datas FIXAS da obra (a faixa de 28% são os primeiros
// meses, antes da evolução de obra na Caixa pesar no bolso); quem assina um
// mês depois desloca os 4 atos um mês para frente, e a primeira mensal que
// caía no 5º mês some. Por isso as quantidades aqui são recalculadas a partir
// do mês do ato: sai primeiro a faixa de 28%, depois a de 22%, depois a de 18%.
// O mesmo vale para anual, única e pós-chave: o que cairia dentro do período
// dos atos deixa de existir (vira ato).
//
// Arquivo puro (sem React), testado em tests/simuladores-vibra.test.ts.
// ============================================================================

import { centavos } from "@/lib/amortizacao";
import {
  competenciaDoIndice,
  indiceMes,
  rotuloMes,
  type Competencia,
} from "@/lib/simuladores/fluxo";
import {
  CONFERIDA_EM,
  EMPREENDIMENTOS,
  FONTE_TABELA_VIBRA,
  NOMES_NO_CATALOGO,
} from "@/lib/simuladores/tabela-vibra";

export { CONFERIDA_EM, FONTE_TABELA_VIBRA };

export const REGRAS_VIBRA = {
  /** Atos de valor livre: no mês do ato e nos 3 seguintes (0, 30, 60, 90 dias). */
  atos: 4,
  tetoRenda: { m1: 0.28, m2: 0.22, m3: 0.18, anu: 1, pos: 0.1 },
  /** Soma das parcelas de pós-chave ≤ 5% do imóvel. */
  posChaveMaxImovel: 0.05,
  /** Pró-soluto (fluxo sem os atos) ≤ 15% do imóvel. */
  proSolutoMaxImovel: 0.15,
  /** Parcela que cabe depois da entrega, morando: 30% da renda. */
  potencialMorando: 0.3,
  /** Taxa da Caixa na assinatura do financiamento. */
  taxaCaixaMax: 900,
} as const;

// ----------------------------------------------------------------------------
// Empreendimentos
// ----------------------------------------------------------------------------

export interface EmpreendimentoVibra {
  nome: string;
  /** Mês-base da tabela (o 1º ato de quem assina no mês da tabela). */
  base: Competencia;
  g1: number;
  g2: number;
  g3: number;
  anuais: number;
  anualData: Competencia;
  unicaQtd: number;
  unicaPct: number;
  unicaData: Competencia | null;
  posChave: number;
  posChaveIni: Competencia;
  entrega: Competencia;
  retencao: number;
}

const mes = (iso: string): Competencia => iso.slice(0, 7);

export const EMPREENDIMENTOS_VIBRA: readonly EmpreendimentoVibra[] = Object.entries(
  EMPREENDIMENTOS,
).map(([nome, d]) => ({
  nome,
  base: mes(d.atoData),
  g1: d.g1,
  g2: d.g2,
  g3: d.g3,
  anuais: d.anuais,
  anualData: mes(d.anualData),
  unicaQtd: d.unicaQtd,
  unicaPct: d.unicaPct,
  unicaData: d.unicaData ? mes(d.unicaData) : null,
  posChave: d.posChave,
  posChaveIni: mes(d.posChaveIni),
  entrega: mes(d.entrega),
  retencao: d.retencao,
}));

/** Mês-base mais recente da tabela (o "out/2026" que a tela mostra). */
export const VIGENCIA_VIBRA: Competencia = EMPREENDIMENTOS_VIBRA.reduce(
  (max, e) => (e.base > max ? e.base : max),
  EMPREENDIMENTOS_VIBRA[0]?.base ?? "",
);

export function empreendimentoVibra(nome: string | null | undefined): EmpreendimentoVibra | null {
  return EMPREENDIMENTOS_VIBRA.find((e) => e.nome === nome) ?? null;
}

const ABREVIACOES: Record<string, string> = { pq: "parque", vl: "vila", jd: "jardim" };

/** "Vibra - Estação Vila Sônia" → "estacao vila sonia" (para casar com o catálogo). */
export function normalizarNomeVibra(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && t !== "vibra")
    .map((t) => ABREVIACOES[t] ?? t)
    .join(" ");
}

/** O projeto do catálogo do CRM é este empreendimento da tabela? */
export function casaComCatalogo(emp: EmpreendimentoVibra, nomeProjeto: string): boolean {
  const alvo = normalizarNomeVibra(nomeProjeto);
  if (!alvo) return false;
  return [emp.nome, ...(NOMES_NO_CATALOGO[emp.nome] ?? [])].some(
    (n) => normalizarNomeVibra(n) === alvo,
  );
}

export function empreendimentoDoProjeto(nomeProjeto: string): EmpreendimentoVibra | null {
  return EMPREENDIMENTOS_VIBRA.find((e) => casaComCatalogo(e, nomeProjeto)) ?? null;
}

// ----------------------------------------------------------------------------
// Linhas do fluxo (quantas parcelas de cada tipo e quando)
// ----------------------------------------------------------------------------

export type IdLinhaVibra =
  "ato1" | "ato2" | "ato3" | "ato4" | "m1" | "m2" | "m3" | "anu" | "uni" | "pos";

export const IDS_LINHAS_VIBRA: readonly IdLinhaVibra[] = [
  "ato1",
  "ato2",
  "ato3",
  "ato4",
  "m1",
  "m2",
  "m3",
  "anu",
  "uni",
  "pos",
];

export type TipoLinhaVibra = "ato" | "mensal" | "anual" | "unica" | "pos_chave";

export interface LinhaVibra {
  id: IdLinhaVibra;
  tipo: TipoLinhaVibra;
  rotulo: string;
  /** Meses de cada parcela da linha (a quantidade é o tamanho da lista). */
  meses: Competencia[];
  qtd: number;
  /** Fração da renda que limita CADA parcela; null = valor livre (atos). */
  tetoRenda: number | null;
}

const ROTULO_ATO = [
  "1º ato (assinatura)",
  "2º ato (30 dias)",
  "3º ato (60 dias)",
  "4º ato (90 dias)",
];

function mesesDe(ini: number, qtd: number, aPartirDe: number): Competencia[] {
  const out: Competencia[] = [];
  for (let i = Math.max(ini, aPartirDe); i < ini + qtd; i++) out.push(competenciaDoIndice(i));
  return out;
}

/** As 10 linhas do fluxo para quem assina em `hoje`. */
export function linhasVibra(emp: EmpreendimentoVibra, hoje: Competencia): LinhaVibra[] {
  const iHoje = indiceMes(hoje);
  const iBase = indiceMes(emp.base);
  if (!Number.isFinite(iHoje) || !Number.isFinite(iBase)) return [];
  // Primeiro mês livre depois dos atos: o que cairia antes disso sai do fluxo.
  const livre = iHoje + REGRAS_VIBRA.atos;
  const linha = (
    id: IdLinhaVibra,
    tipo: TipoLinhaVibra,
    rotulo: string,
    meses: Competencia[],
    tetoRenda: number | null,
  ): LinhaVibra => ({ id, tipo, rotulo, meses, qtd: meses.length, tetoRenda });

  const atos = ROTULO_ATO.map((r, k) =>
    linha(`ato${k + 1}` as IdLinhaVibra, "ato", r, [competenciaDoIndice(iHoje + k)], null),
  );

  // As faixas são datas fixas da obra, contadas do mês-base da tabela.
  const ini1 = iBase + REGRAS_VIBRA.atos;
  const ini2 = ini1 + emp.g1;
  const ini3 = ini2 + emp.g2;
  const { tetoRenda: t } = REGRAS_VIBRA;

  const iAnual = indiceMes(emp.anualData);
  const anuais = Array.from({ length: emp.anuais }, (_, k) => iAnual + 12 * k)
    .filter((i) => i >= livre)
    .map(competenciaDoIndice);

  const iUnica = indiceMes(emp.unicaData);
  const unica =
    emp.unicaQtd > 0 && Number.isFinite(iUnica) && iUnica >= livre
      ? Array.from({ length: emp.unicaQtd }, () => competenciaDoIndice(iUnica))
      : [];

  return [
    ...atos,
    linha("m1", "mensal", "Mensais 1", mesesDe(ini1, emp.g1, livre), t.m1),
    linha("m2", "mensal", "Mensais 2", mesesDe(ini2, emp.g2, livre), t.m2),
    linha("m3", "mensal", "Mensais 3", mesesDe(ini3, emp.g3, livre), t.m3),
    linha("anu", "anual", "Anuais (dezembro)", anuais, t.anu),
    linha("uni", "unica", "Parcela única", unica, emp.unicaPct),
    linha(
      "pos",
      "pos_chave",
      "Pós-chave",
      mesesDe(indiceMes(emp.posChaveIni), emp.posChave, livre),
      t.pos,
    ),
  ];
}

// ----------------------------------------------------------------------------
// Simulação
// ----------------------------------------------------------------------------

export interface EntradaVibra {
  empreendimento: EmpreendimentoVibra | null;
  /** Mês do 1º ato (assinatura). */
  hoje: Competencia;
  renda: number;
  valorImovel: number;
  /** Financiamento aprovado pelo banco (antes da retenção). */
  financiamento: number;
  /** Subsídio + FGTS (o simulador oficial pede os dois somados). */
  subsidioFgts: number;
  /** Valor de CADA parcela de cada linha (nos atos, o valor do ato). */
  parcelas: Partial<Record<IdLinhaVibra, number>>;
}

export interface LinhaResultadoVibra extends LinhaVibra {
  /** Valor de cada parcela. */
  valor: number;
  total: number;
  /** Teto de cada parcela em R$ (null nos atos e sem renda informada). */
  teto: number | null;
  excedeu: boolean;
}

export type StatusVibra = "incompleto" | "fechou" | "fechou_fora_do_teto" | "falta" | "sobra";

export interface AlertaVibra {
  nivel: "erro" | "aviso" | "info";
  codigo:
    | "recursos_maior_que_valor"
    | "mensais_perdidas"
    | "antes_da_tabela"
    | "sem_mensais"
    | "pos_chave_cortado";
  texto: string;
}

export interface ParcelaVibra {
  competencia: Competencia;
  id: IdLinhaVibra;
  tipo: TipoLinhaVibra;
  /** "Mensal 3/17", "2º ato", "Pós-chave 1/24". */
  rotulo: string;
  valor: number;
}

export interface ResultadoVibra {
  /** Tem empreendimento e valor do imóvel: dá para montar o fluxo. */
  valido: boolean;
  linhas: LinhaResultadoVibra[];
  /** % retido do financiamento (1 ou 1,5). */
  retencaoPct: number;
  financiamentoLiquido: number;
  totalAteEntrega: number;
  potencialMorando: number;
  totalFluxo: number;
  totalAtos: number;
  proSoluto: { valor: number; pct: number; teto: number; excedeu: boolean };
  posChave: { total: number; teto: number; excedeu: boolean };
  /** Total até a entrega − total do fluxo: > 0 falta, < 0 sobra. */
  diferenca: number;
  status: StatusVibra;
  /** O que passa do limite ("Mensais 1 (máx. R$ 1.400,00 cada)"). */
  foraDoTeto: string[];
  /** O máximo que o fluxo SEM os atos comporta pelas regras (tetos e 15%). */
  capacidadeParcelado: number;
  /** O mínimo que precisa ir nos atos para fechar com o resto no teto. */
  atosMinimos: number;
  /** Mensais da tabela que já saíram por assinar depois do mês-base. */
  mensaisPerdidas: number;
  mensais: number;
  entrega: Competencia | null;
  cronograma: ParcelaVibra[];
  alertas: AlertaVibra[];
}

const pos = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct1 = (v: number) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
/** Arredonda para baixo no centavo: o valor sugerido nunca passa do teto. */
const centavosAbaixo = (v: number) => Math.floor(v * 100 + 1e-6) / 100;

/** Teto da linha inteira (qtd × teto; no pós-chave, também 5% do imóvel). */
function tetoDaLinha(l: LinhaResultadoVibra, tetoPosChave: number): number {
  if (l.teto == null || l.qtd === 0) return 0;
  const cheio = centavos(l.teto * l.qtd);
  return l.tipo === "pos_chave" ? Math.min(cheio, tetoPosChave) : cheio;
}

export function simularVibra(e: EntradaVibra): ResultadoVibra {
  const emp = e.empreendimento;
  const renda = pos(e.renda);
  const valorImovel = pos(e.valorImovel);
  const retencao = emp?.retencao ?? 0.99;
  const financiamentoLiquido = centavos(pos(e.financiamento) * retencao);
  const totalAteEntrega =
    valorImovel > 0 ? centavos(valorImovel - financiamentoLiquido - pos(e.subsidioFgts)) : 0;

  const linhas: LinhaResultadoVibra[] = (emp ? linhasVibra(emp, e.hoje) : []).map((l) => {
    const valor = l.qtd > 0 ? centavos(pos(e.parcelas[l.id] ?? 0)) : 0;
    // Sem renda não há teto a conferir (a linha não fica vermelha à toa).
    const teto = l.tetoRenda == null || renda <= 0 ? null : centavos(renda * l.tetoRenda);
    return {
      ...l,
      valor,
      total: centavos(valor * l.qtd),
      teto,
      excedeu: teto != null && valor > 0 && valor > teto + 0.005,
    };
  });

  const soma = (f: (l: LinhaResultadoVibra) => boolean) =>
    centavos(linhas.filter(f).reduce((s, l) => s + l.total, 0));
  const totalFluxo = soma(() => true);
  const totalAtos = soma((l) => l.tipo === "ato");
  const proSolutoValor = centavos(totalFluxo - totalAtos);
  const proSolutoTeto = centavos(valorImovel * REGRAS_VIBRA.proSolutoMaxImovel);
  const posTotal = soma((l) => l.tipo === "pos_chave");
  const posTeto = centavos(valorImovel * REGRAS_VIBRA.posChaveMaxImovel);

  const capacidadeParcelado = centavos(
    Math.min(
      proSolutoTeto,
      linhas.filter((l) => l.tipo !== "ato").reduce((s, l) => s + tetoDaLinha(l, posTeto), 0),
    ),
  );

  const proSoluto = {
    valor: proSolutoValor,
    pct: valorImovel > 0 ? (proSolutoValor / valorImovel) * 100 : 0,
    teto: proSolutoTeto,
    excedeu: valorImovel > 0 && proSolutoValor > proSolutoTeto + 0.005,
  };
  const posChave = {
    total: posTotal,
    teto: posTeto,
    excedeu: valorImovel > 0 && posTotal > posTeto + 0.005,
  };

  const foraDoTeto = [
    ...linhas.filter((l) => l.excedeu).map((l) => `${l.rotulo} (máx. ${brl(l.teto ?? 0)} cada)`),
    ...(posChave.excedeu ? [`pós-chave no total (máx. ${brl(posTeto)}, 5% do imóvel)`] : []),
    ...(proSoluto.excedeu ? [`pró-soluto (${pct1(proSoluto.pct)} do imóvel, máx. 15%)`] : []),
  ];

  const diferenca = centavos(totalAteEntrega - totalFluxo);
  const valido = !!emp && valorImovel > 0;
  const status: StatusVibra =
    !valido || renda <= 0
      ? "incompleto"
      : Math.abs(diferenca) < 0.005
        ? foraDoTeto.length > 0
          ? "fechou_fora_do_teto"
          : "fechou"
        : diferenca > 0
          ? "falta"
          : "sobra";

  const mensais = linhas.filter((l) => l.tipo === "mensal").reduce((s, l) => s + l.qtd, 0);
  const mensaisDaTabela = emp ? emp.g1 + emp.g2 + emp.g3 : 0;
  const mensaisPerdidas = Math.max(0, mensaisDaTabela - mensais);

  // Cronograma mês a mês: mensais numeradas na sequência das três faixas.
  const cronograma: ParcelaVibra[] = [];
  const contagem: Record<TipoLinhaVibra, number> = {
    ato: 0,
    mensal: 0,
    anual: 0,
    unica: 0,
    pos_chave: 0,
  };
  const totalDoTipo = (t: TipoLinhaVibra) =>
    linhas.filter((l) => l.tipo === t && l.valor > 0).reduce((s, l) => s + l.qtd, 0);
  for (const l of linhas) {
    if (l.valor <= 0) continue;
    for (const m of l.meses) {
      const n = ++contagem[l.tipo];
      const de = totalDoTipo(l.tipo);
      const rotulo =
        l.tipo === "ato"
          ? `${l.id.slice(3)}º ato`
          : l.tipo === "mensal"
            ? `Mensal ${n}/${de}`
            : l.tipo === "anual"
              ? de > 1
                ? `Anual ${n}/${de}`
                : "Anual"
              : l.tipo === "unica"
                ? "Parcela única"
                : `Pós-chave ${n}/${de}`;
      cronograma.push({ competencia: m, id: l.id, tipo: l.tipo, rotulo, valor: l.valor });
    }
  }
  const ordem = IDS_LINHAS_VIBRA;
  cronograma.sort(
    (a, b) =>
      indiceMes(a.competencia) - indiceMes(b.competencia) ||
      ordem.indexOf(a.id) - ordem.indexOf(b.id),
  );

  const alertas: AlertaVibra[] = [];
  if (valorImovel > 0 && totalAteEntrega < 0) {
    alertas.push({
      nivel: "erro",
      codigo: "recursos_maior_que_valor",
      texto: `Financiamento líquido + subsídio + FGTS passam do valor do imóvel em ${brl(-totalAteEntrega)}. Confira os valores do banco.`,
    });
  }
  if (emp) {
    const iHoje = indiceMes(e.hoje);
    const iBase = indiceMes(emp.base);
    if (iHoje > iBase && mensaisPerdidas > 0) {
      alertas.push({
        nivel: "info",
        codigo: "mensais_perdidas",
        texto: `A tabela da Vibra é de ${rotuloMes(emp.base)}. Assinando em ${rotuloMes(e.hoje)}, ${mensaisPerdidas === 1 ? "a primeira mensal já saiu" : `as ${mensaisPerdidas} primeiras mensais já saíram`} da conta (cada mês sem assinar é uma mensal a menos, começando pela faixa de 28%). Se a Vibra mandou tabela nova, confira as faixas com ela.`,
      });
    }
    if (iHoje < iBase) {
      alertas.push({
        nivel: "info",
        codigo: "antes_da_tabela",
        texto: `O mês do ato (${rotuloMes(e.hoje)}) é anterior à tabela vigente (${rotuloMes(emp.base)}): as mensais seguem as datas da tabela.`,
      });
    }
    if (mensaisDaTabela > 0 && mensais === 0) {
      alertas.push({
        nivel: "aviso",
        codigo: "sem_mensais",
        texto: `Assinando em ${rotuloMes(e.hoje)} não sobra nenhuma mensal da tabela de ${rotuloMes(emp.base)}. Peça à Vibra a condição do mês.`,
      });
    }
    const pc = linhas.find((l) => l.id === "pos");
    if (emp.posChave > 0 && pc && pc.qtd < emp.posChave) {
      alertas.push({
        nivel: "aviso",
        codigo: "pos_chave_cortado",
        texto: `O pós-chave começa em ${rotuloMes(emp.posChaveIni)}, dentro do período dos atos: ${pc.qtd === 0 ? "não sobra nenhuma parcela" : `sobram ${pc.qtd} de ${emp.posChave}`}. Confirme a condição com a Vibra.`,
      });
    }
  }

  return {
    valido,
    linhas,
    retencaoPct: Math.round((1 - retencao) * 1000) / 10,
    financiamentoLiquido,
    totalAteEntrega,
    potencialMorando: centavos(renda * REGRAS_VIBRA.potencialMorando),
    totalFluxo,
    totalAtos,
    proSoluto,
    posChave,
    diferenca,
    status,
    foraDoTeto,
    capacidadeParcelado,
    atosMinimos: centavos(Math.max(0, totalAteEntrega - capacidadeParcelado)),
    mensaisPerdidas,
    mensais,
    entrega: emp?.entrega ?? null,
    cronograma,
    alertas,
  };
}

/** A frase do status, igual à do simulador oficial (mais o caso "fora do teto"). */
export function textoStatusVibra(r: ResultadoVibra): string {
  switch (r.status) {
    case "incompleto":
      return "Preencha o empreendimento, a renda e os valores da unidade";
    case "fechou":
      return "FECHOU! O cliente tem perfil para este projeto.";
    case "fechou_fora_do_teto":
      return `A conta fecha, mas passa do limite da Vibra: ${r.foraDoTeto.join("; ")}.`;
    case "falta":
      return `FALTA INCLUIR ${brl(r.diferenca)} no fluxo de pagamento`;
    case "sobra":
      return `SOBRA ${brl(-r.diferenca)} no fluxo (reduza algum valor)`;
  }
}

// ----------------------------------------------------------------------------
// Preencher pelo teto
// ----------------------------------------------------------------------------

/**
 * Monta um fluxo que FECHA respeitando os tetos: põe cada parcela no máximo
 * permitido, na ordem do calendário (Mensais 1, 2, 3, anuais, única e por
 * último o pós-chave, que pesa junto com a parcela do banco), até cobrir o
 * total até a entrega ou bater os 15% de pró-soluto. O que não cabe vai para
 * os atos, dividido igualmente nos 4 (o 1º leva os centavos da divisão).
 * É um ponto de partida: o corretor ajusta linha a linha depois.
 */
export function sugestaoPeloTeto(e: EntradaVibra): Record<IdLinhaVibra, number> {
  const out = Object.fromEntries(IDS_LINHAS_VIBRA.map((id) => [id, 0])) as Record<
    IdLinhaVibra,
    number
  >;
  const r = simularVibra({ ...e, parcelas: {} });
  if (!r.valido || r.totalAteEntrega <= 0) return out;

  let orcamento = Math.min(r.capacidadeParcelado, r.totalAteEntrega);
  let parcelado = 0;
  for (const l of r.linhas) {
    if (l.tipo === "ato" || l.qtd === 0 || orcamento <= 0) continue;
    const usar = Math.min(tetoDaLinha(l, r.posChave.teto), orcamento);
    const parcela = centavosAbaixo(usar / l.qtd);
    out[l.id] = parcela;
    parcelado = centavos(parcelado + parcela * l.qtd);
    orcamento = centavos(orcamento - parcela * l.qtd);
  }

  const atos = r.linhas.filter((l) => l.tipo === "ato");
  const totalAtos = centavos(r.totalAteEntrega - parcelado);
  const cada = centavosAbaixo(totalAtos / atos.length);
  atos.forEach((l, k) => {
    out[l.id] = k === 0 ? centavos(totalAtos - cada * (atos.length - 1)) : cada;
  });
  return out;
}

// ----------------------------------------------------------------------------
// Quanto custa esperar
// ----------------------------------------------------------------------------

export interface CenarioEsperaVibra {
  hoje: Competencia;
  mensais: number;
  capacidadeParcelado: number;
  atosMinimos: number;
  /** Quanto os atos mínimos sobem em relação a assinar agora. */
  diferenca: number;
}

/** O mesmo cliente assinando neste mês e nos próximos `meses − 1`. */
export function cenariosEsperaVibra(e: EntradaVibra, meses = 4): CenarioEsperaVibra[] {
  const iHoje = indiceMes(e.hoje);
  if (!Number.isFinite(iHoje)) return [];
  const out: CenarioEsperaVibra[] = [];
  for (let k = 0; k < meses; k++) {
    const hoje = competenciaDoIndice(iHoje + k);
    const r = simularVibra({ ...e, hoje });
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
