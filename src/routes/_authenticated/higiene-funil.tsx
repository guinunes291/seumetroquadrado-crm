import { createFileRoute, redirect } from "@tanstack/react-router";
import { useUserRoles } from "@/hooks/use-auth";
import { useFlagHigiene } from "@/hooks/use-higiene-funil";
import { HigienePage } from "@/features/higiene/higiene-page";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/higiene-funil")({
  head: () => ({ meta: [{ title: "Higiene do Funil — Seu Metro Quadrado" }] }),
  component: HigieneFunilRoute,
});

function HigieneFunilRoute() {
  const { isAdmin, isGestor, isSuperintendente, loading } = useUserRoles();
  const { data: ligada, isPending: flagCarregando } = useFlagHigiene();

  // Mesma régua de /distribuicao: admin e gestor operam, superintendente vê,
  // corretor não entra. O `!loading` importa — sem ele a tela expulsa o usuário
  // no primeiro render, antes do papel chegar.
  if (!loading && !isAdmin && !isGestor && !isSuperintendente) {
    throw redirect({ to: "/" });
  }

  // "Ainda não sei" não é "desligada": tratar o carregamento como flag off
  // faria a tela sumir por um instante a cada visita.
  if (loading || flagCarregando) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (ligada === false) {
    throw redirect({ to: "/" });
  }

  return <HigienePage />;
}
