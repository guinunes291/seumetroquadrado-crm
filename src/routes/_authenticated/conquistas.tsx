import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota legada mantida para deep-links: o conteúdo vive como aba do hub
// (features/ranking/conquistas-page.tsx).
export const Route = createFileRoute("/_authenticated/conquistas")({
  beforeLoad: () => {
    throw redirect({ to: "/ranking", search: { tab: "conquistas" } });
  },
});
