import { createFileRoute } from "@tanstack/react-router";
import { AcademiaGestaoGuard } from "@/features/academia/gestao/guard-gestao";
import { ConteudoModuloPage } from "@/features/academia/gestao/conteudo-modulo-page";

export const Route = createFileRoute("/_authenticated/academia/conteudo/$codigo")({
  head: () => ({ meta: [{ title: "Editar módulo · Academia SMQ" }] }),
  component: ConteudoModuloRota,
});

function ConteudoModuloRota() {
  const { codigo } = Route.useParams();
  return (
    <AcademiaGestaoGuard somenteAdmin>
      <ConteudoModuloPage codigo={codigo} />
    </AcademiaGestaoGuard>
  );
}
