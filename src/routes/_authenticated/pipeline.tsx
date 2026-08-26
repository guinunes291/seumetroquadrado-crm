import { createFileRoute, redirect } from "@tanstack/react-router";
import { ResponsiveTabs, ResponsiveTabsContent } from "@/components/ui/responsive-tabs";
import { PageHeader } from "@/components/page-header";
import { KanbanBoard } from "@/components/leads-kanban-board";
import { FechamentoView } from "@/features/pipeline/fechamento-view";
import { stagesDaFase, type FaseFunil } from "@/lib/leads";

type PipelineTab = "funil" | "fechamento";

// Pipeline comercial: o funil (kanban) e o Modo Fechamento na mesma central.
// /kanban e /radar redirecionam para cá. Com `?fase`, o quadro mostra só as
// colunas da fase (Prospecção × Carteira) — /pipeline cru segue o quadro completo.
export const Route = createFileRoute("/_authenticated/pipeline")({
  validateSearch: (search: Record<string, unknown>): { tab?: PipelineTab; fase?: FaseFunil } => ({
    tab: search.tab === "fechamento" ? "fechamento" : undefined,
    // Qualquer valor fora das duas fases vira undefined — bookmarks antigos
    // de /pipeline cru continuam abrindo o quadro completo.
    fase: search.fase === "prospeccao" || search.fase === "carteira" ? search.fase : undefined,
  }),
  // Em Prospecção a aba Fechamento não existe (a página renderiza só o funil),
  // e o resolvedor da sidebar desempata por `tab` sobre a location CRUA — um
  // ?fase=prospeccao&tab=fechamento acenderia "Modo Fechamento" na Carteira.
  // Normaliza a URL para o que a página de fato renderiza.
  beforeLoad: ({ search }) => {
    if (search.fase === "prospeccao" && search.tab) {
      throw redirect({ to: "/pipeline", search: { fase: "prospeccao" }, replace: true });
    }
  },
  head: () => ({ meta: [{ title: "Pipeline — Seu Metro Quadrado" }] }),
  component: PipelinePage,
});

function PipelinePage() {
  const { tab, fase } = Route.useSearch();
  const navigate = Route.useNavigate();
  // O Fechamento opera no fundo do funil — em Prospecção a aba não faz
  // sentido: só o quadro, e um tab=fechamento vindo na URL cai no funil.
  const soFunil = fase === "prospeccao";
  const activeTab: PipelineTab = soFunil ? "funil" : (tab ?? "funil");
  const onTabChange = (v: string) =>
    // Updater funcional para não apagar `fase` (o objeto literal descartava o
    // resto do search ao trocar de aba).
    navigate({
      search: (prev) => ({ ...prev, tab: v === "fechamento" ? "fechamento" : undefined }),
    });

  const header =
    fase === "prospeccao"
      ? {
          title: "Prospecção",
          description: "Funil de entrada — atenda, qualifique e avance o volumão do topo.",
        }
      : fase === "carteira"
        ? {
            title: "Gestão de Carteira",
            description: "Leads em andamento — visitas, análise de crédito e fechamento.",
          }
        : {
            title: "Pipeline",
            description:
              "Do primeiro contato ao contrato — arraste etapas no Funil e feche o mês no Modo Fechamento.",
          };

  return (
    <div className="space-y-4">
      <PageHeader title={header.title} description={header.description} />
      {soFunil ? (
        <KanbanBoard stages={stagesDaFase(fase)} />
      ) : (
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
            <KanbanBoard stages={stagesDaFase(fase)} />
          </ResponsiveTabsContent>
          <ResponsiveTabsContent value="fechamento">
            <FechamentoView />
          </ResponsiveTabsContent>
        </ResponsiveTabs>
      )}
    </div>
  );
}
