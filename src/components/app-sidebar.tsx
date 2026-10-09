import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CaretDoubleLeft,
  CaretDoubleRight,
  CaretUpDown,
  Lifebuoy,
  List,
  SignOut,
  User as UserIcon,
} from "@phosphor-icons/react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles, type AppRole } from "@/hooks/use-auth";
import { usePreference } from "@/hooks/use-preference";
import { useNavBadges } from "@/features/nav/use-nav-badges";
import {
  badgeDaSecao,
  badgeDoSistema,
  homeDoSistema,
  secaoAtiva,
  secoesVisiveis,
  sistemaAtivoContextual,
  sistemasVisiveis,
  SISTEMAS_NAV,
  type PapelCtx,
  type Secao,
  type Sistema,
} from "@/features/nav/sistemas";
import { useFlagsNav } from "@/features/academia/use-flags-nav";
import { useFaseDaJornada } from "@/features/nav/contexto-jornada";
import { isTypingTarget } from "@/lib/shortcuts";
import { EVENTO_ABRIR_ONBOARDING } from "@/features/onboarding/onboarding";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeMenuItems } from "@/components/theme-toggle";

// Sidebar da identidade Lançamento (2026-10, a partir do vídeo de lançamento
// do CRM): a lista de TODOS os módulos visíveis ao papel, sempre à mão, e as
// seções do módulo aberto aninhadas sob ele. Antes ela mostrava só as seções
// do módulo ativo e um "← Módulos"; trocar de módulo exigia passar pelo hub.
// A regra dos 2 menus continua: o 1º nível são os módulos (o que era o hub),
// o 2º as páginas do módulo — e no máximo uma linha de abas dentro da página.

/** Contagem 99+ para não estourar o layout. */
function badgeText(n: number): string {
  return n > 99 ? "99+" : String(n);
}

const PAPEL_LABEL: [AppRole, string][] = [
  ["admin", "Administrador"],
  ["superintendente", "Superintendente"],
  ["gestor", "Gestor"],
  ["corretor", "Corretor"],
  ["sdr", "Pré-venda (SDR)"],
];

