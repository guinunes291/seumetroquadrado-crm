import { createFileRoute, redirect } from "@tanstack/react-router";

// "Relatórios" foi consolidado como a aba "Analytics" dentro de /hoje (Fase 1).
// Mantemos a rota como redirect de compatibilidade para não quebrar links/atalhos.
export const Route = createFileRoute("/_authenticated/relatorios")({
  beforeLoad: () => {
    throw redirect({ to: "/hoje", search: { tab: "analytics" } });
  },
});
