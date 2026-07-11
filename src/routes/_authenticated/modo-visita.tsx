import { createFileRoute } from "@tanstack/react-router";

import { ModoVisitaPage } from "@/features/visitas/modo-visita-page";

export const Route = createFileRoute("/_authenticated/modo-visita")({
  head: () => ({ meta: [{ title: "Modo Visita — Seu Metro Quadrado" }] }),
  component: ModoVisitaPage,
});