function papelPrincipal(roles: AppRole[]): string {
  return PAPEL_LABEL.find(([r]) => roles.includes(r))?.[1] ?? "";
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const letras = (partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "");
  return letras.toUpperCase() || "?";
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
  const { user } = useAuth();
  const { roles, isAdmin, isCorretor } = useUserRoles();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // A search entra na resolução do sistema: é ela que separa /pipeline?fase=
  // prospeccao de ?fase=carteira e escolhe a seção acesa por ?tab.
  const search = useRouterState({ select: (s) => s.location.search }) as Record<string, unknown>;
  const badges = useNavBadges();

  const flagsLigadas = useFlagsNav();
  const ctx: PapelCtx = { roles, isAdmin, flagsLigadas };
  // Telas transversais (ficha do lead, vitrine/projeto com ?leadId) publicam
  // a fase da jornada — a sidebar acompanha o lead, não o prefixo do path.
  const faseJornada = useFaseDaJornada();
  const ativo = sistemaAtivoContextual({ pathname, search }, faseJornada, SISTEMAS_NAV);
  const secoesDoAtivo = ativo ? secoesVisiveis(ativo, ctx) : [];
  // Ativação por id da seção resolvida — path puro acenderia junto o par que
  // divide /pipeline (fase × fechamento).
  const secaoAcesa = ativo ? secaoAtiva(ativo, { pathname, search }) : null;

  // Configurações não é módulo de trabalho: sai da lista e desce para o
  // rodapé, como no vídeo (mesmo gate de papel do registro: só admin).
  const visiveis = sistemasVisiveis(ctx, SISTEMAS_NAV);
  const modulos = visiveis.filter((s) => s.id !== "configuracoes");
  const configuracoes = visiveis.find((s) => s.id === "configuracoes");

  const nome =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.nome as string | undefined) ??
    user?.email?.split("@")[0] ??
    "";

  // Trilha "Como usar o CRM" — reabrível a qualquer momento pelo corretor.
  const abrirOnboarding = () => {
    onNavigate?.();
    window.dispatchEvent(new Event(EVENTO_ABRIR_ONBOARDING));
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  const countPill = (n: number) =>
    n > 0 ? (
      <span
        aria-label={`${n} pendências`}
        className="ml-auto shrink-0 rounded-full bg-destructive px-1.5 py-px text-[11px] font-semibold tabular-nums text-destructive-foreground"
      >
        {badgeText(n)}
      </span>
    ) : null;

  // Seções só aparecem quando há escolha: módulo de uma página só (Modo
  // Visita) é o próprio item da lista.
  const mostraSecoes = (s: Sistema) => s.id === ativo?.id && secoesDoAtivo.length > 1;

  const renderSecao = (secao: Secao) => {
    const active = secaoAcesa?.id === secao.id;
    return (
      <li key={secao.id}>
        <Link
          to={secao.to}
          search={secao.search}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "relative flex min-h-11 items-center gap-2 rounded-md px-2.5 text-[13px] transition-colors md:min-h-9",
            active
              ? "bg-claro/[0.07] font-medium text-claro before:absolute before:-left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:rounded-full before:bg-gold"
              : "text-sidebar-foreground/65 hover:bg-claro/[0.04] hover:text-claro",
          )}
        >
          <span className="flex-1 truncate">{secao.label}</span>
          {countPill(badgeDaSecao(secao, badges, ctx))}
        </Link>
      </li>
    );
  };

  const renderModulo = (s: Sistema) => {
    const Icon = s.icon;
    const eAtivo = s.id === ativo?.id;
    const aberto = mostraSecoes(s);
    return (
      <li key={s.id}>
        <Link
          {...homeDoSistema(s, ctx)}
          onClick={onNavigate}
          // Com as seções abertas, quem diz "página atual" é a seção acesa.
          aria-current={eAtivo && !aberto ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-[13.5px] transition-colors md:min-h-10",
            eAtivo
              ? "bg-claro/[0.09] font-medium text-claro ring-1 ring-inset ring-claro/10"
              : "text-sidebar-foreground/75 hover:bg-claro/[0.05] hover:text-claro",
          )}
        >
          <Icon className="h-[18px] w-[18px] shrink-0" weight="regular" />
          <span className="flex-1 truncate" title={s.titulo}>
            {s.titulo}
          </span>
          {!aberto && countPill(badgeDoSistema(s, badges, ctx))}
        </Link>
        {aberto && (
          <ul
            aria-label={`Páginas de ${s.titulo}`}
            className="mb-1.5 ml-[21px] mt-1 space-y-0.5 border-l border-claro/10 pl-2.5"
          >
            {secoesDoAtivo.map(renderSecao)}
          </ul>
        )}
      </li>
    );
  };

  // ---- Modo trilho (colapsado): só ícones com tooltip. A search vai junto no
  // Link — sem ela o destino cai na visão errada (ex.: fase do pipeline).
  const railClasses = (active: boolean) =>
    cn(
      "relative mx-auto flex h-11 w-11 items-center justify-center rounded-lg transition-colors",
      active
        ? "bg-claro/[0.09] text-claro ring-1 ring-inset ring-claro/10"
        : "text-sidebar-foreground/70 hover:bg-claro/[0.05] hover:text-claro",
    );

  const railDot = (n: number) =>
    n > 0 ? (
      <span
        aria-label={`${n} pendências`}
        className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive"
      />
    ) : null;

  const renderRailModulo = (s: Sistema) => {
    const Icon = s.icon;
    const eAtivo = s.id === ativo?.id;
    const n = badgeDoSistema(s, badges, ctx);
    return (
      <li key={s.id}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              {...homeDoSistema(s, ctx)}
              onClick={onNavigate}
              aria-current={eAtivo ? "page" : undefined}
              aria-label={s.titulo}
              className={railClasses(eAtivo)}
            >
              <Icon className="h-5 w-5" weight="regular" />
              {railDot(n)}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {s.titulo}
            {n > 0 && <span className="tabular-nums">{badgeText(n)}</span>}
          </TooltipContent>
        </Tooltip>
      </li>
    );
  };

  const renderRailSecao = (secao: Secao) => {
    const Icon = secao.icon;
    const active = secaoAcesa?.id === secao.id;
    const n = badgeDaSecao(secao, badges, ctx);
    return (
      <li key={secao.id}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to={secao.to}
              search={secao.search}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              aria-label={secao.label}
              className={cn(railClasses(active), "h-9 w-9")}
            >
              <Icon className="h-4 w-4" weight={active ? "fill" : "regular"} />
              {railDot(n)}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{secao.label}</TooltipContent>
        </Tooltip>
      </li>
    );
  };

  const menuDaPessoa = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Menu da conta"
          className={cn(
            "flex min-h-11 items-center gap-2.5 rounded-lg text-left transition-colors hover:bg-claro/[0.05]",
            collapsed ? "mx-auto w-11 justify-center" : "min-w-0 flex-1 px-2",
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-claro/10 text-xs font-semibold text-claro">
            {iniciais(nome)}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-medium text-claro">{nome}</span>
                <span className="block truncate text-[11px] text-sidebar-foreground/55">
                  {papelPrincipal(roles)}
                </span>
              </span>
              <CaretUpDown className="h-4 w-4 shrink-0 text-sidebar-foreground/50" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={collapsed ? "right" : "top"} align="start" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium">{nome}</span>
          {user?.email && (
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="gap-2">
          <Link to="/meu-perfil" onClick={onNavigate}>
            <UserIcon className="h-4 w-4" />
            Meu perfil
          </Link>
        </DropdownMenuItem>
        {isCorretor && (
          <DropdownMenuItem onClick={abrirOnboarding} className="gap-2">
            <Lifebuoy className="h-4 w-4" />
            Como usar o CRM
          </DropdownMenuItem>
        )}
        <ThemeMenuItems />
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="gap-2">
          <SignOut className="h-4 w-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const toggle = onToggleCollapse && (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
          aria-expanded={!collapsed}
          className={cn(
            "flex h-11 items-center justify-center rounded-lg text-sidebar-foreground/55 transition-colors hover:bg-claro/[0.05] hover:text-claro",
            collapsed ? "mx-auto w-11" : "w-9 shrink-0",
          )}
        >
          {collapsed ? (
            <CaretDoubleRight className="h-4 w-4" />
          ) : (
            <CaretDoubleLeft className="h-4 w-4" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {collapsed ? "Expandir ( [ )" : "Recolher ( [ )"}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex h-full flex-col bg-gradient-command text-sidebar-foreground">
        <div
          className={cn(
            "flex h-16 shrink-0 items-center",
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
              collapsed ? "justify-center" : "gap-2.5",
            )}
          >
            <img
              src="/icons/icon-192.png"
              alt="Seu Metro Quadrado"
              className="h-9 w-9 shrink-0 rounded-lg bg-claro object-contain p-px"
            />
            {!collapsed && (
              <div className="leading-tight">
                <div className="font-display text-sm font-semibold text-claro">
                  Seu Metro Quadrado
                </div>
                <div className="text-[11px] text-sidebar-primary/90">Central de Comando</div>
              </div>
            )}
          </Link>
        </div>

        <nav aria-label="Módulos" className="flex-1 overflow-y-auto px-3 pb-3">
          {collapsed ? (
            <ul className="space-y-1 pt-3">
              {modulos.map(renderRailModulo)}
              {ativo && ativo.id !== "configuracoes" && secoesDoAtivo.length > 1 && (
                <>
                  <li aria-hidden="true" className="mx-auto my-2 h-px w-8 bg-claro/10" />
                  {secoesDoAtivo.map(renderRailSecao)}
                </>
              )}
            </ul>
          ) : (
            <>
              <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/45">
                Módulos
              </p>
              <ul className="space-y-0.5">{modulos.map(renderModulo)}</ul>
            </>
          )}
        </nav>

        <div className="shrink-0 space-y-1 border-t border-claro/10 p-2">
          {configuracoes &&
            (collapsed ? (
              <ul className="space-y-1">
                {renderRailModulo(configuracoes)}
                {ativo?.id === "configuracoes" && secoesDoAtivo.map(renderRailSecao)}
              </ul>
            ) : (
              <ul>{renderModulo(configuracoes)}</ul>
            ))}
          {collapsed ? (
            <>
              {menuDaPessoa}
              {toggle}
            </>
          ) : (
            <div className="flex items-center gap-1">
              {menuDaPessoa}
              {toggle}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
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
        "hidden md:sticky md:top-0 md:flex md:h-screen md:shrink-0 md:flex-col border-r border-sidebar-border transition-[width] duration-200 motion-reduce:transition-none",
        collapsed ? "md:w-[72px]" : "md:w-68",
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
          <List className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0 w-72 bg-sidebar border-sidebar-border">
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
