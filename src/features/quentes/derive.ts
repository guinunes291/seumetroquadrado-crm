// Negociações quentes (referência de 2026-10, "Hot deals"): os leads mais perto
// de virar venda, para o gestor empurrar o que fecha o mês. Puro e testável:
// a consulta mora em queries.ts, a tela em negociacoes-quentes.tsx.
//
// O CRM não guarda valor de negócio no lead — o cartão mostra o que existe
// (etapa, cliente, empreendimento, próximo passo, tempo parado) e, quando o
// projeto tem preço, o "a partir de" como estimativa declarada, no mesmo
// critério do "R$ em risco" do Painel do Dia.

import { diasDesde, scoreLead, type ScoreResult } from "@/lib/priority";

/** Etapas "perto de fechar", da mais próxima da venda para a mais distante. */
export const ETAPAS_QUENTES = ["analise_credito", "proposta_enviada", "visita_realizada"] as const;
export type EtapaQuente = (typeof ETAPAS_QUENTES)[number];

export type LeadQuenteRow = {
  id: string;
  nome: string;
  status: EtapaQuente;
  temperatura: string | null;
  ultima_interacao: string | null;
  created_at: string;
  proximo_followup: string | null;
  projeto_nome: string | null;
  corretor_id: string | null;
  preco_a_partir: number | null;
};

export type LeadQuente = LeadQuenteRow & {
  score: ScoreResult;
  diasParado: number | null;
};

/**
 * Ordena por proximidade da venda e, dentro da etapa, pelo score de
 * prioridade (o mesmo do anel da ficha: quente, parado, sem contato sobem).
 * A etapa vem antes do score porque PESO_ETAPA — espelhado no banco pela
 * Higiene do Funil — ainda não pesa `proposta_enviada`; pelo score puro, uma
 * proposta enviada cairia abaixo de uma visita.
 */
export function rankearQuentes(rows: LeadQuenteRow[], agora: Date, limite = 6): LeadQuente[] {
  const ordemEtapa = (s: EtapaQuente) => ETAPAS_QUENTES.indexOf(s);
  return rows
    .map((r) => ({
      ...r,
      score: scoreLead({
        temperatura: r.temperatura,
        status: r.status,
        ultimaInteracao: r.ultima_interacao,
        agora,
      }),
      diasParado: diasDesde(r.ultima_interacao ?? r.created_at, agora),
    }))
    .sort(
      (a, b) =>
        ordemEtapa(a.status) - ordemEtapa(b.status) ||
        b.score.score - a.score.score ||
        // O score satura em 5 dias sem contato: no empate, o mais parado primeiro.
        (b.diasParado ?? 0) - (a.diasParado ?? 0) ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    )
    .slice(0, limite);
}

/** "Follow-up 30/10", "Follow-up hoje" ou "Follow-up atrasado" — o próximo passo combinado. */
export function rotuloFollowup(iso: string | null, agora: Date): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const delta = Math.round((dia(t) - dia(agora)) / 86_400_000);
  if (delta < 0) return "Follow-up atrasado";
  if (delta === 0) return "Follow-up hoje";
  return `Follow-up ${t.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
}
