import { createFileRoute } from "@tanstack/react-router";
import { AcademiaGestaoGuard } from "@/features/academia/gestao/guard-gestao";
import { FichaCorretorPage } from "@/features/academia/gestao/ficha-corretor-page";

export const Route = createFileRoute("/_authenticated/academia/gestao/corretor/$corretorId")({
  head: () => ({ meta: [{ title: "Ficha na Academia · Seu Metro Quadrado" }] }),
  component: FichaRota,
});

function FichaRota() {
  const { corretorId } = Route.useParams();
  return (
    <AcademiaGestaoGuard>
      <FichaCorretorPage corretorId={corretorId} />
    </AcademiaGestaoGuard>
  );
}
