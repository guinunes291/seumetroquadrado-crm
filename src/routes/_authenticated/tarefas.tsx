import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota legada mantida para deep-links: o conteúdo vive como aba do hub
// (features/agenda/tarefas-page.tsx).
export const Route = createFileRoute("/_authenticated/tarefas")({
  beforeLoad: () => {
    throw redirect({ to: "/agendamentos", search: { tab: "tarefas" } });
  },
});
