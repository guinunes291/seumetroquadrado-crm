import { createFileRoute, redirect } from "@tanstack/react-router";

// A página Hoje foi retirada em 12/09/2026: a Fila Única é a porta da Central
// de Comando. A rota fica só para links salvos, atalhos e notificações antigas
// não caírem em 404 — e a antiga aba Analytics (?tab=analytics) continua
// levando aos relatórios do Painel do Gestor.
export const Route = createFileRoute("/_authenticated/hoje")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (search.tab === "analytics") {
      throw redirect({ to: "/painel-gestor", search: { tab: "relatorios" } });
    }
    throw redirect({ to: "/fila" });
  },
});
