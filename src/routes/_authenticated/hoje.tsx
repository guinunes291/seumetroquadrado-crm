import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { useHomeWidgetPrefs, WIDGET_SIZE_CLASS } from "@/features/command-center/widget-registry";
import { CustomizeHomeDialog } from "@/features/command-center/widgets/customize-dialog";
import type { Periodo } from "@/features/command-center/widgets/use-home-data";

export const Route = createFileRoute("/_authenticated/hoje")({
  // A antiga aba Analytics virou a página /inteligencia — links salvos com
  // ?tab=analytics continuam funcionando via redirect.
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (search.tab === "analytics") throw redirect({ to: "/inteligencia" });
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
 * AsyncBoundary. Quais widgets aparecem — e em que ordem — é preferência do
 * usuário (useHomeWidgetPrefs), ajustável pelo diálogo de personalização.
 */
function CommandCenterPage() {
  const { user } = useAuth();
  const { isAdmin, isGestor, isSuperintendente } = useUserRoles();
  // Período do bloco de desempenho — vive na rota porque os widgets "metas" e
  // "produtividade" compartilham o mesmo seletor (e as mesmas queries).
  const [periodo, setPeriodo] = useState<Periodo>("hoje");

  // Escopo da tela: "minha" (carteira do usuário) x "operacao" (visão gerencial).
  // admin/superintendente veem TUDO; gestor vê a própria equipe; corretor só
  // tem "minha". Default é "operacao" para quem pode — o admin abre a Hoje e vê
  // a operação, não um dia pessoal vazio.
  const podeOperacao = isAdmin || isSuperintendente || isGestor;
  const [escopoManual, setEscopoManual] = useState<"minha" | "operacao" | null>(null);
  const escopo: "minha" | "operacao" = escopoManual ?? (podeOperacao ? "operacao" : "minha");

  // Corretores da equipe do gestor (inclui ele mesmo). Só busca quando um gestor
  // sem papel global está na visão de operação.
  const precisaEquipe = escopo === "operacao" && isGestor && !isAdmin && !isSuperintendente;
  const { data: equipeCorretorIds } = useQuery({
    queryKey: ["hoje:equipe-corretores", user?.id],
    enabled: !!user && precisaEquipe,
    queryFn: async () => {
      const { data: equipes } = await supabase
        .from("equipes")
        .select("id")
        .eq("gestor_id", user!.id);
      const equipeIds = (equipes ?? []).map((e) => e.id);
      if (equipeIds.length === 0) return [user!.id];
      const { data: membros } = await supabase
        .from("profiles")
        .select("id")
        .in("equipe_id", equipeIds);
      return Array.from(new Set([user!.id, ...(membros ?? []).map((m) => m.id)]));
    },
  });

  // null = sem filtro de corretor (toda a operação); array = restringe a esses ids.
  const scopeIds = useMemo<string[] | null>(() => {
    if (escopo === "minha") return user?.id ? [user.id] : [];
    if (isAdmin || isSuperintendente) return null;
    return equipeCorretorIds ?? (user?.id ? [user.id] : []);
  }, [escopo, isAdmin, isSuperintendente, equipeCorretorIds, user?.id]);
  const scopeKey = scopeIds ? scopeIds.join(",") : "operacao:all";
  // Evita disparar as queries com escopo incompleto (gestor esperando a equipe).
  const scopeReady = !precisaEquipe || equipeCorretorIds !== undefined;

  const prefs = useHomeWidgetPrefs(escopo);

  const primeiroNome =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    (user?.user_metadata?.nome as string | undefined)?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "corretor";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Central de Comando"
        description={
          escopo === "operacao"
            ? `${saudacao()}, ${primeiroNome} — a operação de hoje em ordem de prioridade.`
            : `${saudacao()}, ${primeiroNome} — este é o seu dia em ordem de prioridade.`
        }
        actions={
          <>
            {podeOperacao ? (
              <div className="inline-flex rounded-md border bg-card p-0.5">
                {(["operacao", "minha"] as const).map((e) => (
                  <Button
                    key={e}
                    size="sm"
                    variant={escopo === e ? "default" : "ghost"}
                    onClick={() => setEscopoManual(e)}
                  >
                    {e === "operacao" ? "Operação" : "Minha"}
                  </Button>
                ))}
              </div>
            ) : undefined}
            <CustomizeHomeDialog prefs={prefs} />
          </>
        }
      />

      {prefs.visible.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="Todos os widgets estão ocultos"
          description="Use o botão de personalização no topo da página para reativá-los."
        />
      ) : (
        <div className="stagger-children grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-6">
          {prefs.visible.map((w) => {
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
      )}
    </div>
  );
}
