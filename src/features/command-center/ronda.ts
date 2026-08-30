// Ronda do dia (auditoria das abas laterais, 2026-08-27): a ronda do gestor é
// transversal — entrada, régua de follow-up e aprovações moram FORA do
// /painel-gestor, e nenhuma tela indexava o circuito completo. Este módulo
// deriva, dos badges já existentes do nav (useNavBadges — nenhuma RPC nova),
// os itens ACIONÁVEIS da ronda para o hero de gestão da /hoje.
//
// Trava anti-"menu global" (verificador de produto): item só existe com
// contador > 0. Com tudo zerado a função devolve [] e a UI não renderiza
// NADA extra — a ronda nunca vira uma lista estática de links.

import type { NavBadges } from "@/features/nav/use-nav-badges";

export type RondaItem = {
  id: "aprovacoes" | "followups" | "atendimento";
  /** Rótulo já flexionado pelo contador — o número é renderizado ao lado. */
  label: string;
  /** Contexto no hover: de onde vem o número e para onde o clique leva. */
  descricao: string;
  count: number;
  /** Mesma escala de severidade dos chips de exceção do widget. */
  intent: "danger" | "warning" | "info";
  to: string;
  search?: Record<string, string>;
};

/**
 * Itens da ronda com contador > 0, na ordem da ronda descrita pelo gestor:
 * aprovações (destrava dinheiro do time) → régua (cobertura do follow-up) →
 * entrada (lead esperando distribuição).
 *
 * Os números já chegam recortados por papel (nav_pendencias é SECURITY
 * INVOKER) e o widget que consome isto só monta para gestão — aqui não há
 * gate de papel a refazer. /distribuicao aceita os três papéis de gestão
 * (superintendente entra somente-leitura; a rota resolve).
 */
export function buildRondaItems(badges: NavBadges | null): RondaItem[] {
  // Sem badges (RPC ausente/carregando) a ronda some inteira — mesmo
  // comportamento dos badges da sidebar: nada quebra, nada mente.
  if (!badges) return [];

  const itens: RondaItem[] = [];

  if (badges.aprovacoes > 0) {
    itens.push({
      id: "aprovacoes",
      count: badges.aprovacoes,
      label:
        badges.aprovacoes === 1 ? "aprovação de venda pendente" : "aprovações de venda pendentes",
      descricao: "Vendas aguardando aprovação — abre Dinheiro › Comissões.",
      intent: "warning",
      to: "/financeiro",
      search: { tab: "comissoes" },
    });
  }

  if (badges.followups > 0) {
    itens.push({
      id: "followups",
      count: badges.followups,
      label: badges.followups === 1 ? "toque de follow-up do time" : "toques de follow-up do time",
      descricao: "Toques de hoje + vencidos — abre a Cobertura do Follow-Up.",
      intent: "info",
      to: "/follow-up",
      search: { tab: "cobertura" },
    });
  }

  if (badges.atendimento > 0) {
    itens.push({
      id: "atendimento",
      count: badges.atendimento,
      label:
        badges.atendimento === 1
          ? "lead na entrada aguardando atendimento"
          : "leads na entrada aguardando atendimento",
      descricao: "Entrada sem dono — abre a Central de Distribuição.",
      intent: "danger",
      to: "/distribuicao",
    });
  }

  return itens;
}
