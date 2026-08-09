// Lógica pura da Tela 4 (Time): o cruzamento esforço × conversão que
// transforma a tabela em decisão de gestão — quem precisa de mentoria
// (esforço alto, conversão baixa) e quem está subaproveitado (esforço
// baixo, conversão alta).

import { formatDuration } from "@/lib/duracao";
import type { PerformanceRow } from "./queries";

export type SinalCorretor = "mentoria" | "dar_mais_lead" | null;

export type MediasTime = {
  contatosMedio: number;
  conversaoMedia: number; // vendas / leads_recebidos (%)
};

const AMOSTRA_MINIMA_LEADS = 5;

export function mediasDoTime(rows: PerformanceRow[]): MediasTime {
  const comLeads = rows.filter((r) => r.leads_recebidos >= AMOSTRA_MINIMA_LEADS);
  if (comLeads.length === 0) return { contatosMedio: 0, conversaoMedia: 0 };
  const contatos = comLeads.reduce((s, r) => s + r.contatos, 0) / comLeads.length;
  const leads = comLeads.reduce((s, r) => s + r.leads_recebidos, 0);
  const vendas = comLeads.reduce((s, r) => s + r.vendas, 0);
  return {
    contatosMedio: contatos,
    conversaoMedia: leads > 0 ? (vendas / leads) * 100 : 0,
  };
}

export function conversaoPct(r: PerformanceRow): number | null {
  if (r.leads_recebidos < AMOSTRA_MINIMA_LEADS) return null;
  return Math.round((r.vendas / r.leads_recebidos) * 1000) / 10;
}

/**
 * Sinaliza o cruzamento esforço × conversão vs a média do time. Amostra
 * pequena (<5 leads) nunca gera sinal — evita acusar/premiar por ruído.
 */
export function sinalizar(r: PerformanceRow, medias: MediasTime): SinalCorretor {
  const conv = conversaoPct(r);
  if (conv === null || medias.conversaoMedia <= 0 || medias.contatosMedio <= 0) return null;
  const esforcoAlto = r.contatos >= medias.contatosMedio * 1.2;
  const esforcoBaixo = r.contatos <= medias.contatosMedio * 0.8;
  const convBaixa = conv <= medias.conversaoMedia * 0.5;
  const convAlta = conv >= medias.conversaoMedia * 1.5;
  if (esforcoAlto && convBaixa) return "mentoria";
  if (esforcoBaixo && convAlta) return "dar_mais_lead";
  return null;
}

export const SINAL_LABEL: Record<Exclude<SinalCorretor, null>, string> = {
  mentoria: "Esforço alto, conversão baixa — problema de técnica: mentoria",
  dar_mais_lead: "Esforço baixo, conversão alta — subaproveitado: dar mais lead",
};

/** Linhas planas para export XLSX da Tela 4. */
export function performanceParaExport(rows: PerformanceRow[]): Array<Record<string, unknown>> {
  return rows.map((r) => ({
    Corretor: r.nome,
    "Leads recebidos": r.leads_recebidos,
    Interações: r.interacoes,
    "Contatos reais": r.contatos,
    Agendamentos: r.agendamentos_criados,
    "Visitas realizadas": r.visitas_realizadas,
    "No-shows": r.no_shows,
    Análises: r.analises,
    "Tarefas concluídas": r.tarefas_concluidas,
    Vendas: r.vendas,
    "VGV (R$)": r.vgv,
    // O número em minutos permanece (análises externas somam/ordenam por ele);
    // a coluna hh:mm ao lado é só leitura humana.
    "1ª resposta p50 (min)": r.primeira_resposta_p50_min ?? "",
    "1ª resposta p50 (hh:mm)": formatDuration(r.primeira_resposta_p50_min),
    "Carga ativa": r.carga_ativa,
    "Capacidade (%)": r.capacidade_pct ?? "",
  }));
}
