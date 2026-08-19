import { createFileRoute } from "@tanstack/react-router";
import { ResponsiveTabs, ResponsiveTabsContent } from "@/components/ui/responsive-tabs";
import { useUserRoles } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { FechamentoPage } from "@/features/financeiro/fechamento-page";
import { ComissoesPage } from "@/features/comissoes/comissoes-page";
import { DrePage } from "@/features/financeiro/dre-page";

// DINHEIRO — hub financeiro (auditoria ux-ia-2026-08, item 2.4 [DECIDIDO]):
// fechamento, comissões e aprovação de venda no mesmo lugar. Responde "o que
// entrou, o que aprovo e o que se paga?" e conserta a tarefa #15 — o badge de
// aprovações agora aponta para a tela que aprova (PendingSalesApproval é
// montado pela ComissoesPage, para gestão).
//
// Guard POR ABA, não por rota: Fechamento é ferramenta de admin/gestor, mas
// Comissões é também o resultado financeiro PESSOAL do corretor (recortado
// pela RLS) — um guard de rota admin/gestor quebraria o corretor.
//
// DRE: resultado por unidade + consolidado da rede (módulo dre_*, 100%
// aditivo). Mesma regra do Fechamento — ferramenta de gestão, guard por aba.
const FINANCEIRO_TABS = ["fechamento", "comissoes", "dre"] as const;
type FinanceiroTab = (typeof FINANCEIRO_TABS)[number];

export const Route = createFileRoute("/_authenticated/financeiro/")({
  validateSearch: (search: Record<string, unknown>): { tab?: FinanceiroTab } => ({
    tab: FINANCEIRO_TABS.includes(search.tab as FinanceiroTab)
      ? (search.tab as FinanceiroTab)
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Dinheiro — Seu Metro Quadrado" },
      {
        name: "description",
        content: "Fechamento financeiro, comissões e aprovação de vendas da operação.",
      },
      { property: "og:title", content: "Dinheiro — Seu Metro Quadrado" },
      {
        property: "og:description",
        content: "Fechamento financeiro, comissões e aprovação de vendas da operação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinanceiroPage,
});

function FinanceiroPage() {
  const { isAdmin, isGestor, loading } = useUserRoles();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const podeFechamento = isAdmin || isGestor;

  if (loading) {
    return <Skeleton className="h-40 w-full" aria-busy="true" aria-label="Carregando" />;
  }

  // Default por papel: gestão cai no Fechamento (ferramenta diária); corretor
  // e superintendente caem nas Comissões. Deep-link de fechamento/DRE sem
  // papel degrada para Comissões em vez de tela vazia.
  const activeTab: FinanceiroTab =
    (tab === "fechamento" || tab === "dre") && !podeFechamento
      ? "comissoes"
      : (tab ?? (podeFechamento ? "fechamento" : "comissoes"));
  const onTabChange = (v: string) =>
    navigate({
      search: {
        tab: FINANCEIRO_TABS.includes(v as FinanceiroTab) ? (v as FinanceiroTab) : undefined,
      },
    });

  // Sem aba de fechamento, sobra uma aba só — não renderizar barra de abas
  // para uma opção única (as páginas têm PageHeader próprio).
  if (!podeFechamento) {
    return <ComissoesPage />;
  }

  return (
    <ResponsiveTabs
      value={activeTab}
      onValueChange={onTabChange}
      ariaLabel="Visões do financeiro"
      className="space-y-4"
      items={[
        { value: "fechamento", label: "Fechamento" },
        { value: "comissoes", label: "Comissões & Aprovação" },
        { value: "dre", label: "DRE" },
      ]}
    >
      <ResponsiveTabsContent value="fechamento">
        <FechamentoPage />
      </ResponsiveTabsContent>
      <ResponsiveTabsContent value="comissoes">
        <ComissoesPage />
      </ResponsiveTabsContent>
      <ResponsiveTabsContent value="dre">
        <DrePage />
      </ResponsiveTabsContent>
    </ResponsiveTabs>
  );
}
