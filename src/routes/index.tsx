import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { RoutePending } from "@/components/route-pending";
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

  return <RoutePending label="Carregando acesso..." />;
}