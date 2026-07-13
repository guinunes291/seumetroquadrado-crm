import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota legada mantida para deep-links: o conteúdo vive como aba do hub
// (features/comissoes/comissoes-page.tsx).
export const Route = createFileRoute("/_authenticated/comissoes")({
  beforeLoad: () => {
    throw redirect({ to: "/projetos", search: { tab: "comissoes" } });
  },
});
