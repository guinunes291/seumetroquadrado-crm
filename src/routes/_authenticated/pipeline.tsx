import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { UserPlus, X } from "@phosphor-icons/react";
import { ResponsiveTabs, ResponsiveTabsContent } from "@/components/ui/responsive-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { KanbanBoard } from "@/components/leads-kanban-board";
import { FechamentoView } from "@/features/pipeline/fechamento-view";
import { abrirNovoLead } from "@/features/leads/novo-lead-dialog";
import { stagesDaFase, type FaseFunil } from "@/lib/leads";

type PipelineTab = "funil" | "fechamento";

const ROTULO_FASE: Record<FaseFunil, string> = {
  prospeccao: "Só Prospecção",
  carteira: "Só Carteira",
};

// Kanban comercial: o funil (quadro) e o Modo Fechamento na mesma central.
// /kanban e /radar redirecionam para cá. Com `?fase`, o quadro mostra só as
// colunas da fase (Prospecção × Carteira) — /pipeline cru é o quadro completo,
// e é ele que a seção "Kanban" da Gestão de Carteira abre (2026-09-11): um
// lead que está na Base de leads está no Kanban, sem fase escondida.
export const Route = createFileRoute("/_authenticated/pipeline")({
  validateSearch: (search: Record<string, unknown>): { tab?: PipelineTab; fase?: FaseFunil } => ({
    tab: search.tab === "fechamento" ? "fechamento" : undefined,
    // Qualquer valor fora das duas fases vira undefined — bookmarks antigos
    // de /pipeline cru continuam abrindo o quadro completo.
    fase: search.fase === "prospeccao" || search.fase === "carteira" ? search.fase : undefined,
  }),
  // Em Prospecção a aba Fechamento não existe (a página renderiza só o
  // funil). Normaliza a URL para o que a página de fato renderiza — mesmo
  // sem a antiga seção Fechamento da sidebar (corte 2026-08-30), um
  // ?fase=prospeccao&tab=fechamento seguiria mentindo na URL.
  beforeLoad: ({ search }) => {
    if (search.fase === "prospeccao" && search.tab) {
      throw redirect({ to: "/pipeline", search: { fase: "prospeccao" }, replace: true });
    }
  },
  head: () => ({ meta: [{ title: "Kanban — Seu Metro Quadrado" }] }),
  component: PipelinePage,
});

function PipelinePage() {
  const { tab, fase } = Route.useSearch();
  const navigate = Route.useNavigate();
  // A busca mora aqui para o campo ficar na linha das abas (padrão
  // Lançamento); o quadro recebe o texto e faz o resto (debounce e RPCs).
  const [busca, setBusca] = useState("");
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

  // Um título só (padrão Lançamento, 2026-10): "Kanban" fixo, com o eyebrow
  // automático "Módulo 03 · Gestão de Carteira". A fase continua recortando
  // as colunas — não troca mais o título; aparece como um chip que limpa.
  const header = (
    <PageHeader
      title="Kanban"
      description="Arraste a etapa; o Fechamento ordena o fundo do funil."
      actions={
        <Button size="sm" onClick={abrirNovoLead}>
          <UserPlus className="mr-1 h-4 w-4" aria-hidden="true" /> Novo lead
        </Button>
      }
    />
  );

  // Busca à direita da linha das abas; a fase, quando houver, ao lado dela.
  const ferramentasDoFunil = (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
      {fase && (
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          aria-label={`${ROTULO_FASE[fase]} — mostrar todas as etapas`}
          title="Mostrar todas as etapas"
          onClick={() => navigate({ search: (prev) => ({ ...prev, fase: undefined }) })}
        >
          {ROTULO_FASE[fase]}
          <X className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      )}
      <Input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar lead…"
        aria-label="Buscar leads no funil"
        className="min-h-11 w-full sm:w-64"
      />
    </div>
  );

  const quadro = <KanbanBoard stages={stagesDaFase(fase)} busca={busca} resumo />;

  return (
    <div className="space-y-4">
      {header}
      {soFunil ? (
        <div className="space-y-4">
          <div className="flex justify-end">{ferramentasDoFunil}</div>
          {quadro}
        </div>
      ) : (
        <ResponsiveTabs
          value={activeTab}
          onValueChange={onTabChange}
          ariaLabel="Visões do pipeline"
          // Abas à esquerda e busca à direita numa linha só; o conteúdo da aba
          // quebra para a linha de baixo (w-full).
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-4"
          items={[
            { value: "funil", label: "Funil" },
            { value: "fechamento", label: "Fechamento" },
          ]}
        >
          {activeTab === "funil" && ferramentasDoFunil}
          <ResponsiveTabsContent value="funil" className="mt-0 w-full">
            {quadro}
          </ResponsiveTabsContent>
          <ResponsiveTabsContent value="fechamento" className="mt-0 w-full">
            <FechamentoView />
          </ResponsiveTabsContent>
        </ResponsiveTabs>
      )}
    </div>
  );
}
