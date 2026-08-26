// Registro dos módulos do hub "Acesso aos Módulos" (/inicio). Espelha a
// taxonomia da sidebar (NAV_ITEMS em app-sidebar.tsx): mesmos destinos e a
// mesma regra de papel — módulo sem permissão fica OCULTO, não acinzentado.
// Arquivo puro (sem React) para os filtros serem testáveis em
// tests/inicio-modulos.test.ts.

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarClock,
  Headset,
  Link2,
  Megaphone,
  MessageCircle,
  PhoneOutgoing,
  Settings,
  Shuffle,
  Star,
  Sun,
  Trello,
  Trophy,
  Wallet,
} from "lucide-react";
import type { AppRole } from "@/hooks/use-auth";
import type { NavBadges } from "@/features/nav/use-nav-badges";

export type Modulo = {
  id: string;
  titulo: string;
  /** Uma frase curta — o card corta em duas linhas (line-clamp-2). */
  descricao: string;
  icon: LucideIcon;
  to: string;
  /** Search params do destino — o card leva à ABA onde a ação vive. */
  search?: Record<string, string>;
  /** Ausente = todos os papéis. Sem papel, o módulo some do hub. */
  roles?: AppRole[];
  /** Qual contador de pendências este módulo carrega. */
  badge?: (b: NavBadges) => number;
  /** Papéis que veem o BADGE, quando diferem de quem vê o módulo. */
  badgeRoles?: AppRole[];
  grupo: "operacao" | "gestao";
  /** Card-herói do grid (ocupa duas colunas). */
  destaque?: boolean;
};

const GESTAO: AppRole[] = ["admin", "gestor", "superintendente"];

export const MODULOS: Modulo[] = [
  {
    id: "hoje",
    titulo: "Central de Comando",
    descricao: "Seu dia em ordem de prioridade: próxima melhor ação, agenda e metas num só lugar.",
    icon: Sun,
    to: "/hoje",
    grupo: "operacao",
    destaque: true,
  },
  {
    id: "atendimento",
    titulo: "Atendimento",
    descricao: "Fila de leads priorizada por urgência — atenda quem precisa de você agora.",
    icon: Headset,
    to: "/atendimento",
    badge: (b) => b.atendimento,
    grupo: "operacao",
  },
  {
    id: "mensagens",
    titulo: "Mensagens",
    descricao: "Central de conversas WhatsApp unificada, com o histórico de cada lead.",
    icon: MessageCircle,
    to: "/mensagens",
    grupo: "operacao",
  },
  {
    id: "agenda",
    titulo: "Agenda & Tarefas",
    descricao: "Visitas do dia, follow-ups e tarefas com prazo — nada escapa.",
    icon: CalendarClock,
    to: "/agendamentos",
    badge: (b) => b.agendaHoje + b.tarefasVencidas,
    grupo: "operacao",
  },
  {
    id: "pipeline",
    titulo: "Pipeline",
    descricao: "Funil completo em kanban e o Modo Fechamento para avançar negociações.",
    icon: Trello,
    to: "/pipeline",
    grupo: "operacao",
  },
  {
    id: "projetos",
    titulo: "Projetos em Foco",
    descricao: "Bancada dos empreendimentos parceiros: book, tabela e material a um clique.",
    icon: Star,
    to: "/projetos-foco",
    grupo: "operacao",
  },
  {
    id: "oferta-ativa",
    titulo: "Oferta Ativa",
    descricao: "Prospecção da base fria com listas segmentadas e campanhas de ligação.",
    icon: PhoneOutgoing,
    to: "/oferta-ativa",
    grupo: "operacao",
  },
  {
    id: "desempenho",
    titulo: "Desempenho",
    descricao: "Ranking, competições e conquistas — acompanhe a sua evolução no time.",
    icon: Trophy,
    to: "/ranking",
    grupo: "operacao",
  },
  {
    id: "links-uteis",
    titulo: "Links Úteis",
    descricao: "Books, tabelas e sistemas das construtoras para consulta rápida em campo.",
    icon: Link2,
    to: "/links-uteis",
    grupo: "operacao",
  },
  {
    id: "operacao",
    titulo: "Operação",
    descricao: "Painel do dia, relatórios, funil, time e metas da operação num só hub.",
    icon: BarChart3,
    to: "/painel-gestor",
    roles: GESTAO,
    grupo: "gestao",
  },
  {
    id: "dinheiro",
    titulo: "Dinheiro",
    descricao: "Fechamento de vendas, comissões e as aprovações pendentes da operação.",
    icon: Wallet,
    to: "/financeiro",
    search: { tab: "comissoes" },
    roles: GESTAO,
    badge: (b) => b.aprovacoes,
    badgeRoles: GESTAO,
    grupo: "gestao",
  },
  {
    id: "distribuicao",
    titulo: "Distribuição",
    descricao: "Roletas e regras de distribuição automática de leads para o time.",
    icon: Shuffle,
    to: "/distribuicao",
    roles: ["admin", "gestor"],
    grupo: "gestao",
  },
  {
    id: "captacao",
    titulo: "Captação",
    descricao: "Landing pages e campanhas de aquisição de novos leads.",
    icon: Megaphone,
    to: "/leads-landing",
    roles: ["admin", "gestor"],
    grupo: "gestao",
  },
  {
    id: "configuracoes",
    titulo: "Configurações",
    descricao: "Integrações, pessoas, estoque e preferências da conta.",
    icon: Settings,
    to: "/configuracoes",
    roles: ["admin"],
    grupo: "gestao",
  },
];

export type PapelCtx = { roles: AppRole[]; isAdmin: boolean };

/** Mesma regra do temPapel da sidebar: admin enxerga tudo. */
export function temPapel(permitidos: AppRole[] | undefined, ctx: PapelCtx): boolean {
  if (!permitidos) return true;
  if (ctx.isAdmin) return true;
  return permitidos.some((r) => ctx.roles.includes(r));
}

export function modulosVisiveis(modulos: Modulo[], ctx: PapelCtx): Modulo[] {
  return modulos.filter((m) => temPapel(m.roles, ctx));
}

/** 0 = sem badge (dados indisponíveis, papel sem a ação, ou contagem zerada). */
export function badgeDoModulo(m: Modulo, badges: NavBadges | null, ctx: PapelCtx): number {
  if (!badges || !m.badge) return 0;
  if (m.badgeRoles && !temPapel(m.badgeRoles, ctx)) return 0;
  return m.badge(badges);
}
