import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar, MobileSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { CelebrationHost } from "@/components/ui/celebration";
import { Search } from "lucide-react";

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

let lastPresenceMark = 0;
const PRESENCE_MARK_INTERVAL_MS = 60 * 60 * 1000;

function markPresenceSafely() {
  const now = Date.now();
  if (now - lastPresenceMark < PRESENCE_MARK_INTERVAL_MS) return;
  lastPresenceMark = now;

  void (async () => {
    try {
      const { error } = await supabase.rpc("marcar_presenca", { _presente: true });
      if (error) {
        lastPresenceMark = 0;
        console.warn("Não foi possível atualizar presença do corretor", error.message);
      }
    } catch (error) {
      lastPresenceMark = 0;
      console.warn("Não foi possível atualizar presença do corretor", error);
    }
  })();
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { next: location.href } });
    }

    // Verifica o estado da conta distinguindo NEGAÇÃO REAL (conta inativa/
    // bloqueada) de FALHA DE INFRAESTRUTURA (RPC ausente/PGRST202, timeout,
    // 5xx, rede). Só a negação real encerra a sessão. Uma falha transitória
    // NUNCA desloga — degradamos mantendo a sessão, pois RLS/has_role
    // continuam sendo a barreira real no servidor. Um soluço de banco não
    // pode derrubar todos os usuários (nem revogar suas outras sessões).
    let contaAtiva: boolean | null = null;
    let accountError: unknown = null;
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const res = await supabase.rpc("conta_atual_ativa");
      accountError = res.error;
      contaAtiva = res.data as boolean | null;
      if (!res.error) break;
      if (tentativa === 0) await new Promise((resolve) => setTimeout(resolve, 400));
    }

    if (!accountError && !contaAtiva) {
      // Resposta definitiva do banco: conta inativa/bloqueada. Encerra apenas a
      // sessão LOCAL (escopo local não revoga os outros dispositivos) e redireciona.
      await supabase.auth.signOut({ scope: "local" });
      throw redirect({ to: "/auth", search: { next: "", motivo: "inativa" } });
    }

    if (accountError) {
      // Indisponibilidade do RPC: não desloga. Segue com a sessão atual; a RLS
      // barra o acesso a dados caso a conta não esteja realmente ativa.
      console.warn(
        "conta_atual_ativa indisponível; seguindo com a sessão (RLS permanece como barreira)",
        accountError,
      );
    }

    // Auto check-in para liberar a distribuição automática de leads.
    markPresenceSafely();
    return { user: data.user };
  },
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
              <Search className="h-4 w-4" />
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
      </Suspense>
      <CelebrationHost />
      <Toaster richColors closeButton />
    </div>
  );
}
