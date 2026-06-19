import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import {
  PeriodFilter,
  useDateFilter,
  type PeriodPreset,
} from "@/features/dashboard/period-filter";
import {
  useDashboardKpis,
  useDashboardSerie,
  useDashboardFunil,
  useDashboardPorCorretor,
  useDashboardMotivosPerda,
  useDashboardLeadsUrgentes,
  useDashboardRedistribuicoes,
} from "@/features/dashboard/queries";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Seu Metro Quadrado" }] }),
  component: DashboardPage,
});

function DashboardPage() {
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
  const funilQ = useDashboardFunil(range, scope, stage >= 3);
  const porCorretorQ = useDashboardPorCorretor(range, canSeeAll && stage >= 3);
  const motivosQ = useDashboardMotivosPerda(range, scope, stage >= 4);
  const redistQ = useDashboardRedistribuicoes(range, canSeeAll && stage >= 4);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Dashboard"
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

      <KpiGrid data={kpisQ.data} loading={kpisQ.isLoading} />

      {canSeeAll && (
        <SituacaoAgora
          urgentes={urgentesQ.data ?? []}
          semCorretor={kpisQ.data?.sem_corretor ?? 0}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Evolução no período
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            {serieQ.isLoading || !range.di ? (
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

      {canSeeAll && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4" /> Ranking por corretor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PorCorretorTable rows={porCorretorQ.data ?? []} loading={porCorretorQ.isLoading} />
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
          <CardContent className="h-[280px]">
            {motivosQ.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (motivosQ.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados no período.</p>
            ) : (
              <MotivosChart data={motivosQ.data ?? []} />
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

const KPI_CARDS: Array<{
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  status?: string;
  className?: string;
}> = [
  { key: "total", label: "Total de leads", icon: Users },
  { key: "aguardando", label: "Aguardando", icon: Hourglass, status: "aguardando_atendimento" },
  { key: "em_atendimento", label: "Em atendimento", icon: Clock, status: "em_atendimento" },
  { key: "agendado", label: "Agendado", icon: Calendar, status: "agendado" },
  { key: "visita_realizada", label: "Visita", icon: Eye, status: "visita_realizada" },
  { key: "analise_credito", label: "Análise crédito", icon: FileCheck, status: "analise_credito" },
  {
    key: "contrato_fechado",
    label: "Vendas",
    icon: CheckCircle2,
    status: "contrato_fechado",
    className: "border-emerald-500/40 bg-emerald-500/5",
  },
  { key: "perdido", label: "Perdidos", icon: XCircle, status: "perdido" },
];

function KpiGrid({
  data,
  loading,
}: {
  data?: Record<string, number>;
  loading: boolean;
}) {
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
      {KPI_CARDS.map(({ key, label, icon: Icon, status, className }) => {
        const value = data?.[key] ?? 0;
        const inner = (
          <Card
            className={`transition-all hover:border-primary/40 hover:shadow-sm ${className ?? ""}`}
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
                <div className="text-2xl font-semibold tabular-nums">{value}</div>
              )}
            </CardContent>
          </Card>
        );
        return status ? (
          <Link key={key} to="/leads" search={{ status } as any}>
            {inner}
          </Link>
        ) : (
          <div key={key}>{inner}</div>
        );
      })}
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
              <p className="text-xs text-muted-foreground">
                Sem contato após distribuição
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/leads" search={{ status: "aguardando_atendimento" } as any}>
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
  data: Array<{ dia: string; leads: number; agendamentos: number; visitas: number; vendas: number }>;
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
        <Line type="monotone" dataKey="leads" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="agendamentos" stroke="#06b6d4" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="visitas" stroke="#f59e0b" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="vendas" stroke="#10b981" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function FunilView({ data }: { data: Array<{ etapa: string; quantidade: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.quantidade));
  return (
    <div className="space-y-2">
      {data.map((d) => {
        const pct = Math.round((d.quantidade / max) * 100);
        return (
          <div key={d.etapa}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">{d.etapa}</span>
              <span className="font-medium tabular-nums">{d.quantidade}</span>
            </div>
            <div className="h-7 rounded-md bg-muted overflow-hidden">
              <div
                className="h-full bg-primary/80 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PorCorretorTable({
  rows,
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
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-40 w-full" />;
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">Sem dados no período.</p>;
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
              <TableCell className="text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                {r.fechados}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {r.perdidos}
              </TableCell>
              <TableCell className="text-right">
                <Badge variant={r.conversao >= 5 ? "default" : "secondary"}>
                  {r.conversao}%
                </Badge>
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
  loading,
}: {
  rows: Array<{
    lead_id: string;
    nome: string;
    telefone: string;
    corretor_nome: string;
    minutos_parado: number;
  }>;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-32 w-full" />;
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Tudo em dia — nenhum lead parado há mais de 30 min.
      </p>
    );
  return (
    <ul className="divide-y">
      {rows.slice(0, 10).map((r) => {
        const h = Math.floor(r.minutos_parado / 60);
        const m = r.minutos_parado % 60;
        const tempo = h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
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
        <YAxis
          type="category"
          dataKey="motivo"
          tick={{ fontSize: 11 }}
          width={140}
          interval={0}
        />
        <Tooltip />
        <Bar dataKey="quantidade" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
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
                <Link to="/leads/$leadId" params={{ leadId: r.lead_id }} className="hover:underline">
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
