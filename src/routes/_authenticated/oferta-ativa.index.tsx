import { createFileRoute } from "@tanstack/react-router";
import { OfertaAtivaPage } from "@/features/projetos/oferta-ativa-page";

// Oferta Ativa é prospecção de base (listas segmentadas para campanha) — vive
// no mundo de Leads, com página própria. A antiga aba de /projetos redireciona
// para cá.
export const Route = createFileRoute("/_authenticated/oferta-ativa/")({
  head: () => ({ meta: [{ title: "Oferta Ativa — Seu Metro Quadrado" }] }),
  component: OfertaAtivaPage,
});
