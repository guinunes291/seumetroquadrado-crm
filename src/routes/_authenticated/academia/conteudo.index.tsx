import { createFileRoute } from "@tanstack/react-router";
import { AcademiaGestaoGuard } from "@/features/academia/gestao/guard-gestao";
import { ConteudoPage } from "@/features/academia/gestao/conteudo-page";

export const Route = createFileRoute("/_authenticated/academia/conteudo/")({
  head: () => ({ meta: [{ title: "Conteúdo da Academia · Seu Metro Quadrado" }] }),
  component: () => (
    <AcademiaGestaoGuard somenteAdmin>
      <ConteudoPage />
    </AcademiaGestaoGuard>
  ),
});
