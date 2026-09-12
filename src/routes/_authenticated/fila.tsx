import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useUserRoles } from "@/hooks/use-auth";
import { FilaUnicaPage } from "@/features/fila-unica/fila-unica-page";
import { Skeleton } from "@/components/ui/skeleton";

// Fila Única (Fatia 1): a lista única do corretor. Vive na Central de Comando
// ao lado da Hoje; não substitui nenhuma rota — /atendimento, /follow-up e a
// home seguem vivas até a fila provar, com número, que absorve o que elas
// respondem (docs/ops/fila-unica-fatia1.md).
export const Route = createFileRoute("/_authenticated/fila")({
  head: () => ({ meta: [{ title: "Fila Única — Seu Metro Quadrado" }] }),
  component: FilaRoute,
});

function FilaRoute() {
  const { isSdr, isAdmin, loading } = useUserRoles();

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
  return <FilaUnicaPage />;
}
