import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useUserRoles } from "@/hooks/use-auth";
import { ReservaPage } from "@/features/carteira-ativa/reserva-page";
import { Skeleton } from "@/components/ui/skeleton";

// Reserva: o que ficou guardado esperando vaga na carteira ativa — a segunda
// seção da Central de Comando, par da Fila Única. `?corretor=<id>` abre a
// Reserva de outro corretor para a gestão (leitura; o resgate é sempre para a
// própria carteira e o banco recusa o resto). O escopo é decidido no banco.
export const Route = createFileRoute("/_authenticated/reserva")({
  head: () => ({ meta: [{ title: "Reserva — Seu Metro Quadrado" }] }),
  validateSearch: (search: Record<string, unknown>): { corretor?: string } => ({
    corretor: typeof search.corretor === "string" && search.corretor ? search.corretor : undefined,
  }),
  component: ReservaRoute,
});

function ReservaRoute() {
  const { isSdr, isAdmin, loading } = useUserRoles();
  const { corretor } = Route.useSearch();

  // Mesma régua da Fila Única: o SDR tem hub próprio e não tem carteira de
  // corretor. O `loading` importa — sem ele o redirect dispara antes do papel.
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isSdr && !isAdmin) {
    return <Navigate to="/sdr" replace />;
  }
  return <ReservaPage corretorId={corretor} />;
}
