import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota legada mantida para deep-links: a Copa SMQ (edição 2026) encerrou e a
// aba Competição saiu do hub de Desempenho — o endereço cai no ranking.
export const Route = createFileRoute("/_authenticated/copa")({
  beforeLoad: () => {
    throw redirect({ to: "/ranking", search: {} });
  },
});
