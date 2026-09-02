// KPIs do Follow-Up — a curva que valida a tese dos 13 toques.
//
// ESTE arquivo importa recharts (~105KB gz) e por isso só entra no app via
// lazy(): nenhum módulo fora dele pode importar recharts nem importar este
// arquivo de forma estática. A camada de dados (kpis-client) é recharts-free.
//
// Papel decide a fonte, não o shape: gestão lê a curva agregada do time
// (gestao_followup_tentativas); corretor lê a própria (meu_followup_tentativas,
// auto-escopo no banco). Mesmo gráfico, mesmo layout.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowCounterClockwise,
  ArrowUpRight,
  PaperPlaneTilt,
  Percent,
} from "@phosphor-icons/react";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { useUserRoles } from "@/hooks/use-auth";
import { dateKey } from "@/lib/periodo";
import {
  fetchMinhasTentativas,
  fetchTentativasDoTime,
  resumoKpis,
  taxaResposta,
} from "./kpis-client";

/** Janela padrão da curva — mesma dos 6 meses do self-serve. */
const MESES_JANELA = 6;

const fmtPct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const fmtDataHora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
};

export function FollowUpKpisView() {
  const { isAdmin, isGestor, isSuperintendente, loading: rolesLoading } = useUserRoles();
  const gestao = isAdmin || isGestor || isSuperintendente;

  const curvaQ = useQuery({
    // A chave inclui a fonte: trocar de papel (impersonação/refresh de roles)
    // nunca serve a curva do time como se fosse a pessoal, e vice-versa.
    queryKey: ["followup:curva", gestao ? "time" : "minha", MESES_JANELA],
    enabled: !rolesLoading,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!gestao) return fetchMinhasTentativas(MESES_JANELA);
      // Paridade de janela com o self-serve: 1º dia do mês, N-1 meses atrás.
      const hoje = new Date();
      const de = dateKey(new Date(hoje.getFullYear(), hoje.getMonth() - (MESES_JANELA - 1), 1));
      return fetchTentativasDoTime(de, null, null);
    },
  });

  const rows = useMemo(() => curvaQ.data?.rows ?? [], [curvaQ.data]);
  const kpis = useMemo(() => resumoKpis(rows), [rows]);
  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        tentativa: r.tentativa,
        enviados: r.enviados,
        taxa: taxaResposta([r]),
      })),
    [rows],
  );

  const titulo = gestao ? "Curva do time" : "Minha curva";

  return (
    <div className="space-y-4">
      <AsyncBoundary
        isLoading={rolesLoading || curvaQ.isLoading}
        isError={curvaQ.isError}
        error={curvaQ.error}
        errorTitle="Não foi possível carregar os KPIs de follow-up."
        onRetry={() => void curvaQ.refetch()}
        loadingFallback={
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        }
      >
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
            Sem toques registrados nos últimos {MESES_JANELA} meses — a curva aparece assim que a
            régua registrar os primeiros contatos.
          </p>
        ) : (
          <>
            <StatGrid>
              <StatTile
                title="Toques enviados"
                value={kpis.enviados}
                icon={PaperPlaneTilt}
                hint={`últimos ${MESES_JANELA} meses`}
              />
              <StatTile
                title="Taxa de resposta"
                value={fmtPct(kpis.taxaPct)}
                icon={Percent}
                intent="info"
                hint={`${kpis.respondidos.toLocaleString("pt-BR")} respostas em até 7 dias`}
              />
              <StatTile
                title="Reativados 3º+ toque"
                value={kpis.reativados}
                icon={ArrowCounterClockwise}
                intent="success"
                hint="responderam do 3º toque em diante"
              />
              <StatTile
                title="Avançaram de etapa"
                value={kpis.avancaram}
                icon={ArrowUpRight}
                intent="success"
                hint="agendado ou além, em até 7 dias"
              />
            </StatGrid>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{titulo}</CardTitle>
                <CardDescription>
                  Volume de toques e % de resposta por nº da tentativa — a curva que valida a tese
                  dos 13 toques.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={chartData}
                      margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="tentativa"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: number) => `${v}º`}
                      />
                      <YAxis yAxisId="enviados" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis
                        yAxisId="taxa"
                        orientation="right"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: number) => `${v}%`}
                      />
                      <Tooltip
                        labelFormatter={(v) => `${v}º toque`}
                        formatter={(value: number, name: string) =>
                          name === "% de resposta" ? fmtPct(value) : value
                        }
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar
                        yAxisId="enviados"
                        dataKey="enviados"
                        name="Toques enviados"
                        fill="var(--chart-1)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Line
                        yAxisId="taxa"
                        type="monotone"
                        dataKey="taxa"
                        name="% de resposta"
                        stroke="var(--success)"
                        strokeWidth={2}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-2 font-medium">Toque</th>
                        <th className="py-2 pr-2 text-right font-medium">Enviados</th>
                        <th className="py-2 pr-2 text-right font-medium">Respondidos</th>
                        <th className="py-2 pr-2 text-right font-medium">% resposta</th>
                        <th className="py-2 text-right font-medium">Avançaram</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr
                          key={r.tentativa}
                          className="border-b border-border-subtle last:border-0"
                        >
                          <td className="py-2 pr-2 font-medium">{r.tentativa}º</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{r.enviados}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{r.respondidos}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">
                            {fmtPct(taxaResposta([r]))}
                          </td>
                          <td className="py-2 text-right tabular-nums">{r.avancaram}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-muted-foreground">
                  Dados da MV, atualizados a cada 15 min
                  {curvaQ.data?.atualizadoEm
                    ? ` — última atualização ${fmtDataHora(curvaQ.data.atualizadoEm)}`
                    : ""}
                  .
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </AsyncBoundary>
    </div>
  );
}
