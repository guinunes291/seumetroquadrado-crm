// Regras puras do painel "Hoje / Meu Dia" — extraídas da rota para ficarem
// testáveis sem mocks e centralizadas (evita espalhar regra de negócio na view).

import { scoreLead, type ScoreResult } from "@/lib/priority";

export type LeadSemAcaoInput = {
  id: string;
  nome: string;
  telefone: string | null;
  status: string; // leads.status é não-nulo no banco
  temperatura: string | null;
  proximo_followup: string | null;
  ultima_interacao: string | null;
};

export type LeadSemAcao = LeadSemAcaoInput & { _score: ScoreResult };

/**
 * Leads ATIVOS sem próximo passo: sem tarefa aberta, sem agendamento futuro e
 * sem follow-up futuro. Ordenados pelo Score de prioridade (desc). NÃO fatia —
 * o chamador decide o limite para manter contador == lista.
 */
export function filtrarSemAcao(
  leads: LeadSemAcaoInput[],
  leadIdsComTarefa: Set<string | null>,
  leadIdsComAgenda: Set<string | null>,
  agora: Date,
): LeadSemAcao[] {
  const agoraMs = agora.getTime();
  return leads
    .filter((l) => {
      if (leadIdsComTarefa.has(l.id) || leadIdsComAgenda.has(l.id)) return false;
      // Follow-up FUTURO já é um próximo passo; follow-up vencido/nulo não conta.
      if (l.proximo_followup && new Date(l.proximo_followup).getTime() > agoraMs) return false;
      return true;
    })
    .map((l) => ({
      ...l,
      _score: scoreLead({
        temperatura: l.temperatura,
        status: l.status,
        ultimaInteracao: l.ultima_interacao,
        agora,
      }),
    }))
    .sort((a, b) => b._score.score - a._score.score);
}

/** Tarefa vencida = tem prazo e o prazo já passou. */
export function tarefaAtrasada(dataVencimento: string | null, agora: Date): boolean {
  if (!dataVencimento) return false;
  const t = Date.parse(dataVencimento);
  if (Number.isNaN(t)) return false;
  return t < agora.getTime();
}

export function contarTarefasAtrasadas(
  tarefas: { data_vencimento: string | null }[],
  agora: Date,
): number {
  return tarefas.filter((t) => tarefaAtrasada(t.data_vencimento, agora)).length;
}

export type AtividadeRow = {
  ligacoes: number;
  whatsapps: number;
  agendamentos: number;
  visitas: number;
  documentacoes: number;
  vendas: number;
  vgv_dia: number | string;
  pontuacao_total: number;
};

export type Totais = {
  ligacoes: number;
  whatsapps: number;
  agendamentos: number;
  visitas: number;
  documentacoes: number;
  vendas: number;
  vgv: number;
  pontos: number;
};

/** Soma as linhas diárias do período em totais únicos. */
export function somarAtividades(rows: AtividadeRow[]): Totais {
  const acc: Totais = {
    ligacoes: 0,
    whatsapps: 0,
    agendamentos: 0,
    visitas: 0,
    documentacoes: 0,
    vendas: 0,
    vgv: 0,
    pontos: 0,
  };
  for (const r of rows) {
    acc.ligacoes += r.ligacoes ?? 0;
    acc.whatsapps += r.whatsapps ?? 0;
    acc.agendamentos += r.agendamentos ?? 0;
    acc.visitas += r.visitas ?? 0;
    acc.documentacoes += r.documentacoes ?? 0;
    acc.vendas += r.vendas ?? 0;
    acc.vgv += Number(r.vgv_dia) || 0;
    acc.pontos += r.pontuacao_total ?? 0;
  }
  return acc;
}

/** Só os dígitos do telefone — "" quando não há número discável. */
export function telDigits(telefone: string | null | undefined): string {
  return (telefone ?? "").replace(/\D/g, "");
}
