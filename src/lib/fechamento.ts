// Radar de fechamento: estima a PROBABILIDADE de o lead virar venda (0–100),
// para o corretor focar onde a venda está mais perto. Diferente do score de
// prioridade (priority.ts), que responde "quem atender primeiro/mais urgente":
// aqui o peso maior é a ETAPA do funil + o momento (recência), não a urgência.
// Função pura e testável.

export type FechamentoInput = {
  status?: string | null;
  temperatura?: string | null;
  /** Última interação (ISO) — momentum recente sobe a chance; parado derruba. */
  ultimaInteracao?: string | null;
  /** Próximo follow-up agendado (ISO) — sinal de engajamento ativo. */
  proximoFollowup?: string | null;
  /** Injetável para testes determinísticos. */
  agora?: Date;
};

export type FechamentoTier = "alta" | "media" | "baixa";
export type FechamentoResult = {
  probabilidade: number;
  tier: FechamentoTier;
  motivo: string;
};

// Probabilidade-base por etapa: quanto mais perto do contrato, maior.
// Etapas iniciais (novo/aguardando_atendimento) e terminais ficam de fora do radar.
const BASE_ETAPA: Record<string, number> = {
  analise_credito: 72,
  proposta_enviada: 60,
  visita_realizada: 48,
  agendado: 35,
  qualificado: 24,
  aguardando_retorno: 16,
  em_atendimento: 14,
};

// Etapas que entram no radar (negociação em andamento).
export const ETAPAS_RADAR = Object.keys(BASE_ETAPA);

export function diasDesde(iso: string | null | undefined, agora: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((agora.getTime() - t) / 86_400_000));
}

export function probabilidadeFechamento(input: FechamentoInput): FechamentoResult {
  const agora = input.agora ?? new Date();
  const base = BASE_ETAPA[input.status ?? ""] ?? 0;
  let p = base;
  const motivos: string[] = [];

  // Temperatura ajusta o engajamento percebido.
  if (input.temperatura === "quente") {
    p += 15;
    motivos.push("quente");
  } else if (input.temperatura === "frio") {
    p -= 12;
    motivos.push("esfriando");
  }

  // Momentum: contato recente ajuda; silêncio longo derruba.
  const dias = diasDesde(input.ultimaInteracao, agora);
  if (dias === null) {
    p -= 10;
    motivos.push("sem contato registrado");
  } else if (dias <= 2) {
    p += 10;
  } else if (dias > 14) {
    p -= 18;
    motivos.push(`${dias} dias parado`);
  } else if (dias > 7) {
    p -= 8;
    motivos.push(`${dias} dias parado`);
  }

  // Follow-up futuro agendado = engajamento ativo.
  const diasFollowup = diasDesde(input.proximoFollowup, agora);
  if (input.proximoFollowup && (diasFollowup === null || diasFollowup === 0)) {
    p += 5;
  }

  const probabilidade = Math.max(0, Math.min(100, Math.round(p)));
  const tier: FechamentoTier =
    probabilidade >= 55 ? "alta" : probabilidade >= 30 ? "media" : "baixa";

  // Motivo prioriza a etapa (o sinal mais forte), depois os modificadores.
  const cabeca = etapaCurta(input.status);
  const motivo = [cabeca, ...motivos].filter(Boolean).join(" · ");
  return { probabilidade, tier, motivo };
}

function etapaCurta(status?: string | null): string {
  switch (status) {
    case "analise_credito":
      return "Em análise de crédito";
    case "proposta_enviada":
      return "Proposta enviada";
    case "visita_realizada":
      return "Visita realizada";
    case "agendado":
      return "Visita agendada";
    case "qualificado":
      return "Qualificado";
    case "aguardando_retorno":
      return "Aguardando retorno";
    case "em_atendimento":
      return "Em atendimento";
    default:
      return "";
  }
}

export const FECHAMENTO_TIER_LABEL: Record<FechamentoTier, string> = {
  alta: "Quente p/ fechar",
  media: "Em negociação",
  baixa: "Distante",
};

// Verde = perto da venda (oportunidade), não urgência.
export const FECHAMENTO_TIER_TONE: Record<FechamentoTier, string> = {
  alta: "bg-emerald-500/15 text-emerald-700 border-emerald-300",
  media: "bg-amber-500/15 text-amber-700 border-amber-300",
  baixa: "bg-slate-400/15 text-slate-600 border-slate-300",
};

export const FECHAMENTO_TIER_DOT: Record<FechamentoTier, string> = {
  alta: "bg-emerald-500",
  media: "bg-amber-500",
  baixa: "bg-slate-400",
};
