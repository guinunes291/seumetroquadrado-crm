import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { cn, formatDuracaoParado } from "@/lib/utils";
import { leadStatusLabel } from "@/lib/leads";
import {
  useDashboardPorCorretor,
  useDashboardLeadsUrgentes,
  useTempoPrimeiraResposta,
} from "@/features/dashboard/queries";
import {
  useGestaoMetricas,
  LIMITE_ATIVIDADE,
  type AtividadeAutor,
} from "@/features/gestao/use-gestao-metricas";
import {
  Activity,
  AlertTriangle,
  ClipboardCheck,
  ShieldAlert,
  PhoneCall,
  MessageCircle,
  MapPin,
  BarChart3,
  Timer,
  UserX,
  Users,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VisaoGeralPanel } from "@/features/gestao/visao-geral";
import { CorretoresPage } from "@/features/gestao/corretores-page";
import { EquipesPage } from "@/features/gestao/equipes-page";
import { LeadsPorCorretorPage } from "@/features/gestao/leads-por-corretor-page";
import { TemplatesPage } from "@/features/gestao/templates-page";
import { DuplicatasPage } from "@/features/gestao/duplicatas-page";
import { LixeiraPage } from "@/features/gestao/lixeira-page";
import { EstoquePage } from "@/features/gestao/estoque-page";

type GestaoTab =
  | "visao"
  | "saude"
  | "estoque"
  | "leads-corretor"
  | "pessoas"
  | "comunicacao"
  | "qualidade";
const GESTAO_TABS: GestaoTab[] = [
  "visao",
  "saude",
  "estoque",
  "leads-corretor",
  "pessoas",
  "comunicacao",
  "qualidade",
];


