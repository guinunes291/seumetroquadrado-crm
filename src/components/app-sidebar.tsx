import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  Users,
  Trello,
  CalendarClock,
  Zap,
  Trophy,
  Sun,
  Building2,
  Map,
  Megaphone,
  Settings,
  LogOut,
  User as UserIcon,
  BarChart3,
  ChevronRight,
  Headset,
  Shuffle,
  MapPinned,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { usePreference } from "@/hooks/use-preference";
import { useNavBadges, type NavBadges } from "@/features/nav/use-nav-badges";
import { isTypingTarget } from "@/lib/shortcuts";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Item = {
  to?: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: ("admin" | "gestor" | "corretor" | "superintendente")[];
  comingSoon?: boolean;
  /** Subitens recolhíveis — usados para consolidar o menu sem esconder rotas. */
  children?: Item[];
  /** Qual contador de pendências este destino carrega (badge discreto). */
  badge?: (b: NavBadges) => number;
};

// Navegação por INTENÇÃO com TETO DE 7 BOTÕES principais (Fase 1 da reestruturação).
// Cada botão é um "destino" que agrupa as rotas relacionadas como subitens recolhíveis.
// Nenhuma rota foi removida — tudo continua acessível, só consolidado em 7 grupos:
// corretor vê 6 botões, gestor/admin 7 (Configurações vive no rodapé).
const NAV_ITEMS: Item[] = [
  {
    // A home é a Central de Comando; Desempenho (ranking/metas/copa) é filho.
    to: "/hoje",
    label: "Início",
    icon: Sun,
    children: [{ to: "/ranking", label: "Desempenho", icon: Trophy }],
  },
  {
    to: "/leads",
    label: "Leads",
    icon: Users,
    badge: (b) => b.atendimento,
    children: [
      { to: "/blitz", label: "Modo Blitz", icon: Zap },
      {
        to: "/leads-landing",
        label: "Captação (Landing)",
        icon: Megaphone,
        roles: ["admin", "gestor"],
      },
    ],
  },
  {
    // Filas de resposta/follow-up/reaquecimento/documentação priorizadas.
    to: "/atendimento",
    label: "Atendimento",
    icon: Headset,
    badge: (b) => b.tarefasVencidas,
    children: [
      {
        to: "/agendamentos",
        label: "Agenda & Tarefas",
        icon: CalendarClock,
        badge: (b) => b.agendaHoje,
      },
      { to: "/modo-visita", label: "Modo Visita", icon: MapPinned },
    ],
  },
  {
    // Funil (kanban) + Modo Fechamento na mesma central.
    to: "/pipeline",
    label: "Pipeline",
    icon: Trello,
  },
  {
    // Catálogo, Oferta, Comissões e Links são abas do hub /projetos.
    // Match IA continua acessível pelo botão no hub e pela página do lead.
    to: "/projetos",
    label: "Projetos",
    icon: Building2,
    children: [{ to: "/vitrine", label: "Vitrine (mapa)", icon: Map }],
  },
  {
    // As sub-áreas (Pessoas, Comunicação, Qualidade…) são abas internas do hub
    // /painel-gestor. A Distribuição (3 roletas + exceções) tem página própria.
    to: "/painel-gestor",
    label: "Gestão",
    icon: BarChart3,
    roles: ["admin", "gestor"],
    badge: (b) => b.aprovacoes,
    children: [
      { to: "/distribuicao", label: "Distribuição", icon: Shuffle, roles: ["admin", "gestor"] },
    ],
  },
  {
    // Insights em linguagem de negócio + relatórios completos (org-wide) → gestão.
    to: "/inteligencia",
    label: "Inteligência",
    icon: LayoutDashboard,
    roles: ["admin", "gestor", "superintendente"],
  },
];

// Casa a rota ativa por fronteira de segmento, evitando que "/leads" acenda em
// "/leads-landing" ou "/leads-por-corretor".
function isActivePath(pathname: string, to?: string) {
  if (!to) return false;
  return pathname === to || pathname.startsWith(to + "/");
}

/** Contagem 99+ para não estourar o layout. */
function badgeText(n: number): string {
  return n > 99 ? "99+" : String(n);
}

