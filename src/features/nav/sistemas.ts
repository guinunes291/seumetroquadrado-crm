// Registro ÚNICO dos sistemas do CRM — fonte de verdade da navegação.
// Cada card do hub /inicio é um sistema completo (estilo Dommus): tem home,
// seções (a sidebar contextual mostra só as do sistema ativo) e regra de
// papel. Consomem este registro: o hub (inicio-page), a sidebar (app-sidebar),
// o command palette e os testes (tests/sistemas.test.ts).
//
// Este desenho SUPERSEDE a IA da auditoria ux-ia-2026-08 ("teto de 7 botões"
// num menu global): o teto agora vale por sistema — cada sistema tem ≤6
// seções planas, e o nível de cima virou o hub de módulos.
//
// Arquivo puro (sem React) de propósito: os filtros e o resolvedor de sistema
// ativo são funções puras testáveis.

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarClock,
  Headset,
  Hourglass,
  LineChart,
  Link2,
  Map,
  MapPinned,
  Megaphone,
  MessageCircle,
  Phone,
  PhoneOutgoing,
  Repeat,
  Settings,
  Shuffle,
  Sparkles,
  Star,
  Sun,
  Target,
  Trello,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import type { AppRole } from "@/hooks/use-auth";
import type { NavBadges } from "@/features/nav/use-nav-badges";

export type Destino = { to: string; search?: Record<string, string> };

export type Secao = {
  id: string;
  label: string;
  icon: LucideIcon;
  to: string;
  /** Match ESTRITO na ativação: a seção só acende com o param presente. */
  search?: Record<string, string>;
  /** Ausente = todos os papéis. Sem papel, a seção some do menu. */
  roles?: AppRole[];
  badge?: (b: NavBadges) => number;
  badgeRoles?: AppRole[];
};

export type SistemaId =
  | "central-comando"
  | "prospeccao"
  | "atendimento-central"
  | "carteira"
  | "follow-up"
  | "financeiro"
  | "docs-projetos"
  | "bi"
  | "configuracoes";

export type Sistema = {
  id: SistemaId;
  titulo: string;
  /** Uma frase curta — o card corta em duas linhas (line-clamp-2). */
  descricao: string;
  icon: LucideIcon;
  /** Destino do card no hub (padrão). */
  home: Destino;
  /** Home dependente do papel — só o BI usa (gestão cai no painel). */
  homePorPapel?: (ctx: PapelCtx) => Destino;
  /** Gate explícito do sistema inteiro (só Configurações usa; nos demais a
   *  visibilidade deriva das seções). */
  roles?: AppRole[];
  badge?: (b: NavBadges) => number;
  badgeRoles?: AppRole[];
  grupo: "operacao" | "gestao";
  /** Card-herói do grid (ocupa duas colunas). */
  destaque?: boolean;
  /** Prefixos de rota reivindicados sem seção própria (ex.: /pipeline cru,
   *  que é o quadro completo e pertence à Carteira). */
  dominioExtra?: string[];
  secoes: Secao[];
};

const GESTAO: AppRole[] = ["admin", "gestor", "superintendente"];

