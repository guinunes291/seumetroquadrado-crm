import { createFileRoute, redirect } from "@tanstack/react-router";
import { useUserRoles } from "@/hooks/use-auth";
import {
  DistribuicaoCommandCenter,
  DISTRIBUICAO_TABS,
  type DistribuicaoTab,
} from "@/features/distribuicao/command-center";

// Central de Distribuição (distribuição v3) — página standalone com as
// 3 roletas, fila de exceções, histórico, configurações e auditoria.
// `?tab=` permite deep-link direto em qualquer aba.
export const Route = createFileRoute("/_authenticated/distribuicao")({
  validateSearch: (search: Record<string, unknown>): { tab?: DistribuicaoTab } => ({
    tab: DISTRIBUICAO_TABS.includes(search.tab as DistribuicaoTab)
      ? (search.tab as DistribuicaoTab)
      : undefined,
  }),
  head: () => ({ meta: [{ title: "Distribuição — Seu Metro Quadrado" }] }),
  component: DistribuicaoRoute,
});

function DistribuicaoRoute() {
  const { isAdmin, isGestor, isSuperintendente, loading } = useUserRoles();
  const { tab } = Route.useSearch();

  // Admin/gestor operam; superintendente vê (somente leitura); corretor não
  // acessa a central — a própria elegibilidade dele aparece em Meu Perfil.
  if (!loading && !isAdmin && !isGestor && !isSuperintendente) {
    throw redirect({ to: "/" });
  }

  return <DistribuicaoCommandCenter tab={tab} />;
}
