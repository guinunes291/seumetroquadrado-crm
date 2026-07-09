// Composição PURA da fila de missões da Central de Comando: funde as três
// fontes de urgência (SLA estourado, leads quentes, sem próxima ação) numa
// fila única deduplicada, ordenada pelo Score de prioridade. O primeiro item
// é a "Próxima Melhor Ação" do hero.

import { scoreLead, type ScoreTier } from "@/lib/priority";
import { formatDuracaoParado } from "@/lib/utils";

export type MissionSource = "sla" | "quente" | "sem_acao";

export type MissionQueueInput = {
  sla: Array<{
    lead_id: string;
    nome: string;
    telefone: string | null;
    status: string;
    minutos_decorridos: number;
    sla_status: string | null;
  }>;
  quentes: Array<{
    id: string;
    nome: string;
    telefone: string | null;
    status: string;
    ultima_interacao: string | null;
  }>;
  semAcao: Array<{
    id: string;
    nome: string;
    telefone: string | null;
    status: string;
    temperatura: string | null;
    ultima_interacao: string | null;
  }>;
  /** Injetável para testes determinísticos. */
  agora?: Date;
};

export type Mission = {
  leadId: string;
  nome: string;
  telefone: string | null;
  status: string;
  score: number;
  tier: ScoreTier;
  /** Frase curta que justifica a posição na fila (vira o texto do hero). */
  motivo: string;
  fontes: MissionSource[];
  /** Habilita o botão "criar follow-up" (guardrail anti-perda). */
  semProximaAcao: boolean;
};

const LIMITE_FILA = 12;

export function buildMissionQueue(input: MissionQueueInput): Mission[] {
  const agora = input.agora ?? new Date();
  const porLead = new Map<string, Mission>();

  const upsert = (m: Mission) => {
    const atual = porLead.get(m.leadId);
    if (!atual) {
      porLead.set(m.leadId, m);
      return;
    }
    // Mantém o maior score e o motivo mais urgente (ordem de inserção: sla → quente → sem_acao).
    atual.fontes = [...new Set([...atual.fontes, ...m.fontes])];
    atual.semProximaAcao = atual.semProximaAcao || m.semProximaAcao;
    if (m.score > atual.score) {
      atual.score = m.score;
      atual.tier = m.tier;
    }
  };

  for (const l of input.sla) {
    if (l.sla_status !== "estourado") continue;
    const r = scoreLead({ status: l.status, slaStatus: "estourado", agora });
    upsert({
      leadId: l.lead_id,
      nome: l.nome,
      telefone: l.telefone,
      status: l.status,
      score: r.score,
      tier: r.tier,
      motivo: `SLA estourado — ${formatDuracaoParado(l.minutos_decorridos)} sem atendimento`,
      fontes: ["sla"],
      semProximaAcao: false,
    });
  }

  for (const l of input.quentes) {
    const r = scoreLead({
      temperatura: "quente",
      status: l.status,
      ultimaInteracao: l.ultima_interacao,
      agora,
    });
    upsert({
      leadId: l.id,
      nome: l.nome,
      telefone: l.telefone,
      status: l.status,
      score: r.score,
      tier: r.tier,
      motivo: `Lead quente — ${r.motivo.toLowerCase()}`,
      fontes: ["quente"],
      semProximaAcao: false,
    });
  }

  for (const l of input.semAcao) {
    const r = scoreLead({
      temperatura: l.temperatura,
      status: l.status,
      ultimaInteracao: l.ultima_interacao,
      agora,
    });
    upsert({
      leadId: l.id,
      nome: l.nome,
      telefone: l.telefone,
      status: l.status,
      score: r.score,
      tier: r.tier,
      motivo: `Sem próxima ação — ${r.motivo.toLowerCase()}`,
      fontes: ["sem_acao"],
      semProximaAcao: true,
    });
  }

  return [...porLead.values()].sort((a, b) => b.score - a.score).slice(0, LIMITE_FILA);
}

// ---------------------------------------------------------------------------
// Streak de atividade: dias consecutivos com atividade registrada, terminando
// hoje ou ontem (o dia atual ainda em curso não quebra a sequência).
// ---------------------------------------------------------------------------

export function computeStreak(diasAtivos: string[], hoje: string): number {
  const ativos = new Set(diasAtivos);
  const cursor = new Date(`${hoje}T12:00:00Z`);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  // Hoje sem atividade ainda não zera — começa a contar de ontem.
  if (!ativos.has(fmt(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let streak = 0;
  while (ativos.has(fmt(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
