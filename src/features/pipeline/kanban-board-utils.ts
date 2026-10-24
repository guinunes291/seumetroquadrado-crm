// Quadro Kanban — colunas, regras de exibição do cartão e agrupamento dos
// leads por coluna.
// Recortado de src/components/leads-kanban-board.tsx sem mudança de comportamento.

import { FUNNEL_STAGES, LEAD_STATUS_LABEL, LEAD_STATUS_COLUMN_TONE } from "@/lib/leads";
import type { PeekLead } from "@/features/leads/lead-peek-drawer";
import type { Lead } from "./queries";

export const ALL_COLUMNS = FUNNEL_STAGES.map((id) => ({
  id,
  label: LEAD_STATUS_LABEL[id],
  tone: LEAD_STATUS_COLUMN_TONE[id],
}));
export type KanbanColumn = (typeof ALL_COLUMNS)[number];

// Dias sem interação — o sinal de urgência do card. Só vale para etapas
// "vivas" (mesma regra do badge de inatividade da listagem).
const ETAPAS_SEM_INATIVIDADE = ["novo", "contrato_fechado", "perdido", "pos_venda"];
export function diasParado(lead: {
  status: string;
  ultima_interacao: string | null;
  created_at: string;
}) {
  if (ETAPAS_SEM_INATIVIDADE.includes(lead.status)) return 0;
  const ref = lead.ultima_interacao ?? lead.created_at;
  if (!ref) return 0;
  // Timestamp futuro (dado sujo/importação) não pode virar "-1d" no card.
  return Math.max(0, Math.floor((Date.now() - new Date(ref).getTime()) / 86400000));
}

/** "Registrar contato" → "registrar contato", para ler em "próximo passo: …". */
export function primeiraMinuscula(texto: string): string {
  return texto.charAt(0).toLowerCase() + texto.slice(1);
}

// O drawer não carrega os campos financeiros (renda/entrada/FGTS) — a página
// da etapa é enxuta de propósito. Defaults neutros satisfazem o PeekLead
// estrutural sem alargar o payload do quadro.
export function toPeekLead(lead: Lead): PeekLead {
  return {
    ...lead,
    origem: lead.origem ?? "outro",
    renda_informada: null,
    entrada_disponivel: null,
    usa_fgts: null,
  };
}

/** Leads por coluna visível (Em atendimento ordenada por quem esfria primeiro). */
export function agruparPorColuna(leads: Lead[], columns: readonly KanbanColumn[]) {
  const map = new Map<string, Lead[]>();
  columns.forEach((c) => map.set(c.id, []));
  // O servidor já filtra via `_query` (debounced) na página da etapa e no
  // snapshot. Refiltrar aqui com o texto cru era mais restrito (só nome e
  // telefone, sem unaccent) e dessincronizava os cards dos contadores.
  (leads ?? []).forEach((l) => {
    map.get(l.status)?.push(l);
  });
  // Em "Em atendimento", quem está há mais tempo sem interação sobe pro topo
  // — o corretor ataca primeiro quem está esfriando. Sem interação registrada
  // (recém-iniciado) cai pro fim da coluna. Fallback: created_at.
  const emAtend = map.get("em_atendimento");
  if (emAtend) {
    emAtend.sort((a, b) => {
      const ta = a.ultima_interacao ? Date.parse(a.ultima_interacao) : NaN;
      const tb = b.ultima_interacao ? Date.parse(b.ultima_interacao) : NaN;
      if (Number.isNaN(ta) && Number.isNaN(tb))
        return Date.parse(a.created_at) - Date.parse(b.created_at);
      if (Number.isNaN(ta)) return 1;
      if (Number.isNaN(tb)) return -1;
      return ta - tb;
    });
  }
  return map;
}
