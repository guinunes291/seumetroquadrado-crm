import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota legada mantida para deep-links: o conteúdo vive como aba do hub
// (features/gestao/lixeira-page.tsx).
export const Route = createFileRoute("/_authenticated/lixeira")({
  beforeLoad: () => {
    throw redirect({ to: "/painel-gestor", search: { tab: "qualidade" } });
  },
});
