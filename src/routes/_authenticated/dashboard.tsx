import { createFileRoute, redirect } from "@tanstack/react-router";

// O "Dashboard" virou a página Inteligência. Redirect de compatibilidade para
// não quebrar links/atalhos salvos.
export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/inteligencia" });
  },
});
