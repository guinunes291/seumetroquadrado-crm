import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CardAsync } from "@/components/card-async";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { buildWhatsAppUrl } from "@/lib/templates";
import { useLeadsComSla } from "@/features/dashboard/queries";
import { leadStatusLabel } from "@/lib/leads";
import { formatRelativeTime } from "@/lib/interacoes";
import { TIER_DOT } from "@/lib/priority";
import { rangeForPeriodo, type Periodo } from "@/lib/date-range";
import { filtrarSemAcao, contarTarefasAtrasadas, somarAtividades, telDigits } from "@/lib/meu-dia";
import {
  Phone,
  MessageCircle,
  CalendarCheck,
  CalendarPlus,
  MapPin,
  FileText,
  Trophy,
  Star,
  DollarSign,
  Flame,
  Clock,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  CircleAlert,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RelatoriosView } from "@/features/dashboard/relatorios-view";

type HojeTab = "acao" | "analytics";

export const Route = createFileRoute("/_authenticated/hoje")({
  // `tab` permite abrir direto a aba Analytics (ex.: redirect de /relatorios).
  validateSearch: (search: Record<string, unknown>): { tab?: HojeTab } => ({
    tab: search.tab === "analytics" ? "analytics" : undefined,
  }),
  head: () => ({ meta: [{ title: "Hoje — Seu Metro Quadrado" }] }),
  component: MeuPainelPage,
});

type MetaDiaria = {
  meta_ligacoes: number;
  meta_whatsapps: number;
  meta_agendamentos: number;
  meta_visitas: number;
  meta_vendas: number;
};

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const PERIODO_LABEL: Record<Periodo, string> = { hoje: "Hoje", semana: "Semana", mes: "Mês" };

