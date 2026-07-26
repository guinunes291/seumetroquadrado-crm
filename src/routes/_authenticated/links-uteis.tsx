import { createFileRoute } from "@tanstack/react-router";
import { LinksUteisPage } from "@/features/projetos/links-uteis-page";

// Links Úteis é material de apoio do dia a dia (tabelas, books, sistemas das
// construtoras) — página própria, à mão a partir do Início. A antiga aba de
// /projetos redireciona para cá.
export const Route = createFileRoute("/_authenticated/links-uteis")({
  head: () => ({ meta: [{ title: "Links Úteis — Seu Metro Quadrado" }] }),
  component: LinksUteisPage,
});
