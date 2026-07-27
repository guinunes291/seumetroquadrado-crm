// Raio-X do Corretor — relatório individual de 1 página (aba Time do hub de
// Gestão). É a página da reunião 1:1: resultado vs. time, onde o funil DELE
// trava, evolução 6 meses/trimestral, carteira e exceções de hoje, perdas e
// comissões. Zero SQL novo: compõe as RPCs da camada de gestão.

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  GraduationCap,
  Info,
  Rocket,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/ui/sparkline";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePainelDia } from "@/features/gestao/painel-dia/use-painel-dia";
import { TIPO_META } from "@/features/gestao/painel-dia/derive";
import { usePacing } from "@/features/metas/pacing-panel";
import { projecaoLinear, semaforo } from "@/features/metas/pacing";
import { exportSheetsXlsx } from "@/lib/spreadsheets";
import { leadStatusLabel, MOTIVO_PERDA_LABEL } from "@/lib/leads";
import { cn } from "@/lib/utils";
import { AtualizadoEm } from "./atualizado-em";
import { agregarCoortes, coorteSemDado } from "./funil-derive";
import { SINAL_LABEL, mediasDoTime, sinalizar } from "./performance-derive";
import {
  compararComTime,
  evolucaoTrimestral,
  funilLadoALado,
  raioXParaSheets,
  resumoComissoes,
  type ComissaoRow,
} from "./raio-x-derive";
import {
  useCoberturaMinima,
  useFunilCoorte,
  useFunilSnapshot,
  useMotivosPerdaGestao,
  usePerformanceCorretores,
  usePerformanceDrill,
  type FiltrosInteligencia,
  type PerformanceDrillRow,
} from "./queries";

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });

const fmtMes = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
};

/** Janela do Raio-X: últimos N meses fechando em hoje. */
function janela(meses: number): FiltrosInteligencia {
  const d = new Date();
  return {
    de: new Date(d.getFullYear(), d.getMonth() - (meses - 1), 1).toISOString().slice(0, 10),
    ate: null,
    corretor: null,
  };
}

const PERIODOS = [3, 6, 12] as const;
type Periodo = (typeof PERIODOS)[number];

