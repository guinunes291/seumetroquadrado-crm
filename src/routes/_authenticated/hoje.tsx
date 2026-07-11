import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/ui/section-header";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { buildWhatsAppUrl } from "@/lib/templates";
import { useLeadsComSla } from "@/features/dashboard/queries";
import { scoreLead } from "@/lib/priority";
import { buildMissionQueue, computeStreak, type Mission } from "@/features/command-center/derive";
import { NextBestAction } from "@/features/command-center/next-best-action";
import { MissionQueue } from "@/features/command-center/mission-queue";
import { DayGoals } from "@/features/command-center/day-goals";
import {
  Phone,
  MessageCircle,
  CalendarCheck,
  MapPin,
  FileText,
  Trophy,
  Star,
  DollarSign,
  Clock,
  CheckCircle2,
  ArrowRight,
  Radar,
  Zap,
} from "lucide-react";

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

type Periodo = "hoje" | "semana" | "mes";
type Atividade = {
  dia: string;
  ligacoes: number;
  whatsapps: number;
  agendamentos: number;
  visitas: number;
  documentacoes: number;
  vendas: number;
  vgv_dia: number;
  pontuacao_total: number;
};
type MetaDiaria = {
  meta_ligacoes: number;
  meta_whatsapps: number;
  meta_agendamentos: number;
  meta_visitas: number;
  meta_vendas: number;
};

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

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function CommandCenterPage() {
  const { user } = useAuth();
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const { di, df } = useMemo(() => intervalo(periodo), [periodo]);

  const atividadesQ = useQuery({
    queryKey: ["meu-painel:atividades", user?.id, di, df],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atividades_diarias" as never)
        .select(
          "dia, ligacoes, whatsapps, agendamentos, visitas, documentacoes, vendas, vgv_dia, pontuacao_total",
        )
        .eq("corretor_id", user!.id)
        .gte("dia", di)
        .lte("dia", df);
      if (error) throw error;
      return (data ?? []) as unknown as Atividade[];
    },
  });

  // Streak: últimos 35 dias de atividade (independente do filtro de período).
  const streakQ = useQuery({
    queryKey: ["meu-painel:streak", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const ini = new Date();
      ini.setDate(ini.getDate() - 35);
      const { data, error } = await supabase
        .from("atividades_diarias" as never)
        .select(
          "dia, ligacoes, whatsapps, agendamentos, visitas, documentacoes, vendas, pontuacao_total",
        )
        .eq("corretor_id", user!.id)
        .gte("dia", toDate(ini));
      if (error) throw error;
      const rows = (data ?? []) as unknown as Atividade[];
      const ativos = rows
        .filter(
          (r) =>
            r.ligacoes +
              r.whatsapps +
              r.agendamentos +
              r.visitas +
              r.documentacoes +
              r.vendas +
              r.pontuacao_total >
            0,
        )
        .map((r) => r.dia);
      return computeStreak(ativos, toDate(new Date()));
    },
  });

  const metaQ = useQuery({
    queryKey: ["meu-painel:meta", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("metas_diarias" as never)
        .select("meta_ligacoes, meta_whatsapps, meta_agendamentos, meta_visitas, meta_vendas")
        .eq("corretor_id", user!.id)
        .maybeSingle();
      return (data ?? null) as unknown as MetaDiaria | null;
    },
  });

  const conquistasQ = useQuery({
    queryKey: ["meu-painel:conquistas", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [minhas, tipos] = await Promise.all([
        supabase
          .from("conquistas" as never)
          .select("id")
          .eq("corretor_id", user!.id),
        supabase
          .from("tipos_conquista" as never)
          .select("id")
          .eq("ativo", true),
      ]);
      return {
        ganhas: minhas.data?.length ?? 0,
        total: tipos.data?.length ?? 0,
      };
    },
  });

  // ----- Fila de ação do dia -----
  const qc = useQueryClient();
  const hoje = useMemo(() => {
    const n = new Date();
    const ini = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0);
    const fim = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59);
    return { ini: ini.toISOString(), fim: fim.toISOString() };
  }, []);

  // Leads com SLA estourado (Facebook e leads chegados pelo webhook: 5min;
  // demais: 30min — prazo efetivo calculado por leads_com_sla).
  const slaQ = useLeadsComSla(user?.id ?? null, !!user);

  // Leads quentes do corretor que ainda estão no funil ativo (prioridade nº 1).
  const quentesQ = useQuery({
    queryKey: ["meu-dia:quentes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, telefone, status, ultima_interacao, projeto_nome")
        .eq("corretor_id", user!.id)
        .eq("na_lixeira", false)
        .eq("temperatura", "quente")
        .not("status", "in", "(perdido,contrato_fechado,pos_venda)")
        .order("ultima_interacao", { ascending: true, nullsFirst: true })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Agendamentos de hoje do corretor (visitas/reuniões), exceto cancelados/concluídos.
  const agendaQ = useQuery({
    queryKey: ["meu-dia:agenda", user?.id, hoje.ini],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, titulo, data_inicio, tipo, status, local, lead_id")
        .eq("corretor_id", user!.id)
        .gte("data_inicio", hoje.ini)
        .lte("data_inicio", hoje.fim)
        .not("status", "in", "(cancelado,realizado,nao_compareceu)")
        .order("data_inicio", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Tarefas e follow-ups pendentes (vencendo hoje, atrasados ou sem prazo).
  const tarefasQ = useQuery({
    queryKey: ["meu-dia:tarefas", user?.id, hoje.fim],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefas")
        .select("id, titulo, tipo, prioridade, status, data_vencimento, lead_id")
        .eq("corretor_id", user!.id)
        .in("status", ["pendente", "em_andamento"])
        .or(`data_vencimento.lte.${hoje.fim},data_vencimento.is.null`)
        .order("data_vencimento", { ascending: true, nullsFirst: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const concluirTarefa = useMutation({
    mutationFn: async (id: string) => {
      // `data_conclusao` é o que alimenta o card "Concluídas hoje"; sem isso,
      // marcar como concluída pelo Hoje ficava fora do resumo do dia.
      const { error } = await supabase
        .from("tarefas")
        .update({ status: "concluida", data_conclusao: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa concluída");
      qc.invalidateQueries({ queryKey: ["meu-dia:tarefas"] });
      qc.invalidateQueries({ queryKey: ["meu-dia:atividades"] });
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Guardrail anti-perda: leads ativos do corretor SEM próxima ação — nenhuma
  // tarefa aberta, nenhum agendamento futuro e sem follow-up agendado. São os que
  // silenciosamente esfriam. Ordenados pelo Score de prioridade.
  const semAcaoQ = useQuery({
    queryKey: ["meu-dia:sem-acao", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const [leadsR, tarefasR, agendaR] = await Promise.all([
        supabase
          .from("leads")
          .select("id, nome, telefone, status, temperatura, proximo_followup, ultima_interacao")
          .eq("corretor_id", user!.id)
          .eq("na_lixeira", false)
          .not("status", "in", "(perdido,contrato_fechado,pos_venda)")
          .limit(300),
        supabase
          .from("tarefas")
          .select("lead_id")
          .eq("corretor_id", user!.id)
          .in("status", ["pendente", "em_andamento"])
          .not("lead_id", "is", null),
        supabase
          .from("agendamentos")
          .select("lead_id")
          .eq("corretor_id", user!.id)
          .gte("data_inicio", nowIso)
          .not("status", "in", "(cancelado,realizado,nao_compareceu)")
          .not("lead_id", "is", null),
      ]);
      if (leadsR.error) throw leadsR.error;
      if (tarefasR.error) throw tarefasR.error;
      if (agendaR.error) throw agendaR.error;

      const comTarefa = new Set((tarefasR.data ?? []).map((t) => t.lead_id));
      const comAgenda = new Set((agendaR.data ?? []).map((a) => a.lead_id));
      const agoraMs = Date.now();

      return (leadsR.data ?? [])
        .filter((l) => {
          if (comTarefa.has(l.id) || comAgenda.has(l.id)) return false;
          if (l.proximo_followup && new Date(l.proximo_followup).getTime() > agoraMs) return false;
          return true;
        })
        .map((l) => ({
          ...l,
          _score: scoreLead({
            temperatura: l.temperatura,
            status: l.status,
            ultimaInteracao: l.ultima_interacao,
          }),
        }))
        .sort((a, b) => b._score.score - a._score.score)
        .slice(0, 12);
    },
  });

  // Cria, em 1 clique, um follow-up para amanhã — tirando o lead do radar de risco.
  const criarFollowUpRapido = useMutation({
    mutationFn: async (lead: { id: string; nome: string }) => {
      const amanha = new Date();
      amanha.setDate(amanha.getDate() + 1);
      const { error } = await supabase.from("tarefas").insert({
        titulo: `Follow-up com ${lead.nome}`,
        tipo: "follow_up",
        prioridade: "media",
        status: "pendente",
        lead_id: lead.id,
        corretor_id: user!.id,
        criado_por: user!.id,
        data_vencimento: amanha.toISOString(),
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Follow-up criado para amanhã");
      qc.invalidateQueries({ queryKey: ["meu-dia:sem-acao"] });
      qc.invalidateQueries({ queryKey: ["meu-dia:tarefas"] });
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totais = useMemo(() => {
    const acc = {
      ligacoes: 0,
      whatsapps: 0,
      agendamentos: 0,
      visitas: 0,
      documentacoes: 0,
      vendas: 0,
      vgv: 0,
      pontos: 0,
    };
    (atividadesQ.data ?? []).forEach((r) => {
      acc.ligacoes += r.ligacoes;
      acc.whatsapps += r.whatsapps;
      acc.agendamentos += r.agendamentos;
      acc.visitas += r.visitas;
      acc.documentacoes += r.documentacoes;
      acc.vendas += r.vendas;
      acc.vgv += Number(r.vgv_dia) || 0;
      acc.pontos += r.pontuacao_total;
    });
    return acc;
  }, [atividadesQ.data]);

  const cards = [
    {
      key: "ligacoes",
      label: "Ligações",
      icon: Phone,
      value: totais.ligacoes,
      meta: metaQ.data?.meta_ligacoes,
    },
    {
      key: "whatsapps",
      label: "WhatsApp",
      icon: MessageCircle,
      value: totais.whatsapps,
      meta: metaQ.data?.meta_whatsapps,
    },
    {
      key: "agendamentos",
      label: "Agendamentos",
      icon: CalendarCheck,
      value: totais.agendamentos,
      meta: metaQ.data?.meta_agendamentos,
    },
    {
      key: "visitas",
      label: "Visitas",
      icon: MapPin,
      value: totais.visitas,
      meta: metaQ.data?.meta_visitas,
    },
    {
      key: "documentacoes",
      label: "Documentações",
      icon: FileText,
      value: totais.documentacoes,
      meta: undefined,
    },
    {
      key: "vendas",
      label: "Vendas",
      icon: Trophy,
      value: totais.vendas,
      meta: metaQ.data?.meta_vendas,
    },
  ];

  // Metas são diárias: só mostramos progresso de meta no período "hoje".
  const mostrarMeta = periodo === "hoje" && !!metaQ.data;

  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const agenda = agendaQ.data ?? [];
  const tarefas = tarefasQ.data ?? [];
  const tarefasAtrasadas = tarefas.filter(
    (t) => t.data_vencimento && new Date(t.data_vencimento).getTime() < Date.now(),
  ).length;

  // Fila de missões: funde SLA estourado + quentes + sem-ação, dedup, por score.
  const filaCarregando = slaQ.isLoading || quentesQ.isLoading || semAcaoQ.isLoading;
  // Falha de qualquer fonte da fila NÃO pode virar "dia tranquilo": sinaliza erro.
  const filaErro = slaQ.isError || quentesQ.isError || semAcaoQ.isError;
  const recarregarFila = () => {
    void slaQ.refetch();
    void quentesQ.refetch();
    void semAcaoQ.refetch();
  };
  const missoes = useMemo(
    () =>
      buildMissionQueue({
        sla: (slaQ.data ?? []).map((l) => ({
          lead_id: l.lead_id,
          nome: l.nome,
          telefone: l.telefone,
          status: l.status,
          minutos_decorridos: l.minutos_decorridos,
          sla_status: l.sla_status,
        })),
        quentes: quentesQ.data ?? [],
        semAcao: semAcaoQ.data ?? [],
      }),
    [slaQ.data, quentesQ.data, semAcaoQ.data],
  );
  const slaEstourados = useMemo(
    () => (slaQ.data ?? []).filter((r) => r.sla_status === "estourado").length,
    [slaQ.data],
  );
  const semAcaoCount = semAcaoQ.data?.length ?? 0;

  // Ação de contato (WhatsApp) reutilizada no hero e na fila.
  const abrirWhats = (m: Pick<Mission, "nome" | "telefone">) => {
    const primeiro = m.nome.split(" ")[0] ?? m.nome;
    window.open(
      buildWhatsAppUrl(
        m.telefone ?? "",
        `Olá, ${primeiro}! Aqui é da Seu Metro Quadrado. Posso te ajudar agora?`,
      ),
      "_blank",
      "noopener,noreferrer",
    );
  };

  const primeiroNome =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    (user?.user_metadata?.nome as string | undefined)?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "corretor";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Central de Comando"
        description={`${saudacao()}, ${primeiroNome} — este é o seu dia em ordem de prioridade.`}
      />

      {/* ----- Hero: a próxima melhor ação, executável em 1 clique ----- */}
      {filaErro ? (
        <QueryErrorState
          title="Não foi possível montar a sua fila de prioridades."
          error={slaQ.error ?? quentesQ.error ?? semAcaoQ.error}
          onRetry={recarregarFila}
        />
      ) : (
        <NextBestAction
          mission={missoes[0] ?? null}
          loading={filaCarregando}
          onWhatsApp={abrirWhats}
          extra={
            <Button
              variant="outline"
              onClick={() => window.dispatchEvent(new Event("open-sprint"))}
              title="Bloco de prospecção focada com fila automática e cronômetro"
            >
              <Zap className="h-4 w-4 text-primary" /> Iniciar Sprint
            </Button>
          }
        />
      )}

      {/* ----- Cockpit: missões | hoje | instrumentos ----- */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {/* Coluna 1 — fila de missões */}
        {filaErro ? (
          <QueryErrorState
            title="Não foi possível carregar as missões."
            error={slaQ.error ?? quentesQ.error ?? semAcaoQ.error}
            onRetry={recarregarFila}
          />
        ) : (
          <MissionQueue
            missions={missoes}
            loading={filaCarregando}
            onWhatsApp={abrirWhats}
            onFollowUp={(m) => criarFollowUpRapido.mutate({ id: m.leadId, nome: m.nome })}
            followUpPending={criarFollowUpRapido.isPending}
          />
        )}

        {/* Coluna 2 — o dia: agenda + tarefas */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <CalendarCheck className="h-4 w-4 text-info" /> Agenda de hoje
                {agenda.length > 0 && <Badge variant="secondary">{agenda.length}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {agendaQ.isError ? (
                <QueryErrorState
                  title="Não foi possível carregar a agenda."
                  error={agendaQ.error}
                  onRetry={() => agendaQ.refetch()}
                />
              ) : agendaQ.isLoading ? (
                <>
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </>
              ) : agenda.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem compromissos hoje.</p>
              ) : (
                agenda.map((a) => {
                  const row = (
                    <>
                      <div className="text-sm font-medium">
                        <span className="font-display tabular-nums text-muted-foreground">
                          {hora(a.data_inicio)}
                        </span>{" "}
                        {a.titulo}
                      </div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {a.tipo}
                        {a.local ? ` · ${a.local}` : ""}
                      </div>
                    </>
                  );
                  return (
                    <div key={a.id} className="rounded-md border p-2">
                      {a.lead_id ? (
                        <Link to="/leads/$leadId" params={{ leadId: a.lead_id }} className="block">
                          {row}
                        </Link>
                      ) : (
                        row
                      )}
                    </div>
                  );
                })
              )}
              <Button asChild variant="link" className="h-auto p-0 text-xs">
                <Link to="/agendamentos">ver agenda completa</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-warning" /> Tarefas & follow-ups
                {tarefas.length > 0 && <Badge variant="secondary">{tarefas.length}</Badge>}
                {tarefasAtrasadas > 0 && (
                  <Badge variant="secondary" className="bg-destructive/15 text-destructive">
                    {tarefasAtrasadas} atrasada{tarefasAtrasadas > 1 ? "s" : ""}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {tarefasQ.isError ? (
                <QueryErrorState
                  title="Não foi possível carregar as tarefas."
                  error={tarefasQ.error}
                  onRetry={() => tarefasQ.refetch()}
                />
              ) : tarefasQ.isLoading ? (
                <>
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </>
              ) : tarefas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nada pendente. 🎉</p>
              ) : (
                tarefas.slice(0, 8).map((t) => {
                  const venc = t.data_vencimento ? new Date(t.data_vencimento) : null;
                  const atrasada = !!venc && venc.getTime() < Date.now();
                  const diasAtraso = venc
                    ? Math.floor((Date.now() - venc.getTime()) / (24 * 60 * 60 * 1000))
                    : 0;
                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-2 rounded-md border p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{t.titulo}</div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
                          <span className="capitalize">{t.tipo.replace(/_/g, " ")}</span>
                          {venc && (
                            <span className={cn(atrasada && "text-destructive font-medium")}>
                              ·{" "}
                              {atrasada
                                ? `atrasada há ${diasAtraso === 0 ? "hoje" : `${diasAtraso}d`} (${venc.toLocaleDateString("pt-BR")})`
                                : hora(t.data_vencimento!)}
                            </span>
                          )}
                          {t.lead_id && (
                            <Link
                              to="/leads/$leadId"
                              params={{ leadId: t.lead_id }}
                              className="text-primary hover:underline inline-flex items-center"
                            >
                              · lead <ArrowRight className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-success hover:bg-success/10"
                        title="Concluir"
                        disabled={concluirTarefa.isPending}
                        onClick={() => concluirTarefa.mutate(t.id)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })
              )}
              <Button asChild variant="link" className="h-auto p-0 text-xs">
                <Link to="/agendamentos" search={{ tab: "tarefas" }}>
                  ver todas as tarefas
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Coluna 3 — instrumentos: metas do dia + radar de risco */}
        <div className="space-y-4 lg:col-span-2 xl:col-span-1">
          <DayGoals
            items={cards.filter((c) => c.key !== "documentacoes")}
            streak={streakQ.data ?? 0}
            loading={atividadesQ.isLoading || metaQ.isLoading}
            showMeta={mostrarMeta}
          />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Radar className="h-4 w-4 text-destructive" /> Radar de risco
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-md border p-2">
                <span className="text-muted-foreground">SLA estourado</span>
                <Badge
                  variant="secondary"
                  className={cn(slaEstourados > 0 && "bg-destructive/15 text-destructive")}
                >
                  {slaEstourados}
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded-md border p-2">
                <span className="text-muted-foreground">Sem próxima ação</span>
                <Badge
                  variant="secondary"
                  className={cn(semAcaoCount > 0 && "bg-warning/15 text-warning")}
                >
                  {semAcaoCount}
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded-md border p-2">
                <span className="text-muted-foreground">Tarefas atrasadas</span>
                <Badge
                  variant="secondary"
                  className={cn(tarefasAtrasadas > 0 && "bg-warning/15 text-warning")}
                >
                  {tarefasAtrasadas}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Tudo isso já está priorizado na fila de missões ao lado.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ----- Minha produtividade ----- */}
      <SectionHeader
        eyebrow="Desempenho"
        title="Minha produtividade"
        action={
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
        className="pt-2"
      />

      <KpiGrid className="lg:grid-cols-4 xl:grid-cols-4">
        <KpiCard
          title="Pontuação"
          icon={Star}
          intent="warning"
          loading={atividadesQ.isLoading}
          value={totais.pontos.toLocaleString("pt-BR")}
          hint="pontos no período"
          className="bg-gradient-to-br from-primary/10 to-transparent"
        />
        <KpiCard
          title="VGV"
          icon={DollarSign}
          intent="success"
          loading={atividadesQ.isLoading}
          value={fmtBRL(totais.vgv)}
          hint={`${totais.vendas} venda(s)`}
        />
        <KpiCard
          title="Conquistas"
          icon={Trophy}
          loading={conquistasQ.isLoading}
          value={
            <>
              {conquistasQ.data?.ganhas ?? 0}
              <span className="text-base text-muted-foreground">
                /{conquistasQ.data?.total ?? 0}
              </span>
            </>
          }
          hint={
            <Link
              to="/ranking"
              search={{ tab: "conquistas" }}
              className="text-primary hover:underline"
            >
              ver medalhas
            </Link>
          }
        />
        <KpiCard
          title="Atividades"
          loading={atividadesQ.isLoading}
          value={totais.ligacoes + totais.whatsapps + totais.agendamentos + totais.visitas}
          hint="contatos + agendas + visitas"
        />
      </KpiGrid>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          const pct =
            mostrarMeta && c.meta ? Math.min(100, Math.round((c.value / c.meta) * 100)) : null;
          return (
            <Card key={c.key}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Icon className="h-4 w-4" /> {c.label}
                  </div>
                  {pct !== null && (
                    <Badge
                      variant="secondary"
                      className={cn(pct >= 100 && "bg-success/15 text-success")}
                    >
                      {pct}% da meta
                    </Badge>
                  )}
                </div>
                <div className="font-display mt-1 text-2xl font-bold tabular-nums">
                  {c.value}
                  {mostrarMeta && c.meta ? (
                    <span className="text-sm font-normal text-muted-foreground"> / {c.meta}</span>
                  ) : null}
                </div>
                {pct !== null && (
                  <div
                    className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={`${c.label}: ${pct}% da meta`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                  >
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        pct >= 100 ? "bg-success" : "bg-primary",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!metaQ.data && (
        <p className="text-sm text-muted-foreground">
          Defina suas metas diárias para acompanhar o progresso (peça ao gestor em “Metas”).
        </p>
      )}
    </div>
  );
}
