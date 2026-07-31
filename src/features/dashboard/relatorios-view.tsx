import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { QueryErrorState } from "@/components/ui/query-error-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  LineChart,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import {
  Users,
  Hourglass,
  Clock,
  Calendar,
  Eye,
  FileCheck,
  CheckCircle2,
  XCircle,
  UserX,
  Trophy,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  RefreshCw,
  Megaphone,
  Building2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { PeriodFilter, useDateFilter, type PeriodPreset } from "@/features/dashboard/period-filter";
import {
  useDashboardKpis,
  useDashboardSerie,
  useDashboardFunil,
  useDashboardPorCorretor,
  useDashboardMotivosPerda,
  useDashboardLeadsUrgentes,
  useDashboardRedistribuicoes,
  useOrigens,
  useVendasAprovadas,
  type OrigemRow,
} from "@/features/dashboard/queries";
import type { DashboardKpisFlat } from "@/features/dashboard/derive";
import {
  agruparVendasPorMes,
  ticketMedio,
  topProjetos,
  type ProjetoResultado,
  type VendasMes,
} from "@/features/dashboard/relatorios-derive";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { formatDuracaoParado } from "@/lib/utils";
import { origemLabel } from "@/lib/origem";

/** Link discreto para a aba de análise completa do hub de Gestão. */
function AbaLink({ tab, label }: { tab: "funil" | "gargalos" | "time"; label: string }) {
  return (
    <Link
      to="/painel-gestor"
      search={{ tab }}
      className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-primary hover:underline"
    >
      {label} <ArrowRight className="h-3 w-3" />
    </Link>
  );
}

/**
 * Aba Relatórios da /inteligencia — visão EXECUTIVA em ordem de decisão:
 * resultado em R$ (com delta), situação de agora, pipeline, quais canais
 * VENDEM (mídia), tendência mensal, quais empreendimentos vendem (foco), e
 * as leituras operacionais (funil, motivos, ranking) com atalho para a
 * análise completa em cada aba. A rota /relatorios segue como redirect.
 */
