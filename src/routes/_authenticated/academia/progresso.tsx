import { createFileRoute } from "@tanstack/react-router";
import { AcademiaGuard } from "@/features/academia/guard";
import { ProgressoPage } from "@/features/academia/progresso-page";

export const Route = createFileRoute("/_authenticated/academia/progresso")({
  head: () => ({ meta: [{ title: "Meu progresso — Academia SMQ" }] }),
  component: () => (
    <AcademiaGuard>
      <ProgressoPage />
    </AcademiaGuard>
  ),
});
