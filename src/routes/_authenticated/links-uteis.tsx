import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota legada mantida para deep-links: o conteúdo vive como aba do hub
// (features/projetos/links-uteis-page.tsx).
export const Route = createFileRoute("/_authenticated/links-uteis")({
  beforeLoad: () => {
    throw redirect({ to: "/projetos", search: { tab: "links" } });
  },
});
