import { createFileRoute } from "@tanstack/react-router";
import { AcademiaGuard } from "@/features/academia/guard";
import { AulaPage } from "@/features/academia/aula-page";

export const Route = createFileRoute("/_authenticated/academia/modulo/$codigo/aula/$ordem")({
  head: () => ({ meta: [{ title: "Aula — Academia SMQ" }] }),
  component: RotaAula,
});

function RotaAula() {
  const { codigo, ordem } = Route.useParams();
  return (
    <AcademiaGuard>
      <AulaPage codigo={codigo} ordem={Number(ordem)} />
    </AcademiaGuard>
  );
}
