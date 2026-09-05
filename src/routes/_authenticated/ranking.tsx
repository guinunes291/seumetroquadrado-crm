import { createFileRoute, redirect } from "@tanstack/react-router";
import { Medal as Award, Trophy } from "@phosphor-icons/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConquistasPage } from "@/features/ranking/conquistas-page";
import { RankingPanel } from "@/features/ranking/ranking-page";

// Abas que já existiram no hub: as três primeiras seguem vivas como destino
// (ranking, conquistas) ou como redirect (competicao — a Copa encerrou);
// comissoes e metas migraram para outros hubs. Todas continuam na whitelist
// para o beforeLoad ler o valor cru e redirecionar (URL nenhuma morre).
type DesempenhoTab = "ranking" | "competicao" | "conquistas" | "comissoes" | "metas";
const DESEMPENHO_TABS: DesempenhoTab[] = [
  "ranking",
  "competicao",
  "conquistas",
  "comissoes",
  "metas",
];

export const Route = createFileRoute("/_authenticated/ranking")({
  // `tab` permite abrir/linkar direto uma aba do hub de Desempenho.
  validateSearch: (search: Record<string, unknown>): { tab?: DesempenhoTab } => ({
    tab: DESEMPENHO_TABS.includes(search.tab as DesempenhoTab)
      ? (search.tab as DesempenhoTab)
      : undefined,
  }),
  beforeLoad: ({ search }) => {
    // Metas migrou para o hub único de Gestão — deep-links antigos seguem.
    if (search.tab === "metas") {
      throw redirect({ to: "/painel-gestor", search: { tab: "metas" } });
    }
    // Comissões migrou para o hub Dinheiro (item 2.4) — idem.
    if (search.tab === "comissoes") {
      throw redirect({ to: "/financeiro", search: { tab: "comissoes" } });
    }
    // A Copa SMQ encerrou (edição 2026): a aba Competição saiu do hub e os
    // links antigos (/copa e ?tab=competicao) caem no ranking.
    if (search.tab === "competicao") {
      throw redirect({ to: "/ranking", search: {} });
    }
  },
  head: () => ({ meta: [{ title: "Desempenho — Seu Metro Quadrado" }] }),
  component: DesempenhoPage,
});

// Hub de Desempenho do TIME: ranking ao vivo (Real x Meta, Vendas,
// Produtividade) e conquistas. Comissões vive no hub Dinheiro (/financeiro) e
// Metas & Ritmo no hub de Operação — deep-links antigos redirecionam.
function DesempenhoPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeTab: "ranking" | "conquistas" = tab === "conquistas" ? "conquistas" : "ranking";
  const onTabChange = (v: string) =>
    navigate({ search: { tab: v === "conquistas" ? "conquistas" : undefined } });

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="space-y-4">
      <TabsList
        indicator
        aria-label="Seções do Desempenho"
        className="h-auto flex-wrap justify-start"
      >
        <TabsTrigger value="ranking" className="min-h-9 gap-1.5">
          <Trophy className="h-4 w-4" weight={activeTab === "ranking" ? "fill" : "duotone"} />{" "}
          Ranking
        </TabsTrigger>
        <TabsTrigger value="conquistas" className="min-h-9 gap-1.5">
          <Award className="h-4 w-4" weight={activeTab === "conquistas" ? "fill" : "duotone"} />{" "}
          Conquistas
        </TabsTrigger>
      </TabsList>
      <TabsContent value="ranking">
        <RankingPanel />
      </TabsContent>
      <TabsContent value="conquistas">
        <ConquistasPage />
      </TabsContent>
    </Tabs>
  );
}