function MeuPainelPage() {
  const { user } = useAuth();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeTab: HojeTab = tab ?? "acao";
  const onTabChange = (v: string) =>
    navigate({ search: { tab: v === "analytics" ? "analytics" : undefined } });

  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  // Limites do período no fuso de SP. Calculado a cada render (barato e puro) —
  // assim o "hoje" acompanha a virada do dia sem ficar preso ao mount. As strings
  // são comparadas por valor nas query keys, então não há refetch desnecessário.
  const { diDate, dfDate, iniIso, fimIso } = rangeForPeriodo(periodo);

  const qc = useQueryClient();

  // ----- Produtividade do período (atividades agregadas por dia, em fuso SP) -----
  const atividadesQ = useQuery({
    queryKey: ["meu-painel:atividades", user?.id, diDate, dfDate],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atividades_diarias" as never)
        .select(
          "dia, ligacoes, whatsapps, agendamentos, visitas, documentacoes, vendas, vgv_dia, pontuacao_total",
        )
        .eq("corretor_id", user!.id)
        .gte("dia", diDate)
        .lte("dia", dfDate);
      if (error) throw error;
      return (data ?? []) as unknown as Parameters<typeof somarAtividades>[0];
    },
  });

  const metaQ = useQuery({
    queryKey: ["meu-painel:meta", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("metas_diarias" as never)
        .select("meta_ligacoes, meta_whatsapps, meta_agendamentos, meta_visitas, meta_vendas")
        .eq("corretor_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as MetaDiaria | null;
    },
  });

  const conquistasQ = useQuery({
    queryKey: ["meu-painel:conquistas", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
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
      if (minhas.error) throw minhas.error;
      if (tipos.error) throw tipos.error;
      return {
        ganhas: minhas.data?.length ?? 0,
        total: tipos.data?.length ?? 0,
      };
    },
  });

  // Leads com SLA estourado, restritos ao período (entrada no intervalo).
  const slaQ = useLeadsComSla(user?.id ?? null, { di: diDate, df: dfDate }, !!user);

  // Leads quentes do corretor no funil ativo cuja última interação cai no período
  // (ou que ainda não têm contato — os mais urgentes).
  const quentesQ = useQuery({
    queryKey: ["meu-dia:quentes", user?.id, iniIso, fimIso],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, telefone, status, ultima_interacao, projeto_nome")
        .eq("corretor_id", user!.id)
        .eq("na_lixeira", false)
        .is("deleted_at", null)
        .eq("temperatura", "quente")
        .not("status", "in", "(perdido,contrato_fechado,pos_venda)")
        .or(
          `and(ultima_interacao.gte.${iniIso},ultima_interacao.lte.${fimIso}),ultima_interacao.is.null`,
        )
        .order("ultima_interacao", { ascending: true, nullsFirst: true })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Agendamentos do período (visitas/reuniões), exceto cancelados/concluídos.
  const agendaQ = useQuery({
    queryKey: ["meu-dia:agenda", user?.id, iniIso, fimIso],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, titulo, data_inicio, tipo, status, local, lead_id")
        .eq("corretor_id", user!.id)
        .is("deleted_at", null)
        .gte("data_inicio", iniIso)
        .lte("data_inicio", fimIso)
        .not("status", "in", "(cancelado,realizado,nao_compareceu)")
        .order("data_inicio", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Tarefas/follow-ups pendentes: vencidas (sempre), vencendo até o fim do período
  // ou sem prazo. Exclui concluídas/canceladas/deletadas e de outros usuários.
  const tarefasQ = useQuery({
    queryKey: ["meu-dia:tarefas", user?.id, fimIso],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefas")
        .select("id, titulo, tipo, prioridade, status, data_vencimento, lead_id")
        .eq("corretor_id", user!.id)
        .is("deleted_at", null)
        .in("status", ["pendente", "em_andamento"])
        .or(`data_vencimento.lte.${fimIso},data_vencimento.is.null`)
        .order("data_vencimento", { ascending: true, nullsFirst: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const concluirTarefa = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tarefas")
        .update({ status: "concluida" } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa concluída");
      qc.invalidateQueries({ queryKey: ["meu-dia:tarefas"] });
      qc.invalidateQueries({ queryKey: ["meu-dia:sem-acao"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Guardrail anti-perda: leads ATIVOS do corretor (que entraram no período) SEM
  // próxima ação — sem tarefa aberta, sem agendamento futuro e sem follow-up
  // futuro. Probes de "tem próximo passo" são sempre "agora". Ordenados por Score.
  const semAcaoQ = useQuery({
    queryKey: ["meu-dia:sem-acao", user?.id, iniIso, fimIso],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const [leadsR, tarefasR, agendaR] = await Promise.all([
        supabase
          .from("leads")
          .select("id, nome, telefone, status, temperatura, proximo_followup, ultima_interacao")
          .eq("corretor_id", user!.id)
          .eq("na_lixeira", false)
          .is("deleted_at", null)
          .not("status", "in", "(perdido,contrato_fechado,pos_venda)")
          .gte("created_at", iniIso)
          .lte("created_at", fimIso)
          .limit(300),
        supabase
          .from("tarefas")
          .select("lead_id")
          .eq("corretor_id", user!.id)
          .is("deleted_at", null)
          .in("status", ["pendente", "em_andamento"])
          .not("lead_id", "is", null),
        supabase
          .from("agendamentos")
          .select("lead_id")
          .eq("corretor_id", user!.id)
          .is("deleted_at", null)
          .gte("data_inicio", nowIso)
          .not("status", "in", "(cancelado,realizado,nao_compareceu)")
          .not("lead_id", "is", null),
      ]);
      if (leadsR.error) throw leadsR.error;
      if (tarefasR.error) throw tarefasR.error;
      if (agendaR.error) throw agendaR.error;

      const comTarefa = new Set((tarefasR.data ?? []).map((t) => t.lead_id));
      const comAgenda = new Set((agendaR.data ?? []).map((a) => a.lead_id));
      return filtrarSemAcao(leadsR.data ?? [], comTarefa, comAgenda, new Date()).slice(0, 12);
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

  // Derivados (vazios enquanto carrega/erro — os badges somem em 0; o corpo dos
  // cards mostra esqueleto/erro via CardAsync, garantindo contador == lista).
  const urgentes = (slaQ.data ?? []).filter((r) => r.sla_status === "estourado");
  const quentes = quentesQ.data ?? [];
  const agenda = agendaQ.data ?? [];
  const tarefas = tarefasQ.data ?? [];
  const semAcao = semAcaoQ.data ?? [];
  const tarefasAtrasadas = contarTarefasAtrasadas(tarefas, new Date());

  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  // Ação de contato (WhatsApp + Ligar) reutilizada nos cards de leads.
  const abrirWhats = (nome: string, telefone: string | null) => {
    const primeiro = nome.split(" ")[0] ?? nome;
    window.open(
      buildWhatsAppUrl(
        telefone ?? "",
        `Olá, ${primeiro}! Aqui é da Seu Metro Quadrado. Posso te ajudar agora?`,
      ),
      "_blank",
      "noopener,noreferrer",
    );
  };

  // Botões de contato (WhatsApp/Ligar) — só aparecem quando há telefone discável.
  const ContatoBotoes = ({ nome, telefone }: { nome: string; telefone: string | null }) => {
    const tel = telDigits(telefone);
    if (!tel) return null;
    return (
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10"
          title="WhatsApp"
          aria-label={`Enviar WhatsApp para ${nome}`}
          onClick={() => abrirWhats(nome, telefone)}
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
        <Button
          asChild
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-sky-600 hover:bg-sky-500/10"
          title="Ligar"
          aria-label={`Ligar para ${nome}`}
        >
          <a href={`tel:${tel}`}>
            <Phone className="h-4 w-4" />
          </a>
        </Button>
      </div>
    );
  };

  const agendaTitulo =
    periodo === "hoje"
      ? "Agenda de hoje"
      : periodo === "semana"
        ? "Agenda da semana"
        : "Agenda do mês";
  const agendaVazia =
    periodo === "hoje" ? "Sem compromissos hoje." : "Sem compromissos no período.";

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="space-y-6">
      <TabsList>
        <TabsTrigger value="acao">Ação</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
      </TabsList>
      <TabsContent value="acao" className="space-y-6">
        <PageHeader
          title="Hoje"
          description="O que fazer agora — depois, sua produtividade e metas."
          actions={
            <div
              className="inline-flex rounded-md border bg-card p-0.5"
              role="group"
              aria-label="Período"
            >
              {(["hoje", "semana", "mes"] as const).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={periodo === p ? "default" : "ghost"}
                  onClick={() => setPeriodo(p)}
                  aria-pressed={periodo === p}
                >
                  {PERIODO_LABEL[p]}
                </Button>
              ))}
            </div>
          }
        />

        {/* ----- Fila de ação do dia (ordem: quentes → follow-up → agenda → SLA) ----- */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {/* 1) Leads quentes — prioridade nº 1 */}
          <Card className="border-rose-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-rose-500" /> Leads quentes
                {quentes.length > 0 && (
                  <Badge variant="secondary" className="bg-rose-500/15 text-rose-700">
                    {quentes.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <CardAsync
                query={quentesQ}
                skeletonRows={3}
                isEmpty={(d) => d.length === 0}
                empty={
                  <p className="text-sm text-muted-foreground">Nenhum lead quente no período.</p>
                }
              >
                {(lista) =>
                  lista.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center justify-between gap-2 rounded-md border p-2"
                    >
                      <Link
                        to="/leads/$leadId"
                        params={{ leadId: l.id }}
                        className="min-w-0 flex-1"
                      >
                        <div className="truncate text-sm font-medium">{l.nome}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {leadStatusLabel(l.status)}
                          {l.ultima_interacao
                            ? ` · ${formatRelativeTime(l.ultima_interacao)}`
                            : " · sem contato"}
                        </div>
                      </Link>
                      <ContatoBotoes nome={l.nome} telefone={l.telefone} />
                    </div>
                  ))
                }
              </CardAsync>
            </CardContent>
          </Card>

          {/* 2) Tarefas & follow-ups */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-amber-500" /> Tarefas & follow-ups
                {tarefas.length > 0 && <Badge variant="secondary">{tarefas.length}</Badge>}
                {tarefasAtrasadas > 0 && (
                  <Badge variant="secondary" className="bg-rose-500/15 text-rose-700">
                    {tarefasAtrasadas} atrasada{tarefasAtrasadas > 1 ? "s" : ""}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <CardAsync
                query={tarefasQ}
                skeletonRows={3}
                isEmpty={(d) => d.length === 0}
                empty={<p className="text-sm text-muted-foreground">Nada pendente. 🎉</p>}
              >
                {(lista) =>
                  lista.map((t) => {
                    const atrasada =
                      !!t.data_vencimento && new Date(t.data_vencimento).getTime() < Date.now();
                    return (
                      <div
                        key={t.id}
                        className="flex items-center justify-between gap-2 rounded-md border p-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{t.titulo}</div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <span className="capitalize">{t.tipo.replace(/_/g, " ")}</span>
                            {t.data_vencimento && (
                              <span className={cn(atrasada && "text-rose-600 font-medium")}>
                                · {atrasada ? "atrasada" : hora(t.data_vencimento)}
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
                          className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10"
                          title="Concluir"
                          aria-label={`Concluir tarefa: ${t.titulo}`}
                          disabled={concluirTarefa.isPending}
                          onClick={() => concluirTarefa.mutate(t.id)}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })
                }
              </CardAsync>
              <Button asChild variant="link" className="h-auto p-0 text-xs">
                <Link to="/tarefas">ver todas as tarefas</Link>
              </Button>
            </CardContent>
          </Card>

          {/* 3) Agenda do período */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <CalendarCheck className="h-4 w-4 text-indigo-500" /> {agendaTitulo}
                {agenda.length > 0 && <Badge variant="secondary">{agenda.length}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <CardAsync
                query={agendaQ}
                skeletonRows={3}
                isEmpty={(d) => d.length === 0}
                empty={<p className="text-sm text-muted-foreground">{agendaVazia}</p>}
              >
                {(lista) =>
                  lista.map((a) => {
                    const row = (
                      <>
                        <div className="text-sm font-medium">
                          <span className="text-muted-foreground">{hora(a.data_inicio)}</span>{" "}
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
                          <Link
                            to="/leads/$leadId"
                            params={{ leadId: a.lead_id }}
                            className="block"
                          >
                            {row}
                          </Link>
                        ) : (
                          row
                        )}
                      </div>
                    );
                  })
                }
              </CardAsync>
              <Button asChild variant="link" className="h-auto p-0 text-xs">
                <Link to="/agendamentos">ver agenda completa</Link>
              </Button>
            </CardContent>
          </Card>

          {/* 4) SLA estourando — leads parados além do tempo de atendimento */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-600" /> SLA estourando
                {urgentes.length > 0 && (
                  <Badge variant="secondary" className="bg-amber-500/15 text-amber-700">
                    {urgentes.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <CardAsync
                query={slaQ}
                skeletonRows={3}
                isEmpty={(d) => d.filter((r) => r.sla_status === "estourado").length === 0}
                empty={<p className="text-sm text-muted-foreground">Tudo dentro do prazo. 👏</p>}
              >
                {(d) =>
                  d
                    .filter((r) => r.sla_status === "estourado")
                    .map((l) => (
                      <div
                        key={l.lead_id}
                        className="flex items-center justify-between gap-2 rounded-md border p-2"
                      >
                        <Link
                          to="/leads/$leadId"
                          params={{ leadId: l.lead_id }}
                          className="min-w-0 flex-1"
                        >
                          <div className="truncate text-sm font-medium">{l.nome}</div>
                          <div className="text-xs text-muted-foreground">
                            {leadStatusLabel(l.status)} · {l.minutos_decorridos} min sem atendimento
                          </div>
                        </Link>
                        <ContatoBotoes nome={l.nome} telefone={l.telefone} />
                      </div>
                    ))
                }
              </CardAsync>
            </CardContent>
          </Card>
        </div>

        {/* Guardrail anti-perda: leads ativos sem um próximo passo definido */}
        <Card className="border-amber-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex flex-wrap items-center gap-1.5">
              <CircleAlert className="h-4 w-4 text-amber-600" /> Sem próxima ação
              {semAcao.length > 0 && (
                <Badge variant="secondary" className="bg-amber-500/15 text-amber-700">
                  {semAcao.length}
                </Badge>
              )}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                leads ativos sem tarefa, agenda ou follow-up
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardAsync
              query={semAcaoQ}
              skeletonRows={2}
              isEmpty={(d) => d.length === 0}
              empty={
                <p className="text-sm text-muted-foreground">
                  Todos os seus leads ativos têm um próximo passo. 👏
                </p>
              }
            >
              {(lista) => (
                <div className="grid gap-2 sm:grid-cols-2">
                  {lista.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center justify-between gap-2 rounded-md border p-2"
                    >
                      <Link
                        to="/leads/$leadId"
                        params={{ leadId: l.id }}
                        className="min-w-0 flex-1"
                      >
                        <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                          <span
                            className={cn("h-2 w-2 shrink-0 rounded-full", TIER_DOT[l._score.tier])}
                            title={`Prioridade ${l._score.tier}`}
                          />
                          <span className="truncate">{l.nome}</span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {leadStatusLabel(l.status)} · {l._score.motivo}
                        </div>
                      </Link>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-primary hover:bg-primary/10"
                          title="Criar follow-up para amanhã"
                          aria-label={`Criar follow-up para amanhã com ${l.nome}`}
                          disabled={criarFollowUpRapido.isPending}
                          onClick={() => criarFollowUpRapido.mutate({ id: l.id, nome: l.nome })}
                        >
                          <CalendarPlus className="h-4 w-4" />
                        </Button>
                        <ContatoBotoes nome={l.nome} telefone={l.telefone} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardAsync>
          </CardContent>
        </Card>

        <h2 className="text-sm font-semibold text-muted-foreground pt-2">
          Minha produtividade · {PERIODO_LABEL[periodo]}
        </h2>

        <CardAsync
          query={atividadesQ}
          isEmpty={() => false}
          skeleton={
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            </div>
          }
        >
          {(rows) => {
            const totais = somarAtividades(rows);
            // Metas são diárias: só mostramos progresso de meta no período "hoje".
            const mostrarMeta = periodo === "hoje" && !!metaQ.data;
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
            return (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Card className="bg-gradient-to-br from-primary/10 to-transparent">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-1.5">
                        <Star className="h-4 w-4 text-amber-500" /> Pontuação
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">
                        {totais.pontos.toLocaleString("pt-BR")}
                      </div>
                      <div className="text-xs text-muted-foreground">pontos no período</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-1.5">
                        <DollarSign className="h-4 w-4 text-emerald-500" /> VGV
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{fmtBRL(totais.vgv)}</div>
                      <div className="text-xs text-muted-foreground">{totais.vendas} venda(s)</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-1.5">
                        <Trophy className="h-4 w-4 text-violet-500" /> Conquistas
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {conquistasQ.isError ? (
                          <span className="text-base text-muted-foreground">—</span>
                        ) : conquistasQ.isLoading || !conquistasQ.data ? (
                          <span className="text-base text-muted-foreground">…</span>
                        ) : (
                          <>
                            {conquistasQ.data.ganhas}
                            <span className="text-base text-muted-foreground">
                              /{conquistasQ.data.total}
                            </span>
                          </>
                        )}
                      </div>
                      <Button asChild variant="link" className="h-auto p-0 text-xs">
                        <Link to="/conquistas">ver medalhas</Link>
                      </Button>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Atividades</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {totais.ligacoes + totais.whatsapps + totais.agendamentos + totais.visitas}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        contatos + agendas + visitas
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {cards.map((c) => {
                    const Icon = c.icon;
                    const pct =
                      mostrarMeta && c.meta
                        ? Math.min(100, Math.round((c.value / c.meta) * 100))
                        : null;
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
                                className={cn(pct >= 100 && "bg-emerald-500/15 text-emerald-700")}
                              >
                                {pct}% da meta
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1 text-2xl font-bold">
                            {c.value}
                            {mostrarMeta && c.meta ? (
                              <span className="text-sm font-normal text-muted-foreground">
                                {" "}
                                / {c.meta}
                              </span>
                            ) : null}
                          </div>
                          {pct !== null && (
                            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  pct >= 100 ? "bg-emerald-500" : "bg-primary",
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

                {!metaQ.isLoading && !metaQ.data && (
                  <p className="text-sm text-muted-foreground">
                    Defina suas metas diárias para acompanhar o progresso (peça ao gestor em
                    “Metas”).
                  </p>
                )}
              </div>
            );
          }}
        </CardAsync>
      </TabsContent>
      <TabsContent value="analytics">
        <RelatoriosView />
      </TabsContent>
    </Tabs>
  );
}
