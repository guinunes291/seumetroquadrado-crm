import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota legada mantida para deep-links: o conteúdo vive como aba de
// Configurações (features/gestao/corretores-page.tsx) desde o item 2.1.
export const Route = createFileRoute("/_authenticated/corretores")({
  beforeLoad: () => {
    throw redirect({ to: "/configuracoes", search: { tab: "pessoas" } });
  },
});