export const SISTEMAS: Sistema[] = [
  {
    id: "central-comando",
    titulo: "Central de Comando",
    descricao: "Seu dia em ordem de prioridade: próxima melhor ação, agenda e metas num só lugar.",
    icon: Sun,
    home: { to: "/hoje" },
    grupo: "operacao",
    destaque: true,
    secoes: [{ id: "hoje", label: "Hoje", icon: Sun, to: "/hoje" }],
  },
  {
    id: "prospeccao",
    titulo: "Prospecção",
    descricao: "O volumão do topo do funil: entrada de leads, primeiro contato e qualificação.",
    icon: Users,
    home: { to: "/pipeline", search: { fase: "prospeccao" } },
    // nav_pendencias.atendimento conta `aguardando_atendimento` — literalmente
    // uma etapa de Prospecção, por isso o contador vive neste card.
    badge: (b) => b.atendimento,
    grupo: "operacao",
    secoes: [
      {
        id: "funil-entrada",
        label: "Funil de entrada",
        icon: Trello,
        to: "/pipeline",
        search: { fase: "prospeccao" },
      },
      // A base completa (kanban/lista, ações em massa, importação) é a mesa de
      // triagem da entrada; a consulta da carteira segue viva em Carteira via
      // /atendimento?modo=consulta. Custo consciente do v1: a ficha de um lead
      // de carteira (/leads/$leadId) acende a sidebar de Prospecção — quando
      // doer, o caminho é resolver o sistema pela etapa do lead, não pelo path.
      { id: "base-leads", label: "Base de leads", icon: Users, to: "/leads" },
      {
        id: "distribuicao",
        label: "Distribuição",
        icon: Shuffle,
        to: "/distribuicao",
        roles: ["admin", "gestor"],
      },
      {
        id: "captacao",
        label: "Captação (Landing)",
        icon: Megaphone,
        to: "/leads-landing",
        roles: ["admin", "gestor"],
      },
    ],
  },
  {
    id: "atendimento-central",
    titulo: "Central de Atendimento",
    descricao: "Central multicanal: conversas de WhatsApp, discador e campanhas de oferta ativa.",
    icon: Headset,
    home: { to: "/mensagens" },
    grupo: "operacao",
    secoes: [
      { id: "mensagens", label: "Mensagens", icon: MessageCircle, to: "/mensagens" },
      { id: "discador", label: "Discador", icon: Phone, to: "/discador" },
      { id: "oferta-ativa", label: "Oferta Ativa", icon: PhoneOutgoing, to: "/oferta-ativa" },
    ],
  },
  {
    id: "carteira",
    titulo: "Gestão de Carteira",
    descricao:
      "Só quem está avançando: conversas ativas, visitas, análise de crédito e fechamento.",
    icon: Briefcase,
    home: { to: "/pipeline", search: { fase: "carteira" } },
    badge: (b) => b.tarefasVencidas + b.agendaHoje,
    grupo: "operacao",
    // Dona do /pipeline cru: bookmark antigo = quadro completo, sidebar da
    // Carteira (é onde o Fechamento vive).
    dominioExtra: ["/pipeline"],
    secoes: [
      {
        id: "funil-carteira",
        label: "Funil da carteira",
        icon: Trello,
        to: "/pipeline",
        search: { fase: "carteira" },
      },
      {
        id: "fechamento",
        label: "Modo Fechamento",
        icon: Target,
        to: "/pipeline",
        search: { tab: "fechamento" },
      },
      {
        id: "atender",
        label: "Atender",
        icon: Headset,
        to: "/atendimento",
        badge: (b) => b.atendimento + b.tarefasVencidas,
      },
      {
        id: "agenda",
        label: "Agenda & Tarefas",
        icon: CalendarClock,
        to: "/agendamentos",
        badge: (b) => b.agendaHoje,
      },
      { id: "modo-visita", label: "Modo Visita", icon: MapPinned, to: "/modo-visita" },
      { id: "match", label: "Match IA", icon: Sparkles, to: "/match" },
    ],
  },
  {
    id: "follow-up",
    titulo: "Follow-Up",
    descricao:
      "A régua dos 13 toques: quem tocar hoje, com mensagem pronta e contador por cliente.",
    icon: Repeat,
    home: { to: "/follow-up" },
    // nav_pendencias.followups = tarefas de contato de hoje + vencidas — o
    // número que o corretor precisa zerar.
    badge: (b) => b.followups,
    grupo: "operacao",
    secoes: [
      {
        id: "fila",
        label: "Fila do dia",
        icon: Repeat,
        to: "/follow-up",
        badge: (b) => b.followups,
      },
      {
        id: "esgotados",
        label: "Esgotados (13/13)",
        icon: Hourglass,
        to: "/follow-up",
        search: { tab: "esgotados" },
      },
      {
        id: "kpis",
        label: "Curva de resposta",
        icon: LineChart,
        to: "/follow-up",
        search: { tab: "kpis" },
      },
      {
        id: "cobertura",
        label: "Cobertura do time",
        icon: Users,
        to: "/follow-up",
        search: { tab: "cobertura" },
        roles: GESTAO,
      },
    ],
  },
  {
    id: "financeiro",
    titulo: "Assinaturas & Comissões",
    descricao: "Fechamento de vendas, comissões e aprovações — cada papel vê o seu recorte.",
    icon: Wallet,
    home: { to: "/financeiro", search: { tab: "comissoes" } },
    badge: (b) => b.aprovacoes,
    badgeRoles: GESTAO,
    grupo: "operacao",
    secoes: [
      // As abas internas (fechamento|comissoes|dre) são o segundo nível; o
      // guard por aba do /financeiro já recorta por papel.
      {
        id: "financeiro",
        label: "Fechamento, Comissões & DRE",
        icon: Wallet,
        to: "/financeiro",
      },
    ],
  },
  {
    id: "docs-projetos",
    titulo: "Documentação & Projetos",
    descricao: "Tudo dos empreendimentos: books, tabelas, catálogo, mapa e materiais.",
    icon: Building2,
    home: { to: "/projetos-foco" },
    grupo: "operacao",
    secoes: [
      { id: "projetos-foco", label: "Projetos em Foco", icon: Star, to: "/projetos-foco" },
      { id: "catalogo", label: "Catálogo completo", icon: Building2, to: "/projetos" },
      { id: "vitrine", label: "Vitrine (mapa)", icon: Map, to: "/vitrine" },
      { id: "links-uteis", label: "Links Úteis", icon: Link2, to: "/links-uteis" },
      {
        id: "materiais",
        label: "Materiais (gestão)",
        icon: Megaphone,
        to: "/projetos-materiais",
        roles: ["admin", "gestor"],
      },
    ],
  },
  {
    id: "bi",
    titulo: "BI — Relatórios",
    descricao: "Relatórios e indicadores: seu Raio-X individual e os painéis da operação.",
    icon: LineChart,
    home: { to: "/meu-raio-x" },
    homePorPapel: (ctx) =>
      temPapel(GESTAO, ctx) ? { to: "/painel-gestor" } : { to: "/meu-raio-x" },
    grupo: "operacao",
    secoes: [
      { id: "meu-raio-x", label: "Meu Raio-X", icon: LineChart, to: "/meu-raio-x" },
      { id: "desempenho", label: "Desempenho", icon: Trophy, to: "/ranking" },
      {
        id: "operacao",
        label: "Operação",
        icon: BarChart3,
        to: "/painel-gestor",
        roles: GESTAO,
      },
    ],
  },
  {
    id: "configuracoes",
    titulo: "Configurações",
    descricao: "Integrações, pessoas, estoque e preferências da conta.",
    icon: Settings,
    home: { to: "/configuracoes" },
    roles: ["admin"],
    grupo: "gestao",
    secoes: [],
  },
];

