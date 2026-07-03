// Score de prioridade do lead (0–100): combina temperatura, etapa do funil, SLA
// e tempo parado para responder "quem atender primeiro". Função PURA e testável;
// usada para ordenar filas (guardrail do Meu Dia, e reutilizável em Leads/Blitz).

import { INTENT_DOT } from "@/lib/status-tones";

export type ScoreInput = {
  temperatura?: string | null;
  status?: string | null;
  /** Status de SLA (estourado|atencao|ok), quando disponível. */
  slaStatus?: string | null;
  /** Última interação (ISO) — quanto mais parado, mais urgente. */
  ultimaInteracao?: string | null;
  /** Injetável para testes determinísticos. */
  agora?: Date;
};

export type ScoreTier = "alta" | "media" | "baixa";
export type ScoreResult = { score: number; tier: ScoreTier; motivo: string };

/** Peso por etapa — quanto mais perto da venda, mais cara é a oportunidade. */
const PESO_ETAPA: Record<string, number> = {
  analise_credito: 25,
  visita_realizada: 22,
  agendado: 16,
  em_atendimento: 12,
  aguardando_retorno: 10,
  qualificado: 10,
  aguardando_atendimento: 6,
  novo: 6,
};

export function diasDesde(iso: string | null | undefined, agora: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((agora.getTime() - t) / 86_400_000));
}

export function scoreLead(input: ScoreInput): ScoreResult {
  const agora = input.agora ?? new Date();
  let score = 0;
  const motivos: string[] = [];

  if (input.temperatura === "quente") {
    score += 35;
    motivos.push("quente");
  } else if (input.temperatura === "morno") {
    score += 15;
  }

  score += PESO_ETAPA[input.status ?? ""] ?? 0;

  if (input.slaStatus === "estourado") {
    score += 20;
    motivos.push("SLA estourado");
  } else if (input.slaStatus === "atencao") {
    score += 10;
  }

  const dias = diasDesde(input.ultimaInteracao, agora);
  if (dias === null) {
    score += 12;
    motivos.push("sem contato registrado");
  } else if (dias >= 1) {
    score += Math.min(20, dias * 4);
    if (dias >= 3) motivos.push(`${dias} dias sem contato`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const tier: ScoreTier = score >= 60 ? "alta" : score >= 35 ? "media" : "baixa";
  const motivo = motivos.length ? capitalize(motivos.join(", ")) : tierLabelLongo(tier);
  return { score, tier, motivo };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tierLabelLongo(t: ScoreTier): string {
  return t === "alta" ? "Prioridade alta" : t === "media" ? "Prioridade média" : "Prioridade baixa";
}

export const TIER_DOT: Record<ScoreTier, string> = {
  alta: INTENT_DOT.danger,
  media: INTENT_DOT.warning,
  baixa: INTENT_DOT.neutral,
};

export const TIER_LABEL: Record<ScoreTier, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};
