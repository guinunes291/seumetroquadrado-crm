import { createFileRoute, redirect } from "@tanstack/react-router";

// "Meu Dia" foi fundido em "Hoje". Mantemos a rota antiga redirecionando para
// não quebrar links/atalhos salvos.
export const Route = createFileRoute("/_authenticated/meu-painel")({
  beforeLoad: () => {
    throw redirect({ to: "/hoje" });
  },
});
