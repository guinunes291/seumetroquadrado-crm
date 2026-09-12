import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useUserRoles } from "@/hooks/use-auth";
import { FilaUnicaPage } from "@/features/fila-unica/fila-unica-page";
import { Skeleton } from "@/components/ui/skeleton";

// Fila Única: a lista única do corretor e a porta da Central de Comando.
// `?corretor=<id>` abre a fila de outro corretor para a gestão ("Ver a fila"
// na tabela da equipe); o banco decide o escopo, a tela só pede.
export const Route = createFileRoute("/_authenticated/fila")({
  head: () => ({ meta: [{ title: "Fila Única — Seu Metro Quadrado" }] }),
  validateSearch: (search: Record<string, unknown>): { corretor?: string } => ({
    corretor: typeof search.corretor === "string" && search.corretor ? search.corretor : undefined,
  }),
  component: FilaRoute,
});

function FilaRoute() {
  const { isSdr, isAdmin, loading } = useUserRoles();
  const { corretor } = Route.useSearch();

  // Mesma régua da Hoje: o SDR tem hub próprio — a fila é do corretor e da
  // gestão. O `loading` importa: sem ele o redirect dispara antes do papel.
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isSdr && !isAdmin) {
    return <Navigate to="/sdr" replace />;
  }
  return <FilaUnicaPage corretorId={corretor} />;
}