export type PapelCtx = { roles: AppRole[]; isAdmin: boolean };

/** Mesma regra da sidebar desde sempre: admin enxerga tudo. */
export function temPapel(permitidos: AppRole[] | undefined, ctx: PapelCtx): boolean {
  if (!permitidos) return true;
  if (ctx.isAdmin) return true;
  return permitidos.some((r) => ctx.roles.includes(r));
}

export function secoesVisiveis(sistema: Sistema, ctx: PapelCtx): Secao[] {
  return sistema.secoes.filter((s) => temPapel(s.roles, ctx));
}

/** Sistema visível se o papel passa no gate E alguma seção é visível
 *  (sistema sem seções, como Configurações, decide só pelo gate). */
export function sistemaVisivel(sistema: Sistema, ctx: PapelCtx): boolean {
  if (!temPapel(sistema.roles, ctx)) return false;
  if (sistema.secoes.length === 0) return true;
  return secoesVisiveis(sistema, ctx).length > 0;
}

export function sistemasVisiveis(ctx: PapelCtx, lista: Sistema[] = SISTEMAS): Sistema[] {
  return lista.filter((s) => sistemaVisivel(s, ctx));
}

/** 0 = sem badge (dados indisponíveis, papel sem a ação, ou contagem zerada). */
export function badgeDoSistema(s: Sistema, badges: NavBadges | null, ctx: PapelCtx): number {
  if (!badges || !s.badge) return 0;
  if (s.badgeRoles && !temPapel(s.badgeRoles, ctx)) return 0;
  return s.badge(badges);
}

