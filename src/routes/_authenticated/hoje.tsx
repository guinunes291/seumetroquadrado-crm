import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { buildWhatsAppUrl } from "@/lib/templates";
import { useLeadsComSla } from "@/features/dashboard/queries";
import { leadStatusLabel } from "@/lib/leads";
import { formatRelativeTime } from "@/lib/interacoes";
import { scoreLead, TIER_DOT } from "@/lib/priority";
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

export const Route = createFileRoute("/_authenticated/hoje")({
  head: () => ({ meta: [{ title: "Hoje — Seu Metro Quadrado" }] }),
  component: MeuPainelPage,
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

function MeuPainelPage() {
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

  // ----- Fila de ação do dia ("Meu Dia") -----
  const qc = useQueryClient();
  const hoje = useMemo(() => {
    const n = new Date();
    const ini = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0);
    const fim = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59);
    return { ini: ini.toISOString(), fim: fim.toISOString() };
  }, []);

  // Leads com SLA estourado (tempo por origem: Facebook 5min, demais 30min).
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
      const { error } = await supabase
        .from("tarefas")
        .update({ status: "concluida" } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa concluída");
      qc.invalidateQueries({ queryKey: ["meu-dia:tarefas"] });
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

  const urgentes = (slaQ.data ?? []).filter((r) => r.sla_status === "estourado");
  const quentes = quentesQ.data ?? [];
  const agenda = agendaQ.data ?? [];
  const tarefas = tarefasQ.data ?? [];
  const semAcao = semAcaoQ.data ?? [];
  const tarefasAtrasadas = tarefas.filter(
    (t) => t.data_vencimento && new Date(t.data_vencimento).getTime() < Date.now(),
  ).length;

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hoje"
        description="O que fazer agora — depois, sua produtividade e metas."
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
            {quentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum lead quente agora.</p>
            ) : (
              quentes.map((l) => {
                const tel = (l.telefone ?? "").replace(/\D/g, "");
                return (
                  <div
                    key={l.id}
                    className="flex items-center justify-between gap-2 rounded-md border p-2"
                  >
                    <Link to="/leads/$leadId" params={{ leadId: l.id }} className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{l.nome}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {leadStatusLabel(l.status)}
                        {l.ultima_interacao
                          ? ` · ${formatRelativeTime(l.ultima_interacao)}`
                          : " · sem contato"}
                      </div>
                    </Link>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10"
                        title="WhatsApp"
                        onClick={() => abrirWhats(l.nome, l.telefone)}
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                      <Button
                        asChild
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-sky-600 hover:bg-sky-500/10"
                        title="Ligar"
                      >
                        <a href={`tel:${tel}`}>
                          <Phone className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
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
            {tarefas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada pendente. 🎉</p>
            ) : (
              tarefas.slice(0, 10).map((t) => {
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
              <Link to="/tarefas">ver todas as tarefas</Link>
            </Button>
          </CardContent>
        </Card>

        {/* 3) Agenda de hoje */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <CalendarCheck className="h-4 w-4 text-indigo-500" /> Agenda de hoje
              {agenda.length > 0 && <Badge variant="secondary">{agenda.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {agenda.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem compromissos hoje.</p>
            ) : (
              agenda.map((a) => {
                const row = (
                  <>
                    <div className="text-sm font-medium">
                      <span className="text-muted-foreground">{hora(a.data_inicio)}</span> {a.titulo}
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
            {urgentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tudo dentro do prazo. 👏</p>
            ) : (
              urgentes.slice(0, 8).map((l) => {
                const tel = (l.telefone ?? "").replace(/\D/g, "");
                return (
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
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10"
                        title="WhatsApp"
                        onClick={() => abrirWhats(l.nome, l.telefone)}
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                      <Button
                        asChild
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-sky-600 hover:bg-sky-500/10"
                        title="Ligar"
                      >
                        <a href={`tel:${tel}`}>
                          <Phone className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
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
          {semAcao.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todos os seus leads ativos têm um próximo passo. 👏
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {semAcao.map((l) => {
                const tel = (l.telefone ?? "").replace(/\D/g, "");
                return (
                  <div
                    key={l.id}
                    className="flex items-center justify-between gap-2 rounded-md border p-2"
                  >
                    <Link to="/leads/$leadId" params={{ leadId: l.id }} className="min-w-0 flex-1">
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
                        disabled={criarFollowUpRapido.isPending}
                        onClick={() => criarFollowUpRapido.mutate({ id: l.id, nome: l.nome })}
                      >
                        <CalendarPlus className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10"
                        title="WhatsApp"
                        onClick={() => abrirWhats(l.nome, l.telefone)}
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                      <Button
                        asChild
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-sky-600 hover:bg-sky-500/10"
                        title="Ligar"
                      >
                        <a href={`tel:${tel}`}>
                          <Phone className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <h2 className="text-sm font-semibold text-muted-foreground pt-2">Minha produtividade</h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-primary/10 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Star className="h-4 w-4 text-amber-500" /> Pontuação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totais.pontos.toLocaleString("pt-BR")}</div>
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
              {conquistasQ.data?.ganhas ?? 0}
              <span className="text-base text-muted-foreground">
                /{conquistasQ.data?.total ?? 0}
              </span>
            </div>
            <Button asChild variant="link" className="h-auto p-0 text-xs">
              <a href="/conquistas">ver medalhas</a>
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
            <div className="text-xs text-muted-foreground">contatos + agendas + visitas</div>
          </CardContent>
        </Card>
      </div>

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
                      className={cn(pct >= 100 && "bg-emerald-500/15 text-emerald-700")}
                    >
                      {pct}% da meta
                    </Badge>
                  )}
                </div>
                <div className="mt-1 text-2xl font-bold">
                  {c.value}
                  {mostrarMeta && c.meta ? (
                    <span className="text-sm font-normal text-muted-foreground"> / {c.meta}</span>
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

      {!metaQ.data && (
        <p className="text-sm text-muted-foreground">
          Defina suas metas diárias para acompanhar o progresso (peça ao gestor em “Metas”).
        </p>
      )}
    </div>
  );
}
