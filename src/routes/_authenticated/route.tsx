import { createFileRoute, Outlet } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { guardarRotaAutenticada } from "@/lib/auth-guard";
import { AppSidebar, MobileSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { AvatarRequiredBanner } from "@/components/avatar-required-banner";
import { CelebrationHost } from "@/components/ui/celebration";
import { MagnifyingGlass } from "@phosphor-icons/react";

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
// Pop-up global de chamada ativa do discador Sonax: quando o PABX conecta um
// cliente, a ficha do lead aparece em qualquer tela do CRM, com som.
const ChamadaAtivaHost = lazy(() =>
  import("@/features/telefonia/chamada-ativa-host").then(({ ChamadaAtivaHost }) => ({
    default: ChamadaAtivaHost,
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
    // bg-ambient: luz radial estática no contêiner que NÃO rola (o scroll vive
    // no <main>) — profundidade sem repaint durante a rolagem.
    <div className="flex min-h-screen bg-background bg-ambient">
      <a
        href="#conteudo-principal"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Pular para o conteúdo
      </a>
      <AppSidebar />
      <main id="conteudo-principal" tabIndex={-1} className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border/70 bg-background/70 backdrop-blur-md px-4 md:px-8 h-14">
          <MobileSidebar />
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground gap-2"
              aria-label="Abrir busca global"
              onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
            >
              <MagnifyingGlass className="h-4 w-4" />
              <span className="hidden sm:inline">Buscar</span>
              <kbd className="hidden md:inline pointer-events-none rounded border bg-muted px-1.5 text-[10px] font-medium">
                ⌘K
              </kbd>
            </Button>
            <Suspense fallback={null}>
              <RegistrarVendaDialog />
            </Suspense>
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>
        {/* pb-24 reserva o espaço do BottomNav no mobile. */}
        <div className="mx-auto max-w-7xl px-4 py-6 pb-24 md:px-8 md:py-8">
          <AvatarRequiredBanner />
          <Outlet />
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
        <MetasDiaGlobal />
      </Suspense>
      <CelebrationHost />
      <Toaster richColors closeButton />
    </div>
  );
}
