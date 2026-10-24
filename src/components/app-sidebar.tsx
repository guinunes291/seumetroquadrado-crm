import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CaretDoubleLeft, CaretDoubleRight, List } from "@phosphor-icons/react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { usePreference } from "@/hooks/use-preference";
import { useNavBadges } from "@/features/nav/use-nav-badges";
import {
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
import { CheckinLateral } from "@/features/presenca/checkin-lateral";
import { houvePedidoCheckinRecente } from "@/features/presenca/use-checkin-obrigatorio";
import { encerrarSessao } from "@/features/nav/sessao-client";
import {
  ItemModulo,
  ItemTrilhoModulo,
  ItemTrilhoSecao,
  type NavItemCtx,
} from "@/features/nav/sidebar-itens";
import { MenuDaPessoa } from "@/features/nav/sidebar-conta";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Sidebar da identidade Lançamento (2026-10, a partir do vídeo de lançamento
// do CRM): a lista de TODOS os módulos visíveis ao papel, sempre à mão, e as
// seções do módulo aberto aninhadas sob ele. Antes ela mostrava só as seções
// do módulo ativo e um "← Módulos"; trocar de módulo exigia passar pelo hub.
// A regra dos 2 menus continua: o 1º nível são os módulos (o que era o hub),
// o 2º as páginas do módulo — e no máximo uma linha de abas dentro da página.
//
// Desde a quebra em módulos (2026-10): itens da navegação em
// features/nav/sidebar-itens.tsx, menu da conta em features/nav/sidebar-conta.tsx
// e o encerramento da sessão em features/nav/sessao-client.ts.

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
    await encerrarSessao();
    window.location.href = "/auth";
  };

  const nav: NavItemCtx = { ctx, badges, onNavigate, ativo, secaoAcesa, secoesDoAtivo };
  const renderModulo = (s: Sistema) => <ItemModulo key={s.id} sistema={s} nav={nav} />;
  const renderRailModulo = (s: Sistema) => <ItemTrilhoModulo key={s.id} sistema={s} nav={nav} />;
  const renderRailSecao = (secao: Secao) => (
    <ItemTrilhoSecao key={secao.id} secao={secao} nav={nav} />
  );

  const menuDaPessoa = (
    <MenuDaPessoa
      collapsed={collapsed}
      nome={nome}
      email={user?.email}
      roles={roles}
      isCorretor={isCorretor}
      onNavigate={onNavigate}
      abrirOnboarding={abrirOnboarding}
      handleSignOut={handleSignOut}
    />
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
          {/* Check-in de hoje (13/10/2026): painel de ESTADO do corretor, não
            seção nem módulo — fica fora da regra dos 2 menus. Os botões só
            pedem; o diálogo (ou o card de /presenca) faz o check-in. */}
          {isCorretor && (
            <div className={collapsed ? "py-1" : "px-1 pb-1"}>
              <CheckinLateral collapsed={collapsed} onNavigate={onNavigate} />
            </div>
          )}
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
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Abrir menu"
          // O diálogo do check-in aberto pelo Sheet devolve o foco aqui ao fechar.
          data-gatilho-menu=""
        >
          <List className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="p-0 w-72 bg-sidebar border-sidebar-border"
        // O check-in pedido pela barra lateral fecha o Sheet DEPOIS de o
        // diálogo abrir (ou de o card receber o foco): devolver o foco ao ☰
        // o tiraria de lá.
        onCloseAutoFocus={(e) => {
          if (houvePedidoCheckinRecente()) e.preventDefault();
        }}
      >
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
