import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { InsightsPanel } from "@/features/inteligencia/insights-panel";
import { RelatoriosView } from "@/features/dashboard/relatorios-view";

// Inteligência: relatórios que EXPLICAM o negócio — insights em linguagem de
// negócio no topo, evidência (gráficos e tabelas) logo abaixo.
// /relatorios, /dashboard e /hoje?tab=analytics redirecionam para cá.
export const Route = createFileRoute("/_authenticated/inteligencia")({
  head: () => ({ meta: [{ title: "Inteligência — Seu Metro Quadrado" }] }),
  component: InteligenciaPage,
});

function InteligenciaPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Inteligência"
        description="O que está funcionando, onde o funil vaza e para onde o mês caminha — com a evidência logo abaixo."
      />
      <InsightsPanel />
      <RelatoriosView />
    </div>
  );
}