export const Route = createFileRoute("/_authenticated/painel-gestor")({
  // `tab` permite abrir/linkar direto uma aba do hub de Gestão.
  // A antiga aba "distribuicao" virou a página /distribuicao — o valor passa
  // pelo validateSearch para o beforeLoad redirecionar (deep-links antigos
  // continuam funcionando).
  validateSearch: (search: Record<string, unknown>): { tab?: GestaoTab | "distribuicao" } => ({
    tab:
      search.tab === "distribuicao"
        ? "distribuicao"
        : GESTAO_TABS.includes(search.tab as GestaoTab)
          ? (search.tab as GestaoTab)
          : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (search.tab === "distribuicao") {
      throw redirect({ to: "/distribuicao", search: {} });
    }
  },
  head: () => ({ meta: [{ title: "Gestão — Seu Metro Quadrado" }] }),
  component: PainelGestorPage,
});

// Hub de Gestão: consolida saúde da operação, distribuição, pessoas, comunicação
// e qualidade de dados em abas internas (Fase 1). Cada aba reaproveita a página
// já existente; as rotas antigas seguem válidas para deep-link/compatibilidade.
function PainelGestorPage() {
  const { isAdmin, isGestor, loading } = useUserRoles();
  const podeVer = isAdmin || isGestor;
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeTab: GestaoTab = tab && tab !== "distribuicao" ? tab : "visao";
  const onTabChange = (v: string) =>
    navigate({ search: { tab: v === "visao" ? undefined : (v as GestaoTab) } });

  // Guarda real: corretor não acessa o hub de Gestão (antes recebia um painel
  // vazio). Enquanto os papéis carregam, evita o flash redirecionando só depois.
  if (!loading && !podeVer) {
    throw redirect({ to: "/" });
  }
  if (loading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="space-y-4">
      <TabsList className="h-auto flex-wrap justify-start">
        <TabsTrigger value="visao">Visão geral</TabsTrigger>
        <TabsTrigger value="saude">Saúde</TabsTrigger>
        <TabsTrigger value="estoque">Estoque</TabsTrigger>
        <TabsTrigger value="leads-corretor">Leads por Corretor</TabsTrigger>
        <TabsTrigger value="pessoas">Pessoas</TabsTrigger>
        <TabsTrigger value="comunicacao">Comunicação</TabsTrigger>
        {isAdmin && <TabsTrigger value="qualidade">Qualidade</TabsTrigger>}
      </TabsList>
      <TabsContent value="visao">
        <VisaoGeralPanel />
      </TabsContent>
      <TabsContent value="saude">
        <SaudePanel />
      </TabsContent>
      <TabsContent value="estoque">
        <EstoquePage />
      </TabsContent>
      <TabsContent value="leads-corretor">
        <LeadsPorCorretorPage />
      </TabsContent>

      <TabsContent value="pessoas" className="space-y-10">
        <CorretoresPage />
        <EquipesPage />
      </TabsContent>
      <TabsContent value="comunicacao">
        <TemplatesPage />
      </TabsContent>
      {isAdmin && (
        <TabsContent value="qualidade" className="space-y-10">
          <DuplicatasPage />
          <LixeiraPage />
        </TabsContent>
      )}
    </Tabs>
  );
}

type Periodo = "hoje" | "semana" | "mes";
const toDate = (d: Date) => d.toISOString().slice(0, 10);
function intervalo(p: Periodo): { di: string; df: string } {
  const now = new Date();
  if (p === "hoje") return { di: toDate(now), df: toDate(now) };
  if (p === "semana") {
    const s = new Date(now);
    s.setDate(now.getDate() - 6);
    return { di: toDate(s), df: toDate(now) };
  }
  return { di: toDate(new Date(now.getFullYear(), now.getMonth(), 1)), df: toDate(now) };
}

type SaudeRow = {
  corretor_id: string;
  nome: string;
  leads: number;
  agendamentos: number;
  visitas: number;
  analise: number;
  fechados: number;
  perdidos: number;
  conversao: number;
  parados: number;
  /** Minutos médios de 1ª resposta (null = sem amostra no período). */
  primeira_resposta_min: number | null;
};

type AtividadeLinha = AtividadeAutor & { nome: string };

function SaudePanel() {
  const { isAdmin, isGestor } = useUserRoles();
  const podeVer = isAdmin || isGestor;
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const range = useMemo(() => intervalo(periodo), [periodo]);

  const porCorretorQ = useDashboardPorCorretor(range, podeVer);
  const urgentesQ = useDashboardLeadsUrgentes(null, podeVer);
  const tempoQ = useTempoPrimeiraResposta(range, podeVer);

  // Agregados de atividade + aderência num RPC só (fallback: caminho antigo
  // de linhas cruas). Ver use-gestao-metricas.ts.
  const metricasQ = useGestaoMetricas(range, podeVer);

  // Tempo de 1ª resposta por corretor (mapa corretor_id -> métrica).
  const tempoMap = useMemo(
    () => new Map((tempoQ.data ?? []).map((t) => [t.corretor_id, t])),
    [tempoQ.data],
  );

  // Média ponderada da equipe (por nº de leads respondidos) para o card de topo.
  const tempoEquipe = useMemo(() => {
    let somaPond = 0;
    let somaResp = 0;
    for (const t of tempoQ.data ?? []) {
      somaPond += t.tempo_medio_min * t.leads_respondidos;
      somaResp += t.leads_respondidos;
    }
    return somaResp > 0 ? Math.round(somaPond / somaResp) : null;
  }, [tempoQ.data]);

  // Nomes dos corretores (autor das interações) para o relatório de atividade.
  const nomesQ = useQuery({
    queryKey: ["gestor:nomes-corretores"],
    enabled: podeVer,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome");
      if (error) throw error;
      const m = new Map<string, string>();
      (data ?? []).forEach((p: { id: string; nome: string }) => m.set(p.id, p.nome));
      return m;
    },
  });

  // Leads parados (>30 min sem atendimento) agregados por corretor.
  const paradosPorCorretor = useMemo(() => {
    const m = new Map<string, number>();
    (urgentesQ.data ?? []).forEach((u) => {
      if (u.corretor_id) m.set(u.corretor_id, (m.get(u.corretor_id) ?? 0) + 1);
    });
    return m;
  }, [urgentesQ.data]);

  // Linhas da tabela de saúde: métricas por corretor + parados + 1ª resposta.
  const saudeRows = useMemo<SaudeRow[]>(
    () =>
      (porCorretorQ.data ?? []).map((c) => {
        const t = tempoMap.get(c.corretor_id);
        return {
          ...c,
          parados: paradosPorCorretor.get(c.corretor_id) ?? 0,
          primeira_resposta_min: t && t.leads_respondidos > 0 ? t.tempo_medio_min : null,
        };
      }),
    [porCorretorQ.data, tempoMap, paradosPorCorretor],
  );

  const saudeColumns = useMemo<ColumnDef<SaudeRow, unknown>[]>(
    () => [
      {
        accessorKey: "nome",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Corretor" />,
        meta: { label: "Corretor" },
        cell: ({ row }) => <span className="font-medium">{row.original.nome}</span>,
      },
      {
        accessorKey: "leads",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Leads" />,
        meta: { label: "Leads", align: "right", cellClassName: "tabular-nums" },
      },
      {
        accessorKey: "agendamentos",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Agend." />,
        meta: {
          label: "Agendamentos",
          align: "right",
          hideBelow: "sm",
          cellClassName: "tabular-nums",
        },
      },
      {
        accessorKey: "visitas",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Visitas" />,
        meta: { label: "Visitas", align: "right", hideBelow: "sm", cellClassName: "tabular-nums" },
      },
      {
        accessorKey: "analise",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Análise" />,
        meta: { label: "Análise", align: "right", hideBelow: "md", cellClassName: "tabular-nums" },
      },
      {
        accessorKey: "fechados",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Vendas" />,
        meta: { label: "Vendas", align: "right", cellClassName: "tabular-nums" },
        cell: ({ row }) => (
          <span className="font-semibold text-success">{row.original.fechados}</span>
        ),
      },
      {
        accessorKey: "perdidos",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Perdidos" />,
        meta: { label: "Perdidos", align: "right", hideBelow: "md", cellClassName: "tabular-nums" },
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.perdidos}</span>,
      },
      {
        accessorKey: "parados",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Parados" />,
        meta: { label: "Parados", align: "right", cellClassName: "tabular-nums" },
        cell: ({ row }) => (
          <span
            className={cn(
              row.original.parados > 0 ? "font-semibold text-destructive" : "text-muted-foreground",
            )}
          >
            {row.original.parados}
          </span>
        ),
      },
      {
        id: "primeira_resposta",
        accessorFn: (r) => r.primeira_resposta_min ?? -1,
        header: ({ column }) => <DataTableColumnHeader column={column} title="1ª resp." />,
        meta: {
          label: "1ª resposta",
          align: "right",
          hideBelow: "lg",
          cellClassName: "tabular-nums",
        },
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.primeira_resposta_min != null
              ? fmtDuracao(row.original.primeira_resposta_min)
              : "—"}
          </span>
        ),
      },
      {
        accessorKey: "conversao",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Conv." />,
        meta: { label: "Conversão", align: "right", cellClassName: "tabular-nums" },
        cell: ({ row }) => <Badge variant="outline">{row.original.conversao}%</Badge>,
      },
    ],
    [],
  );

  // Relatório de atividade com o nome do autor resolvido.
  const atividade = useMemo(() => {
    const nomes = nomesQ.data;
    const linhas: AtividadeLinha[] = (metricasQ.data?.atividade ?? []).map((l) => ({
      ...l,
      nome: (l.autor_id && nomes?.get(l.autor_id)) || "Sem autor",
    }));
    const tot = { ligacao: 0, whatsapp: 0, visita: 0, total: 0 };
    for (const l of linhas) {
      tot.ligacao += l.ligacao;
      tot.whatsapp += l.whatsapp;
      tot.visita += l.visita;
      tot.total += l.total;
    }
    return { linhas, tot, truncado: metricasQ.data?.truncado ?? false };
  }, [metricasQ.data, nomesQ.data]);

  const atividadeColumns = useMemo<ColumnDef<AtividadeLinha, unknown>[]>(
    () => [
      {
        accessorKey: "nome",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Corretor" />,
        meta: { label: "Corretor" },
        cell: ({ row }) => <span className="font-medium">{row.original.nome}</span>,
      },
      {
        accessorKey: "ligacao",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Ligações" />,
        meta: { label: "Ligações", align: "right", cellClassName: "tabular-nums" },
      },
      {
        accessorKey: "whatsapp",
        header: ({ column }) => <DataTableColumnHeader column={column} title="WhatsApp" />,
        meta: { label: "WhatsApp", align: "right", cellClassName: "tabular-nums" },
      },
      {
        accessorKey: "visita",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Visitas" />,
        meta: { label: "Visitas", align: "right", hideBelow: "sm", cellClassName: "tabular-nums" },
      },
      {
        accessorKey: "outras",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Outras" />,
        meta: { label: "Outras", align: "right", hideBelow: "md", cellClassName: "tabular-nums" },
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.outras}</span>,
      },
      {
        accessorKey: "total",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
        meta: { label: "Total", align: "right", cellClassName: "tabular-nums" },
        cell: ({ row }) => <span className="font-semibold">{row.original.total}</span>,
      },
    ],
    [],
  );

  if (!podeVer) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <ShieldAlert className="h-10 w-10" />
          <div className="font-medium">Acesso restrito</div>
          <div className="text-sm">Esta área é exclusiva para gestores e administradores.</div>
        </CardContent>
      </Card>
    );
  }

  const urgentes = urgentesQ.data ?? [];
  const ad = metricasQ.data?.aderencia;

  const pctAderencia = (faltando: number) =>
    ad && ad.total > 0 ? Math.round((1 - faltando / ad.total) * 100) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel do Gestor"
        description="Saúde da operação: produtividade por corretor, qualidade do CRM e leads parados."
        actions={
          <div className="inline-flex rounded-md border bg-card p-0.5">
            {(["hoje", "semana", "mes"] as const).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={periodo === p ? "default" : "ghost"}
                onClick={() => setPeriodo(p)}
                className="capitalize"
              >
                {p === "mes" ? "Mês" : p}
              </Button>
            ))}
          </div>
        }
      />

      {/* Bloco 1 — Saúde por corretor */}
      <section>
        <SectionHeader
          eyebrow="Produtividade"
          title={
            <span className="flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-primary" /> Saúde por corretor
            </span>
          }
        />
        <DataTable
          tableId="gestao-saude"
          aria-label="Saúde por corretor"
          columns={saudeColumns}
          data={saudeRows}
          rowKey={(r) => r.corretor_id}
          loading={porCorretorQ.isLoading}
          error={porCorretorQ.isError ? porCorretorQ.error : undefined}
          onRetry={() => void porCorretorQ.refetch()}
          empty={
            <EmptyState
              icon={Users}
              title="Sem dados no período."
              description="Ajuste o período acima para ver a produtividade da equipe."
            />
          }
        />
      </section>

      {/* Bloco 2 — Relatório de atividade (ligações / WhatsApp / visitas) */}
      <section>
        <StatGrid className="mb-3">
          <StatTile
            title="Ligações"
            icon={PhoneCall}
            intent="info"
            loading={metricasQ.isLoading}
            value={atividade.tot.ligacao}
          />
          <StatTile
            title="WhatsApp"
            icon={MessageCircle}
            intent="success"
            loading={metricasQ.isLoading}
            value={atividade.tot.whatsapp}
          />
          <StatTile
            title="Visitas"
            icon={MapPin}
            intent="info"
            loading={metricasQ.isLoading}
            value={atividade.tot.visita}
          />
          <StatTile
            title="1ª resposta (méd. equipe)"
            icon={Timer}
            intent="neutral"
            loading={tempoQ.isLoading}
            value={tempoEquipe != null ? fmtDuracao(tempoEquipe) : "—"}
          />
        </StatGrid>
        <SectionHeader
          eyebrow="Atividade"
          title={
            <span className="flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-primary" /> Atividade da equipe no período
            </span>
          }
        />
        <DataTable
          tableId="gestao-atividade"
          aria-label="Atividade da equipe no período"
          columns={atividadeColumns}
          data={atividade.linhas}
          rowKey={(r) => r.autor_id ?? "sem-autor"}
          loading={metricasQ.isLoading}
          error={metricasQ.isError ? metricasQ.error : undefined}
          onRetry={() => void metricasQ.refetch()}
          empty={
            <EmptyState
              icon={BarChart3}
              title="Nenhuma interação registrada no período."
              description="Ligações, mensagens e visitas registradas pela equipe aparecem aqui."
            />
          }
        />
        {atividade.truncado && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Mostrando as {LIMITE_ATIVIDADE.toLocaleString("pt-BR")} interações mais recentes do
            período (limite de exibição) — os totais podem estar subestimados.
          </p>
        )}
      </section>

      {/* Bloco 3 — Aderência / qualidade do CRM */}
      <section>
        <SectionHeader
          eyebrow="Qualidade"
          title={
            <span className="flex items-center gap-1.5">
              <ClipboardCheck className="h-4 w-4 text-primary" /> Qualidade do CRM (leads ativos)
            </span>
          }
        />
        <StatGrid>
          <StatTile
            title="Leads ativos"
            icon={Users}
            loading={metricasQ.isLoading}
            value={ad ? ad.total : "—"}
          />
          <Link to="/leads" className="block" aria-label="Ver leads sem corretor">
            <StatTile
              title="Sem corretor"
              icon={UserX}
              intent={(ad?.semCorretor ?? 0) > 0 ? "warning" : "neutral"}
              loading={metricasQ.isLoading}
              value={ad ? ad.semCorretor : "—"}
              hint="clique para abrir a base"
              className="hover-lift cursor-pointer transition-shadow hover:shadow-elev-2"
            />
          </Link>
          <StatTile
            title="Sem e-mail"
            loading={metricasQ.isLoading}
            value={ad ? ad.semEmail : "—"}
            hint={
              pctAderencia(ad?.semEmail ?? 0) != null
                ? `${pctAderencia(ad?.semEmail ?? 0)}% preenchido`
                : undefined
            }
          />
          <StatTile
            title="Sem renda informada"
            loading={metricasQ.isLoading}
            value={ad ? ad.semRenda : "—"}
            hint={
              pctAderencia(ad?.semRenda ?? 0) != null
                ? `${pctAderencia(ad?.semRenda ?? 0)}% preenchido`
                : undefined
            }
          />
        </StatGrid>
      </section>

      {/* Bloco 4 — Leads parados por corretor (acionável) */}
      <Card className="border-warning/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-warning" /> Leads parados (+30 min sem
            atendimento)
            {urgentes.length > 0 && (
              <Badge variant="secondary" className="bg-warning/15 text-warning">
                {urgentes.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {urgentesQ.isError ? (
            <QueryErrorState
              title="Não foi possível carregar os leads parados."
              error={urgentesQ.error}
              onRetry={() => urgentesQ.refetch()}
            />
          ) : urgentesQ.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : urgentes.length === 0 ? (
            <EmptyState title="Nenhum lead parado agora. 👏" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {urgentes.slice(0, 20).map((u) => (
                <Link
                  key={u.lead_id}
                  to="/leads/$leadId"
                  params={{ leadId: u.lead_id }}
                  className="flex items-center justify-between gap-2 rounded-md border border-border-subtle p-2 hover:bg-accent"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{u.nome}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {leadStatusLabel(u.status)} · {u.corretor_nome || "sem corretor"}
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className="shrink-0 bg-destructive/15 text-destructive"
                  >
                    {formatDuracaoParado(u.minutos_parado)}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Minutos -> "Xmin" / "Xh Ymin" para os tempos de resposta.
function fmtDuracao(min: number): string {
  if (min <= 0) return "—";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}
