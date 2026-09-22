import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Lock } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserRoles } from "@/hooks/use-auth";
import { FilaCadenciaView } from "@/features/cadencia/fila-view";

// Cadência D1/D2/D3 — a Fila do Dia do corretor para lead que ainda não
// respondeu. Depois da resposta o lead sai daqui e passa a ser regido pela
// régua de 13 toques em /follow-up: uma tela por janela, para o corretor
// nunca receber duas ordens sobre o mesmo cliente.
//
// ?tab=painel é a visão de gestão da mesma cadência (Fatia 4). Fica na MESMA
// rota de propósito: quem cobra o time e quem opera a fila olham o mesmo
// processo, e separar em dois módulos criaria duas verdades.
//
// Desenho e regras: docs/ops/cadencia-followup-reativacao.md.

// O painel só desce no bundle quando a seção abre — a fila do corretor é a
// tela quente e não paga pelo peso da visão de gestão.
const PainelCadenciaView = lazy(() =>
  import("@/features/cadencia/painel-view").then(({ PainelCadenciaView }) => ({
    default: PainelCadenciaView,
  })),
);

type CadenciaTab = "painel";
const TABS: CadenciaTab[] = ["painel"];

export const Route = createFileRoute("/_authenticated/cadencia")({
  head: () => ({ meta: [{ title: "Cadência — Seu Metro Quadrado" }] }),
  // Whitelist: valor desconhecido cai na fila (padrão) em vez de quebrar a rota.
  validateSearch: (search: Record<string, unknown>): { tab?: CadenciaTab } => ({
    tab: TABS.includes(search.tab as CadenciaTab) ? (search.tab as CadenciaTab) : undefined,
  }),
  component: CadenciaPage,
});

function AbaSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function CadenciaPage() {
  const { tab } = Route.useSearch();
  const { isAdmin, isGestor, isSuperintendente, loading } = useUserRoles();
  const gestao = isAdmin || isGestor || isSuperintendente;

  if (tab === "painel") {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Painel da cadência"
          description="Quem está devendo hoje, se o D3 se paga, como anda a reativação e se o motor rodou."
        />
        {loading ? (
          <AbaSkeleton />
        ) : gestao ? (
          <Suspense fallback={<AbaSkeleton />}>
            <PainelCadenciaView />
          </Suspense>
        ) : (
          // Sem redirect: quem chegou por link entende o porquê e volta para a
          // própria fila em vez de ver um erro.
          <EmptyState
            icon={Lock}
            title="Acesso restrito à gestão"
            description="O painel da cadência mostra o desempenho do time inteiro. Sua fila do dia continua na seção Cadência."
            className="py-16"
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Fila do Dia"
        description="Os leads cuja etapa vence hoje ou já venceu. Cumprir a cadência até o fim não conta como perda — deixar vencer, sim."
      />
      <FilaCadenciaView />
    </div>
  );
}
