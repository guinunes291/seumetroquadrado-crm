import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "recharts";
import {
  Users,
  Calendar,
  Eye,
  CheckCircle2,
  XCircle,
  UserX,
  Trophy,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  RefreshCw,
  Banknote,
  Target,
  Timer,
  Megaphone,
  DatabaseZap,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { leadStatusLabel, MOTIVO_PERDA_LABEL, type MotivoPerdaCategoria } from "@/lib/leads";
import { PeriodFilter, useDateFilter, type PeriodPreset } from "@/features/dashboard/period-filter";
import {
  fmtBRL,
  fmtBRLCompact,
  fmtInt,
  fmtMinutos,
  fmtHoras,
  deltaPct,
  conversaoEtapas,
  pctSeguro,
} from "@/features/dashboard/format";
import {
  useDashboardKpis,
  useDashboardSerie,
  useDashboardFunil,
  useDashboardPorCorretor,
  useDashboardMotivosPerda,
  useDashboardLeadsUrgentes,
  useDashboardRedistribuicoes,
  useDashboardReceita,
  useDashboardOrigem,
  useTempoMedioPorEtapa,
  useTempoPrimeiraResposta,
  type KpisAtividade,
  type KpisPipeline,
  type ReceitaV2,
  type OrigemRow,
  type TempoEtapaRow,
  type TempoPrimeiraResposta,
  type LeadUrgente,
} from "@/features/dashboard/queries";

/** Cores das séries: tokens --viz-1..4 (matiz da marca, validados p/ CVD). */
const SERIES = [
  { key: "leads", label: "Leads", color: "var(--viz-1)" },
  { key: "agendamentos", label: "Agendamentos", color: "var(--viz-2)" },
  { key: "visitas", label: "Visitas", color: "var(--viz-3)" },
  { key: "vendas", label: "Vendas", color: "var(--viz-4)" },
] as const;

const ORIGEM_LABEL: Record<string, string> = {
  facebook: "Facebook / Meta Ads",
  google_sheets: "Google Sheets",
  site: "Site",
  indicacao: "Indicação",
  captacao_corretor: "Captação do corretor",
  whatsapp: "WhatsApp",
  telefone: "Telefone",
  plantao: "Plantão",
  agendamento_self_service: "Agendamento online",
  chatbot: "Chatbot",
  importacao: "Importação",
  outro: "Outro",
  desconhecida: "Desconhecida",
};

/**
 * Visão de Relatórios/Analytics — aba "Analytics" de `/hoje`.
 * Dados vêm das RPCs `dashboard_*` (migration dashboard_analytics_v2):
 * atividade do período com comparação vs período anterior, carteira atual,
 * receita (VGV/comissão/meta), origem/campanha e velocidade do funil.
 */
export function RelatoriosView() {
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const canSeeAll = isAdmin || isGestor;
  const scope = canSeeAll ? null : (user?.id ?? null);

  const [preset, setPreset] = useState<PeriodPreset>("this_month");
  const [custom, setCustom] = useState<{ from?: Date; to?: Date }>({});
  const range = useDateFilter(preset, custom);

  // Carregamento por tiers (evita rajada de RPCs no primeiro paint)
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
  const receitaQ = useDashboardReceita(range, scope, stage >= 2);
  const urgentesQ = useDashboardLeadsUrgentes(scope, stage >= 2);
  const serieQ = useDashboardSerie(range, scope, stage >= 2);
  const funilQ = useDashboardFunil(range, scope, stage >= 3);
  const origemQ = useDashboardOrigem(range, scope, stage >= 3);
  const porCorretorQ = useDashboardPorCorretor(range, canSeeAll && stage >= 3);
  const tempoRespostaQ = useTempoPrimeiraResposta(range, stage >= 4);
  const tempoEtapaQ = useTempoMedioPorEtapa(range, scope, stage >= 4);
  const motivosQ = useDashboardMotivosPerda(range, scope, stage >= 4);
  const redistQ = useDashboardRedistribuicoes(range, canSeeAll && stage >= 4);

  const sqlPendente = kpisQ.data ? !kpisQ.data.v2 : false;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description={canSeeAll ? "Visão geral do time" : "Sua performance"}
        actions={
          <PeriodFilter
            preset={preset}
            onPresetChange={setPreset}
            custom={custom}
            onCustomChange={setCustom}
          />
        }
      />

      {sqlPendente && <SqlPendenteAlert />}

      <AtividadeGrid
        data={kpisQ.data?.periodo ?? null}
        prev={kpisQ.data?.prev ?? null}
        loading={kpisQ.isLoading}
        comparavel={preset !== "all"}
      />

      <PipelineGrid
        data={kpisQ.data?.pipeline ?? null}
        legado={kpisQ.data?.legado ?? null}
        loading={kpisQ.isLoading}
        canSeeAll={canSeeAll}
      />

      {canSeeAll && (
        <SituacaoAgora
          urgentes={urgentesQ.data ?? []}
          semCorretor={kpisQ.data?.pipeline?.sem_corretor ?? kpisQ.data?.legado?.sem_corretor ?? 0}
        />
      )}

      <ReceitaSection
        data={receitaQ.data ?? null}
        loading={receitaQ.isLoading}
        comparavel={preset !== "all"}
        sqlPendente={receitaQ.data === null && !receitaQ.isLoading}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Evolução no período
              {preset === "all" && (
                <span className="text-xs font-normal text-muted-foreground">(últimos 90 dias)</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            {serieQ.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <SerieChart data={serieQ.data ?? []} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRight className="h-4 w-4" /> Funil de vendas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {funilQ.isLoading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : (
              <FunilView data={funilQ.data ?? []} />
            )}
          </CardContent>
        </Card>
      </div>

      <OrigemSection
        rows={origemQ.data ?? null}
        loading={origemQ.isLoading}
        sqlPendente={origemQ.data === null && !origemQ.isLoading}
      />

      <VelocidadeSection
        resposta={tempoRespostaQ.data ?? []}
        etapas={tempoEtapaQ.data ?? null}
        loading={tempoRespostaQ.isLoading || tempoEtapaQ.isLoading}
        canSeeAll={canSeeAll}
      />

      {canSeeAll && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4" /> Ranking por corretor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PorCorretorTable
              rows={porCorretorQ.data ?? []}
              resposta={tempoRespostaQ.data ?? []}
              loading={porCorretorQ.isLoading}
            />
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
            <UrgentesList rows={urgentesQ.data ?? []} loading={urgentesQ.isLoading} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <XCircle className="h-4 w-4" /> Motivos de perda
            </CardTitle>
          </CardHeader>
          <CardContent>
            {motivosQ.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (motivosQ.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Sem perdas registradas neste período.</p>
            ) : (
              <BarList
                rows={(motivosQ.data ?? []).map((m) => ({
                  label:
                    MOTIVO_PERDA_LABEL[m.motivo as MotivoPerdaCategoria] ??
                    (m.motivo === "nao_informado" ? "Não informado" : m.motivo),
                  value: m.quantidade,
                }))}
              />
            )}
          </CardContent>
        </Card>

        {canSeeAll && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <RefreshCw className="h-4 w-4" /> Redistribuições recentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RedistTable rows={redistQ.data ?? []} loading={redistQ.isLoading} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aviso: migration SQL ainda não aplicada no banco
// ---------------------------------------------------------------------------

function SqlPendenteAlert() {
  return (
    <Alert>
      <DatabaseZap className="h-4 w-4" />
      <AlertTitle>Atualização de dados pendente</AlertTitle>
      <AlertDescription>
        O banco ainda usa as funções antigas do dashboard. Aplique a migration{" "}
        <code className="font-mono text-xs">20260702120000_dashboard_analytics_v2.sql</code> no SQL
        Editor do Supabase para ativar os números corrigidos, Receita, Origem e Velocidade.
      </AlertDescription>
    </Alert>
  );
}

// ---------------------------------------------------------------------------
// Delta vs período anterior
// ---------------------------------------------------------------------------

function DeltaChip({
  atual,
  anterior,
  invert = false,
}: {
  atual: number | null | undefined;
  anterior: number | null | undefined;
  /** true quando SUBIR é ruim (ex.: perdidos). */
  invert?: boolean;
}) {
  const d = deltaPct(atual, anterior);
  if (d.pct === null) return null;
  const good = d.direction === "flat" ? null : (d.direction === "up") !== invert;
  const Icon = d.direction === "up" ? TrendingUp : d.direction === "down" ? TrendingDown : Minus;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${
        good === null
          ? "text-muted-foreground"
          : good
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-rose-600 dark:text-rose-400"
      }`}
      title="Variação vs período anterior equivalente"
    >
      <Icon className="h-3 w-3" />
      {d.pct > 0 ? "+" : ""}
      {d.pct}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Atividade do período (o que ACONTECEU no intervalo filtrado)
// ---------------------------------------------------------------------------

const ATIVIDADE_CARDS: Array<{
  key: keyof KpisAtividade;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  money?: boolean;
  invert?: boolean;
  className?: string;
}> = [
  { key: "leads_novos", label: "Leads novos", icon: Users },
  { key: "agendamentos", label: "Agendamentos", icon: Calendar },
  { key: "visitas", label: "Visitas", icon: Eye },
  {
    key: "vendas",
    label: "Vendas",
    icon: CheckCircle2,
    className: "border-emerald-500/40 bg-emerald-500/5",
  },
  { key: "vgv", label: "VGV", icon: Banknote, money: true },
  { key: "perdidos", label: "Perdidos", icon: XCircle, invert: true },
];

function AtividadeGrid({
  data,
  prev,
  loading,
  comparavel,
}: {
  data: KpisAtividade | null;
  prev: KpisAtividade | null;
  loading: boolean;
  comparavel: boolean;
}) {
  return (
    <section aria-label="Atividade do período">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
        Atividade do período
      </h2>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {ATIVIDADE_CARDS.map(({ key, label, icon: Icon, money, invert, className }) => (
          <Card key={key} className={className}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between mb-1 gap-1">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground leading-tight">
                  {label}
                </span>
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              {loading ? (
                <Skeleton className="h-7 w-14" />
              ) : data ? (
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-2xl font-semibold tabular-nums">
                    {money ? fmtBRLCompact(data[key]) : fmtInt(data[key])}
                  </span>
                  {comparavel && (
                    <DeltaChip atual={data[key]} anterior={prev?.[key]} invert={invert} />
                  )}
                </div>
              ) : (
                <span className="text-2xl font-semibold text-muted-foreground">—</span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Carteira agora (foto atual, independe do filtro de período)
// ---------------------------------------------------------------------------

const PIPELINE_CARDS: Array<{
  key: keyof KpisPipeline;
  legadoKey?: string;
  label: string;
  status?: string;
}> = [
  { key: "em_aberto", label: "Em aberto" },
  {
    key: "aguardando_atendimento",
    legadoKey: "aguardando",
    label: "Aguardando",
    status: "aguardando_atendimento",
  },
  { key: "aguardando_retorno", label: "Aguard. retorno", status: "aguardando_retorno" },
  {
    key: "em_atendimento",
    legadoKey: "em_atendimento",
    label: "Em atendimento",
    status: "em_atendimento",
  },
  { key: "agendado", legadoKey: "agendado", label: "Agendado", status: "agendado" },
  {
    key: "visita_realizada",
    legadoKey: "visita_realizada",
    label: "Visita",
    status: "visita_realizada",
  },
  {
    key: "analise_credito",
    legadoKey: "analise_credito",
    label: "Análise crédito",
    status: "analise_credito",
  },
  { key: "sem_corretor", legadoKey: "sem_corretor", label: "Sem corretor" },
];

function PipelineGrid({
  data,
  legado,
  loading,
  canSeeAll,
}: {
  data: KpisPipeline | null;
  legado: Record<string, number> | null;
  loading: boolean;
  canSeeAll: boolean;
}) {
  const cards = PIPELINE_CARDS.filter((c) => c.key !== "sem_corretor" || canSeeAll);
  return (
    <section aria-label="Carteira agora">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
        Carteira agora
      </h2>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
        {cards.map(({ key, legadoKey, label, status }) => {
          const value = data ? data[key] : legadoKey && legado ? legado[legadoKey] : undefined;
          const inner = (
            <Card className="transition-all hover:border-primary/40 hover:shadow-sm h-full">
              <CardContent className="p-3">
                <span className="block text-[11px] uppercase tracking-wide text-muted-foreground leading-tight mb-1">
                  {label}
                </span>
                {loading ? (
                  <Skeleton className="h-6 w-10" />
                ) : (
                  <span className="text-xl font-semibold tabular-nums">
                    {value === undefined ? "—" : fmtInt(value)}
                  </span>
                )}
              </CardContent>
            </Card>
          );
          return status ? (
            <Link key={key} to="/leads" search={{ status }}>
              {inner}
            </Link>
          ) : (
            <div key={key}>{inner}</div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Situação agora (gestor)
// ---------------------------------------------------------------------------

function SituacaoAgora({
  urgentes,
  semCorretor,
}: {
  urgentes: LeadUrgente[];
  semCorretor: number;
}) {
  // total real vem do SQL v2 (count OVER); antes disso, cai no tamanho da página.
  const total = urgentes[0]?.total_count ?? urgentes.length;
  const distribuidos = urgentes.filter((u) => u.distribuido ?? u.corretor_id !== null).length;
  const naFila = urgentes.length - distribuidos;
  if (total === 0 && semCorretor === 0) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {total > 0 && (
        <Card className="border-orange-500/40 bg-orange-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-orange-500" />
            <div className="flex-1">
              <div className="text-sm font-semibold">
                {fmtInt(total)} {total === 1 ? "lead parado" : "leads parados"} há mais de 30 min
              </div>
              <p className="text-xs text-muted-foreground">
                {distribuidos > 0 && `${distribuidos} sem contato após distribuição`}
                {distribuidos > 0 && naFila > 0 && " · "}
                {naFila > 0 && `${naFila} aguardando distribuição`}
              </p>
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
                {fmtInt(semCorretor)}{" "}
                {semCorretor === 1 ? "lead sem corretor" : "leads sem corretor"}
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

// ---------------------------------------------------------------------------
// Receita (VGV, ticket, comissão) + meta do mês
// ---------------------------------------------------------------------------

function ReceitaSection({
  data,
  loading,
  comparavel,
  sqlPendente,
}: {
  data: ReceitaV2 | null;
  loading: boolean;
  comparavel: boolean;
  sqlPendente: boolean;
}) {
  if (sqlPendente) return null; // banner global já orienta a aplicar o SQL
  const p = data?.periodo;
  const prev = data?.prev;
  const meta = data?.meta;
  return (
    <section aria-label="Receita">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
        Receita
      </h2>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-1">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                VGV no período
              </span>
              <Banknote className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            {loading || !p ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-3xl font-semibold tabular-nums">{fmtBRLCompact(p.vgv)}</span>
                {comparavel && <DeltaChip atual={p.vgv} anterior={prev?.vgv} />}
              </div>
            )}
            {p && <p className="text-xs text-muted-foreground mt-1">{fmtBRL(p.vgv)}</p>}
          </CardContent>
        </Card>

        <StatMoney
          label="Ticket médio"
          value={p?.ticket_medio}
          prev={prev?.ticket_medio}
          loading={loading}
          comparavel={comparavel}
        />
        <StatMoney
          label="Comissão prevista"
          value={p?.comissao_prevista}
          prev={prev?.comissao_prevista}
          loading={loading}
          comparavel={comparavel}
          sub={p ? `Recebida: ${fmtBRLCompact(p.comissao_recebida)}` : undefined}
        />

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Meta do mês {meta ? `(${String(meta.mes).padStart(2, "0")}/${meta.ano})` : ""}
              </span>
              <Target className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            {loading || !meta ? (
              <Skeleton className="h-16 w-full" />
            ) : meta.meta_gmv === 0 && meta.meta_vendas === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sem metas cadastradas para este mês.{" "}
                <Link to="/metas" className="underline">
                  Definir metas
                </Link>
              </p>
            ) : (
              <div className="space-y-2">
                <MetaBar label="VGV" atual={meta.realizado_gmv} meta={meta.meta_gmv} money />
                <MetaBar label="Vendas" atual={meta.realizado_vendas} meta={meta.meta_vendas} />
                <MetaBar label="Visitas" atual={meta.realizado_visitas} meta={meta.meta_visitas} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function StatMoney({
  label,
  value,
  prev,
  loading,
  comparavel,
  sub,
}: {
  label: string;
  value: number | undefined;
  prev: number | undefined;
  loading: boolean;
  comparavel: boolean;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <span className="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
          {label}
        </span>
        {loading || value === undefined ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-semibold tabular-nums">{fmtBRLCompact(value)}</span>
            {comparavel && <DeltaChip atual={value} anterior={prev} />}
          </div>
        )}
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function MetaBar({
  label,
  atual,
  meta,
  money = false,
}: {
  label: string;
  atual: number;
  meta: number;
  money?: boolean;
}) {
  const pct = pctSeguro(atual, meta);
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-0.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {money ? fmtBRLCompact(atual) : fmtInt(atual)}
          <span className="text-muted-foreground">
            {" "}
            / {money ? fmtBRLCompact(meta) : fmtInt(meta)}
            {pct !== null && ` · ${Math.round(pct)}%`}
          </span>
        </span>
      </div>
      <Progress value={Math.min(100, pct ?? 0)} className="h-1.5" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evolução (série diária) — 4 séries, tokens --viz-*, tooltip pt-BR
// ---------------------------------------------------------------------------

const chartTooltipStyle: React.CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
  fontSize: 12,
  padding: "6px 10px",
};

function SerieChart({ data }: { data: Array<{ dia: string } & Record<string, unknown>> }) {
  const formatted = useMemo(
    () => data.map((d) => ({ ...d, label: format(parseISO(d.dia), "dd/MM") })),
    [data],
  );
  if (formatted.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem dados neste período.</p>;
  }
  const serieLabel = (key: string) => SERIES.find((s) => s.key === key)?.label ?? key;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={formatted} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={chartTooltipStyle}
          formatter={(value: number, name: string) => [fmtInt(value), serieLabel(name)]}
          labelFormatter={(label: string) => `Dia ${label}`}
        />
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          formatter={(value: string) => (
            <span style={{ color: "var(--muted-foreground)" }}>{serieLabel(value)}</span>
          )}
        />
        {SERIES.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Funil com % de conversão etapa→etapa
// ---------------------------------------------------------------------------

function FunilView({ data }: { data: Array<{ etapa: string; quantidade: number }> }) {
  const etapas = conversaoEtapas(data);
  const max = Math.max(1, ...data.map((d) => d.quantidade));
  const geral =
    data.length >= 2 ? pctSeguro(data[data.length - 1].quantidade, data[0].quantidade) : null;
  return (
    <div className="space-y-2">
      {etapas.map((d) => (
        <div key={d.etapa}>
          <div className="flex justify-between items-baseline text-xs mb-1">
            <span className="text-muted-foreground">{d.etapa}</span>
            <span className="tabular-nums">
              <span className="font-medium">{fmtInt(d.quantidade)}</span>
              {d.pctAnterior !== null && (
                <span className="text-muted-foreground ml-1.5" title="% da etapa anterior">
                  {d.pctAnterior}%
                </span>
              )}
            </span>
          </div>
          <div className="h-6 rounded-md bg-muted overflow-hidden">
            <div
              className="h-full rounded-r-md transition-all"
              style={{
                width: `${Math.round((d.quantidade / max) * 100)}%`,
                background: "var(--viz-1)",
              }}
            />
          </div>
        </div>
      ))}
      {geral !== null && (
        <p className="text-xs text-muted-foreground pt-1">
          Conversão geral (lead → venda): <span className="font-medium">{geral}%</span>
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BarList — barras horizontais com rótulo direto (motivos, origens, etapas)
// ---------------------------------------------------------------------------

function BarList({
  rows,
  suffix,
}: {
  rows: Array<{ label: string; value: number; extra?: string }>;
  suffix?: (r: { label: string; value: number; extra?: string }) => React.ReactNode;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between items-baseline text-xs mb-0.5 gap-2">
            <span className="text-muted-foreground truncate">{r.label}</span>
            <span className="tabular-nums shrink-0">
              <span className="font-medium">{fmtInt(r.value)}</span>
              {r.extra && <span className="text-muted-foreground ml-1.5">{r.extra}</span>}
              {suffix?.(r)}
            </span>
          </div>
          <div className="h-2.5 rounded-sm bg-muted overflow-hidden">
            <div
              className="h-full rounded-r-sm"
              style={{ width: `${Math.round((r.value / max) * 100)}%`, background: "var(--viz-1)" }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Origem & campanha
// ---------------------------------------------------------------------------

function OrigemSection({
  rows,
  loading,
  sqlPendente,
}: {
  rows: OrigemRow[] | null;
  loading: boolean;
  sqlPendente: boolean;
}) {
  if (sqlPendente) return null;
  const origens = (rows ?? []).filter((r) => r.nivel === "origem");
  const campanhas = (rows ?? []).filter((r) => r.nivel === "campanha");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="h-4 w-4" /> Leads e conversão por origem
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : origens.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem leads neste período.</p>
          ) : (
            <BarList
              rows={origens.map((o) => ({
                label: ORIGEM_LABEL[o.chave] ?? o.chave,
                value: o.leads,
                extra: `${o.vendas} ${o.vendas === 1 ? "venda" : "vendas"} · ${o.conv_pct}%`,
              }))}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="h-4 w-4" /> Top campanhas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : campanhas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem campanha identificada nos leads deste período (utm_campaign/campanha vazios).
            </p>
          ) : (
            <BarList
              rows={campanhas.map((c) => ({
                label: c.chave,
                value: c.leads,
                extra: `${c.vendas} ${c.vendas === 1 ? "venda" : "vendas"} · ${c.conv_pct}%`,
              }))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Velocidade: tempo de 1ª resposta + tempo médio por etapa
// ---------------------------------------------------------------------------

function VelocidadeSection({
  resposta,
  etapas,
  loading,
  canSeeAll,
}: {
  resposta: TempoPrimeiraResposta[];
  etapas: TempoEtapaRow[] | null;
  loading: boolean;
  canSeeAll: boolean;
}) {
  const agg = useMemo(() => {
    const respondidos = resposta.reduce((s, r) => s + r.leads_respondidos, 0);
    const totalLeads = resposta.reduce((s, r) => s + r.leads_no_periodo, 0);
    if (respondidos === 0) return null;
    const mediaPonderada =
      resposta.reduce((s, r) => s + r.tempo_medio_min * r.leads_respondidos, 0) / respondidos;
    return { respondidos, totalLeads, mediaPonderada };
  }, [resposta]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Timer className="h-4 w-4" /> Tempo de 1ª resposta
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : !agg ? (
            <p className="text-sm text-muted-foreground">
              Sem leads respondidos neste período (requer interações de saída registradas).
            </p>
          ) : (
            <div className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums">
                  {fmtMinutos(agg.mediaPonderada)}
                </span>
                <span className="text-xs text-muted-foreground">
                  média {canSeeAll ? "do time" : ""} · {fmtInt(agg.respondidos)} de{" "}
                  {fmtInt(agg.totalLeads)} leads respondidos
                </span>
              </div>
              {canSeeAll && (
                <p className="text-xs text-muted-foreground">
                  Por corretor: coluna “1ª resp.” no Ranking abaixo.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Timer className="h-4 w-4" /> Tempo médio por etapa
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : !etapas || etapas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem transições de etapa neste período.</p>
          ) : (
            <BarList
              rows={etapas.slice(0, 7).map((e) => ({
                label: leadStatusLabel(e.etapa),
                value: Math.round(e.media_horas),
                extra: `média ${fmtHoras(e.media_horas)} · mediana ${fmtHoras(e.p50_horas)}`,
              }))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ranking por corretor (com 1ª resposta)
// ---------------------------------------------------------------------------

function PorCorretorTable({
  rows,
  resposta,
  loading,
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
  resposta: TempoPrimeiraResposta[];
  loading: boolean;
}) {
  const respostaPor = useMemo(() => new Map(resposta.map((r) => [r.corretor_id, r])), [resposta]);
  if (loading) return <Skeleton className="h-40 w-full" />;
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
            <TableHead className="text-right" title="Tempo médio de 1ª resposta">
              1ª resp.
            </TableHead>
            <TableHead className="text-right">Conv.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => {
            const tr = respostaPor.get(r.corretor_id);
            return (
              <TableRow key={r.corretor_id}>
                <TableCell className="text-muted-foreground">{i + 1}º</TableCell>
                <TableCell className="font-medium truncate max-w-[220px]">{r.nome}</TableCell>
                <TableCell className="text-right tabular-nums">{r.leads}</TableCell>
                <TableCell className="text-right tabular-nums">{r.agendamentos}</TableCell>
                <TableCell className="text-right tabular-nums">{r.visitas}</TableCell>
                <TableCell className="text-right tabular-nums">{r.analise}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                  {r.fechados}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {r.perdidos}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {tr && tr.leads_respondidos > 0 ? fmtMinutos(tr.tempo_medio_min) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={r.conversao >= 5 ? "default" : "secondary"}>{r.conversao}%</Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leads urgentes (visão do corretor)
// ---------------------------------------------------------------------------

function UrgentesList({ rows, loading }: { rows: LeadUrgente[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-32 w-full" />;
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Tudo em dia — nenhum lead parado há mais de 30 min.
      </p>
    );
  return (
    <ul className="divide-y">
      {rows.slice(0, 10).map((r) => (
        <li key={r.lead_id} className="py-2 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{r.nome}</div>
            <div className="text-xs text-muted-foreground truncate">
              {r.telefone} · {r.corretor_nome}
            </div>
          </div>
          <Badge variant="destructive">{fmtMinutos(r.minutos_parado)}</Badge>
          <Button asChild size="sm" variant="ghost">
            <Link to="/leads/$leadId" params={{ leadId: r.lead_id }}>
              Abrir
            </Link>
          </Button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Redistribuições recentes
// ---------------------------------------------------------------------------

const TIPO_LABEL: Record<string, string> = {
  automatica: "Automática",
  manual: "Manual",
  inicial: "Inicial",
  redistribuicao: "Redistribuição",
};

function RedistTable({
  rows,
  loading,
}: {
  rows: Array<{
    quando: string;
    lead_id: string;
    lead_nome: string;
    corretor_nome: string;
    tipo: string;
    motivo: string;
  }>;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-40 w-full" />;
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
