// Visão geral da Gestão — lógica PURA que transforma as métricas por corretor
// nos dois artefatos que o gestor precisa ao abrir a tela:
//   1. resumo da operação (totais acionáveis)
//   2. "quem precisa de ajuda" — corretores ranqueados por sinais de risco
// Dados vêm dos RPCs já existentes (dashboard_metricas_por_corretor,
// dashboard_leads_urgentes, tempo_primeira_resposta) — zero migration.

export type MetricaCorretor = {
  corretor_id: string;
  nome: string;
  leads: number;
  agendamentos: number;
  visitas: number;
  analise: number;
  fechados: number;
  perdidos: number;
  conversao: number;
};

export type LeadUrgente = {
  lead_id: string;
  corretor_id: string | null;
  corretor_nome: string;
  minutos_parado: number;
};

export type TempoResposta = {
  corretor_id: string;
  tempo_medio_min: number;
  leads_respondidos: number;
};

export type ResumoOperacao = {
  leads: number;
  vendas: number;
  conversaoMedia: number;
  paradosAgora: number;
  corretoresAtivos: number;
};

export function resumoOperacao(
  porCorretor: MetricaCorretor[],
  urgentes: LeadUrgente[],
): ResumoOperacao {
  const leads = porCorretor.reduce((a, c) => a + c.leads, 0);
  const vendas = porCorretor.reduce((a, c) => a + c.fechados, 0);
  const comLeads = porCorretor.filter((c) => c.leads > 0);
  const conversaoMedia = leads > 0 ? (vendas / leads) * 100 : 0;
  return {
    leads,
    vendas,
    conversaoMedia,
    paradosAgora: urgentes.length,
    corretoresAtivos: comLeads.length,
  };
}

export type CorretorEmRisco = {
  corretorId: string;
  nome: string;
  /** Sinais legíveis — viram chips na UI. */
  motivos: string[];
  parados: number;
  conversao: number;
  tempoMedioMin: number | null;
  /** Quanto maior, mais urgente a intervenção. */
  risco: number;
};

/**
 * Ranqueia corretores por necessidade de intervenção. Sinais (aditivos):
 * - leads parados sem 1º atendimento (peso maior — dinheiro evaporando agora)
 * - conversão bem abaixo da média do time (com amostra mínima)
 * - tempo médio de 1ª resposta alto
 */
export function quemPrecisaDeAjuda(input: {
  porCorretor: MetricaCorretor[];
  urgentes: LeadUrgente[];
  tempoResposta: TempoResposta[];
}): CorretorEmRisco[] {
  const paradosPor = new Map<string, number>();
  for (const u of input.urgentes) {
    if (!u.corretor_id) continue;
    paradosPor.set(u.corretor_id, (paradosPor.get(u.corretor_id) ?? 0) + 1);
  }
  const tempoPor = new Map(input.tempoResposta.map((t) => [t.corretor_id, t]));

  const comAmostra = input.porCorretor.filter((c) => c.leads >= 5);
  const mediaConversao =
    comAmostra.length > 0 ? comAmostra.reduce((a, c) => a + c.conversao, 0) / comAmostra.length : 0;

  const out: CorretorEmRisco[] = [];
  for (const c of input.porCorretor) {
    const motivos: string[] = [];
    let risco = 0;

    const parados = paradosPor.get(c.corretor_id) ?? 0;
    if (parados > 0) {
      risco += Math.min(60, parados * 15);
      motivos.push(`${parados} lead(s) parados sem atendimento`);
    }

    if (c.leads >= 5 && mediaConversao > 0 && c.conversao < mediaConversao * 0.5) {
      risco += 25;
      motivos.push(`conversão ${c.conversao.toFixed(1)}% (time: ${mediaConversao.toFixed(1)}%)`);
    }

    const tempo = tempoPor.get(c.corretor_id);
    if (tempo && tempo.leads_respondidos >= 3 && tempo.tempo_medio_min > 60) {
      risco += 15;
      motivos.push(`1ª resposta em ${Math.round(tempo.tempo_medio_min)}min`);
    }

    if (risco > 0) {
      out.push({
        corretorId: c.corretor_id,
        nome: c.nome,
        motivos,
        parados,
        conversao: c.conversao,
        tempoMedioMin: tempo?.tempo_medio_min ?? null,
        risco,
      });
    }
  }

  return out.sort((a, b) => b.risco - a.risco).slice(0, 8);
}
