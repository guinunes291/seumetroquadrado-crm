import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota legada mantida para deep-links: Comissões vive como aba do hub
// Dinheiro (/financeiro) desde o item 2.4 da auditoria ux-ia-2026-08.
export const Route = createFileRoute("/_authenticated/comissoes")({
  beforeLoad: () => {
    throw redirect({ to: "/financeiro", search: { tab: "comissoes" } });
  },
});
