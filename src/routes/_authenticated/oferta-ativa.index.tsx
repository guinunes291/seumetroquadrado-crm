import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota legada mantida para deep-links: o conteúdo vive como aba do hub
// (features/projetos/oferta-ativa-page.tsx).
export const Route = createFileRoute("/_authenticated/oferta-ativa/")({
  beforeLoad: () => {
    throw redirect({ to: "/projetos", search: { tab: "oferta" } });
  },
});
