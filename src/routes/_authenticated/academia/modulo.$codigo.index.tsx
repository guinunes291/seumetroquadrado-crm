import { createFileRoute } from "@tanstack/react-router";
import { AcademiaGuard } from "@/features/academia/guard";
import { ModuloPage } from "@/features/academia/modulo-page";

export const Route = createFileRoute("/_authenticated/academia/modulo/$codigo/")({
  head: () => ({ meta: [{ title: "Módulo · Academia SMQ" }] }),
  component: RotaModulo,
});

function RotaModulo() {
  const { codigo } = Route.useParams();
  return (
    <AcademiaGuard>
      <ModuloPage codigo={codigo} />
    </AcademiaGuard>
  );
}
