import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota legada mantida para deep-links: o conteúdo vive como aba do hub
// (features/gestao/leads-por-corretor-page.tsx).
export const Route = createFileRoute("/_authenticated/leads-por-corretor")({
  beforeLoad: () => {
    throw redirect({ to: "/painel-gestor", search: { tab: "leads-corretor" } });
  },
});
