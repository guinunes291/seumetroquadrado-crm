import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { cn } from "@/lib/utils";
import { useHomeWidgets, WIDGET_SIZE_CLASS } from "@/features/command-center/widget-registry";
import type { Periodo } from "@/features/command-center/widgets/use-home-data";

export const Route = createFileRoute("/_authenticated/hoje")({
  // A antiga aba Analytics virou a página /inteligencia — links salvos com
  // ?tab=analytics continuam funcionando via redirect.
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (search.tab === "analytics") {
      throw redirect({ to: "/painel-gestor", search: { tab: "relatorios" } });
    }
  },
  head: () => ({ meta: [{ title: "Central de Comando — Seu Metro Quadrado" }] }),
  component: CommandCenterPage,
});

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Central de Comando como cockpit de widgets: a rota calcula o ESCOPO
 * (minha/operação — PR #78) e entrega o resultado pronto a cada widget via
 * props; cada widget busca os próprios dados e falha isolado no seu
 * AsyncBoundary. Quais widgets aparecem depende do papel e do escopo
 * (useHomeWidgets); a ordem é fixa, definida em HOME_WIDGETS.
 */
function CommandCenterPage() {
  const { user } = useAuth();
  const { isAdmin, isGestor, isSuperintendente } = useUserRoles();
  // Período do bloco de desempenho — vive na rota porque os widgets "metas" e
  // "produtividade" compartilham o mesmo seletor (e as mesmas queries).
  const [periodo, setPeriodo] = useState<Periodo>("hoje");

  // Escopo da tela, derivado do PAPEL — não há mais alternância manual.
  // admin/superintendente veem TUDO; gestor vê a própria equipe; corretor só
  // tem "minha". Quem gere abre a Hoje na operação; quem vende, no próprio dia.
  const podeOperacao = isAdmin || isSuperintendente || isGestor;
  const escopo: "minha" | "operacao" = podeOperacao ? "operacao" : "minha";

  // Corretores da equipe do gestor (inclui ele mesmo). Só busca quando um gestor
  // sem papel global está na visão de operação.
  const precisaEquipe = escopo === "operacao" && isGestor && !isAdmin && !isSuperintendente;
  const equipeQ = useQuery({
    queryKey: ["hoje:equipe-corretores", user?.id],
    enabled: !!user && precisaEquipe,
    queryFn: async () => {
      const { data: equipes, error: equipesError } = await supabase
        .from("equipes")
        .select("id")
        .eq("gestor_id", user!.id);
      if (equipesError) throw equipesError;
      const equipeIds = (equipes ?? []).map((e) => e.id);
      if (equipeIds.length === 0) return [user!.id];
      const { data: membros, error: membrosError } = await supabase
        .from("profiles")
        .select("id")
        .in("equipe_id", equipeIds);
      if (membrosError) throw membrosError;
      return Array.from(new Set([user!.id, ...(membros ?? []).map((m) => m.id)]));
    },
  });
  const equipeCorretorIds = equipeQ.data;

  // null = sem filtro de corretor (toda a operação); array = restringe a esses ids.
  const scopeIds = useMemo<string[] | null>(() => {
    if (escopo === "minha") return user?.id ? [user.id] : [];
    if (isAdmin || isSuperintendente) return null;
    return equipeCorretorIds ?? (user?.id ? [user.id] : []);
  }, [escopo, isAdmin, isSuperintendente, equipeCorretorIds, user?.id]);
  const scopeKey = scopeIds ? scopeIds.join(",") : "operacao:all";
  // Evita disparar as queries com escopo incompleto (gestor esperando a equipe).
  const scopeReady = !precisaEquipe || equipeCorretorIds !== undefined;

  const widgets = useHomeWidgets(escopo);

  const primeiroNome =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    (user?.user_metadata?.nome as string | undefined)?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "corretor";

  return (
    <div className="space-y-6">
      <PageHeader
        title={escopo === "operacao" ? "Cockpit de Gestão" : "Central de Comando"}
        description={
          escopo === "operacao"
            ? `${saudacao()}, ${primeiroNome} — o que exige ação, o ritmo da meta e os atalhos da gestão.`
            : `${saudacao()}, ${primeiroNome} — este é o seu dia em ordem de prioridade.`
        }
      />

      {/* O escopo de equipe do gestor é pré-requisito de TODOS os widgets: se a
          busca falha, scopeReady nunca fica true, as queries dos widgets ficam
          desabilitadas (isLoading=false) e a tela inteira viraria "tudo em dia"
          com zeros. Por isso o erro/carregamento DESTA query é tratado aqui,
          antes de montar a grade. */}
      <AsyncBoundary
        isLoading={precisaEquipe && equipeQ.isLoading}
        isError={precisaEquipe && equipeQ.isError}
        error={equipeQ.error}
        errorTitle="Não foi possível carregar a sua equipe para montar a visão de operação."
        onRetry={() => void equipeQ.refetch()}
        loadingLabel="Carregando a sua equipe…"
      >
        <div className="stagger-children grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-6">
          {widgets.map((w) => {
            const Widget = w.Component;
            return (
              <div key={w.id} className={cn("min-w-0", WIDGET_SIZE_CLASS[w.size])}>
                <Widget
                  escopo={escopo}
                  scopeIds={scopeIds}
                  scopeKey={scopeKey}
                  scopeReady={scopeReady}
                  periodo={periodo}
                  onPeriodoChange={setPeriodo}
                />
              </div>
            );
          })}
        </div>
      </AsyncBoundary>
    </div>
  );
}