export function badgeDaSecao(s: Secao, badges: NavBadges | null, ctx: PapelCtx): number {
  if (!badges || !s.badge) return 0;
  if (s.badgeRoles && !temPapel(s.badgeRoles, ctx)) return 0;
  return s.badge(badges);
}

export function homeDoSistema(s: Sistema, ctx: PapelCtx): Destino {
  return s.homePorPapel?.(ctx) ?? s.home;
}

/** Search do link de uma seção, preservando o contexto da URL atual: entrar
 *  no Modo Fechamento estando na fase Carteira mantém `fase=carteira` — sem
 *  isso, voltar à aba Funil cairia no quadro completo. Em Prospecção (ou sem
 *  fase) nada é injetado: a fase não tem aba Fechamento. */
export function searchDaSecao(
  secao: Secao,
  atual: Record<string, unknown>,
): Record<string, string> | undefined {
  if (
    secao.to === "/pipeline" &&
    secao.search?.tab === "fechamento" &&
    String(atual.fase) === "carteira"
  ) {
    return { ...secao.search, fase: "carteira" };
  }
  return secao.search;
}

// ---------------------------------------------------------------------------
// Resolução do sistema ativo a partir da rota (pathname + search)
// ---------------------------------------------------------------------------

export type Loc = { pathname: string; search: Record<string, unknown> };

/** Fronteira de segmento: /leads casa /leads/abc mas NÃO /leads-landing. */
function pathCasa(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(to + "/");
}

/** Match estrito: toda chave de search da seção precisa estar presente e
 *  igual na URL. Seção sem search casa qualquer search. */
function searchCasa(secao: Secao, search: Record<string, unknown>): boolean {
  if (!secao.search) return true;
  return Object.entries(secao.search).every(([k, v]) => String(search[k]) === v);
}

type Candidata = { sistema: Sistema; secao: Secao; chaves: number; temTab: boolean };

function candidatas(loc: Loc, lista: Sistema[]): Candidata[] {
  const out: Candidata[] = [];
  for (const sistema of lista) {
    for (const secao of sistema.secoes) {
      if (!pathCasa(loc.pathname, secao.to)) continue;
      if (!searchCasa(secao, loc.search)) continue;
      const chaves = secao.search ? Object.keys(secao.search).length : 0;
      out.push({ sistema, secao, chaves, temTab: !!secao.search && "tab" in secao.search });
    }
  }
  return out;
}

/** Ranking: mais chaves de search casadas > chave de VISÃO (`tab`) > declaração.
 *  O `tab` desempata porque escolhe a visão renderizada (ex.: /pipeline com
 *  fase E tab=fechamento mostra o Fechamento, não o funil). */
function melhorCandidata(cands: Candidata[]): Candidata | null {
  if (cands.length === 0) return null;
  return cands.reduce((melhor, c) => {
    if (c.chaves !== melhor.chaves) return c.chaves > melhor.chaves ? c : melhor;
    if (c.temTab !== melhor.temTab) return c.temTab ? c : melhor;
    return melhor; // empate total: primeira declarada vence
  });
}

export function sistemaAtivo(loc: Loc, lista: Sistema[] = SISTEMAS): Sistema | null {
  const melhor = melhorCandidata(candidatas(loc, lista));
  if (melhor) return melhor.sistema;

  // Sem seção casando: domínio extra por prefixo mais longo.
  let dono: Sistema | null = null;
  let maior = -1;
  for (const sistema of lista) {
    for (const prefixo of sistema.dominioExtra ?? []) {
      if (pathCasa(loc.pathname, prefixo) && prefixo.length > maior) {
        dono = sistema;
        maior = prefixo.length;
      }
    }
  }
  return dono;
}

/** Seção acesa na sidebar do sistema ativo (null = nenhuma; ex.: /pipeline
 *  cru dentro da Carteira — o quadro completo não é nenhuma das duas fases). */
export function secaoAtiva(sistema: Sistema, loc: Loc): Secao | null {
  return melhorCandidata(candidatas(loc, [sistema]))?.secao ?? null;
}
