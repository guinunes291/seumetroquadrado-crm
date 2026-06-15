// Constantes e cálculos de performance (Fase 5)

export const LEAD_STATUS_GANHO = ["contrato_fechado", "pos_venda"] as const;
export const LEAD_STATUS_PERDIDO = ["perdido"] as const;
export const LEAD_STATUS_VISITA = [
  "visita_realizada",
  "proposta_enviada",
  "analise_credito",
  "contrato_fechado",
  "pos_venda",
] as const;
export const LEAD_STATUS_ATENDIDO = [
  "em_atendimento",
  "qualificado",
  "agendado",
  "visita_realizada",
  "proposta_enviada",
  "analise_credito",
  "contrato_fechado",
  "pos_venda",
  "perdido",
] as const;

export const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export type LeadSlim = {
  status: string;
  corretor_id?: string | null;
  created_at?: string | null;
};

export type AgendamentoSlim = {
  status: string;
  corretor_id?: string | null;
  data_inicio?: string | null;
};

export function isInPeriod(
  iso: string | null | undefined,
  ano: number,
  mes: number,
): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === ano && d.getMonth() + 1 === mes;
}

export function pct(numerador: number, denominador: number): number {
  if (!denominador) return 0;
  return Math.round((numerador / denominador) * 100);
}

export type AgentMetrics = {
  corretor_id: string;
  leads_total: number;
  leads_atendidos: number;
  visitas: number;
  vendas: number;
  perdidos: number;
  taxa_conversao: number; // vendas / leads_atendidos %
};

export function computeAgentMetrics(
  leads: LeadSlim[],
  agendamentos: AgendamentoSlim[],
  ano: number,
  mes: number,
): Map<string, AgentMetrics> {
  const out = new Map<string, AgentMetrics>();
  const get = (id: string): AgentMetrics => {
    let m = out.get(id);
    if (!m) {
      m = {
        corretor_id: id,
        leads_total: 0,
        leads_atendidos: 0,
        visitas: 0,
        vendas: 0,
        perdidos: 0,
        taxa_conversao: 0,
      };
      out.set(id, m);
    }
    return m;
  };

  for (const l of leads) {
    if (!l.corretor_id) continue;
    if (!isInPeriod(l.created_at, ano, mes)) continue;
    const m = get(l.corretor_id);
    m.leads_total++;
    if ((LEAD_STATUS_ATENDIDO as readonly string[]).includes(l.status)) m.leads_atendidos++;
    if ((LEAD_STATUS_GANHO as readonly string[]).includes(l.status)) m.vendas++;
    if ((LEAD_STATUS_PERDIDO as readonly string[]).includes(l.status)) m.perdidos++;
  }

  for (const a of agendamentos) {
    if (!a.corretor_id) continue;
    if (!isInPeriod(a.data_inicio, ano, mes)) continue;
    if (a.status === "realizado") {
      get(a.corretor_id).visitas++;
    }
  }

  for (const m of out.values()) {
    m.taxa_conversao = pct(m.vendas, m.leads_atendidos);
  }

  return out;
}

export type Ranking = AgentMetrics & { posicao: number; nome?: string };

export function rankAgents(
  metrics: Map<string, AgentMetrics>,
  nomes?: Map<string, string>,
): Ranking[] {
  return Array.from(metrics.values())
    .sort((a, b) => b.vendas - a.vendas || b.visitas - a.visitas || b.leads_atendidos - a.leads_atendidos)
    .map((m, idx) => ({ ...m, posicao: idx + 1, nome: nomes?.get(m.corretor_id) }));
}

export function progressoMeta(realizado: number, meta: number): number {
  if (!meta) return 0;
  return Math.min(100, Math.round((realizado / meta) * 100));
}
