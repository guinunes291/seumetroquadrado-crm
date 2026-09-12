// Registro ÚNICO dos sistemas do CRM — fonte de verdade da navegação.
// Cada card do hub /inicio é um sistema completo (estilo Dommus): tem home,
// seções (a sidebar contextual mostra só as do sistema ativo) e regra de
// papel. Consomem este registro: o hub (inicio-page), a sidebar (app-sidebar),
// o command palette e os testes (tests/sistemas.test.ts).
//
// Regra dos 2 menus (decisão do dono, 2026-09-11): dentro de um módulo há no
// máximo DOIS níveis de menu — (1) a sidebar do módulo, que lista só PÁGINAS,
// curta e plana, e (2) no máximo uma linha de abas internas da página. Nada de
// seção de sidebar que só repete uma aba da mesma tela, nem de hub "vitrine"
// que só reagrupa telas de outro módulo. Efeitos: o hub Comunicações saiu
// (Discador e Oferta Ativa foram para a Prospecção; Mensagens segue viva pelo
// ⌘K), a Gestão de Carteira ficou com Base de leads · Kanban · Agenda ·
// Tarefas, e o Modo Visita virou módulo próprio. Para o corretor, nenhum
// módulo do dia passa de 4 seções.
//
// Este desenho SUPERSEDE a IA da auditoria ux-ia-2026-08 ("teto de 7 botões"
// num menu global): o teto agora vale por sistema — cada sistema tem ≤6
// seções planas, e o nível de cima virou o hub de módulos.
//
// Arquivo puro (sem React) de propósito: os filtros e o resolvedor de sistema
// ativo são funções puras testáveis.

import {
  ArrowsClockwise,
  Briefcase,
  Broom,
  Buildings,
  CalendarDots,
  ChartBar,
  ChartLineUp,
  Crosshair,
  Fire,
  GearSix,
  Handshake,
  Hourglass,
  Kanban,
  Layout,
  Link,
  ListChecks,
  MapPinArea,
  MapTrifold,
  Megaphone,
  Phone,
  PhoneOutgoing,
  Shuffle,
  Star,
  SunHorizon,
  Target,
  Trophy,
  UsersThree,
  Wallet,
  WhatsappLogo,
  type Icon as IconComponent,
} from "@phosphor-icons/react";
import { SamiMark } from "@/components/ui/sami-mark";
import type { AppRole } from "@/hooks/use-auth";
import type { CorModulo } from "@/features/nav/cores-modulo";
import type { NavBadges } from "@/features/nav/use-nav-badges";
import { CARTEIRA_STAGES, type FaseFunil } from "@/lib/leads";

export type Destino = { to: string; search?: Record<string, string> };

