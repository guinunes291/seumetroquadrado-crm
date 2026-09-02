// Cobertura da régua por corretor — visão de gestão do módulo Follow-Up.
// Leitura ao vivo (gestao_followup_cobertura, não-MV): fila de hoje, vencidos
// e régua esgotada por corretor do escopo. SEM recharts aqui — este arquivo
// pode ser importado fora do bundle lazy dos gráficos.

import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { GearSix } from "@phosphor-icons/react";
import { useUserRoles } from "@/hooks/use-auth";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fetchCobertura } from "./kpis-client";

export function CoberturaView() {
  // Quem enxerga a régua esgotando aqui não deveria caçar o ajuste: o link
  // leva direto à aba Config (admin) — visível só para quem pode mexer.
  const { isAdmin } = useUserRoles();
  const coberturaQ = useQuery({
    queryKey: ["followup:cobertura"],
    staleTime: 60_000,
    queryFn: () => fetchCobertura(),
  });

  // A RPC já devolve ordenado por vencidos desc — a tela não reordena.
  const rows = coberturaQ.data ?? [];
  const totais = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          fila_hoje: acc.fila_hoje + r.fila_hoje,
          vencidos: acc.vencidos + r.vencidos,
          esgotados: acc.esgotados + r.esgotados,
        }),
        { fila_hoje: 0, vencidos: 0, esgotados: 0 },
      ),
    [rows],
  );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Cobertura por corretor</CardTitle>
          <CardDescription>
            Fila do dia, toques vencidos e réguas esgotadas — leads ativos de cada corretor do seu
            escopo.
          </CardDescription>
        </div>
        {isAdmin && (
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link to="/follow-up" search={{ tab: "config" }}>
              <GearSix className="mr-1 h-4 w-4" /> Configurar régua
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <AsyncBoundary
          isLoading={coberturaQ.isLoading}
          isError={coberturaQ.isError}
          error={coberturaQ.error}
          errorTitle="Não foi possível carregar a cobertura do follow-up."
          onRetry={() => void coberturaQ.refetch()}
          loadingFallback={<Skeleton className="h-40 w-full" />}
        >
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem corretores com leads ativos na régua — a cobertura aparece quando houver carteira
              em acompanhamento.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Corretor</th>
                    <th className="py-2 pr-2 text-right font-medium">Fila hoje</th>
                    <th className="py-2 pr-2 text-right font-medium">Vencidos</th>
                    <th className="py-2 text-right font-medium">Esgotados</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.corretor_id} className="border-b border-border-subtle last:border-0">
                      <td className="max-w-[220px] truncate py-2 pr-2 font-medium">
                        {r.corretor_nome}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">{r.fila_hoje}</td>
                      <td
                        className={cn(
                          "py-2 pr-2 text-right tabular-nums",
                          r.vencidos > 0 && "font-semibold text-destructive",
                        )}
                      >
                        {r.vencidos}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {r.esgotados}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t text-xs">
                    <td className="py-2 pr-2 font-medium text-muted-foreground">
                      Total ({rows.length} {rows.length === 1 ? "corretor" : "corretores"})
                    </td>
                    <td className="py-2 pr-2 text-right font-semibold tabular-nums">
                      {totais.fila_hoje}
                    </td>
                    <td
                      className={cn(
                        "py-2 pr-2 text-right font-semibold tabular-nums",
                        totais.vencidos > 0 && "text-destructive",
                      )}
                    >
                      {totais.vencidos}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">
                      {totais.esgotados}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </AsyncBoundary>
      </CardContent>
    </Card>
  );
}