export function RaioXCorretor({
  corretorId,
  onVoltar,
}: {
  corretorId: string;
  onVoltar: () => void;
}) {
  const hoje = new Date();
  const mesAtual = `${hoje.toISOString().slice(0, 8)}01`;
  // Um único filtro de período rege TODAS as janelas de análise (funil,
  // evolução, perdas, comissões). O cabeçalho continua sendo "o mês".
  const [meses, setMeses] = useState<Periodo>(6);
  const filtrosDele = useMemo(() => ({ ...janela(meses), corretor: corretorId }), [corretorId, meses]);
  const filtrosTime = useMemo(() => janela(meses), [meses]);

  const perfQ = usePerformanceCorretores(mesAtual);
  const drillQ = usePerformanceDrill(corretorId, meses);
  const coorteDeleQ = useFunilCoorte(filtrosDele, null);
  const coorteTimeQ = useFunilCoorte(filtrosTime, null);
  const snapshotQ = useFunilSnapshot(corretorId);
  const excecoesQ = usePainelDia(true, corretorId);
  const perdasQ = useMotivosPerdaGestao(filtrosDele);
  const pacingQ = usePacing(hoje.getFullYear(), hoje.getMonth() + 1);
  const coberturaMin = useCoberturaMinima().data ?? 60;

  const comissoesQ = useQuery({
    queryKey: ["raiox:comissoes", corretorId, meses],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ComissaoRow[]> => {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1), 1).toISOString();
      const { data, error } = await supabase
        .from("comissoes")
        .select("status, valor_liquido, valor_comissao")
        .eq("beneficiario_id", corretorId)
        .gte("created_at", inicio);
      if (error) throw error;
      return (data ?? []) as ComissaoRow[];
    },
  });

  const time = perfQ.data?.rows ?? [];
  const corretor = time.find((r) => r.corretor_id === corretorId);
  const medias = useMemo(() => mediasDoTime(time), [time]);
  const sinal = corretor ? sinalizar(corretor, medias) : null;
  const comparacoes = useMemo(
    () => (corretor ? compararComTime(corretor, time) : []),
    [corretor, time],
  );

  const coorteDele = useMemo(
    () => (coorteDeleQ.data ? agregarCoortes(coorteDeleQ.data) : null),
    [coorteDeleQ.data],
  );
  const coorteTime = useMemo(
    () => (coorteTimeQ.data ? agregarCoortes(coorteTimeQ.data) : null),
    [coorteTimeQ.data],
  );
  const funil = useMemo(() => funilLadoALado(coorteDele, coorteTime), [coorteDele, coorteTime]);
  const funilSemDado = coorteDele === null || coorteSemDado(coorteDele.cobertura_pct, coberturaMin);

  const serie = drillQ.data ?? [];
  const trimestres = useMemo(() => evolucaoTrimestral(serie), [serie]);
  const comissoes = useMemo(() => resumoComissoes(comissoesQ.data ?? []), [comissoesQ.data]);

  const metaDele = pacingQ.data?.por_corretor.find((c) => c.corretor_id === corretorId);
  const du = pacingQ.data?.dias_uteis;
  const projVgv =
    metaDele && du ? projecaoLinear(metaDele.vgv, du.passados, du.total) : null;
  const farol = metaDele ? semaforo(projVgv, metaDele.meta_gmv) : "neutro";

  const exportar = async () => {
    try {
      await exportSheetsXlsx(`raio-x-${(corretor?.nome ?? "corretor").toLowerCase().replace(/\s+/g, "-")}`, [
        ...raioXParaSheets({
          nome: corretor?.nome ?? "Corretor",
          comparacoes,
          serie,
          funil,
          perdas: perdasQ.data?.rows ?? [],
        }),
      ]);
      toast.success("Raio-X exportado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar.");
    }
  };

  if (perfQ.isLoading) return <Skeleton className="h-96 w-full" />;
  if (!corretor) {
    return (
      <div className="space-y-3">
        <Button size="sm" variant="ghost" onClick={onVoltar}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Time
        </Button>
        <p className="text-sm text-muted-foreground">
          Corretor não encontrado no seu escopo (ou fora da equipe).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Barra de ações */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onVoltar}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Time
          </Button>
          {/* Filtro de período: rege funil, evolução, perdas e comissões. */}
          <div className="inline-flex rounded-md border bg-card p-0.5">
            {PERIODOS.map((p) => (
              <Button
                key={p}
                size="sm"
                variant={meses === p ? "default" : "ghost"}
                onClick={() => setMeses(p)}
              >
                {p} meses
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AtualizadoEm quando={corretor.atualizado_em} />
          <Button asChild size="sm" variant="outline">
            <Link to="/leads" search={{ corretor: corretorId }}>
              Ver leads
            </Link>
          </Button>
          <Button size="sm" onClick={exportar}>
            <Download className="mr-1 h-4 w-4" /> Exportar Raio-X
          </Button>
        </div>
      </div>

      {/* 1. Cabeçalho de resultado */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-display flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
          {corretor.nome
            .split(" ")
            .slice(0, 2)
            .map((p) => p[0])
            .join("")}
        </span>
        <div className="min-w-0">
          <h2 className="font-display truncate text-xl font-semibold">{corretor.nome}</h2>
          <p className="text-xs text-muted-foreground">
            {corretor.presente ? "presente hoje" : "ausente hoje"} · carga {corretor.carga_ativa}
            {corretor.capacidade_pct != null && ` (${corretor.capacidade_pct}% da capacidade)`}
            {metaDele && metaDele.meta_gmv > 0 && (
              <>
                {" · meta "}
                {fmtBRL(metaDele.meta_gmv)}{" "}
                <span
                  className={cn(
                    farol === "verde" && "text-success",
                    farol === "ambar" && "text-warning",
                    farol === "vermelho" && "text-destructive",
                  )}
                >
                  (
                  {farol === "verde"
                    ? "no ritmo"
                    : farol === "ambar"
                      ? "atenção"
                      : farol === "vermelho"
                        ? "risco"
                        : "sem base"}
                  )
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      <StatGrid>
        {comparacoes
          .filter((c) => ["vendas", "vgv", "visitas_realizadas", "primeira_resposta"].includes(c.chave))
          .map((c) => {
            const acima = c.deltaPct !== null && (c.menorMelhor ? c.deltaPct < 0 : c.deltaPct > 0);
            return (
              <StatTile
                key={c.chave}
                title={c.label}
                value={
                  c.chave === "vgv"
                    ? c.valor === null
                      ? "—"
                      : fmtBRL(c.valor)
                    : (c.valor ?? "—")
                }
                intent={c.deltaPct === null ? "neutral" : acima ? "success" : "warning"}
                hint={
                  c.mediaTime === null ? (
                    "média do time: sem amostra"
                  ) : (
                    <span>
                      time: {c.chave === "vgv" ? fmtBRL(c.mediaTime) : Math.round(c.mediaTime * 10) / 10}
                      {c.deltaPct !== null && (
                        <span className={cn("ml-1 font-medium", acima ? "text-success" : "text-warning")}>
                          ({c.deltaPct > 0 ? "+" : ""}
                          {c.deltaPct}%)
                        </span>
                      )}
                    </span>
                  )
                }
              />
            );
          })}
      </StatGrid>

      {/* 2. Sinal de gestão */}
      <Card
        className={cn(
          sinal === "mentoria" && "border-warning/40 bg-warning/5",
          sinal === "dar_mais_lead" && "border-success/40 bg-success/5",
        )}
      >
        <CardContent className="flex items-center gap-3 p-3 text-sm">
          {sinal === "mentoria" ? (
            <GraduationCap className="h-4 w-4 shrink-0 text-warning" />
          ) : sinal === "dar_mais_lead" ? (
            <Rocket className="h-4 w-4 shrink-0 text-success" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span>
            {sinal
              ? SINAL_LABEL[sinal]
              : "Dentro do padrão do time no mês (esforço e conversão na média)."}
            <span className="ml-1 text-xs text-muted-foreground">
              — {corretor.contatos} contatos · {corretor.vendas} vendas em{" "}
              {corretor.leads_recebidos} leads
            </span>
          </span>
        </CardContent>
      </Card>

      {/* 3. Funil dele × time */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Onde o funil dele trava ({meses} meses, coorte)
            <AtualizadoEm quando={coorteDeleQ.data?.[0]?.atualizado_em} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {coorteDeleQ.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : funilSemDado ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4 shrink-0" />
              Sem dado suficiente: cobertura de histórico abaixo de {coberturaMin}% na janela (ou
              camada metrics não aplicada) — as taxas seriam enganosas.
            </p>
          ) : (
            <>
            <div className="mb-4 h-[220px]">
              <FunilComparadoChart data={funil} nome={corretor.nome.split(" ")[0]} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Etapa</TableHead>
                  <TableHead className="text-right">Ele(a)</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                  <TableHead className="text-right">Gap</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {funil.map((f) => (
                  <TableRow key={f.etapa}>
                    <TableCell className="font-medium">{f.etapa}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {f.minhaTaxa === null ? "—" : `${f.minhaTaxa}%`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {f.taxaTime === null ? "—" : `${f.taxaTime}%`}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        f.gapPp !== null && f.gapPp < -5 && "text-destructive",
                        f.gapPp !== null && f.gapPp > 5 && "text-success",
                      )}
                    >
                      {f.gapPp === null ? "—" : `${f.gapPp > 0 ? "+" : ""}${f.gapPp} p.p.`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </>
          )}
        </CardContent>
      </Card>

      {/* 4. Evolução + trimestres */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Evolução ({meses} meses)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {drillQ.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : serie.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem histórico mensal (camada metrics não aplicada ou corretor sem atividade).
            </p>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="h-[220px]">
                  <ResultadoMensalChart serie={serie} />
                </div>
                <div className="h-[220px]">
                  <EsforcoMensalChart serie={serie} />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-2 font-medium">Mês</th>
                      <th className="py-2 pr-2 text-right font-medium">Leads</th>
                      <th className="py-2 pr-2 text-right font-medium">Contatos</th>
                      <th className="py-2 pr-2 text-right font-medium">Visitas</th>
                      <th className="py-2 pr-2 text-right font-medium">Análises</th>
                      <th className="py-2 pr-2 text-right font-medium">Vendas</th>
                      <th className="py-2 pr-2 text-right font-medium">VGV</th>
                      <th className="py-2 text-right font-medium">1ª resp.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serie.map((m) => (
                      <tr key={m.mes} className="border-b border-border-subtle last:border-0">
                        <td className="py-2 pr-2 font-medium">{fmtMes(m.mes)}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{m.leads_recebidos}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{m.contatos}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">
                          {m.visitas_realizadas}
                          {m.no_shows > 0 && (
                            <span className="ml-1 text-xs text-destructive">({m.no_shows}ns)</span>
                          )}
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums">{m.analises}</td>
                        <td className="py-2 pr-2 text-right font-semibold tabular-nums text-success">
                          {m.vendas}
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums">
                          {Number(m.vgv) > 0 ? fmtBRL(Number(m.vgv)) : "—"}
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {m.primeira_resposta_p50_min != null
                            ? `${m.primeira_resposta_p50_min}m`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Sparkline data={serie.map((m) => m.vendas)} /> vendas
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Sparkline data={serie.map((m) => Number(m.vgv))} /> VGV
                </span>
                {trimestres.length > 1 && (
                  <span>
                    Trimestres:{" "}
                    {trimestres
                      .map((t) => `${t.trimestre}: ${t.vendas}v · ${fmtBRL(t.vgv)}`)
                      .join(" → ")}{" "}
                    <span className="opacity-70">(base do escalonamento de comissão)</span>
                  </span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 5. Carteira agora + exceções de hoje */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Carteira agora</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {snapshotQ.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (snapshotQ.data?.rows ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem leads ativos na carteira.</p>
            ) : (
              (snapshotQ.data?.rows ?? []).map((r) => {
                const max = Math.max(1, ...(snapshotQ.data?.rows ?? []).map((x) => x.quantidade));
                return (
                  <div key={r.etapa}>
                    <div className="mb-1 flex justify-between text-xs">
                      <Link
                        to="/leads"
                        search={{ status: r.etapa, corretor: corretorId }}
                        className="text-muted-foreground hover:underline"
                      >
                        {leadStatusLabel(r.etapa)}
                      </Link>
                      <span className="tabular-nums">
                        <span className="font-medium">{r.quantidade}</span>
                        {r.parados != null && r.parados > 0 && (
                          <span className="ml-2 text-destructive">{r.parados} parados</span>
                        )}
                      </span>
                    </div>
                    <div className="h-4 overflow-hidden rounded bg-muted">
                      <div
                        className="h-full bg-primary/70"
                        style={{ width: `${Math.max(3, Math.round((r.quantidade / max) * 100))}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" /> Exceções abertas hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            {excecoesQ.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (excecoesQ.data?.excecoes ?? []).length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-success" /> Nenhuma exceção agora.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {(excecoesQ.data?.excecoes ?? []).slice(0, 8).map((e) => (
                  <li key={`${e.tipo}:${e.lead_id}`} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="shrink-0 px-1.5 py-0 font-normal">
                      {TIPO_META[e.tipo].label}
                    </Badge>
                    <Link
                      to="/leads/$leadId"
                      params={{ leadId: e.lead_id }}
                      className="min-w-0 truncate hover:underline"
                    >
                      {e.lead_nome}
                    </Link>
                  </li>
                ))}
                {(excecoesQ.data?.excecoes ?? []).length > 8 && (
                  <li className="text-xs text-muted-foreground">
                    +{(excecoesQ.data?.excecoes ?? []).length - 8} — ver no Painel do Dia
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 6. Perdas dele + 7. Comissões */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Onde ele(a) mais perde ({meses} meses)</CardTitle>
          </CardHeader>
          <CardContent>
            {perdasQ.isLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : (perdasQ.data?.rows ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem perdas registradas na janela.</p>
            ) : (
              <div className="h-[220px]">
                <PerdasChart rows={(perdasQ.data?.rows ?? []).slice(0, 6)} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4" /> Comissões ({meses} meses)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {comissoesQ.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <span>
                  <span className="font-display text-2xl font-semibold tabular-nums text-success">
                    {fmtBRL(comissoes.pago)}
                  </span>
                  <span className="ml-1 text-xs text-muted-foreground">pagas</span>
                </span>
                <span>
                  <span className="font-display text-2xl font-semibold tabular-nums">
                    {fmtBRL(comissoes.aberto)}
                  </span>
                  <span className="ml-1 text-xs text-muted-foreground">em aberto</span>
                </span>
                <Link
                  to="/ranking"
                  search={{ tab: "comissoes" }}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  detalhe →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gráficos do Raio-X (recharts — o hub já carrega esta região em lazy)
// ---------------------------------------------------------------------------

/** Vendas (barras) + VGV (linha) por mês. */
function ResultadoMensalChart({ serie }: { serie: PerformanceDrillRow[] }) {
  const data = serie.map((m) => ({
    label: fmtMes(m.mes),
    vendas: m.vendas,
    vgv: Number(m.vgv) || 0,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="vendas" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis
          yAxisId="vgv"
          orientation="right"
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) =>
            v.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 })
          }
        />
        <Tooltip
          formatter={(value: number, name: string) =>
            name === "VGV"
              ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
              : value
          }
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="vendas" dataKey="vendas" name="Vendas" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
        <Line yAxisId="vgv" type="monotone" dataKey="vgv" name="VGV" stroke="var(--success)" strokeWidth={2} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Esforço mensal: leads recebidos, contatos e visitas realizadas. */
function EsforcoMensalChart({ serie }: { serie: PerformanceDrillRow[] }) {
  const data = serie.map((m) => ({
    label: fmtMes(m.mes),
    leads: m.leads_recebidos,
    contatos: m.contatos,
    visitas: m.visitas_realizadas,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="leads" name="Leads" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="contatos" name="Contatos" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="visitas" name="Visitas" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Funil comparado: taxa de passagem dele × time, por etapa. */
function FunilComparadoChart({
  data,
  nome,
}: {
  data: Array<{ etapa: string; minhaTaxa: number | null; taxaTime: number | null }>;
  nome: string;
}) {
  const rows = data.map((f) => ({
    etapa: f.etapa,
    corretor: f.minhaTaxa,
    time: f.taxaTime,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="etapa" tick={{ fontSize: 10 }} interval={0} />
        <YAxis tick={{ fontSize: 11 }} unit="%" />
        <Tooltip formatter={(value: number) => `${value}%`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="corretor" name={nome} fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="time" name="Média do time" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Perdas por categoria (barras horizontais; VGV estimado no tooltip). */
function PerdasChart({
  rows,
}: {
  rows: Array<{ categoria: string; quantidade: number; vgv_estimado: number | null }>;
}) {
  const data = rows.map((p) => ({
    categoria:
      MOTIVO_PERDA_LABEL[p.categoria as keyof typeof MOTIVO_PERDA_LABEL] ?? p.categoria,
    quantidade: p.quantidade,
    vgv: p.vgv_estimado != null ? Number(p.vgv_estimado) : null,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis type="category" dataKey="categoria" tick={{ fontSize: 11 }} width={150} interval={0} />
        <Tooltip
          formatter={(value: number, _name: string, item: { payload?: { vgv?: number | null } }) => {
            const vgv = item?.payload?.vgv;
            return vgv != null
              ? [`${value} leads · ~${vgv.toLocaleString("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 })} (estimado)`, "Perdas"]
              : [`${value} leads`, "Perdas"];
          }}
        />
        <Bar dataKey="quantidade" fill="var(--chart-2)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
