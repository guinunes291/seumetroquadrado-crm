import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { RequireRole } from "@/components/require-role";
import { Skeleton } from "@/components/ui/skeleton";
import { InsightsPanel } from "@/features/inteligencia/insights-panel";

// Recharts (~105KB gz) só desce quando esta tela abre — e mesmo aqui os
// insights (topo) pintam primeiro; os gráficos hidratam em seguida (P3-13).
const RelatoriosView = lazy(() =>
  import("@/features/dashboard/relatorios-view").then(({ RelatoriosView }) => ({
    default: RelatoriosView,
  })),
);

// Inteligência: relatórios que EXPLICAM o negócio — insights em linguagem de
// negócio no topo, evidência (gráficos e tabelas) logo abaixo.
// /relatorios, /dashboard e /hoje?tab=analytics redirecionam para cá.
// Superfície de análise da OPERAÇÃO (relatórios org-wide) → só gestão. Um
// corretor não deve ver o funil/vendas de toda a empresa.
export const Route = createFileRoute("/_authenticated/inteligencia")({
  head: () => ({ meta: [{ title: "Inteligência — Seu Metro Quadrado" }] }),
  component: InteligenciaPage,
});

function ChartsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando relatórios">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

function InteligenciaPage() {
  return (
    <RequireRole allow={["admin", "gestor", "superintendente"]}>
      <div className="space-y-6">
        <PageHeader
          title="Inteligência"
          description="O que está funcionando, onde o funil vaza e para onde o mês caminha — com a evidência logo abaixo."
        />
        <InsightsPanel />
        <Suspense fallback={<ChartsSkeleton />}>
          <RelatoriosView />
        </Suspense>
      </div>
    </RequireRole>
  );
}
