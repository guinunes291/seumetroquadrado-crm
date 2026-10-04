import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useUserRoles } from "@/hooks/use-auth";
import { Meus65Page } from "@/features/em-atendimento/meus-65-page";
import { Skeleton } from "@/components/ui/skeleton";

// Meus 65: quem disputa as vagas de Em atendimento e a escolha do corretor
// (regra dos 65, Fatia 2). `?corretor=<id>` abre a tela de outro corretor
// para a gestão, em leitura. O escopo é decidido no banco.
export const Route = createFileRoute("/_authenticated/meus-65")({
  head: () => ({ meta: [{ title: "Meus 65 — Seu Metro Quadrado" }] }),
  validateSearch: (search: Record<string, unknown>): { corretor?: string } => ({
    corretor: typeof search.corretor === "string" && search.corretor ? search.corretor : undefined,
  }),
  component: Meus65Route,
});

function Meus65Route() {
  const { isSdr, isAdmin, loading } = useUserRoles();
  const { corretor } = Route.useSearch();

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  // Mesma régua da Fila e da Minha base: o SDR não tem carteira de corretor.
  if (isSdr && !isAdmin) {
    return <Navigate to="/sdr" replace />;
  }
  return <Meus65Page corretorId={corretor} />;
}
