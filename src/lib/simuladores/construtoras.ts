// Simuladores de fluxo por construtora — quais existem e com que regras abrem.
//
// Cada construtora parceira com simulador próprio tem aqui o PRESET das regras
// do fluxo (ato mínimo, intermediárias, teto de parcelamento, pós-chaves...).
// A tela abre com o preset e deixa o corretor ajustar; o ajuste fica salvo por
// usuário numa chave VERSIONADA (simuladores:regras:v{versao}:{id}) — subir a
// `versao` de uma construtora descarta os ajustes antigos de todo mundo, para
// ninguém ficar simulando com regra velha depois que a tabela mudou.
//
// ESTADO DAS REGRAS (out/2026):
//   • VIBRA: conferida com o simulador oficial do canal (Vibra Parcerias,
//     Equipe Grego). O modelo dela é outro (teto de cada parcela pela renda,
//     tabela por empreendimento) e mora em vibra.ts / tabela-vibra.ts; o
//     `regras` abaixo não é usado na aba dela.
//   • MUNDO APTO: conferida com a Política de Análise de Crédito de
//     09/04/2026 (Tabelão out/2026). Motor próprio em mundo-apto.ts, com a
//     tabela de vencimentos em tabela-mundo-apto.ts; `regras` também não é
//     usado na aba dela.
//   • DIRECIONAL e LONGITUDE: os simuladores de referência (o da Longitude é
//     fechado por login; o smq-fluxo não pôde ser lido) ainda não deram a
//     regra. Os presets abrem com o padrão da OPERAÇÃO, não com o da
//     construtora:
//   • teto de parcelamento = regra 80/20 do CRM (TETO_PARCELAMENTO_CONSTRUTORA,
//     a mesma do Match e da pré-qualificação APROVE);
//   • INCC projetado = INCC-M acumulado em 12 meses até ago/2026 (6,55%, FGV);
//   • juros pós-chaves = 1% a.m., a convenção mais comum de mercado;
//   • o resto (ato mínimo, piso da mensal, intermediárias) fica SEM regra (0)
//     e a tela avisa "regras a conferir" enquanto `conferidoEm` for null.
// Ao calibrar com a tabela vigente: preencha as regras, ponha a data em
// `conferidoEm`, a fonte em `fonte` e suba a `versao`.

import { TETO_PARCELAMENTO_CONSTRUTORA } from "@/lib/orcamento";
import type { Periodicidade, RegrasFluxo } from "@/lib/simuladores/fluxo";
import type { SimuladorId } from "@/lib/simuladores/ids";
import { CONFERIDA_EM, FONTE_TABELA_VIBRA } from "@/lib/simuladores/tabela-vibra";
import { CONFERIDA_EM_MA, FONTE_POLITICA_MA } from "@/lib/simuladores/tabela-mundo-apto";

export type { SimuladorId } from "@/lib/simuladores/ids";

/**
 * generico     → saldo dividido em mensais até a entrega (fluxo.ts), regras
 *                editáveis no card "Regras da construtora";
 * tabela_vibra → tabela oficial da Vibra por empreendimento, com teto de cada
 *                parcela pela renda (vibra.ts);
 * politica_mundo_apto → política de crédito da Mundo Apto: modalidades,
 *                teto pela renda líquida e limites por grupo (mundo-apto.ts).
 */
export type ModeloSimulador = "generico" | "tabela_vibra" | "politica_mundo_apto";

export interface SimuladorConstrutora {
  id: SimuladorId;
  /** Nome da parceira — casa com `projetos.construtora` via mesmaConstrutora. */
  nome: string;
  modelo: ModeloSimulador;
  /** Sobe quando o preset muda: invalida os ajustes salvos pelos corretores. */
  versao: number;
  regras: RegrasFluxo;
  /** Data (YYYY-MM-DD) em que as regras foram conferidas com a tabela; null = a conferir. */
  conferidoEm: string | null;
  /** De onde vieram as regras (tabela do mês, e-mail do gerente, simulador oficial). */
  fonte: string | null;
}

