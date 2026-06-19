import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar, MobileSidebar } from "@/components/app-sidebar";
import { NotificationBell } from "@/components/notification-bell";
import { CommandPalette } from "@/components/command-palette";
import { RegistrarVendaDialog } from "@/components/registrar-venda-dialog";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

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
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // Auto check-in para liberar a distribuição automática de leads.
    markPresenceSafely();
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-background/80 backdrop-blur px-4 md:px-8 h-14">
          <MobileSidebar />
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground gap-2"
              onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Buscar</span>
              <kbd className="hidden md:inline pointer-events-none rounded border bg-muted px-1.5 text-[10px] font-medium">
                ⌘K
              </kbd>
            </Button>
            <RegistrarVendaDialog />
            <NotificationBell />
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>
      <CommandPalette />
      <Toaster richColors closeButton />
    </div>
  );
}