export type Secao = {
  id: string;
  label: string;
  icon: IconComponent;
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
  | "carteira"
  | "visita"
  | "follow-up"
  | "financeiro"
  | "docs-projetos"
  | "bi"
  | "configuracoes"
  | "sdr";

export type Sistema = {
  id: SistemaId;
  titulo: string;
  /** Uma frase curta — o card corta em duas linhas (line-clamp-2). */
  descricao: string;
  icon: IconComponent;
  /** Destino do card no hub (padrão). */
  home: Destino;
  /** Home dependente do papel — só o BI usa (gestão cai no painel). */
  homePorPapel?: (ctx: PapelCtx) => Destino;
  /** Gate explícito do sistema inteiro (só Configurações usa; nos demais a
   *  visibilidade deriva das seções). */
  roles?: AppRole[];
  badge?: (b: NavBadges) => number;
  badgeRoles?: AppRole[];
  /** Cor fixa do módulo (identidade v3): tile no portal, cabeçalho da sidebar,
   *  header da página e badge de pendência leem daqui. Ver cores-modulo.ts. */
  cor: CorModulo;
  /** Frequência de uso no portal (decisão 2026-08-30): "operacao" é o dia do
   *  corretor (primeira dobra, na ordem do fluxo), "consulta" é referência
   *  ocasional (Docs, Financeiro, BI) e "gestao" é só admin. */
  grupo: "operacao" | "consulta" | "gestao";
  /** Card com acento dourado no grid (mesmo tamanho dos demais). */
  destaque?: boolean;
  /** Prefixos de rota reivindicados sem seção própria (ex.: /atendimento e
   *  /mensagens, que saíram do menu mas pertencem à Carteira). */
  dominioExtra?: string[];
  secoes: Secao[];
};

const GESTAO: AppRole[] = ["admin", "gestor", "superintendente"];

// Papéis da OPERAÇÃO de venda (2026-09-04): os hubs do dia do corretor e da
// gestão. O SDR (pré-venda) tem hub próprio e só compartilha Docs & Projetos —
// o resto seria cockpit vazio para ele (RLS não lhe mostra carteira alguma).
const OPERACAO: AppRole[] = ["admin", "gestor", "corretor", "superintendente"];
// O papel `sdr` fica fora de OPERACAO de propósito (o dia dele é o hub /sdr),
// com uma exceção: Modo Foco (Prospecção) + Base de leads (hoje na Carteira).
// Quem virou SDR vindo de corretor ainda é `corretor_id` de leads agendados e
// de base da carteira antiga e precisa continuar controlando esses
// atendimentos pelo mesmo lugar (2026-09-04). O resto das seções desses dois
// módulos (Oferta Ativa, Discador, Kanban, Agenda, Tarefas) e as seções de
// gestão ficam gated por OPERACAO — a superfície do SDR não cresceu na
// reorganização de 2026-09-11.

export const SISTEMAS: Sistema[] = [
  {
    id: "central-comando",
    titulo: "Central de Comando",
    descricao:
      "Uma lista só, na ordem em que o dinheiro está em risco: o que fazer agora e o funil das etapas.",
    icon: SunHorizon,
    home: { to: "/fila" },
    // A Fila é a carteira PESSOAL (Fatia 3 traz a visão por corretor). A
    // gestão entra pelo cockpit da operação, que já existe no Painel do
    // Gestor (aba Dia) — era o que o hero de gestão da Hoje mostrava.
    homePorPapel: (ctx) => (temPapel(GESTAO, ctx) ? { to: "/painel-gestor" } : { to: "/fila" }),
    roles: OPERACAO,
    cor: "central",
    grupo: "operacao",
    destaque: true,
    // Fila Única é a porta do módulo (2026-09-12): a página Hoje foi retirada
    // — a fila absorveu o que ela respondia (próxima ação, SLA, follow-ups) e
    // ganhou o funil das etapas. /hoje redireciona para cá.
    secoes: [{ id: "fila", label: "Fila Única", icon: ListChecks, to: "/fila" }],
  },
  {
    id: "prospeccao",
    titulo: "Prospecção",
    descricao:
      "O volumão do topo do funil: Modo Foco, Oferta Ativa e Discador para trabalhar um lead por vez.",
    icon: UsersThree,
    // Abre DIRETO no Modo Foco: o corretor escolhe a base (Aguardando
    // Atendimento / Aguardando Retorno / Em Qualificação), o sistema monta o
    // lote e o trabalho é um por um. O funil kanban e a base completa vivem
    // na Gestão de Carteira — aqui é só ferramenta de topo de funil.
    home: { to: "/prospeccao" },
    // nav_pendencias.atendimento conta `aguardando_atendimento` — literalmente
    // uma etapa de Prospecção, por isso o contador vive neste card.
    badge: (b) => b.atendimento,
    // + sdr: carteira antiga de quem virou SDR (ver nota em OPERACAO).
    roles: [...OPERACAO, "sdr"],
    cor: "prospeccao",
    grupo: "operacao",
    secoes: [
      {
        id: "modo-foco",
        label: "Modo Foco",
        icon: Crosshair,
        to: "/prospeccao",
        badge: (b) => b.atendimento,
      },
      // Regra dos 2 menus (2026-09-11): para o CORRETOR a sidebar é Modo Foco
      // + Oferta Ativa + Discador — as três ferramentas de topo de funil, e só.
      // Oferta Ativa (listas segmentadas para campanha) e Discador (PABX) vieram
      // do extinto hub Comunicações: são prospecção de base, não "comunicação".
      // Gated por OPERACAO: o SDR segue vendo só o Modo Foco (decisão de
      // 2026-09-04 preservada).
      {
        id: "oferta-ativa",
        label: "Oferta Ativa",
        icon: PhoneOutgoing,
        to: "/oferta-ativa",
        roles: OPERACAO,
      },
      { id: "discador", label: "Discador", icon: Phone, to: "/discador", roles: OPERACAO },
      // As seções de gestão continuam role-gated — invisíveis para o corretor,
      // e o único acesso de navegação da gestão a estas telas.
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
    id: "carteira",
    titulo: "Gestão de Carteira",
    descricao: "Sua carteira num só lugar: base de leads, kanban, agenda e tarefas.",
    icon: Briefcase,
    // A porta da Carteira é a Base de leads (decisão 2026-09-11): a lista
    // completa, com filtros, é a visão mais geral do que o corretor tem em
    // mãos — o Kanban é a mesma base em colunas, e Agenda/Tarefas são os
    // compromissos dela. Substitui a "porta única" Atender do item 2.7c.
    home: { to: "/leads" },
    badge: (b) => b.tarefasVencidas + b.agendaHoje,
    // O SDR só enxerga a Base de leads aqui (carteira antiga; ver nota em
    // OPERACAO) — sem Agenda/Tarefas na sidebar, o badge do card não teria
    // onde cair, por isso ele também é só da operação.
    badgeRoles: OPERACAO,
    roles: [...OPERACAO, "sdr"],
    cor: "carteira",
    grupo: "operacao",
    // Rotas vivas SEM seção própria (regra dos 2 menus): /atendimento (as
    // filas por prioridade — "Trabalhar carteira") e /mensagens (a Central de
    // Mensagens, herdada do hub Comunicações) saíram da sidebar mas continuam
    // no ⌘K (ATALHOS_EXTRAS) e na barra mobile (Atender); /match virou ação
    // dentro da ficha do lead (corte 2026-08-30).
    dominioExtra: ["/atendimento", "/mensagens", "/match"],
    secoes: [
      // A base completa (lista, ações em massa, importação). A ficha
      // (/leads/$leadId) resolve pela ETAPA do lead (sistemaAtivoContextual) —
      // o prefixo daqui é só o fallback enquanto o lead carrega.
      { id: "base-leads", label: "Base de leads", icon: UsersThree, to: "/leads" },
      // O quadro COMPLETO (todas as colunas do funil): a mesma base da lista,
      // em colunas — um lead que está na Base está no Kanban. A Reta final
      // segue como aba interna do /pipeline (o 2º menu permitido) e no ⌘K.
      { id: "kanban", label: "Kanban", icon: Kanban, to: "/pipeline", roles: OPERACAO },
      // Agenda e Tarefas viraram DUAS seções (antes: "Agenda & Tarefas" +
      // abas internas repetindo a escolha). A página esconde a própria linha
      // de abas no desktop — a sidebar é o menu.
      {
        id: "agenda",
        label: "Agenda",
        icon: CalendarDots,
        to: "/agendamentos",
        roles: OPERACAO,
        badge: (b) => b.agendaHoje,
      },
      {
        id: "tarefas",
        label: "Tarefas",
        icon: ListChecks,
        to: "/agendamentos",
        search: { tab: "tarefas" },
        roles: OPERACAO,
        badge: (b) => b.tarefasVencidas,
      },
    ],
  },
  {
    // Modo Visita virou MÓDULO (decisão 2026-09-11): é um modo de trabalho
    // inteiro — em campo, no celular, com o cliente na frente — e não uma
    // seção escondida dentro da Carteira. Um card no hub, uma tela, sem menu.
    // Sem badge de propósito: `agenda_hoje` conta TODOS os compromissos do
    // dia (visitas, reuniões, ligações) e continua da Agenda, na Carteira —
    // cada contador tem UM dono.
    id: "visita",
    titulo: "Modo Visita",
    descricao:
      "Em campo com o cliente: agenda do dia, rota, briefing do lead e o resultado da visita.",
    icon: MapPinArea,
    home: { to: "/modo-visita" },
    roles: OPERACAO,
    cor: "visita",
    grupo: "operacao",
    secoes: [{ id: "modo-visita", label: "Modo Visita", icon: MapPinArea, to: "/modo-visita" }],
  },
  {
    id: "follow-up",
    titulo: "Follow-Up",
    descricao:
      "A régua dos 13 toques: quem tocar hoje, com mensagem pronta e contador por cliente.",
    icon: ArrowsClockwise,
    home: { to: "/follow-up" },
    // nav_pendencias.followups = tarefas de contato de hoje + vencidas — o
    // número que o corretor precisa zerar.
    badge: (b) => b.followups,
    roles: OPERACAO,
    cor: "followup",
    grupo: "operacao",
    secoes: [
      {
        id: "fila",
        label: "Fila do dia",
        icon: ArrowsClockwise,
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
        icon: ChartLineUp,
        to: "/follow-up",
        search: { tab: "kpis" },
      },
      {
        id: "cobertura",
        label: "Cobertura do time",
        icon: UsersThree,
        to: "/follow-up",
        search: { tab: "cobertura" },
        roles: GESTAO,
      },
      {
        // A régua se configura ONDE se opera (padrão da Central de
        // Distribuição): quem vê a Cobertura esgotando não deveria caçar o
        // ajuste num hub admin sem link. Aba admin-only dentro do módulo.
        id: "config",
        label: "Config da régua",
        icon: GearSix,
        to: "/follow-up",
        search: { tab: "config" },
        roles: ["admin"],
      },
    ],
  },
  {
    // Pré-venda (SDR): carteira própria de base (importação, estoque,
    // devolvidos, perdidos), reaquecimento de lead parado de corretor e
    // entrega pela roleta de agendados. Só o papel sdr vê este card (admin
    // enxerga tudo, como sempre). Decisões em docs/politica-sdr-v1.md.
    id: "sdr",
    titulo: "Pré-venda (SDR)",
    descricao: "Esquente a base, qualifique e agende: o corretor recebe o lead pronto pela roleta.",
    icon: Fire,
    home: { to: "/sdr" },
    roles: ["sdr"],
    cor: "sdr",
    grupo: "operacao",
    secoes: [
      { id: "base", label: "Minha base", icon: Fire, to: "/sdr" },
      {
        id: "reaquecer",
        label: "Reaquecer (parados)",
        icon: ArrowsClockwise,
        to: "/sdr",
        search: { tab: "reaquecer" },
      },
      {
        id: "entregues",
        label: "Entregues",
        icon: Handshake,
        to: "/sdr",
        search: { tab: "entregues" },
      },
      {
        id: "agenda",
        label: "Visitas & confirmações",
        icon: CalendarDots,
        to: "/sdr",
        search: { tab: "agenda" },
      },
      {
        id: "raio-x",
        label: "Raio-X do SDR",
        icon: ChartLineUp,
        to: "/sdr",
        search: { tab: "raio-x" },
      },
    ],
  },
  {
    id: "docs-projetos",
    titulo: "Documentação & Projetos",
    descricao: "Tudo dos empreendimentos: books, tabelas, catálogo, mapa e materiais.",
    icon: Buildings,
    home: { to: "/projetos-foco" },
    cor: "projetos",
    grupo: "consulta",
    // /links-uteis saiu da sidebar (corte 2026-08-30) mas a rota segue viva
    // com dono — o acesso é o botão em Projetos em Foco e o ⌘K.
    dominioExtra: ["/links-uteis"],
    secoes: [
      { id: "projetos-foco", label: "Projetos em Foco", icon: Star, to: "/projetos-foco" },
      { id: "catalogo", label: "Catálogo completo", icon: Buildings, to: "/projetos" },
      { id: "vitrine", label: "Vitrine (mapa)", icon: MapTrifold, to: "/vitrine" },
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
    id: "financeiro",
    titulo: "Assinaturas & Comissões",
    descricao: "Fechamento de vendas, comissões e aprovações — cada papel vê o seu recorte.",
    icon: Wallet,
    home: { to: "/financeiro", search: { tab: "comissoes" } },
    badge: (b) => b.aprovacoes,
    badgeRoles: GESTAO,
    roles: OPERACAO,
    cor: "financeiro",
    grupo: "consulta",
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
    id: "bi",
    titulo: "BI — Relatórios",
    descricao: "Relatórios e indicadores: seu Raio-X individual e os painéis da operação.",
    icon: ChartLineUp,
    home: { to: "/meu-raio-x" },
    homePorPapel: (ctx) =>
      temPapel(GESTAO, ctx) ? { to: "/painel-gestor" } : { to: "/meu-raio-x" },
    roles: OPERACAO,
    cor: "bi",
    grupo: "consulta",
    secoes: [
      { id: "meu-raio-x", label: "Meu Raio-X", icon: ChartLineUp, to: "/meu-raio-x" },
      { id: "desempenho", label: "Desempenho", icon: Trophy, to: "/ranking" },
      {
        id: "operacao",
        label: "Operação",
        icon: ChartBar,
        to: "/painel-gestor",
        roles: GESTAO,
      },
      // Higiene do Funil mora no BI e não na Central de Distribuição porque a
      // pergunta que ela responde é de diagnóstico ("o que está parado e
      // custando dinheiro"), não de configuração. GESTAO: ver a carteira
      // parada dos colegas muda o clima do time, então corretor não alcança.
      {
        id: "higiene-funil",
        label: "Higiene do Funil",
        icon: Broom,
        to: "/higiene-funil",
        roles: GESTAO,
      },
    ],
  },
  {
    id: "configuracoes",
    titulo: "Configurações",
    descricao: "Integrações, pessoas, estoque e preferências da conta.",
    icon: GearSix,
    home: { to: "/configuracoes" },
    roles: ["admin"],
    cor: "config",
    grupo: "gestao",
    // As abas mais buscadas ganham endereço na sidebar e no ⌘K (antes o card
    // era mudo: 9 abas internas inalcançáveis pela navegação). A seção
    // Integrações, sem search, é dona do /configuracoes cru — o card deixa de
    // abrir uma tela sem sidebar. Demais abas seguem internas ao painel.
    secoes: [
      { id: "integracoes", label: "Integrações", icon: Link, to: "/configuracoes" },
      {
        id: "pessoas",
        label: "Pessoas",
        icon: UsersThree,
        to: "/configuracoes",
        search: { tab: "pessoas" },
      },
      {
        id: "estoque",
        label: "Estoque",
        icon: Buildings,
        to: "/configuracoes",
        search: { tab: "estoque" },
      },
    ],
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

/** Atalhos do ⌘K que as seções não expressam: pulos direto a uma ABA
 *  interna e as portas que saíram da sidebar nos cortes de 2026-08-30 (Reta
 *  final, Match IA, Links Úteis) e de 2026-09-11 (Trabalhar carteira,
 *  Mensagens) — rotas vivas via dominioExtra. Moram no REGISTRO, não na
 *  paleta, para o invariante de destino único (tests/sistemas.test.ts)
 *  cobrir seções e atalhos juntos. */
export type AtalhoExtra = {
  label: string;
  icon: IconComponent;
  to: string;
  search?: Record<string, string>;
  roles?: AppRole[];
};

export const ATALHOS_EXTRAS: AtalhoExtra[] = [
  { label: "Comissões", icon: ListChecks, to: "/financeiro", search: { tab: "comissoes" } },
  {
    // "Reta final" é a leitura de fechamento DA CARTEIRA (auditoria
    // 2026-08-27) — por isso o atalho fixa fase=carteira, mesmo vindo do
    // quadro completo.
    label: "Reta final (fechamento do funil)",
    icon: Target,
    to: "/pipeline",
    search: { tab: "fechamento", fase: "carteira" },
  },
  // Portas que saíram da sidebar na regra dos 2 menus (2026-09-11): as filas
  // por prioridade e a Central de Mensagens seguem vivas (dominioExtra da
  // Carteira) — sem menu, mas a um ⌘K de distância. Só operação: o SDR nunca
  // as teve (2026-09-04).
  {
    label: "Trabalhar carteira (filas por prioridade)",
    icon: Briefcase,
    to: "/atendimento",
    roles: OPERACAO,
  },
  { label: "Mensagens (WhatsApp)", icon: WhatsappLogo, to: "/mensagens", roles: OPERACAO },
  { label: "Match IA", icon: SamiMark, to: "/match" },
  { label: "Links Úteis", icon: Link, to: "/links-uteis" },
  {
    label: "Relatórios (Operação)",
    icon: Layout,
    to: "/painel-gestor",
    search: { tab: "relatorios" },
    roles: ["admin", "gestor", "superintendente"],
  },
  {
    label: "Metas & Ritmo",
    icon: Layout,
    to: "/painel-gestor",
    search: { tab: "metas" },
    roles: ["admin", "gestor", "superintendente"],
  },
];

// A antiga searchDaSecao (que injetava fase=carteira no link da Reta final)
// morreu com a seção Fechamento (corte 2026-08-30): o alternador interno do
// /pipeline preserva a fase sozinho, e os links de seção usam `secao.search`
// direto.

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
 *  O desempate por `tab` ficou sem par no registro atual (a seção Fechamento,
 *  que empatava com o Funil no /pipeline, morreu no corte de 2026-08-30) —
 *  fica como guarda para a próxima dupla página×visão que surgir. */
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

// ---------------------------------------------------------------------------
// Telas TRANSVERSAIS: resolução contextual pela fase da jornada do lead
// ---------------------------------------------------------------------------
// A ficha do lead (30 links de todos os sistemas desembocam nela), a Vitrine e
// a ficha de projeto abertas COM um lead são passos de uma jornada — não
// pertencem a hub fixo. Resolver pelo prefixo do path prendia lead avançado na
// sidebar de Prospecção (o "custo consciente do v1", medido pela auditoria de
// 2026-08-27 como a maior fonte de troca falsa de hub). A resolução é por
// DADO DETERMINÍSTICO (etapa do lead; leadId na URL), nunca por referrer —
// bookmark e refresh resolvem igual.

/** Fase da jornada pela etapa do lead. Terminais (pos_venda/perdido) contam
 *  como carteira — o fim da jornada é trabalho de carteira. null = sem dado
 *  (carregando): o caller cai na resolução padrão por path. */
export function faseDoStatus(status: string | null | undefined): FaseFunil | null {
  if (!status) return null;
  if (
    (CARTEIRA_STAGES as string[]).includes(status) ||
    status === "pos_venda" ||
    status === "perdido"
  ) {
    return "carteira";
  }
  return "prospeccao";
}

/** Tela transversal de lead: a ficha (/leads/$id) sempre; Vitrine e ficha de
 *  projeto SÓ quando abertas com ?leadId — sem lead, são consulta de catálogo
 *  e pertencem a Docs & Projetos como sempre. */
export function telaTransversalDeLead(loc: Loc): boolean {
  if (loc.pathname.startsWith("/leads/")) return true;
  const comLead = typeof loc.search.leadId === "string" && loc.search.leadId.length > 0;
  // /match entrou no corte de 2026-08-30: aberto da ficha (?leadId) é parte
  // da jornada DAQUELE lead — match de orçamento é uso típico de qualificação
  // — e a sidebar não pode saltar para a Carteira (dominioExtra) e voltar.
  return (
    comLead &&
    (pathCasa(loc.pathname, "/vitrine") ||
      pathCasa(loc.pathname, "/projetos") ||
      pathCasa(loc.pathname, "/match"))
  );
}

/** sistemaAtivo com o contexto da jornada: numa tela transversal com a fase
 *  do lead conhecida, a sidebar acompanha a jornada (prospecção/carteira);
 *  fora disso — ou enquanto a fase carrega — vale a resolução padrão. */
export function sistemaAtivoContextual(
  loc: Loc,
  faseLead: FaseFunil | null,
  lista: Sistema[] = SISTEMAS,
): Sistema | null {
  if (faseLead && telaTransversalDeLead(loc)) {
    return lista.find((s) => s.id === faseLead) ?? sistemaAtivo(loc, lista);
  }
  return sistemaAtivo(loc, lista);
}