function SidebarContent({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const { roles, isAdmin, isGestor } = useUserRoles();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const badges = useNavBadges();

  const canSee = (it: Item) => {
    if (!it.roles) return true;
    if (isAdmin) return true;
    return it.roles.some(
      (r) =>
        (r === "admin" && isAdmin) || (r === "gestor" && isGestor) || roles.includes(r as never),
    );
  };

  const visibleChildren = (it: Item) => (it.children ?? []).filter(canSee);

  const itemVisible = (it: Item): boolean => {
    if (it.children && it.children.length > 0) {
      return canSee(it) && (it.to != null || visibleChildren(it).length > 0);
    }
    return canSee(it);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  const badgeCount = (it: Item): number => (badges && it.badge ? it.badge(badges) : 0);

  // Item ativo: trilho dourado à esquerda + texto/ícone dourados sobre um véu
  // sutil — o dourado é acento, não bloco (moeda rara do design system).
  const leafClasses = (active: boolean) =>
    cn(
      "relative flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
      active
        ? "bg-white/[0.06] font-medium text-sidebar-primary before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:bg-gradient-gold"
        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
    );

  const countPill = (n: number) =>
    n > 0 ? (
      <span
        aria-label={`${n} pendências`}
        className="ml-auto shrink-0 rounded-full bg-gold-500/15 px-1.5 py-0.5 text-xs font-medium tabular-nums text-gold-300"
      >
        {badgeText(n)}
      </span>
    ) : null;

  const renderLeaf = (it: Item, opts?: { nested?: boolean }) => {
    const Icon = it.icon;
    const n = badgeCount(it);
    const inner = (
      <>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{it.label}</span>
        {countPill(n)}
        {it.comingSoon && (
          <span className="text-[9px] uppercase tracking-wider text-sidebar-foreground/40">
            em breve
          </span>
        )}
      </>
    );
    if (it.comingSoon || !it.to) {
      return (
        <div
          aria-disabled="true"
          title="Em breve"
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/40 cursor-not-allowed",
            opts?.nested && "pl-9",
          )}
        >
          {inner}
        </div>
      );
    }
    return (
      <Link
        to={it.to}
        onClick={onNavigate}
        aria-current={isActivePath(pathname, it.to) ? "page" : undefined}
        className={cn(leafClasses(isActivePath(pathname, it.to)), opts?.nested && "pl-9")}
      >
        {inner}
      </Link>
    );
  };

  // ---- Modo trilho (colapsado): só ícones com tooltip; filhos ficam pela
  // busca ⌘K ou expandindo de volta. O item pai acende se um filho está ativo.
  const renderRailItem = (it: Item) => {
    const Icon = it.icon;
    const active =
      isActivePath(pathname, it.to) ||
      visibleChildren(it).some((c) => isActivePath(pathname, c.to));
    const n = badgeCount(it);
    if (!it.to) return null;
    return (
      <li key={it.to} className="flex justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to={it.to}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              aria-label={it.label}
              className={cn(
                "relative flex h-11 w-11 items-center justify-center rounded-md transition-colors",
                active
                  ? "bg-white/[0.08] text-sidebar-primary"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              {n > 0 && (
                <span
                  aria-label={`${n} pendências`}
                  className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-gradient-gold shadow-glow-gold"
                />
              )}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {it.label}
            {n > 0 && <span className="tabular-nums text-gold-600">{badgeText(n)}</span>}
          </TooltipContent>
        </Tooltip>
      </li>
    );
  };

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex h-full flex-col bg-gradient-command text-sidebar-foreground">
        <div
          className={cn(
            "flex h-16 items-center border-b border-sidebar-border/60",
            collapsed ? "justify-center px-2" : "gap-2 px-5",
          )}
        >
          <img
            src="/icons/icon-192.png"
            alt="Seu Metro Quadrado"
            className="h-9 w-9 shrink-0 rounded-md object-contain bg-white shadow-elev-1"
          />
          {!collapsed && (
            <div className="leading-tight">
              <div className="font-display font-semibold text-sm">Seu Metro Quadrado</div>
              <div className="text-[11px] tracking-wide text-sidebar-primary/90">
                Central de Comando
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {collapsed ? (
            <ul className="space-y-1">{NAV_ITEMS.filter(itemVisible).map(renderRailItem)}</ul>
          ) : (
            <ul className="space-y-0.5">
              {NAV_ITEMS.filter(itemVisible).map((it) =>
                it.children && it.children.length > 0 ? (
                  <NavGroup
                    key={it.label}
                    item={it}
                    subitems={visibleChildren(it)}
                    pathname={pathname}
                    renderLeaf={renderLeaf}
                    leafClasses={leafClasses}
                    onNavigate={onNavigate}
                  />
                ) : (
                  <li key={it.to ?? it.label}>{renderLeaf(it)}</li>
                ),
              )}
            </ul>
          )}
        </nav>

        <div className={cn("space-y-1 border-t border-sidebar-border p-2")}>
          {collapsed ? (
            <>
              <RailFootLink
                to="/meu-perfil"
                label="Meu perfil"
                icon={UserIcon}
                active={isActivePath(pathname, "/meu-perfil")}
                onNavigate={onNavigate}
              />
              {isAdmin && (
                <RailFootLink
                  to="/configuracoes"
                  label="Configurações"
                  icon={Settings}
                  active={isActivePath(pathname, "/configuracoes")}
                  onNavigate={onNavigate}
                />
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    aria-label="Sair"
                    className="mx-auto flex h-11 w-11 items-center justify-center rounded-md text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Sair</TooltipContent>
              </Tooltip>
            </>
          ) : (
            <>
              <Link
                to="/meu-perfil"
                onClick={onNavigate}
                aria-current={isActivePath(pathname, "/meu-perfil") ? "page" : undefined}
                className="flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <UserIcon className="h-4 w-4" />
                Meu perfil
              </Link>
              {isAdmin && (
                <Link
                  to="/configuracoes"
                  onClick={onNavigate}
                  aria-current={isActivePath(pathname, "/configuracoes") ? "page" : undefined}
                  className="flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <Settings className="h-4 w-4" />
                  Configurações
                </Link>
              )}
              <Button
                variant="ghost"
                onClick={handleSignOut}
                className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </Button>
            </>
          )}

          {onToggleCollapse && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  aria-label={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
                  aria-expanded={!collapsed}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                    collapsed ? "mx-auto w-11 justify-center px-0" : "w-full",
                  )}
                >
                  {collapsed ? (
                    <PanelLeftOpen className="h-4 w-4" />
                  ) : (
                    <>
                      <PanelLeftClose className="h-4 w-4" />
                      <span className="flex-1 text-left">Recolher</span>
                      <span className="rounded border border-sidebar-border px-1 text-[11px] text-sidebar-foreground/50">
                        [
                      </span>
                    </>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {collapsed ? "Expandir ( [ )" : "Recolher ( [ )"}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

function RailFootLink({
  to,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: typeof UserIcon;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={to}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          aria-label={label}
          className={cn(
            "mx-auto flex h-11 w-11 items-center justify-center rounded-md transition-colors",
            active
              ? "bg-white/[0.08] text-sidebar-primary"
              : "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function NavGroup({
  item,
  subitems,
  pathname,
  renderLeaf,
  leafClasses,
  onNavigate,
}: {
  item: Item;
  subitems: Item[];
  pathname: string;
  renderLeaf: (it: Item, opts?: { nested?: boolean }) => React.ReactNode;
  leafClasses: (active: boolean) => string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const selfActive = isActivePath(pathname, item.to);
  const childActive = subitems.some((c) => isActivePath(pathname, c.to));
  const [open, setOpen] = useState(selfActive || childActive);
  // Mantém aberto enquanto um subitem estiver ativo (não esconde a página atual).
  const expanded = open || childActive;

  const chevron = (
    <button
      type="button"
      aria-label={expanded ? "Recolher" : "Expandir"}
      aria-expanded={expanded}
      onClick={() => setOpen((o) => !o)}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
    </button>
  );

  return (
    <li>
      {item.to ? (
        // Link e chevron como IRMÃOS (botão não pode ficar dentro do <a>).
        <div className="flex items-center gap-0.5">
          <Link
            to={item.to}
            onClick={onNavigate}
            aria-current={selfActive ? "page" : undefined}
            className={cn(leafClasses(selfActive), "flex-1 min-w-0")}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{item.label}</span>
          </Link>
          {chevron}
        </div>
      ) : (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setOpen((o) => !o)}
          className={cn(leafClasses(false), "w-full")}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate text-left">{item.label}</span>
          <ChevronRight
            className={cn("h-3.5 w-3.5 shrink-0 transition-transform", expanded && "rotate-90")}
          />
        </button>
      )}
      {expanded && (
        <ul className="mt-0.5 space-y-0.5">
          {subitems.map((c) => (
            <li key={c.to ?? c.label}>{renderLeaf(c, { nested: true })}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function AppSidebar() {
  const [collapsed, setCollapsed] = usePreference("ui:sidebar-collapsed", false);

  // Atalho "[" alterna o trilho (fora de campos de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      setCollapsed((c) => !c);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setCollapsed]);

  return (
    <aside
      className={cn(
        "hidden md:flex md:flex-col border-r border-sidebar-border transition-[width] duration-200 motion-reduce:transition-none",
        collapsed ? "md:w-[72px]" : "md:w-64",
      )}
    >
      <SidebarContent collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
    </aside>
  );
}

export function MobileSidebar() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0 w-72 bg-sidebar border-sidebar-border">
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
