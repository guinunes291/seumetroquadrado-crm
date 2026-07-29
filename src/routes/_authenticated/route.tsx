import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { verificarContaAtiva } from "@/lib/conta-ativa";
import { AppSidebar, MobileSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { AvatarRequiredBanner } from "@/components/avatar-required-banner";
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

// Resultado do gate de conta ativa, memorizado por usuário.
//
// PERF: `beforeLoad` roda em TODA navegação para dentro de /_authenticated —
// sem cache, cada clique no menu pagava um round-trip de conta_atual_ativa
// (e até dois, porque verificarContaAtiva tenta de novo após 400ms quando o
// RPC falha) ANTES de qualquer pixel novo aparecer. Era a maior fatia do
// "lento nos carregamentos". O veredito vale por CONTA_ATIVA_TTL_MS; a RLS
// segue barrando os dados no servidor, então uma conta bloqueada perde o
// acesso na hora mesmo que o menu ainda apareça por até 1 minuto.
const CONTA_ATIVA_TTL_MS = 60_000;
let contaAtivaCache: { userId: string; em: number } | null = null;

function contaAtivaRecenteOk(userId: string) {
  return (
    contaAtivaCache !== null &&
    contaAtivaCache.userId === userId &&
    Date.now() - contaAtivaCache.em < CONTA_ATIVA_TTL_MS
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // PERF: getSession() lê a sessão do storage local (e só renova o token
    // quando expirado); getUser() batia na API de auth a cada navegação. Para
    // um guard de ROTA a sessão local basta — quem valida o JWT de verdade é o
    // servidor, a cada request, via RLS.
    const { data, error } = await supabase.auth.getSession();
    const usuario = data.session?.user ?? null;
    if (error || !usuario) {
      throw redirect({ to: "/auth", search: { next: location.href } });
    }

    if (contaAtivaRecenteOk(usuario.id)) {
      markPresenceSafely();
      return { user: usuario };
    }

    // Verifica o estado da conta distinguindo NEGAÇÃO REAL (conta inativa/
    // bloqueada) de FALHA DE INFRAESTRUTURA (RPC ausente/PGRST202, timeout,
    // 5xx, rede). Só a negação real encerra a sessão — decisão centralizada
    // e testada em verificarContaAtiva (tests/auth-guard.test.ts).
    const resultado = await verificarContaAtiva(async () => {
      const res = await supabase.rpc("conta_atual_ativa");
      return { data: res.data as boolean | null, error: res.error };
    });

    if (resultado === "inativa") {
      contaAtivaCache = null;
      // Resposta definitiva do banco: conta inativa/bloqueada. Encerra apenas a
      // sessão LOCAL (escopo local não revoga os outros dispositivos) e redireciona.
      await supabase.auth.signOut({ scope: "local" });
      throw redirect({ to: "/auth", search: { next: "", motivo: "inativa" } });
    }

    if (resultado === "indisponivel") {
      // Indisponibilidade do RPC: não desloga. Segue com a sessão atual; a RLS
      // barra o acesso a dados caso a conta não esteja realmente ativa. NÃO
      // memoriza: o veredito ainda não veio, então a próxima navegação tenta
      // de novo em vez de congelar a dúvida por um minuto.
      console.warn(
        "conta_atual_ativa indisponível; seguindo com a sessão (RLS permanece como barreira)",
      );
    } else {
      contaAtivaCache = { userId: usuario.id, em: Date.now() };
    }

    // Auto check-in para liberar a distribuição automática de leads.
    markPresenceSafely();
    return { user: usuario };
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
      </Suspense>
      <CelebrationHost />
      <Toaster richColors closeButton />
    </div>
  );
}
