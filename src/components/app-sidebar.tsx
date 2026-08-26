import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutGrid,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  User as UserIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { usePreference } from "@/hooks/use-preference";
import { useNavBadges } from "@/features/nav/use-nav-badges";
import {
  badgeDaSecao,
  secaoAtiva,
  secoesVisiveis,
  sistemaAtivo,
  type Secao,
} from "@/features/nav/sistemas";
import { isTypingTarget } from "@/lib/shortcuts";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const { roles, isAdmin } = useUserRoles();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // A search entra na resolução do sistema: é ela que separa /pipeline?fase=
  // prospeccao de ?fase=carteira e escolhe a seção acesa por ?tab.
  const search = useRouterState({ select: (s) => s.location.search }) as Record<string, unknown>;
  const badges = useNavBadges();

  const ctx = { roles, isAdmin };
  const sistema = sistemaAtivo({ pathname, search });
  const secoes = sistema ? secoesVisiveis(sistema, ctx) : [];
  // Ativação por id da seção resolvida — path puro acenderia junto o par que
  // divide /pipeline (fase × fechamento).
  const secaoAcesa = sistema ? secaoAtiva(sistema, { pathname, search }) : null;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

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

  const renderLeaf = (secao: Secao) => {
    const Icon = secao.icon;
    const n = badgeDaSecao(secao, badges, ctx);
    const active = secaoAcesa?.id === secao.id;
    return (
      <Link
        to={secao.to}
        search={secao.search}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={leafClasses(active)}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{secao.label}</span>
        {countPill(n)}
      </Link>
    );
  };

  // O "voltar ao portal" abre a lista em todo sistema e é o único item das
  // rotas neutras (perfil, configurações).
  const modulosAtivo = isActivePath(pathname, "/inicio");
  const modulosLeaf = (
    <Link
      to="/inicio"
      onClick={onNavigate}
      aria-current={modulosAtivo ? "page" : undefined}
      className={leafClasses(modulosAtivo)}
    >
      <LayoutGrid className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">← Módulos</span>
    </Link>
  );

  const railModulos = (
    <li className="flex justify-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/inicio"
            onClick={onNavigate}
            aria-current={modulosAtivo ? "page" : undefined}
            aria-label="Acesso aos módulos"
            className={cn(
              "relative flex h-11 w-11 items-center justify-center rounded-md transition-colors",
              modulosAtivo
                ? "bg-white/[0.08] text-sidebar-primary"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
            )}
          >
            <LayoutGrid className="h-5 w-5" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">Acesso aos módulos</TooltipContent>
      </Tooltip>
    </li>
  );

  // ---- Modo trilho (colapsado): só ícones com tooltip. A search vai junto no
  // Link — sem ela o destino cai na visão errada (ex.: fase do pipeline).
  const renderRailItem = (secao: Secao) => {
    const Icon = secao.icon;
    const active = secaoAcesa?.id === secao.id;
    const n = badgeDaSecao(secao, badges, ctx);
    return (
      <li key={secao.id} className="flex justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to={secao.to}
              search={secao.search}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              aria-label={secao.label}
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
            {secao.label}
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
            collapsed ? "justify-center px-2" : "px-5",
          )}
        >
          {/* A marca leva de volta ao hub de módulos — o "voltar ao portal". */}
          <Link
            to="/inicio"
            onClick={onNavigate}
            aria-label="Acesso aos módulos"
            className={cn(
              "flex items-center rounded-md transition-opacity hover:opacity-85",
              collapsed ? "justify-center" : "gap-2",
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
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {collapsed ? (
            <ul className="space-y-1">
              {railModulos}
              {secoes.map(renderRailItem)}
            </ul>
          ) : (
            <ul className="space-y-0.5">
              <li>{modulosLeaf}</li>
              {sistema && (
                <>
                  <li>
                    {/* Cabeçalho do sistema ativo — mesmo tom discreto da marca. */}
                    <div className="flex items-center gap-2 px-3 pb-1 pt-3">
                      <sistema.icon className="h-4 w-4 shrink-0 text-sidebar-primary/90" />
                      <span className="truncate font-display text-sm font-semibold">
                        {sistema.titulo}
                      </span>
                    </div>
                  </li>
                  {secoes.map((secao) => (
                    <li key={secao.id}>{renderLeaf(secao)}</li>
                  ))}
                </>
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
