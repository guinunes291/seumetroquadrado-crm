import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { useDashboardSerie } from "@/features/dashboard/queries";
import { leadStatusLabel } from "@/lib/leads";
import { AtualizadoEm } from "./atualizado-em";
import {
  agregarCoortes,
  coorteSemDado,
  taxasDePassagem,
  vendasPorSemana,
} from "./funil-derive";
import {
  useCoberturaMinima,
  useFunilCoorte,
  useFunilSnapshot,
  useTempoEtapa,
  type FiltrosInteligencia,
} from "./queries";

const fmtMes = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
};

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });

/**
 * Tela 2 — Funil e Conversão. Duas leituras EXPLÍCITAS e alternáveis:
 * coorte (conversão real de quem entrou no período) × snapshot (estoque
 * atual, carga de trabalho). Confundir as duas é o erro clássico.
 */
export function FunilView({ filtros, origem }: { filtros: FiltrosInteligencia; origem: string | null }) {
  const [leitura, setLeitura] = useState<"coorte" | "snapshot">("coorte");
  const coorteQ = useFunilCoorte(filtros, origem, leitura === "coorte");
  const snapshotQ = useFunilSnapshot(filtros.corretor, leitura === "snapshot");
  const tempoQ = useTempoEtapa(filtros);
  const serieQ = useDashboardSerie(
    { di: filtros.de, df: filtros.ate ?? new Date().toISOString().slice(0, 10) },
    filtros.corretor,
    !!filtros.de,
  );
  const coberturaMin = useCoberturaMinima().data ?? 60;

  const agregada = useMemo(
    () => (coorteQ.data ? agregarCoortes(coorteQ.data) : null),
    [coorteQ.data],
  );
  const semanas = useMemo(() => vendasPorSemana(serieQ.data ?? []), [serieQ.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={leitura} onValueChange={(v) => setLeitura(v as "coorte" | "snapshot")}>
          <TabsList>
            <TabsTrigger value="coorte" title="Leads que ENTRARAM no período, seguidos até hoje — leitura correta para conversão">
              Coorte (conversão)
            </TabsTrigger>
            <TabsTrigger value="snapshot" title="Estoque atual por etapa — leitura correta para carga de trabalho">
              Snapshot (estoque)
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {leitura === "coorte" ? (
          <AtualizadoEm quando={coorteQ.data?.[0]?.atualizado_em} />
        ) : (
          <span className="text-xs text-muted-foreground">estoque ao vivo</span>
        )}
      </div>

      {leitura === "coorte" ? (
        coorteQ.isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : coorteQ.isError ? (
          <QueryErrorState
            title="Não foi possível carregar as coortes."
            error={coorteQ.error}
            onRetry={() => coorteQ.refetch()}
          />
        ) : coorteQ.data === null ? (
          <Card>
            <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
              <Info className="h-4 w-4 shrink-0" />
              Sem dado suficiente: a leitura de coorte depende da camada metrics (migrations da
              Fase A) ainda não aplicada neste ambiente. O snapshot ao lado continua disponível.
            </CardContent>
          </Card>
        ) : (
          <>
            {agregada && coorteSemDado(agregada.cobertura_pct, coberturaMin) && (
              <Card className="border-warning/40 bg-warning/5">
                <CardContent className="flex items-center gap-3 p-3 text-sm">
                  <Info className="h-4 w-4 shrink-0 text-warning" />
                  <span>
                    Cobertura de histórico de {agregada.cobertura_pct ?? 0}% (mínimo{" "}
                    {coberturaMin}%): boa parte destes leads veio do import legado sem transições
                    registradas (pré-jun/2026). As taxas abaixo estão suprimidas ou subestimadas —
                    escolha um período mais recente para a leitura confiável.
                  </span>
                </CardContent>
              </Card>
            )}

            {agregada && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Funil da coorte ({agregada.leads.toLocaleString("pt-BR")} leads no período)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {taxasDePassagem(agregada).map((p) => {
                    const max = agregada.leads || 1;
                    const largura = Math.max(2, Math.round((p.volume / max) * 100));
                    const suprimir = coorteSemDado(agregada.cobertura_pct, coberturaMin);
                    return (
                      <div key={p.etapa.chave}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-muted-foreground">{p.etapa.label}</span>
                          <span className="tabular-nums">
                            <span className="font-medium">{p.volume.toLocaleString("pt-BR")}</span>
                            {!suprimir && p.taxa_passagem_pct !== null && (
                              <span className="ml-2 text-muted-foreground">
                                {p.taxa_passagem_pct}% da anterior
                              </span>
                            )}
                            {!suprimir && p.conversao_acumulada_pct !== null && p.etapa.chave !== "leads" && (
                              <span className="ml-2 text-muted-foreground">
                                · {p.conversao_acumulada_pct}% do total
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="h-6 overflow-hidden rounded-md bg-muted">
                          <div
                            className="h-full bg-primary/80 transition-all"
                            style={{ width: `${largura}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Coortes mensais (comparativo período a período) */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Coortes mensais</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Coorte</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                      <TableHead className="text-right">Atendidos</TableHead>
                      <TableHead className="text-right">Agendaram</TableHead>
                      <TableHead className="text-right">Visitaram</TableHead>
                      <TableHead className="text-right">Análise</TableHead>
                      <TableHead className="text-right">Vendas</TableHead>
                      <TableHead className="text-right">Conv.</TableHead>
                      <TableHead className="text-right">Cobertura</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(coorteQ.data ?? []).map((r) => {
                      const semDado = coorteSemDado(r.cobertura_pct, coberturaMin);
                      const conv =
                        r.leads > 0 ? Math.round((r.vendas / r.leads) * 1000) / 10 : null;
                      return (
                        <TableRow key={r.mes_coorte}>
                          <TableCell className="font-medium">{fmtMes(r.mes_coorte)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <Link
                              to="/leads"
                              search={{
                                dataInicio: r.mes_coorte,
                                periodo: "custom",
                                ...(filtros.corretor ? { corretor: filtros.corretor } : {}),
                              }}
                              className="hover:underline"
                            >
                              {r.leads.toLocaleString("pt-BR")}
                            </Link>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{r.atingiu_atendimento}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.atingiu_agendado}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.atingiu_visita}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.atingiu_analise}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-success">
                            {r.vendas}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {semDado || conv === null ? (
                              <span
                                className="text-muted-foreground"
                                title="Sem dado suficiente: cobertura de transições abaixo do mínimo (import legado)"
                              >
                                sem dado
                              </span>
                            ) : (
                              `${conv}%`
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant="outline"
                              className={
                                semDado ? "border-warning/50 text-warning" : "text-muted-foreground"
                              }
                            >
                              {r.cobertura_pct ?? 0}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )
      ) : snapshotQ.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : snapshotQ.isError ? (
        <QueryErrorState
          title="Não foi possível carregar o snapshot."
          error={snapshotQ.error}
          onRetry={() => snapshotQ.refetch()}
        />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Estoque atual por etapa
              {snapshotQ.data?.degradado && (
                <span className="ml-2 text-xs font-normal text-warning">
                  modo degradado (sem VGV/parados)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(snapshotQ.data?.rows ?? []).map((r) => {
              const max = Math.max(1, ...(snapshotQ.data?.rows ?? []).map((x) => x.quantidade));
              return (
                <div key={r.etapa}>
                  <div className="mb-1 flex justify-between text-xs">
                    <Link
                      to="/leads"
                      search={{ status: r.etapa }}
                      className="text-muted-foreground hover:underline"
                    >
                      {leadStatusLabel(r.etapa)}
                    </Link>
                    <span className="tabular-nums">
                      <span className="font-medium">{r.quantidade.toLocaleString("pt-BR")}</span>
                      {r.vgv != null && r.vgv > 0 && (
                        <span className="ml-2 text-muted-foreground">~{fmtBRL(Number(r.vgv))}</span>
                      )}
                      {r.parados != null && r.parados > 0 && (
                        <span className="ml-2 text-destructive">{r.parados} parados</span>
                      )}
                    </span>
                  </div>
                  <div className="h-6 overflow-hidden rounded-md bg-muted">
                    <div
                      className="h-full bg-primary/80"
                      style={{ width: `${Math.max(2, Math.round((r.quantidade / max) * 100))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Tempo por etapa */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Tempo por etapa
            <AtualizadoEm quando={tempoQ.data?.[0]?.atualizado_em} />
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {tempoQ.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (tempoQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem dado suficiente: tempo por etapa depende de transições registradas
              (lead_status_transitions) no período — histórico existe desde jun/2026.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Etapa</TableHead>
                  <TableHead className="text-right">Média (h)</TableHead>
                  <TableHead className="text-right">Mediana (h)</TableHead>
                  <TableHead className="text-right">Amostra</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(tempoQ.data ?? []).map((r) => (
                  <TableRow key={r.etapa}>
                    <TableCell className="font-medium">{leadStatusLabel(r.etapa)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.horas_media ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.horas_p50 ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.n}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Curva semanal de vendas */}
      {semanas.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Vendas por semana
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                no período filtrado
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={semanas.map((s) => ({ ...s, label: fmtMes(s.semana) + " · " + s.semana.slice(8) }))}
                margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="semana" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="vendas" stroke="var(--success)" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
