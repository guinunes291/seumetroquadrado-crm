import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/")({
  beforeLoad: () => {
    // "Hoje" é a tela inicial do dia (fila acionável).
    throw redirect({ to: "/hoje" });
  },
});
