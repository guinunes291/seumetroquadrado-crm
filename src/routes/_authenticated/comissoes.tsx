import { createFileRoute, redirect } from "@tanstack/react-router";

// Comissões é resultado financeiro do corretor — vive como aba do hub de
// Desempenho (o corretor vê as suas junto do ranking; a gestão de pagamento
// segue no Financeiro · Fechamento).
export const Route = createFileRoute("/_authenticated/comissoes")({
  beforeLoad: () => {
    throw redirect({ to: "/ranking", search: { tab: "comissoes" } });
  },
});
