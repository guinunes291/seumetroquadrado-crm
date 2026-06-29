import { createFileRoute, redirect } from "@tanstack/react-router";

// O Kanban virou uma das visões de /leads (toggle Lista/Kanban). Mantemos a rota
// como redirect de compatibilidade para não quebrar links/atalhos salvos.
export const Route = createFileRoute("/_authenticated/kanban")({
  beforeLoad: () => {
    throw redirect({ to: "/leads", search: { view: "kanban" } });
  },
});
