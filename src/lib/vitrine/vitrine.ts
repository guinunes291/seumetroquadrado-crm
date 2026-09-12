// Situação comercial do empreendimento: a derivação de "Pronto / Em obras /
// Lançamento" a partir do texto livre de entrega, e o rótulo curto do badge.
//
// Vive separado porque três telas dependem da MESMA leitura — Mapa de Mercado,
// prateleira e projetos em foco. Os filtros do mapa moram em `mercado.ts`, que
// trabalha sobre o modelo mesclado (CRM + planilha), não sobre `ProjetoRow`.

import type { ProjetoRow } from "@/components/projeto-card";

export type Situacao = "Pronto" | "Em obras" | "Lançamento" | "A confirmar";

export const SITUACOES: Situacao[] = ["Pronto", "Em obras", "Lançamento", "A confirmar"];

/**
 * Situação comercial do empreendimento a partir do texto livre de entrega e do
 * ano previsto. Prioriza sinais explícitos ("pronto", "lançamento") e trata
 * "tem data futura" como obra em andamento.
 */
export function deriveSituacao(p: ProjetoRow): Situacao {
  const txt = `${p.status_entrega ?? ""} ${p.entrega_status ?? ""}`.toLowerCase();
  if (/pronto|entregue|habite-?se/.test(txt)) return "Pronto";
  if (/lan[çc]/.test(txt)) return "Lançamento";
  if (/obra|constru/.test(txt) || p.ano_entrega != null || p.mes_entrega != null) return "Em obras";
  return "A confirmar";
}

/** Rótulo curto de entrega para o badge do card ("Entrega 06/2028", "Pronto"…). */
export function entregaBadge(p: ProjetoRow): string {
  const sit = deriveSituacao(p);
  if (sit === "Em obras" && p.ano_entrega) {
    const mm = p.mes_entrega ? `${String(p.mes_entrega).padStart(2, "0")}/` : "";
    return `Entrega ${mm}${p.ano_entrega}`;
  }
  return sit;
}
