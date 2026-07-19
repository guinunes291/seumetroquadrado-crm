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
    const redirect = (to: "/auth" | "/hoje", search?: { next: string }) => {
      if (cancelled) return;
      void navigate(search ? { to, search, replace: true } : { to, replace: true });
    };

    const failSafe = window.setTimeout(() => {
      redirect("/auth", { next: "/" });
    }, 3500);

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;

        window.clearTimeout(failSafe);
        if (data.session) {
          redirect("/hoje");
          return;
        }

        redirect("/auth", { next: "/" });
      })
      .catch(() => {
        window.clearTimeout(failSafe);
        redirect("/auth", { next: "/" });
      });

    return () => {
      cancelled = true;
      window.clearTimeout(failSafe);
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