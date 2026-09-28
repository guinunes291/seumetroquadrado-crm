import { createFileRoute } from "@tanstack/react-router";
import { AcademiaGuard } from "@/features/academia/guard";
import { TrilhaPage } from "@/features/academia/trilha-page";

export const Route = createFileRoute("/_authenticated/academia/")({
  head: () => ({ meta: [{ title: "Minha trilha — Academia SMQ" }] }),
  component: () => (
    <AcademiaGuard>
      <TrilhaPage />
    </AcademiaGuard>
  ),
});
