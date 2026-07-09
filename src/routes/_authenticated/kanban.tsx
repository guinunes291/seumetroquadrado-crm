import { createFileRoute, redirect } from "@tanstack/react-router";

// O Kanban virou a aba Funil do /pipeline. Redirect de compatibilidade para
// não quebrar links/atalhos salvos.
export const Route = createFileRoute("/_authenticated/kanban")({
  beforeLoad: () => {
    throw redirect({ to: "/pipeline" });
  },
});
