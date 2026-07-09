import { createFileRoute, redirect } from "@tanstack/react-router";

// "Relatórios" virou a página Inteligência (insights + evidência). Redirect de
// compatibilidade para não quebrar links/atalhos salvos.
export const Route = createFileRoute("/_authenticated/relatorios")({
  beforeLoad: () => {
    throw redirect({ to: "/inteligencia" });
  },
});
