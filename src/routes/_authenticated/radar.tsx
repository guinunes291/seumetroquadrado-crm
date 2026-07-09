import { createFileRoute, redirect } from "@tanstack/react-router";

// O Radar virou o Modo Fechamento do Pipeline. Redirect de compatibilidade
// para não quebrar links/atalhos salvos.
export const Route = createFileRoute("/_authenticated/radar")({
  beforeLoad: () => {
    throw redirect({ to: "/pipeline", search: { tab: "fechamento" } });
  },
});
