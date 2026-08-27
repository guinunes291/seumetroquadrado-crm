// Régua de follow-up (13 toques) — a matemática pura da cadência.
//
// A operação mediu que o cliente responde por volta da 13ª tentativa de
// contato; a régua transforma isso em processo: cada lead tem um contador de
// toques (só contato ATIVO do corretor conta) e uma cadência
// temperatura × etapa que diz QUANDO e POR QUAL CANAL sai o próximo toque.
// Esgotou os 13 sem resposta → decisão humana (reativar ou descartar),
// nunca auto-perdido (regra assentada: ver arquivar_leads_sem_contato_30d,
// desativada de propósito em 2026-07-17).
//
// A configuração vive em gestao_config (chave `regua_followup`) e é editada
// pelo gestor nas Configurações; este arquivo é o parser tolerante + o
// cálculo, espelhado nos testes (tests/regua-followup.test.ts). O agendamento
// em si é uma tarefa comum (garantirFollowUpAberto) — o espelho
// tarefas ↔ leads.proximo_followup faz o resto.

import type { LeadStatus } from "@/lib/leads";

export type CanalToque = "whatsapp" | "ligacao";
export type TemperaturaRegua = "quente" | "morno" | "frio";

export type ReguaFollowUp = {
  /** Teto de toques da régua (a tese dos 13). */
  maxToques: number;
  /** Dias entre um toque e o seguinte, por temperatura — índice 0 = espera
   *  até o toque 1 (entrada na régua), índice n = espera após o toque n. */
  gaps: Record<TemperaturaRegua, number[]>;
  /** Toques feitos por LIGAÇÃO (Discador); os demais são WhatsApp. */
  ligacaoNosToques: number[];
  /** Multiplicador de ritmo por etapa (fundo do funil acelera). Ausente = 1. */
  multEtapa: Partial<Record<LeadStatus, number>>;
  /** Dias de follow-up vencido até o lead voltar à roleta (SLA duro). */
  slaDevolucaoDias: number;
  /** Liga/desliga a devolução automática por SLA (opt-in do gestor). */
  devolucaoAtiva: boolean;
};

/** Régua padrão — calibrada com a cadência consultiva MCMV: densa no começo
 *  (quando a chance de resposta é maior), espaçando até o 13º toque. */
export const REGUA_PADRAO: ReguaFollowUp = {
  maxToques: 13,
  gaps: {
    quente: [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 7, 7, 10],
    morno: [0, 2, 2, 3, 3, 4, 5, 5, 7, 7, 10, 10, 14],
    frio: [0, 3, 4, 5, 7, 7, 10, 10, 14, 14, 21, 21, 30],
  },
  ligacaoNosToques: [3, 7, 11],
  multEtapa: {
    agendado: 0.5,
    visita_realizada: 0.5,
    analise_credito: 0.5,
  },
  slaDevolucaoDias: 3,
  devolucaoAtiva: false,
};

const TEMPERATURAS: TemperaturaRegua[] = ["quente", "morno", "frio"];

function numeroOu(fallback: number, v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
}

/** Parser tolerante do jsonb de gestao_config: qualquer campo ausente ou
 *  malformado cai no padrão — a régua nunca quebra a fila por config ruim. */
export function parseRegua(raw: unknown): ReguaFollowUp {
  if (!raw || typeof raw !== "object") return REGUA_PADRAO;
  const o = raw as Record<string, unknown>;

  const maxToques = Math.max(1, Math.min(30, numeroOu(REGUA_PADRAO.maxToques, o.max_toques)));

  const gaps = {} as Record<TemperaturaRegua, number[]>;
  const rawGaps = (o.gaps ?? {}) as Record<string, unknown>;
  for (const t of TEMPERATURAS) {
    const arr = Array.isArray(rawGaps[t]) ? (rawGaps[t] as unknown[]) : null;
    const base = REGUA_PADRAO.gaps[t];
    gaps[t] = Array.from({ length: maxToques }, (_, i) => {
      const candidato = arr?.[i];
      const fallback = base[Math.min(i, base.length - 1)];
      return numeroOu(fallback, candidato);
    });
  }

  const ligacao = Array.isArray(o.ligacao_nos_toques)
    ? (o.ligacao_nos_toques as unknown[]).filter(
        (n): n is number => typeof n === "number" && n >= 1 && n <= maxToques,
      )
    : REGUA_PADRAO.ligacaoNosToques;

  const multEtapa: Partial<Record<LeadStatus, number>> = {};
  if (o.mult_etapa && typeof o.mult_etapa === "object") {
    for (const [k, v] of Object.entries(o.mult_etapa as Record<string, unknown>)) {
      if (typeof v === "number" && v > 0 && v <= 4) multEtapa[k as LeadStatus] = v;
    }
  } else {
    Object.assign(multEtapa, REGUA_PADRAO.multEtapa);
  }

  return {
    maxToques,
    gaps,
    ligacaoNosToques: ligacao,
    multEtapa,
    slaDevolucaoDias: Math.max(1, numeroOu(REGUA_PADRAO.slaDevolucaoDias, o.sla_devolucao_dias)),
    devolucaoAtiva: o.devolucao_ativa === true,
  };
}

export type ProximoToque = {
  /** Número do toque a agendar (tentativas + 1). */
  toque: number;
  /** Dias a partir de agora até o toque. */
  emDias: number;
  canal: CanalToque;
};

/** Próximo toque da régua para um lead com `tentativas` toques já dados.
 *  null = régua esgotada (tentativas >= maxToques) — decisão humana. */
export function proximoToque(
  regua: ReguaFollowUp,
  temperatura: TemperaturaRegua | null | undefined,
  etapa: LeadStatus | string | null | undefined,
  tentativas: number,
): ProximoToque | null {
  const feitas = Math.max(0, Math.floor(tentativas));
  if (feitas >= regua.maxToques) return null;

  const t: TemperaturaRegua = TEMPERATURAS.includes(temperatura as TemperaturaRegua)
    ? (temperatura as TemperaturaRegua)
    : "morno";
  const toque = feitas + 1;
  const gapBase = regua.gaps[t][toque - 1] ?? regua.gaps[t][regua.gaps[t].length - 1];
  const mult = regua.multEtapa[etapa as LeadStatus] ?? 1;
  // Nunca zero dias além do 1º toque: o corretor não deve ser cobrado duas
  // vezes no mesmo instante por causa de um multiplicador agressivo.
  const emDias = toque === 1 ? 0 : Math.max(1, Math.round(gapBase * mult));

  return {
    toque,
    emDias,
    canal: regua.ligacaoNosToques.includes(toque) ? "ligacao" : "whatsapp",
  };
}

/** Título padrão da tarefa de cadência — o "Toque N/13" que aparece na
 *  Agenda e na fila. */
export function tituloDoToque(toque: number, maxToques: number, canal: CanalToque): string {
  const acao = canal === "ligacao" ? "Ligar" : "WhatsApp";
  return `Follow-up ${toque}/${maxToques} — ${acao}`;
}

/** Tipo de tarefa correspondente ao canal (entra no espelho proximo_followup
 *  e é cancelado pelo trigger de fechamento como os demais tipos de contato). */
export function tipoDaTarefa(canal: CanalToque): "whatsapp" | "ligacao" {
  return canal === "ligacao" ? "ligacao" : "whatsapp";
}
