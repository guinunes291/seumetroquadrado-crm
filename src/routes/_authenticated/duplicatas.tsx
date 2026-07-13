import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota legada mantida para deep-links: o conteúdo vive como aba do hub
// (features/gestao/duplicatas-page.tsx).
export const Route = createFileRoute("/_authenticated/duplicatas")({
  beforeLoad: () => {
    throw redirect({ to: "/painel-gestor", search: { tab: "qualidade" } });
  },
});
