import { createFileRoute, Outlet } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { guardarRotaAutenticada } from "@/lib/auth-guard";
import { AppSidebar, MobileSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { NotificationBell } from "@/components/notification-bell";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AvatarRequiredBanner } from "@/components/avatar-required-banner";
import { CelebrationHost } from "@/components/ui/celebration";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { NavBreadcrumb } from "@/features/nav/nav-breadcrumb";
import { ModuloAtualProvider } from "@/features/nav/modulo-atual-provider";
// A janela de troca "entra um, sai um" (regra dos 65) mora aqui, uma vez: a
// mutação de etapa de qualquer tela pede a abertura pelo contexto.
import { JanelaTrocaProvider } from "@/features/em-atendimento/janela-troca-context";

const SamiQLauncher = lazy(() =>
  import("@/components/samiq/samiq-launcher").then(({ SamiQLauncher }) => ({
    default: SamiQLauncher,
  })),
);
const SprintGlobal = lazy(() =>
  import("@/features/sprint/sprint-global").then(({ SprintGlobal }) => ({
    default: SprintGlobal,
  })),
);
const CommandPalette = lazy(() =>
  import("@/components/command-palette").then(({ CommandPalette }) => ({
    default: CommandPalette,
  })),
);
const RegistrarVendaDialog = lazy(() =>
  import("@/components/registrar-venda-dialog").then(({ RegistrarVendaDialog }) => ({
    default: RegistrarVendaDialog,
  })),
);
const NovoLeadDialogHost = lazy(() =>
  import("@/features/leads/novo-lead-dialog").then(({ NovoLeadDialogHost }) => ({
    default: NovoLeadDialogHost,
  })),
);
const KeyboardShortcutsHelp = lazy(() =>
  import("@/components/keyboard-shortcuts-help").then(({ KeyboardShortcutsHelp }) => ({
    default: KeyboardShortcutsHelp,
  })),
);
// Pop-up global de chamada ativa do discador (3C Plus): quando o discador
// conecta um cliente ao agente, a ficha do lead aparece em qualquer tela do
// CRM, com som.
const ChamadaAtivaHost = lazy(() =>
  import("@/features/telefonia/chamada-ativa-host").then(({ ChamadaAtivaHost }) => ({
    default: ChamadaAtivaHost,
  })),
);

// Onboarding do primeiro acesso do corretor — montado ANTES das metas do dia.
const OnboardingGlobal = lazy(() =>
  import("@/features/onboarding/onboarding-global").then(({ OnboardingGlobal }) => ({
    default: OnboardingGlobal,
  })),
);

// Estudo do Meu Funil: obrigatório para o corretor às quintas, entre o onboarding
// e as metas do dia.
const MeuFunilGlobal = lazy(() =>
  import("@/features/meu-funil/meu-funil-global").then(({ MeuFunilGlobal }) => ({
    default: MeuFunilGlobal,
  })),
);

// Metas do dia: popup obrigatório na 1ª abertura do dia (corretor) + card
// flutuante de progresso que sobrevive à navegação.
const MetasDiaGlobal = lazy(() =>
  import("@/features/metas-dia/metas-dia-global").then(({ MetasDiaGlobal }) => ({
    default: MetasDiaGlobal,
  })),
);

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // Sessão, conta ativa e presença vivem no guard compartilhado com o hub
  // /inicio (src/lib/auth-guard.ts) — uma única fonte de verdade.
  beforeLoad: ({ location }) => guardarRotaAutenticada(location.href),
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <JanelaTrocaProvider>
      {/* bg-ambient: luz radial estática no contêiner que NÃO rola (o scroll vive
        no <main>) — profundidade sem repaint durante a rolagem. */}
      <div className="flex min-h-screen bg-background bg-ambient">
        <a
          href="#conteudo-principal"
          className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Pular para o conteúdo
        </a>
        <AppSidebar />
        <main id="conteudo-principal" tabIndex={-1} className="flex-1 overflow-y-auto">
          {/* Header da identidade Lançamento (2026-10): trilha em texto à
            esquerda e três quadrados à direita — busca, Registrar venda (o
            único preenchido: é a ação que vale dinheiro) e notificações. O
            tema mudou para o menu da pessoa, no rodapé da sidebar. */}
          <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b border-border/70 bg-background/80 px-4 backdrop-blur-md md:h-16 md:px-8">
            <MobileSidebar />
            {/* Trilha "Módulos / Módulo / Página" — desktop; no celular o
              título da página já diz onde o corretor está. */}
            <NavBreadcrumb className="hidden min-w-0 md:flex" />
            <div className="ml-auto flex items-center gap-2">
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-muted-foreground"
                      aria-label="Abrir busca global"
                      aria-keyshortcuts="Meta+K"
                      onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
                    >
                      <MagnifyingGlass className="h-4 w-4" weight="regular" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Buscar lead, projeto ou tarefa (⌘K)</TooltipContent>
                </Tooltip>
                <Suspense fallback={null}>
                  <RegistrarVendaDialog />
                </Suspense>
              </TooltipProvider>
              <NotificationBell />
            </div>
          </header>
          {/* Mobile: tira das metas do dia, grudada sob o header (sem cobrir a
            faixa inferior, disputada por barras de ação e pelo BottomNav). */}
          <div id="metas-dia-slot" className="sticky top-14 z-10 md:hidden" />
          {/* pb-24 reserva o espaço do BottomNav no mobile. */}
          <div className="mx-auto max-w-7xl px-4 py-6 pb-24 md:px-8 md:py-8">
            <AvatarRequiredBanner />
            {/* O módulo da página vai por contexto ao eyebrow do PageHeader. */}
            <ModuloAtualProvider>
              <Outlet />
            </ModuloAtualProvider>
          </div>
        </main>
        <BottomNav />
        <Suspense fallback={null}>
          <SamiQLauncher />
          <SprintGlobal />
          <CommandPalette />
          <NovoLeadDialogHost />
          <KeyboardShortcutsHelp />
          <ChamadaAtivaHost />
          <OnboardingGlobal />
          <MeuFunilGlobal />
          <MetasDiaGlobal />
        </Suspense>
        <CelebrationHost />
        <Toaster richColors closeButton />
      </div>
    </JanelaTrocaProvider>
  );
}
