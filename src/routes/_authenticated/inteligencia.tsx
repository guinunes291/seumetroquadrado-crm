import { createFileRoute, redirect } from "@tanstack/react-router";

// A Inteligência foi consolidada no hub único de Gestão (/painel-gestor):
// Relatórios, Funil, Gargalos e Time agora são abas de lá. Esta rota fica
// como redirect de compatibilidade — deep-links salvos (inclusive com
// filtros na URL) continuam abrindo a leitura certa.
const TAB_DESTINO: Record<string, "funil" | "time"> = {
  funil: "funil",
  gargalos: "funil",
  performance: "time",
};

export const Route = createFileRoute("/_authenticated/inteligencia")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: string; de?: string; ate?: string; corretor?: string; origem?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
    de: typeof search.de === "string" ? search.de : undefined,
    ate: typeof search.ate === "string" ? search.ate : undefined,
    corretor: typeof search.corretor === "string" ? search.corretor : undefined,
    origem: typeof search.origem === "string" ? search.origem : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/painel-gestor",
      search: {
        tab: TAB_DESTINO[search.tab ?? ""] ?? ("relatorios" as const),
        de: search.de,
        ate: search.ate,
        corretor: search.corretor,
        origem: search.origem,
      },
    });
  },
});
