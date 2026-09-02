import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Lock } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserRoles } from "@/hooks/use-auth";
import { FilaFollowUpView } from "@/features/followup/fila-view";
import { EsgotadosView } from "@/features/followup/esgotados-view";

// Módulo Follow-Up — a régua de 13 toques virou processo: a fila do dia diz
// quem tocar e por qual canal; Esgotados guarda a decisão humana (nunca
// auto-perdido); KPIs mostram a curva de resposta por tentativa; Cobertura é
// a visão de gestão. Sem abas próprias: a sidebar contextual navega entre as
// seções via ?tab= na URL.

// Recharts das visões analíticas só desce quando a seção abre — mesmo padrão
// do hub de operação.
const FollowUpKpisView = lazy(() =>
  import("@/features/followup/kpis-view").then(({ FollowUpKpisView }) => ({
    default: FollowUpKpisView,
  })),
);
const CoberturaView = lazy(() =>
  import("@/features/followup/cobertura-view").then(({ CoberturaView }) => ({
    default: CoberturaView,
  })),
);
// A régua se configura onde se opera (auditoria das abas laterais,
// 2026-08-27): o editor saiu da aba Follow-Up de /configuracoes para cá.
const ReguaFollowUpConfigCard = lazy(() =>
  import("@/features/gestao/regua-followup-config").then(({ ReguaFollowUpConfigCard }) => ({
    default: ReguaFollowUpConfigCard,
  })),
);

type FollowUpTab = "esgotados" | "kpis" | "cobertura" | "config";
const TABS: FollowUpTab[] = ["esgotados", "kpis", "cobertura", "config"];

export const Route = createFileRoute("/_authenticated/follow-up")({
  head: () => ({ meta: [{ title: "Follow-Up — Seu Metro Quadrado" }] }),
  // Whitelist: valor desconhecido cai na fila (padrão) em vez de quebrar a rota.
  validateSearch: (search: Record<string, unknown>): { tab?: FollowUpTab } => ({
    tab: TABS.includes(search.tab as FollowUpTab) ? (search.tab as FollowUpTab) : undefined,
  }),
  component: FollowUpPage,
});

function AbaSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function FollowUpPage() {
  const { tab } = Route.useSearch();
  const { isAdmin, isGestor, isSuperintendente, loading: rolesLoading } = useUserRoles();
  const gestao = isAdmin || isGestor || isSuperintendente;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Follow-Up"
        description="A régua de toques: quem contatar hoje e por qual canal, até a resposta — ou a decisão."
      />

      {!tab && <FilaFollowUpView />}
      {tab === "esgotados" && <EsgotadosView />}
      {tab === "kpis" && (
        <Suspense fallback={<AbaSkeleton />}>
          <FollowUpKpisView />
        </Suspense>
      )}
      {tab === "cobertura" &&
        (rolesLoading ? (
          <AbaSkeleton />
        ) : gestao ? (
          <Suspense fallback={<AbaSkeleton />}>
            <CoberturaView />
          </Suspense>
        ) : (
          // Sem redirect: o corretor que cair aqui por link entende o porquê
          // e segue para a própria fila.
          <EmptyState
            icon={Lock}
            title="Acesso restrito à gestão"
            description="A cobertura de follow-up por corretor é uma visão de gestão. Sua fila do dia continua disponível na seção Fila."
            className="py-16"
          />
        ))}
      {tab === "config" &&
        (rolesLoading ? (
          <AbaSkeleton />
        ) : isAdmin ? (
          <Suspense fallback={<AbaSkeleton />}>
            <ReguaFollowUpConfigCard />
          </Suspense>
        ) : (
          <EmptyState
            icon={Lock}
            title="Configuração restrita ao administrador"
            description="A cadência da régua vale para a operação inteira — o ajuste é do admin. A Cobertura mostra o efeito dela no time."
            className="py-16"
          />
        ))}
    </div>
  );
}