/** Padrão da operação para quem ainda não tem regra conferida. */
export const REGRAS_PADRAO: RegrasFluxo = {
  atoMinimoPct: 0,
  atoMinimoValor: 0,
  mensalMinima: 0,
  mesesAntesDaEntrega: 1,
  intermediarias: "nenhuma",
  parceladoMaxPct: TETO_PARCELAMENTO_CONSTRUTORA * 100,
  comprometimentoMaxPct: 0,
  posChavesPermitido: false,
  posChavesMaxParcelas: 0,
  jurosPosChavesPct: 1,
  inccAnualPct: 6.55,
};

const preset = (id: SimuladorId, nome: string): SimuladorConstrutora => ({
  id,
  nome,
  modelo: "generico",
  versao: 1,
  regras: { ...REGRAS_PADRAO },
  conferidoEm: null,
  fonte: null,
});

/** Ordem das abas: a mesma em que a operação pediu os simuladores. */
export const SIMULADORES_CONSTRUTORAS: readonly SimuladorConstrutora[] = [
  {
    ...preset("vibra", "Vibra"),
    modelo: "tabela_vibra",
    // v2: saiu do fluxo genérico para a tabela oficial (os ajustes de regra
    // salvos na v1 não valem mais).
    versao: 2,
    conferidoEm: CONFERIDA_EM,
    fonte: FONTE_TABELA_VIBRA,
  },
  preset("direcional", "Direcional"),
  preset("longitude", "Longitude"),
  {
    ...preset("mundo-apto", "Mundo Apto"),
    modelo: "politica_mundo_apto",
    // v2: saiu do fluxo genérico para a política de crédito (os ajustes de
    // regra salvos na v1 não valem mais).
    versao: 2,
    conferidoEm: CONFERIDA_EM_MA,
    fonte: FONTE_POLITICA_MA,
  },
];

export function simuladorPorId(id: string | null | undefined): SimuladorConstrutora {
  return SIMULADORES_CONSTRUTORAS.find((s) => s.id === id) ?? SIMULADORES_CONSTRUTORAS[0];
}

/** Chave de preferência dos ajustes do corretor (versionada com o preset). */
export function chaveRegrasAjustadas(s: SimuladorConstrutora): string {
  return `simuladores:regras:v${s.versao}:${s.id}`;
}

/**
 * Regras efetivas: o preset com os ajustes salvos por cima. Campo salvo com
 * tipo errado (preferência antiga, JSON mexido à mão) é ignorado — o preset
 * vale para ele.
 */
export function regrasComAjustes(
  preset: RegrasFluxo,
  ajustes: Partial<RegrasFluxo> | null | undefined,
): RegrasFluxo {
  if (!ajustes || typeof ajustes !== "object") return preset;
  const pega = <K extends keyof RegrasFluxo>(k: K): RegrasFluxo[K] => {
    const v: unknown = ajustes[k];
    if (v === undefined || typeof v !== typeof preset[k]) return preset[k];
    if (typeof v === "number" && !Number.isFinite(v)) return preset[k];
    if (k === "intermediarias" && !PERIODICIDADES.includes(v as Periodicidade)) return preset[k];
    return v as RegrasFluxo[K];
  };
  // Campo a campo de propósito: regra nova no RegrasFluxo quebra a compilação
  // aqui até alguém decidir como ela é lida da preferência.
  return {
    atoMinimoPct: pega("atoMinimoPct"),
    atoMinimoValor: pega("atoMinimoValor"),
    mensalMinima: pega("mensalMinima"),
    mesesAntesDaEntrega: pega("mesesAntesDaEntrega"),
    intermediarias: pega("intermediarias"),
    parceladoMaxPct: pega("parceladoMaxPct"),
    comprometimentoMaxPct: pega("comprometimentoMaxPct"),
    posChavesPermitido: pega("posChavesPermitido"),
    posChavesMaxParcelas: pega("posChavesMaxParcelas"),
    jurosPosChavesPct: pega("jurosPosChavesPct"),
    inccAnualPct: pega("inccAnualPct"),
  };
}

const PERIODICIDADES: readonly Periodicidade[] = ["nenhuma", "anual", "semestral", "dezembro"];

/** Só os campos que diferem do preset — é isso que vai para a preferência. */
export function diferencasDoPreset(preset: RegrasFluxo, regras: RegrasFluxo): Partial<RegrasFluxo> {
  const out: Partial<RegrasFluxo> = {};
  for (const k of Object.keys(preset) as (keyof RegrasFluxo)[]) {
    if (regras[k] !== preset[k]) Object.assign(out, { [k]: regras[k] });
  }
  return out;
}