export function RelatoriosView() {
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const canSeeAll = isAdmin || isGestor;
  const scope = canSeeAll ? null : (user?.id ?? null);

  const [preset, setPreset] = useState<PeriodPreset>("this_month");
  const [custom, setCustom] = useState<{ from?: Date; to?: Date }>({});
  const range = useDateFilter(preset, custom);

  // Carregamento por tiers
  const [stage, setStage] = useState(1);
  useEffect(() => {
    const t2 = setTimeout(() => setStage((s) => Math.max(s, 2)), 250);
    const t3 = setTimeout(() => setStage((s) => Math.max(s, 3)), 700);
    const t4 = setTimeout(() => setStage((s) => Math.max(s, 4)), 1400);
    return () => {
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  const kpisQ = useDashboardKpis(range, scope);
  const urgentesQ = useDashboardLeadsUrgentes(scope, stage >= 2);
  const serieQ = useDashboardSerie(range, scope, stage >= 2);
  const vendasQ = useVendasAprovadas(6, canSeeAll && stage >= 2);
  const funilQ = useDashboardFunil(range, scope, stage >= 3);
  const origensQ = useOrigens(range, canSeeAll && stage >= 3);
  const porCorretorQ = useDashboardPorCorretor(range, canSeeAll && stage >= 3);
  const motivosQ = useDashboardMotivosPerda(range, scope, stage >= 4);
  const redistQ = useDashboardRedistribuicoes(range, canSeeAll && stage >= 4);

  const vendasMensais = useMemo(() => agruparVendasPorMes(vendasQ.data ?? []), [vendasQ.data]);
  const projetos = useMemo(() => topProjetos(vendasQ.data ?? []), [vendasQ.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description={
          canSeeAll
            ? "Resultado, canais e produto — a leitura executiva do negócio."
            : "Sua performance"
        }
        actions={
          <PeriodFilter
            preset={preset}
            onPresetChange={setPreset}
            custom={custom}
            onCustomChange={setCustom}
          />
        }
      />

      {/* 1. Resultado do período (R$ primeiro — é a leitura de negócio) */}
      <AsyncBoundary
        isLoading={kpisQ.isLoading}
        isError={kpisQ.isError}
        error={kpisQ.error}
        errorTitle="Não foi possível carregar os indicadores."
        onRetry={() => kpisQ.refetch()}
        loadingFallback={<ResultadoHero loading />}
      >
        <ResultadoHero data={kpisQ.data} />
      </AsyncBoundary>

      {/* 1b. Produção do período (cada atividade na data em que aconteceu) */}
      <ProducaoPeriodo data={kpisQ.data} loading={kpisQ.isLoading} />

      {/* 2. Situação de agora (o que não pode esperar o relatório) */}
      {canSeeAll &&
        (urgentesQ.isError || kpisQ.isError ? (
          <QueryErrorState
            title="Não foi possível carregar a situação atual."
            error={urgentesQ.isError ? urgentesQ.error : kpisQ.error}
            onRetry={() => {
              if (urgentesQ.isError) void urgentesQ.refetch();
              if (kpisQ.isError) void kpisQ.refetch();
            }}
          />
        ) : (
          <SituacaoAgora
            urgentes={urgentesQ.data ?? []}
            semCorretor={kpisQ.data?.sem_corretor ?? 0}
          />
        ))}

      {/* 3. Pipeline agora (estoque por etapa, clicável) */}
      <PipelineAgora data={kpisQ.data} loading={kpisQ.isLoading} />

      {/* 4. Evolução diária + funil compacto */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Evolução no período
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            <AsyncBoundary
              className="h-full"
              isLoading={serieQ.isLoading || !range.di}
              isError={serieQ.isError}
              error={serieQ.error}
              errorTitle="Não foi possível carregar a evolução."
              onRetry={() => serieQ.refetch()}
              loadingFallback={<Skeleton className="h-full w-full" />}
            >
              <SerieChart data={serieQ.data ?? []} />
            </AsyncBoundary>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRight className="h-4 w-4" /> Funil do período
              {canSeeAll && <AbaLink tab="funil" label="análise completa" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AsyncBoundary
              isLoading={funilQ.isLoading}
              isError={funilQ.isError}
              error={funilQ.error}
              errorTitle="Não foi possível carregar o funil."
              onRetry={() => funilQ.refetch()}
              loadingFallback={<Skeleton className="h-[240px] w-full" />}
            >
              <FunilView data={funilQ.data ?? []} />
            </AsyncBoundary>
          </CardContent>
        </Card>
      </div>

      {/* 5. Decisão de mídia e tendência de resultado */}
      {canSeeAll && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Megaphone className="h-4 w-4" /> Origem que vende
                {origensQ.data?.degradado && (
                  <span className="text-xs font-normal text-warning">por status atual</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AsyncBoundary
                isLoading={origensQ.isLoading}
                isError={origensQ.isError}
                error={origensQ.error}
                errorTitle="Não foi possível carregar as origens."
                onRetry={() => origensQ.refetch()}
                loadingFallback={<Skeleton className="h-48 w-full" />}
              >
                <OrigemTable rows={origensQ.data?.rows ?? []} />
              </AsyncBoundary>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Vendas e VGV por mês (6 meses)
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[280px]">
              <AsyncBoundary
                className="h-full"
                isLoading={vendasQ.isLoading}
                isError={vendasQ.isError}
                error={vendasQ.error}
                errorTitle="Não foi possível carregar a evolução de vendas."
                onRetry={() => vendasQ.refetch()}
                loadingFallback={<Skeleton className="h-full w-full" />}
              >
                {vendasMensais.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sem vendas aprovadas nos últimos 6 meses.
                  </p>
                ) : (
                  <EvolucaoMensalChart data={vendasMensais} />
                )}
              </AsyncBoundary>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 6. Produto e perdas */}
      <div className="grid gap-4 lg:grid-cols-2">
        {canSeeAll && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Top empreendimentos (6 meses)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AsyncBoundary
                isLoading={vendasQ.isLoading}
                isError={vendasQ.isError}
                error={vendasQ.error}
                errorTitle="Não foi possível carregar os empreendimentos."
                onRetry={() => vendasQ.refetch()}
                loadingFallback={<Skeleton className="h-40 w-full" />}
              >
                <TopProjetosTable rows={projetos} />
              </AsyncBoundary>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <XCircle className="h-4 w-4" /> Motivos de perda
              {canSeeAll && <AbaLink tab="gargalos" label="diagnóstico com R$" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            <AsyncBoundary
              className="h-full"
              isLoading={motivosQ.isLoading}
              isError={motivosQ.isError}
              error={motivosQ.error}
              errorTitle="Não foi possível carregar os motivos de perda."
              onRetry={() => motivosQ.refetch()}
              loadingFallback={<Skeleton className="h-full w-full" />}
            >
              {(motivosQ.data?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sem dados neste período. Ajuste o filtro de data acima.
                </p>
              ) : (
                <MotivosChart data={motivosQ.data ?? []} />
              )}
            </AsyncBoundary>
          </CardContent>
        </Card>
      </div>

      {/* 7. Pessoas */}
      {canSeeAll && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4" /> Ranking por corretor
              <AbaLink tab="time" label="performance completa" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AsyncBoundary
              isLoading={porCorretorQ.isLoading}
              isError={porCorretorQ.isError}
              error={porCorretorQ.error}
              errorTitle="Não foi possível carregar o ranking."
              onRetry={() => porCorretorQ.refetch()}
              loadingFallback={<Skeleton className="h-40 w-full" />}
            >
              <PorCorretorTable rows={porCorretorQ.data ?? []} />
            </AsyncBoundary>
          </CardContent>
        </Card>
      )}

      {!canSeeAll && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Meus leads urgentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AsyncBoundary
              isLoading={urgentesQ.isLoading}
              isError={urgentesQ.isError}
              error={urgentesQ.error}
              errorTitle="Não foi possível carregar seus leads urgentes."
              onRetry={() => urgentesQ.refetch()}
              loadingFallback={<Skeleton className="h-32 w-full" />}
            >
              <UrgentesList rows={urgentesQ.data ?? []} />
            </AsyncBoundary>
          </CardContent>
        </Card>
      )}

      {/* 8. Operacional (fim da página) */}
      {canSeeAll && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="h-4 w-4" /> Redistribuições recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AsyncBoundary
              isLoading={redistQ.isLoading}
              isError={redistQ.isError}
              error={redistQ.error}
              errorTitle="Não foi possível carregar as redistribuições."
              onRetry={() => redistQ.refetch()}
              loadingFallback={<Skeleton className="h-40 w-full" />}
            >
              <RedistTable rows={redistQ.data ?? []} />
            </AsyncBoundary>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const fmtBRLCompacto = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });

/**
 * 1º bloco: resultado do período em linguagem de negócio — leads, vendas,
 * VGV e ticket médio, sempre com a variação vs. o período anterior de mesma
 * duração ("nunca um número solo").
 */
function ResultadoHero({ data, loading = false }: { data?: DashboardKpisFlat; loading?: boolean }) {
  const ticket = data ? ticketMedio(data.vgv, data.contrato_fechado) : null;
  return (
    <StatGrid>
      <StatTile
        title="Leads no período"
        value={data?.total ?? 0}
        icon={Users}
        loading={loading}
        delta={data?.deltas.total ?? undefined}
        deltaLabel="vs. período anterior"
      />
      <StatTile
        title="Vendas"
        value={data?.contrato_fechado ?? 0}
        icon={CheckCircle2}
        intent="success"
        loading={loading}
        delta={data?.deltas.contrato_fechado ?? undefined}
        deltaLabel="vs. período anterior"
      />
      <StatTile
        title="VGV"
        value={data?.vgv ?? 0}
        formatValue={fmtBRLCompacto}
        icon={TrendingUp}
        intent="success"
        loading={loading}
        delta={data?.deltas.vgv ?? undefined}
        deltaLabel="vs. período anterior"
      />
      <StatTile
        title="Ticket médio"
        value={ticket === null ? "—" : fmtBRLCompacto(ticket)}
        icon={FileCheck}
        loading={loading}
        hint={ticket === null ? "sem vendas no período" : "VGV ÷ vendas do período"}
      />
    </StatGrid>
  );
}

/**
 * 1º-B bloco: o que a operação PRODUZIU no período, cada atividade contada
 * na data do próprio fato — agendamento na criação, visita no dia em que a
 * visita estava marcada (validada pelo corretor, uma por agendamento), pasta
 * no dia em que ficou montada e análise no dia da mudança de status.
 */
function ProducaoPeriodo({
  data,
  loading = false,
}: {
  data?: DashboardKpisFlat;
  loading?: boolean;
}) {
  const comparecimento =
    data && data.visitas_agendadas_periodo > 0
      ? Math.round((data.visitas_periodo / data.visitas_agendadas_periodo) * 100)
      : null;
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
        Produção do período (cada atividade na data em que aconteceu)
      </p>
      <StatGrid>
        <StatTile
          title="Agendamentos criados"
          value={data?.agendamentos_periodo ?? 0}
          icon={Calendar}
          loading={loading}
          hint="pela data em que o agendamento foi criado"
        />
        <StatTile
          title="Visitas realizadas"
          value={data?.visitas_periodo ?? 0}
          icon={Eye}
          loading={loading}
          hint="pelo dia da visita, validada pelo corretor"
        />
        <StatTile
          title="Comparecimento"
          value={comparecimento === null ? "—" : `${comparecimento}%`}
          icon={CheckCircle2}
          intent={comparecimento !== null && comparecimento < 50 ? "warning" : "neutral"}
          loading={loading}
          hint={
            data && data.visitas_agendadas_periodo > 0
              ? `${data.visitas_periodo} de ${data.visitas_agendadas_periodo} visitas marcadas · ${data.no_shows_periodo} não compareceu`
              : "sem visitas marcadas no período"
          }
        />
        <StatTile
          title="Pastas montadas"
          value={data?.pastas_periodo ?? 0}
          icon={FileCheck}
          loading={loading}
          hint="3+ documentos recebidos"
        />
        <StatTile
          title="Análises de crédito"
          value={data?.analises_periodo ?? 0}
          icon={FileCheck}
          loading={loading}
          hint="pela data da mudança de status"
        />
        <StatTile
          title="Perdidos"
          value={data?.perdido ?? 0}
          icon={XCircle}
          loading={loading}
          delta={data?.deltas.perdido ?? undefined}
          deltaLabel="vs. período anterior"
          hint="pela data da perda"
        />
      </StatGrid>
    </div>
  );
}

const PIPELINE_CARDS: Array<{
  key: keyof Omit<DashboardKpisFlat, "deltas">;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  status?: string;
}> = [
  { key: "aguardando", label: "Aguardando", icon: Hourglass, status: "aguardando_atendimento" },
  { key: "aguardando_retorno", label: "Ag. retorno", icon: Clock, status: "aguardando_retorno" },
  { key: "em_atendimento", label: "Em atendimento", icon: Clock, status: "em_atendimento" },
  { key: "agendado", label: "Agendado", icon: Calendar, status: "agendado" },
  { key: "visita_realizada", label: "Visita", icon: Eye, status: "visita_realizada" },
  { key: "analise_credito", label: "Análise crédito", icon: FileCheck, status: "analise_credito" },
  { key: "perdido", label: "Perdidos (per.)", icon: XCircle, status: "perdido" },
  { key: "sem_corretor", label: "Sem corretor", icon: Users },
];

/** 3º bloco: estoque ATUAL por etapa (foto de agora) — cada card abre a lista. */
function PipelineAgora({ data, loading = false }: { data?: DashboardKpisFlat; loading?: boolean }) {
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
        Pipeline agora (estoque por etapa — foto de hoje, não segue o filtro de período)
      </p>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
        {PIPELINE_CARDS.map(({ key, label, icon: Icon, status }) => {
          const value = data?.[key] ?? 0;
          const inner = (
            <Card className="transition-all hover:border-primary/40 hover:shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-start justify-between mb-1 gap-1">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground leading-tight">
                    {label}
                  </span>
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                {loading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  <div className="text-2xl font-semibold tabular-nums">{value}</div>
                )}
              </CardContent>
            </Card>
          );
          return status ? (
            <Link key={key} to="/leads" search={{ status }}>
              {inner}
            </Link>
          ) : (
            <Link key={key} to="/leads" search={{}}>
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function SituacaoAgora({
  urgentes,
  semCorretor,
}: {
  urgentes: Array<{ minutos_parado: number }>;
  semCorretor: number;
}) {
  const parados30 = urgentes.length;
  if (parados30 === 0 && semCorretor === 0) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {parados30 > 0 && (
        <Card className="border-orange-500/40 bg-orange-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-orange-500" />
            <div className="flex-1">
              <div className="text-sm font-semibold">
                {parados30} {parados30 === 1 ? "lead parado" : "leads parados"} há mais de 30 min
              </div>
              <p className="text-xs text-muted-foreground">Sem contato após distribuição</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/leads" search={{ status: "aguardando_atendimento" }}>
                Abrir
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
      {semCorretor > 0 && (
        <Card className="border-red-500/40 bg-red-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <UserX className="h-6 w-6 text-red-500" />
            <div className="flex-1">
              <div className="text-sm font-semibold">
                {semCorretor} {semCorretor === 1 ? "lead sem corretor" : "leads sem corretor"}
              </div>
              <p className="text-xs text-muted-foreground">Aguardando distribuição na fila</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/leads">Abrir</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SerieChart({
  data,
}: {
  data: Array<{
    dia: string;
    leads: number;
    agendamentos: number;
    visitas: number;
    vendas: number;
  }>;
}) {
  const formatted = data.map((d) => ({ ...d, label: format(parseISO(d.dia), "dd/MM") }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={formatted} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {/* Cores em tokens do design system: os antigos hsl(var(--primary)) eram
            CSS inválido com oklch (stroke caía no fallback) e os hex fixos não
            acompanhavam o tema. */}
        <Line type="monotone" dataKey="leads" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
        <Line
          type="monotone"
          dataKey="agendamentos"
          stroke="var(--chart-3)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="visitas"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="vendas"
          stroke="var(--success)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * Funil por EVENTOS do período: cada etapa conta os leads que passaram por
 * ela DENTRO do recorte, pela data do próprio fato. Como não é coorte, uma
 * etapa pode superar a anterior (lead criado no mês passado que visitou
 * agora) — é produção do período, não inconsistência.
 */
function FunilView({ data }: { data: Array<{ etapa: string; quantidade: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.quantidade));
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        Leads que passaram por cada etapa no período, pela data do fato.
      </p>
      {data.map((d) => {
        const pct = Math.round((d.quantidade / max) * 100);
        return (
          <div key={d.etapa}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">{d.etapa}</span>
              <span className="font-medium tabular-nums">{d.quantidade}</span>
            </div>
            <div className="h-7 rounded-md bg-muted overflow-hidden">
              <div className="h-full bg-primary/80 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PorCorretorTable({
  rows,
}: {
  rows: Array<{
    corretor_id: string;
    nome: string;
    leads: number;
    agendamentos: number;
    visitas: number;
    analise: number;
    fechados: number;
    perdidos: number;
    conversao: number;
  }>;
}) {
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Sem dados neste período. Ajuste o filtro de data acima.
      </p>
    );
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Corretor</TableHead>
            <TableHead className="text-right">Leads</TableHead>
            <TableHead className="text-right">Ag.</TableHead>
            <TableHead className="text-right">Visitas</TableHead>
            <TableHead className="text-right">Análise</TableHead>
            <TableHead className="text-right">Fechados</TableHead>
            <TableHead className="text-right">Perdidos</TableHead>
            <TableHead className="text-right">Conv.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.corretor_id}>
              <TableCell className="text-muted-foreground">{i + 1}º</TableCell>
              <TableCell className="font-medium truncate max-w-[220px]">{r.nome}</TableCell>
              <TableCell className="text-right tabular-nums">{r.leads}</TableCell>
              <TableCell className="text-right tabular-nums">{r.agendamentos}</TableCell>
              <TableCell className="text-right tabular-nums">{r.visitas}</TableCell>
              <TableCell className="text-right tabular-nums">{r.analise}</TableCell>
              <TableCell className="text-right tabular-nums font-semibold text-emerald-600">
                {r.fechados}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {r.perdidos}
              </TableCell>
              <TableCell className="text-right">
                <Badge variant={r.conversao >= 5 ? "default" : "secondary"}>{r.conversao}%</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function UrgentesList({
  rows,
}: {
  rows: Array<{
    lead_id: string;
    nome: string;
    telefone: string;
    corretor_nome: string;
    minutos_parado: number;
  }>;
}) {
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Tudo em dia — nenhum lead parado há mais de 30 min.
      </p>
    );
  return (
    <ul className="divide-y">
      {rows.slice(0, 10).map((r) => {
        const tempo = formatDuracaoParado(r.minutos_parado);
        return (
          <li key={r.lead_id} className="py-2 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{r.nome}</div>
              <div className="text-xs text-muted-foreground truncate">
                {r.telefone} · {r.corretor_nome}
              </div>
            </div>
            <Badge variant="destructive">{tempo}</Badge>
            <Button asChild size="sm" variant="ghost">
              <Link to="/leads/$leadId" params={{ leadId: r.lead_id }}>
                Abrir
              </Link>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function MotivosChart({ data }: { data: Array<{ motivo: string; quantidade: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis type="category" dataKey="motivo" tick={{ fontSize: 11 }} width={140} interval={0} />
        <Tooltip />
        <Bar dataKey="quantidade" fill="var(--chart-2)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const TIPO_LABEL: Record<string, string> = {
  automatica: "Automática",
  manual: "Manual",
  redistribuicao: "Redistribuição",
};

function RedistTable({
  rows,
}: {
  rows: Array<{
    quando: string;
    lead_id: string;
    lead_nome: string;
    corretor_nome: string;
    tipo: string;
    motivo: string;
  }>;
}) {
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">Sem redistribuições no período.</p>;
  return (
    <div className="overflow-x-auto max-h-[280px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quando</TableHead>
            <TableHead>Lead</TableHead>
            <TableHead>Corretor</TableHead>
            <TableHead>Tipo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(0, 30).map((r, i) => (
            <TableRow key={`${r.lead_id}-${i}`}>
              <TableCell className="text-xs whitespace-nowrap">
                {format(parseISO(r.quando), "dd/MM HH:mm", { locale: ptBR })}
              </TableCell>
              <TableCell className="font-medium truncate max-w-[200px]">
                <Link
                  to="/leads/$leadId"
                  params={{ leadId: r.lead_id }}
                  className="hover:underline"
                >
                  {r.lead_nome ?? "—"}
                </Link>
              </TableCell>
              <TableCell className="truncate max-w-[160px]">{r.corretor_nome}</TableCell>
              <TableCell>
                <Badge variant="outline">{TIPO_LABEL[r.tipo] ?? r.tipo}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Origem que vende: leads × vendas × conversão por canal (decisão de mídia). */
function OrigemTable({ rows }: { rows: OrigemRow[] }) {
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Sem leads no período. Ajuste o filtro de data acima.
      </p>
    );
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Origem</TableHead>
            <TableHead className="text-right">Leads</TableHead>
            <TableHead className="text-right">Vendas</TableHead>
            <TableHead className="text-right">Conv.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(0, 10).map((r) => {
            const semDado = r.cobertura_pct !== null && Number(r.cobertura_pct) < 60;
            return (
              <TableRow key={r.origem}>
                <TableCell className="font-medium capitalize">
                  <Link to="/leads" search={{ origem: r.origem }} className="hover:underline">
                    {origemLabel(r.origem)}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.leads.toLocaleString("pt-BR")}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold text-success">
                  {r.vendas}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {semDado ? (
                    <span
                      className="text-muted-foreground"
                      title="Sem dado suficiente: boa parte destes leads não tem histórico de transições (import)"
                    >
                      sem dado
                    </span>
                  ) : (
                    <Badge variant={Number(r.conv_pct) >= 1 ? "default" : "secondary"}>
                      {r.conv_pct ?? 0}%
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** Vendas (barras) e VGV (linha) por mês — tendência de resultado. */
function EvolucaoMensalChart({ data }: { data: VendasMes[] }) {
  const formatted = data.map((d) => ({
    ...d,
    label: format(parseISO(d.mes), "MMM/yy", { locale: ptBR }),
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={formatted} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
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
        <Bar
          yAxisId="vendas"
          dataKey="vendas"
          name="Vendas"
          fill="var(--chart-2)"
          radius={[4, 4, 0, 0]}
        />
        <Line
          yAxisId="vgv"
          type="monotone"
          dataKey="vgv"
          name="VGV"
          stroke="var(--success)"
          strokeWidth={2}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Top empreendimentos por VGV — onde o resultado está sendo feito. */
function TopProjetosTable({ rows }: { rows: ProjetoResultado[] }) {
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">Sem vendas aprovadas nos últimos 6 meses.</p>
    );
  const maxVgv = Math.max(1, ...rows.map((r) => r.vgv));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.projeto}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span className="truncate font-medium">{r.projeto}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {r.vendas} {r.vendas === 1 ? "venda" : "vendas"} ·{" "}
              {r.vgv.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
                notation: "compact",
                maximumFractionDigits: 1,
              })}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary/70"
              style={{ width: `${Math.max(3, Math.round((r.vgv / maxVgv) * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
