import { createFileRoute } from "@tanstack/react-router";
import { ResponsiveTabs, ResponsiveTabsContent } from "@/components/ui/responsive-tabs";
import { PageHeader } from "@/components/page-header";
import { KanbanBoard } from "@/components/leads-kanban-board";
import { FechamentoView } from "@/features/pipeline/fechamento-view";

type PipelineTab = "funil" | "fechamento";

// Pipeline comercial: o funil (kanban) e o Modo Fechamento na mesma central.
// /kanban e /radar redirecionam para cá.
export const Route = createFileRoute("/_authenticated/pipeline")({
  validateSearch: (search: Record<string, unknown>): { tab?: PipelineTab } => ({
    tab: search.tab === "fechamento" ? "fechamento" : undefined,
  }),
  head: () => ({ meta: [{ title: "Pipeline — Seu Metro Quadrado" }] }),
  component: PipelinePage,
});

function PipelinePage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeTab: PipelineTab = tab ?? "funil";
  const onTabChange = (v: string) =>
    navigate({ search: { tab: v === "fechamento" ? "fechamento" : undefined } });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pipeline"
        description="Do primeiro contato ao contrato — arraste etapas no Funil e feche o mês no Modo Fechamento."
      />
      <ResponsiveTabs
        value={activeTab}
        onValueChange={onTabChange}
        ariaLabel="Visões do pipeline"
        className="space-y-4"
        items={[
          { value: "funil", label: "Funil" },
          { value: "fechamento", label: "Fechamento" },
        ]}
      >
        <ResponsiveTabsContent value="funil">
          <KanbanBoard />
        </ResponsiveTabsContent>
        <ResponsiveTabsContent value="fechamento">
          <FechamentoView />
        </ResponsiveTabsContent>
      </ResponsiveTabs>
    </div>
  );
}
