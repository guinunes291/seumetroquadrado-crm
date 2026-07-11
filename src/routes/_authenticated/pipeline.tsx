import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
      <Tabs value={activeTab} onValueChange={onTabChange} className="space-y-4">
        <TabsList>
          <TabsTrigger value="funil">Funil</TabsTrigger>
          <TabsTrigger value="fechamento">Fechamento</TabsTrigger>
        </TabsList>
        <TabsContent value="funil">
          <KanbanBoard />
        </TabsContent>
        <TabsContent value="fechamento">
          <FechamentoView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
