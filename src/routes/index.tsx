import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Seu Metro Quadrado CRM" },
      {
        name: "description",
        content: "Acesso ao CRM Seu Metro Quadrado.",
      },
    ],
  }),
  component: IndexRedirect,
});

function IndexRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;

      if (data.user) {
        void navigate({ to: "/hoje", replace: true });
        return;
      }

      void navigate({ to: "/auth", search: { next: "/" }, replace: true });
    });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <img
          src="/icons/icon-192.png"
          alt="Seu Metro Quadrado"
          className="h-14 w-14 rounded-md bg-white object-contain shadow-elev-1"
        />
        <p className="text-sm text-muted-foreground">Carregando acesso...</p>
      </div>
    </main>
  );
}