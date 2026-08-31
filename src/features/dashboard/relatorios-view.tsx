import { Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  UserCheck,
  UserX,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  Megaphone,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { PeriodFilter, useDateFilter, type PeriodPreset } from "@/features/dashboard/period-filter";
import {
  useDashboardKpis,
  useDashboardSerie,
  useDashboardFunil,
  useDashboardMotivosPerda,
  useDashboardLeadsUrgentes,
  useOrigens,
  type OrigemRow,
} from "@/features/dashboard/queries";
import type { DashboardKpisFlat } from "@/features/dashboard/derive";
import { ticketMedio } from "@/features/dashboard/relatorios-derive";
import {
  useCorretorNomes,
  usePipelineEtapaNominal,
} from "@/features/dashboard/relatorios-nominais";
import { corretorNome, LeadCell, NotaTeto } from "@/features/dashboard/relatorios-partes";
import { ExportarPdfButton } from "@/features/dashboard/exportar-pdf-button";
import type { DocumentoRelatorio } from "@/features/dashboard/relatorios-pdf";

type RelatoriosPdf = typeof import("@/features/dashboard/relatorios-pdf");
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { formatDuration } from "@/lib/duracao";
import { origemLabel } from "@/lib/origem";

// Sub-abas pesadas (tabelas nominais + gráficos) só descem quando abrem.
const RelatoriosVendasTab = lazy(() =>
  import("@/features/dashboard/relatorios-vendas-tab").then(({ RelatoriosVendasTab }) => ({
    default: RelatoriosVendasTab,
  })),
);
const RelatoriosAtividadesTab = lazy(() =>
  import("@/features/dashboard/relatorios-atividades-tab").then(({ RelatoriosAtividadesTab }) => ({
    default: RelatoriosAtividadesTab,
  })),
);
const RelatoriosTimeTab = lazy(() =>
  import("@/features/dashboard/relatorios-time-tab").then(({ RelatoriosTimeTab }) => ({
    default: RelatoriosTimeTab,
  })),
);
const RelatoriosCorretoresTab = lazy(() =>
  import("@/features/dashboard/relatorios-corretores-tab").then(({ RelatoriosCorretoresTab }) => ({
    default: RelatoriosCorretoresTab,
  })),
);

/** Link discreto para a aba de análise completa do hub de Gestão. */
function AbaLink({ tab, label }: { tab: "funil" | "time"; label: string }) {
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

function AbaSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/**
 * Aba Relatórios do hub de Gestão, agora em SUB-ABAS: Resumo (leitura
 * executiva em ordem de decisão), Vendas, Atividades, Time e Corretores —
 * as quatro últimas NOMINAIS: nome do cliente e corretor responsável em cada
 * linha, sem precisar abrir a base de leads para saber de quem se trata.
 * A rota /relatorios segue como redirect.
 */
export function RelatoriosView() {
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const canSeeAll = isAdmin || isGestor;
  const scope = canSeeAll ? null : (user?.id ?? null);

  const [preset, setPreset] = useState<PeriodPreset>("this_month");
  const [custom, setCustom] = useState<{ from?: Date; to?: Date }>({});
  const range = useDateFilter(preset, custom);
  const [aba, setAba] = useState("resumo");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Relatórios"
        description={
          canSeeAll
            ? "Resultado, canais, produto e pessoas — com nome de cliente e corretor."
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

      <Tabs value={aba} onValueChange={setAba} className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="vendas">Vendas</TabsTrigger>
          <TabsTrigger value="atividades">Atividades</TabsTrigger>
          {canSeeAll && <TabsTrigger value="time">Time</TabsTrigger>}
          {canSeeAll && <TabsTrigger value="corretores">Corretores</TabsTrigger>}
        </TabsList>

        <TabsContent value="resumo">
          <ResumoTab range={range} scope={scope} canSeeAll={canSeeAll} />
        </TabsContent>
        <TabsContent value="vendas">
          <Suspense fallback={<AbaSkeleton />}>
            <RelatoriosVendasTab range={range} scope={scope} canSeeAll={canSeeAll} />
          </Suspense>
        </TabsContent>
        <TabsContent value="atividades">
          <Suspense fallback={<AbaSkeleton />}>
            <RelatoriosAtividadesTab range={range} scope={scope} canSeeAll={canSeeAll} />
          </Suspense>
        </TabsContent>
        {canSeeAll && (
          <TabsContent value="time">
            <Suspense fallback={<AbaSkeleton />}>
              <RelatoriosTimeTab range={range} />
            </Suspense>
          </TabsContent>
        )}
        {canSeeAll && (
          <TabsContent value="corretores">
            <Suspense fallback={<AbaSkeleton />}>
              <RelatoriosCorretoresTab />
            </Suspense>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

type Range = { di: string | null; df: string | null };

/** Sub-aba RESUMO — a leitura executiva original, em ordem de decisão. */
function ResumoTab({
  range,
  scope,
  canSeeAll,
}: {
  range: Range;
  scope: string | null;
  canSeeAll: boolean;
}) {
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
  const funilQ = useDashboardFunil(range, scope, stage >= 3);
  const origensQ = useOrigens(range, canSeeAll && stage >= 3);
  const motivosQ = useDashboardMotivosPerda(range, scope, stage >= 4);

  const montarPdf = (pdf: RelatoriosPdf): DocumentoRelatorio => {
    const d = kpisQ.data;
    const ticket = d ? ticketMedio(d.vgv, d.contrato_fechado) : null;
    const ant = d?.anterior ?? null;
    const comparecimento =
      d && d.visitas_agendadas_periodo > 0
        ? `${Math.round((d.visitas_periodo / d.visitas_agendadas_periodo) * 100)}%`
        : "—";
    return {
      titulo: "Resumo executivo",
      periodo: pdf.periodoLabelPdf(range),
      blocos: [
        {
          titulo: "Resultado do período",
          html: pdf.kpisPdf([
            {
              label: "Leads",
              valor: (d?.total ?? 0).toLocaleString("pt-BR"),
              hint: ant ? `anterior: ${ant.total.toLocaleString("pt-BR")}` : undefined,
            },
            {
              label: "Vendas",
              valor: String(d?.contrato_fechado ?? 0),
              hint: ant ? `anterior: ${ant.contrato_fechado}` : undefined,
            },
            {
              label: "VGV",
              valor: fmtBRLCompacto(d?.vgv ?? 0),
              hint: ant ? `anterior: ${fmtBRLCompacto(ant.vgv)}` : undefined,
            },
            { label: "Ticket médio", valor: ticket === null ? "—" : fmtBRLCompacto(ticket) },
          ]),
        },
        {
          titulo: "Produção do período",
          sub: "cada atividade na data em que aconteceu",
          html: pdf.kpisPdf([
            { label: "Agendamentos", valor: String(d?.agendamentos_periodo ?? 0) },
            { label: "Visitas realizadas", valor: String(d?.visitas_periodo ?? 0) },
            { label: "Comparecimento", valor: comparecimento },
            { label: "Pastas montadas", valor: String(d?.pastas_periodo ?? 0) },
            { label: "Análises", valor: String(d?.analises_periodo ?? 0) },
            { label: "Perdidos", valor: String(d?.perdido ?? 0) },
          ]),
        },
        {
          titulo: "Pipeline agora",
          sub: "estoque por etapa — foto de hoje, não segue o filtro de período",
          html: pdf.tabelaPdf(
            ["Etapa", "Leads"],
            PIPELINE_CARDS.map(({ key, label }) => [label, d?.[key] ?? 0]),
            { direita: [1] },
          ),
        },
        ...(canSeeAll
          ? [
              {
                titulo: "Origem que vende",
                sub: origensQ.data?.degradado ? "por status atual" : undefined,
                html: pdf.tabelaPdf(
                  ["Origem", "Leads", "Vendas", "Conv."],
                  (origensQ.data?.rows ?? [])
                    .slice(0, 10)
                    .map((r) => [
                      origemLabel(r.origem),
                      r.leads.toLocaleString("pt-BR"),
                      r.vendas,
                      r.cobertura_pct !== null && Number(r.cobertura_pct) < 60
                        ? "sem dado"
                        : `${r.conv_pct ?? 0}%`,
                    ]),
                  { direita: [1, 2, 3] },
                ),
              },
            ]
          : []),
        {
          titulo: "Motivos de perda",
          html: pdf.tabelaPdf(
            ["Motivo", "Quantidade"],
            (motivosQ.data ?? []).map((m) => [m.motivo, m.quantidade]),
            { direita: [1] },
          ),
        },
      ],
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ExportarPdfButton montar={montarPdf} disabled={kpisQ.isLoading} />
      </div>
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

      {/* 3. Pipeline agora (estoque por etapa) — clique EXPANDE a lista nominal */}
      <PipelineAgora
        data={kpisQ.data}
        loading={kpisQ.isLoading}
        scope={scope}
        canSeeAll={canSeeAll}
      />

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

      {/* 5. Decisão de mídia + perdas */}
      <div className="grid gap-4 lg:grid-cols-2">
        {canSeeAll && (
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
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <XCircle className="h-4 w-4" /> Motivos de perda
              {canSeeAll && <AbaLink tab="funil" label="diagnóstico com R$" />}
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
  // Lado a lado (tarefa #11): o número do período anterior aparece JUNTO do
  // atual — "melhorei ou piorei?" sem anotar nada de cabeça.
  const ant = data?.anterior ?? null;
  const ticketAnterior = ant ? ticketMedio(ant.vgv, ant.contrato_fechado) : null;
  return (
    <StatGrid>
      <StatTile
        title="Leads no período"
        value={data?.total ?? 0}
        icon={Users}
        loading={loading}
        delta={data?.deltas.total ?? undefined}
        deltaLabel="vs. período anterior"
        hint={ant ? `anterior: ${ant.total.toLocaleString("pt-BR")}` : undefined}
      />
      <StatTile
        title="Vendas"
        value={data?.contrato_fechado ?? 0}
        icon={CheckCircle2}
        intent="success"
        loading={loading}
        delta={data?.deltas.contrato_fechado ?? undefined}
        deltaLabel="vs. período anterior"
        hint={ant ? `anterior: ${ant.contrato_fechado.toLocaleString("pt-BR")}` : undefined}
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
        hint={ant ? `anterior: ${fmtBRLCompacto(ant.vgv)}` : undefined}
      />
      <StatTile
        title="Ticket médio"
        value={ticket === null ? "—" : fmtBRLCompacto(ticket)}
        icon={FileCheck}
        loading={loading}
        hint={
          ticket === null
            ? "sem vendas no período"
            : ticketAnterior !== null
              ? `VGV ÷ vendas · anterior: ${fmtBRLCompacto(ticketAnterior)}`
              : "VGV ÷ vendas do período"
        }
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
  // Lado a lado (tarefa #11) também na produção — todo tile carrega o número
  // anterior junto do atual.
  const ant = data?.anterior ?? null;
  const comparecimentoAnterior =
    ant && ant.visitas_agendadas_periodo > 0
      ? Math.round((ant.visitas_periodo / ant.visitas_agendadas_periodo) * 100)
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
          delta={data?.deltas.agendamentos ?? undefined}
          deltaLabel="vs. período anterior"
          hint={
            ant
              ? `pela data de criação · anterior: ${ant.agendamentos_periodo}`
              : "pela data em que o agendamento foi criado"
          }
        />
        <StatTile
          title="Visitas realizadas"
          value={data?.visitas_periodo ?? 0}
          icon={Eye}
          loading={loading}
          delta={data?.deltas.visitas ?? undefined}
          deltaLabel="vs. período anterior"
          hint={
            ant
              ? `pelo dia da visita · anterior: ${ant.visitas_periodo}`
              : "pelo dia da visita, validada pelo corretor"
          }
        />
        <StatTile
          title="Comparecimento"
          value={comparecimento === null ? "—" : `${comparecimento}%`}
          icon={CheckCircle2}
          intent={comparecimento !== null && comparecimento < 50 ? "warning" : "neutral"}
          loading={loading}
          hint={
            data && data.visitas_agendadas_periodo > 0
              ? `${data.visitas_periodo} de ${data.visitas_agendadas_periodo} visitas marcadas · ${data.no_shows_periodo} não compareceu${
                  comparecimentoAnterior !== null ? ` · anterior: ${comparecimentoAnterior}%` : ""
                }`
              : "sem visitas marcadas no período"
          }
        />
        <StatTile
          title="Pastas montadas"
          value={data?.pastas_periodo ?? 0}
          icon={FileCheck}
          loading={loading}
          delta={data?.deltas.pastas ?? undefined}
          deltaLabel="vs. período anterior"
          hint={
            ant
              ? `3+ documentos recebidos · anterior: ${ant.pastas_periodo}`
              : "3+ documentos recebidos"
          }
        />
        <StatTile
          title="Análises de crédito"
          value={data?.analises_periodo ?? 0}
          icon={FileCheck}
          loading={loading}
          delta={data?.deltas.analises ?? undefined}
          deltaLabel="vs. período anterior"
          hint={
            ant
              ? `pela mudança de status · anterior: ${ant.analises_periodo}`
              : "pela data da mudança de status"
          }
        />
        <StatTile
          title="Perdidos"
          value={data?.perdido ?? 0}
          icon={XCircle}
          loading={loading}
          delta={data?.deltas.perdido ?? undefined}
          deltaLabel="vs. período anterior"
          hint={ant ? `pela data da perda · anterior: ${ant.perdido}` : "pela data da perda"}
        />
      </StatGrid>
    </div>
  );
}

const PIPELINE_CARDS: Array<{
  key: keyof Omit<DashboardKpisFlat, "deltas" | "anterior">;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Chave da expansão nominal (status atual) — undefined = só navega. */
  etapa?: string;
  status?: string;
}> = [
  {
    key: "aguardando",
    label: "Aguardando",
    icon: Hourglass,
    etapa: "aguardando_atendimento",
    status: "aguardando_atendimento",
  },
  {
    key: "aguardando_retorno",
    label: "Ag. retorno",
    icon: Clock,
    etapa: "aguardando_retorno",
    status: "aguardando_retorno",
  },
  {
    key: "qualificacao_corretor",
    label: "Qualificação",
    icon: UserCheck,
    etapa: "qualificacao_corretor",
    status: "qualificacao_corretor",
  },
  {
    key: "em_atendimento",
    label: "Em atendimento",
    icon: Clock,
    etapa: "em_atendimento",
    status: "em_atendimento",
  },
  { key: "agendado", label: "Agendado", icon: Calendar, etapa: "agendado", status: "agendado" },
  {
    key: "visita_realizada",
    label: "Visita",
    icon: Eye,
    etapa: "visita_realizada",
    status: "visita_realizada",
  },
  {
    key: "analise_credito",
    label: "Análise crédito",
    icon: FileCheck,
    etapa: "analise_credito",
    status: "analise_credito",
  },
  // Perdidos é métrica de PERÍODO (não estoque) — a lista nominal com motivo
  // vive na sub-aba Atividades; aqui o card navega para a base filtrada.
  { key: "perdido", label: "Perdidos (per.)", icon: XCircle, status: "perdido" },
  { key: "sem_corretor", label: "Sem corretor", icon: Users, etapa: "sem_corretor" },
];

/**
 * 3º bloco: estoque ATUAL por etapa (foto de agora). Clicar num card EXPANDE
 * ali mesmo a lista nominal — nome do cliente, telefone (oculto), corretor e
 * há quanto tempo está parado — sem precisar ir para a base de leads.
 */
function PipelineAgora({
  data,
  loading = false,
  scope,
  canSeeAll,
}: {
  data?: DashboardKpisFlat;
  loading?: boolean;
  scope: string | null;
  canSeeAll: boolean;
}) {
  const [etapaAberta, setEtapaAberta] = useState<string | null>(null);
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
        Pipeline agora (estoque por etapa — foto de hoje, não segue o filtro de período)
      </p>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-9">
        {PIPELINE_CARDS.map(({ key, label, icon: Icon, etapa, status }) => {
          const value = data?.[key] ?? 0;
          const aberta = etapa != null && etapaAberta === etapa;
          // Item 3.1: o card de Análise responde "quantos negócios estão
          // liberados" — desdobra a última análise de cada lead da etapa.
          const analiseDetalhe =
            key === "analise_credito" &&
            data &&
            (data.analise_aprovada > 0 ||
              data.analise_condicionada > 0 ||
              data.analise_reprovada > 0)
              ? [
                  `✓ ${data.analise_aprovada} aprovada(s)`,
                  data.analise_condicionada > 0
                    ? `⚠ ${data.analise_condicionada} condicionada(s)`
                    : null,
                  `✗ ${data.analise_reprovada} reprovada(s)`,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : null;
          const inner = (
            <Card
              className={
                aberta
                  ? "border-primary/60 shadow-sm transition-all"
                  : "transition-all hover:border-primary/40 hover:shadow-sm"
              }
            >
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
                  <div className="text-2xl font-semibold tabular-nums flex items-center gap-1">
                    {value}
                    {etapa &&
                      (aberta ? (
                        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ))}
                  </div>
                )}
                {!loading && analiseDetalhe && (
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{analiseDetalhe}</div>
                )}
              </CardContent>
            </Card>
          );
          if (etapa) {
            return (
              <button
                key={key}
                type="button"
                className="text-left"
                title="Ver quem está nesta etapa"
                onClick={() => setEtapaAberta(aberta ? null : etapa)}
              >
                {inner}
              </button>
            );
          }
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
      {etapaAberta && (
        <PipelineEtapaPainel
          etapa={etapaAberta}
          scope={scope}
          canSeeAll={canSeeAll}
          onFechar={() => setEtapaAberta(null)}
        />
      )}
    </div>
  );
}

/** Expansão inline de uma etapa do pipeline: quem está nela AGORA. */
function PipelineEtapaPainel({
  etapa,
  scope,
  canSeeAll,
  onFechar,
}: {
  etapa: string;
  scope: string | null;
  canSeeAll: boolean;
  onFechar: () => void;
}) {
  const q = usePipelineEtapaNominal(etapa, scope);
  const nomesQ = useCorretorNomes(canSeeAll);
  const rotulo = PIPELINE_CARDS.find((c) => c.etapa === etapa)?.label ?? etapa;
  const linkBase =
    etapa === "sem_corretor" ? { search: {} } : { search: { status: etapa } as const };
  return (
    <Card className="mt-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Quem está em “{rotulo}” agora
          <span className="text-xs font-normal text-muted-foreground">
            {q.data ? `${q.data.total.toLocaleString("pt-BR")} leads` : ""}
          </span>
          <span className="ml-auto flex items-center gap-3">
            <Link
              to="/leads"
              search={linkBase.search}
              className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-primary hover:underline"
            >
              abrir na base <ArrowRight className="h-3 w-3" />
            </Link>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onFechar}>
              fechar
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <AsyncBoundary
          isLoading={q.isLoading}
          isError={q.isError}
          error={q.error}
          errorTitle="Não foi possível carregar os leads da etapa."
          onRetry={() => q.refetch()}
          loadingFallback={<Skeleton className="h-32 w-full" />}
        >
          {(q.data?.rows.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguém nesta etapa agora.</p>
          ) : (
            <>
              <ul className="divide-y">
                {(q.data?.rows ?? []).map((l) => (
                  <li key={l.id} className="flex items-center gap-3 py-2">
                    <div className="flex-1 min-w-0">
                      <LeadCell leadId={l.id} nome={l.nome} telefone={l.telefone} />
                    </div>
                    {canSeeAll && (
                      <span className="hidden sm:block text-xs text-muted-foreground truncate max-w-[160px]">
                        {corretorNome(l.corretor_id, nomesQ.data)}
                      </span>
                    )}
                    <Badge variant="outline" className="whitespace-nowrap">
                      parado{" "}
                      {formatDistanceToNowStrict(parseISO(l.ultima_atividade_em), {
                        locale: ptBR,
                      })}
                    </Badge>
                  </li>
                ))}
              </ul>
              <NotaTeto mostrando={q.data?.rows.length ?? 0} total={q.data?.total ?? 0} />
            </>
          )}
        </AsyncBoundary>
      </CardContent>
    </Card>
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
                {parados30} {parados30 === 1 ? "lead parado" : "leads parados"} há mais de{" "}
                {formatDuration(30)}
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
        Tudo em dia — nenhum lead parado há mais de {formatDuration(30)}.
      </p>
    );
  return (
    <ul className="divide-y">
      {rows.slice(0, 10).map((r) => {
        const tempo = formatDuration(r.minutos_parado);
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
