import { createFileRoute, redirect } from "@tanstack/react-router";

// O "Dashboard" virou "Relatórios". Mantemos a rota antiga redirecionando para
// não quebrar links/atalhos salvos.
export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/relatorios" });
  },
});
