import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addMonths,
  addDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  List as ListIcon,
  ExternalLink,
  Download,
  MapPinned,
} from "lucide-react";
import { buildGoogleCalendarUrl, downloadIcs, type CalendarEventInput } from "@/lib/calendar-links";
import { syncAgendamentoGoogle } from "@/lib/google-calendar.functions";
import { invalidateAgendamentoQueries } from "@/lib/agendamentos";

// Espelha no Google Calendar em segundo plano — nunca bloqueia o fluxo do CRM.
function syncGoogleEmBackground(agendamentoId: string) {
  syncAgendamentoGoogle({ data: { agendamentoId } })
    .then((r) => {
      if (!r.synced && r.reason && !/não configurado|sem Google conectado/.test(r.reason)) {
        toast.warning("Agendamento salvo, mas não sincronizou com o Google Agenda", {
          description: r.reason,
        });
      }
    })
    .catch(() => {
      /* silencioso: o agendamento em si já foi salvo */
    });
}
import { cn } from "@/lib/utils";
import { HUE_BADGE, HUE_DOT, INTENT_BADGE } from "@/lib/status-tones";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TarefasPage } from "@/routes/_authenticated/tarefas";

type CompromissosTab = "agenda" | "tarefas";

export const Route = createFileRoute("/_authenticated/agendamentos")({
  // `tab` permite abrir a aba Tarefas; padrão é a Agenda (preserva /agendamentos).
  validateSearch: (search: Record<string, unknown>): { tab?: CompromissosTab } => ({
    tab: search.tab === "tarefas" ? "tarefas" : undefined,
  }),
  head: () => ({ meta: [{ title: "Agenda & Tarefas — Seu Metro Quadrado" }] }),
  component: CompromissosPage,
});

// Hub "Agenda & Tarefas": consolida a agenda de compromissos (calendário) e a
// lista de tarefas/follow-ups em abas internas (Fase 2). Cada aba reaproveita a
// página existente; /agendamentos e /tarefas seguem válidas para deep-link.
function CompromissosPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeTab: CompromissosTab = tab ?? "agenda";
  const onTabChange = (v: string) =>
    navigate({ search: { tab: v === "tarefas" ? "tarefas" : undefined } });

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="space-y-4">
      <TabsList className="h-auto flex-wrap justify-start">
        <TabsTrigger value="agenda">Agenda</TabsTrigger>
        <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
      </TabsList>
      <TabsContent value="agenda">
        <AgendaPanel />
      </TabsContent>
      <TabsContent value="tarefas">
        <TarefasPage />
      </TabsContent>
    </Tabs>
  );
}

const TIPO_OPTIONS = ["visita", "reuniao", "ligacao", "follow_up", "outro"] as const;
const STATUS_OPTIONS = [
  "agendado",
  "confirmado",
  "realizado",
  "cancelado",
  "nao_compareceu",
  "remarcado",
] as const;

const TIPO_LABEL: Record<string, string> = {
  visita: "Visita",
  reuniao: "Reunião",
  ligacao: "Ligação",
  follow_up: "Follow-up",
  outro: "Outro",
};

const STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  realizado: "Realizado",
  cancelado: "Cancelado",
  nao_compareceu: "Não compareceu",
  remarcado: "Remarcado",
};

const STATUS_TONE: Record<string, string> = {
  agendado: INTENT_BADGE.info,
  confirmado: INTENT_BADGE.success,
  realizado: HUE_BADGE.green,
  cancelado: INTENT_BADGE.danger,
  nao_compareceu: INTENT_BADGE.warning,
  remarcado: HUE_BADGE.violet,
};

const TIPO_DOT: Record<string, string> = {
  visita: HUE_DOT.blue,
  reuniao: HUE_DOT.violet,
  ligacao: HUE_DOT.emerald,
  follow_up: HUE_DOT.amber,
  outro: HUE_DOT.slate,
};

type Agendamento = {
  id: string;
  lead_id: string | null;
  corretor_id: string;
  criado_por_id: string | null;
  tipo: (typeof TIPO_OPTIONS)[number];
  status: (typeof STATUS_OPTIONS)[number];
  titulo: string;
  descricao: string | null;
  local: string | null;
  data_inicio: string;
  data_fim: string;
  timezone: string;
  lembrete_minutos: number;
  motivo_cancelamento: string | null;
  realizado_em: string | null;
};

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AgendaPanel() {
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const qc = useQueryClient();
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [cursor, setCursor] = useState(() => new Date());
  const [filtroCorretor, setFiltroCorretor] = useState<string>("todos");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [openNew, setOpenNew] = useState(false);
  const [editing, setEditing] = useState<Agendamento | null>(null);

  const { data: corretores = [] } = useQuery({
    queryKey: ["profiles-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, email")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: leads = [] } = useQuery({
    queryKey: ["leads-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, telefone, corretor_id")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const rangeStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const rangeEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const {
    data: agendamentos = [],
    isLoading: agLoading,
    isError: agError,
    error: agErrorObj,
    refetch: agRefetch,
  } = useQuery({
    queryKey: [
      "agendamentos",
      rangeStart.toISOString(),
      rangeEnd.toISOString(),
      filtroCorretor,
      filtroStatus,
    ],
    queryFn: async () => {
      let q = supabase
        .from("agendamentos")
        .select("*")
        .is("deleted_at", null)
        .gte("data_inicio", rangeStart.toISOString())
        .lte("data_inicio", rangeEnd.toISOString())
        .order("data_inicio");
      if (filtroCorretor !== "todos") q = q.eq("corretor_id", filtroCorretor);
      if (filtroStatus !== "todos") q = q.eq("status", filtroStatus as Agendamento["status"]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Agendamento[];
    },
  });

  useRealtimeInvalidate("agendamentos", [["agendamentos"]]);

  const corretorNome = (id: string | null) => corretores.find((c) => c.id === id)?.nome ?? "—";
  const leadNome = (id: string | null) =>
    id ? (leads.find((l) => l.id === id)?.nome ?? "Lead") : "—";

  const days = useMemo(() => {
    const out: Date[] = [];
    let d = rangeStart;
    while (d <= rangeEnd) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [rangeStart, rangeEnd]);

  const byDay = useMemo(() => {
    const map = new Map<string, Agendamento[]>();
    for (const a of agendamentos) {
      const key = format(parseISO(a.data_inicio), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return map;
  }, [agendamentos]);

  const createMut = useMutation({
    mutationFn: async (payload: Partial<Agendamento>) => {
      const { data, error } = await supabase
        .from("agendamentos")
        .insert({
          ...payload,
          criado_por_id: user!.id,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      return { id: (data as { id: string }).id, leadId: payload.lead_id ?? null };
    },
    onSuccess: (created) => {
      // Invalida também as queries do detalhe do lead (a aba Agendamentos do
      // lead ficava desatualizada quando criado por aqui).
      invalidateAgendamentoQueries(qc, created.leadId);
      toast.success("Agendamento criado");
      setOpenNew(false);
      syncGoogleEmBackground(created.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: async ({
      id,
      patch,
      leadId,
    }: {
      id: string;
      patch: Partial<Agendamento>;
      leadId: string | null;
    }) => {
      const { error } = await supabase
        .from("agendamentos")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
      return { id, leadId: patch.lead_id ?? leadId };
    },
    onSuccess: ({ id, leadId }) => {
      invalidateAgendamentoQueries(qc, leadId);
      toast.success("Agendamento atualizado");
      setEditing(null);
      syncGoogleEmBackground(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async ({ id, leadId }: { id: string; leadId: string | null }) => {
      const { error } = await supabase
        .from("agendamentos")
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
      return { id, leadId };
    },
    onSuccess: ({ id, leadId }) => {
      invalidateAgendamentoQueries(qc, leadId);
      toast.success("Agendamento movido para a lixeira");
      setEditing(null);
      syncGoogleEmBackground(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agendamentos"
        description="Visitas, reuniões e follow-ups da sua agenda."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/modo-visita">
                <MapPinned className="mr-1 h-4 w-4" /> Modo Visita
              </Link>
            </Button>
            <div className="inline-flex rounded-md border bg-card p-0.5">
              <Button
                size="sm"
                variant={view === "calendar" ? "default" : "ghost"}
                onClick={() => setView("calendar")}
              >
                <CalendarDays className="h-4 w-4 mr-1" /> Calendário
              </Button>
              <Button
                size="sm"
                variant={view === "list" ? "default" : "ghost"}
                onClick={() => setView("list")}
              >
                <ListIcon className="h-4 w-4 mr-1" /> Lista
              </Button>
            </div>
            <Dialog open={openNew} onOpenChange={setOpenNew}>
              <DialogTrigger asChild>
                <Button>
                  <CalendarPlus className="h-4 w-4 mr-1" /> Novo agendamento
                </Button>
              </DialogTrigger>
              <AgendamentoForm
                title="Novo agendamento"
                corretores={corretores}
                leads={leads}
                isAdminOrGestor={isAdmin || isGestor}
                currentUserId={user!.id}
                onSubmit={(payload) => createMut.mutate(payload)}
                pending={createMut.isPending}
              />
            </Dialog>
          </div>
        }
      />

      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 md:items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-lg font-semibold capitalize min-w-[180px] text-center">
              {format(cursor, "MMMM 'de' yyyy", { locale: ptBR })}
            </div>
            <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>
              Hoje
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(isAdmin || isGestor) && (
              <Select value={filtroCorretor} onValueChange={setFiltroCorretor}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Corretor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os corretores</SelectItem>
                  {corretores.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome ?? c.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {agError ? (
        <QueryErrorState
          title="Não foi possível carregar a agenda."
          error={agErrorObj}
          onRetry={() => agRefetch()}
        />
      ) : view === "calendar" ? (
        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-7 border-b bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                <div key={d} className="px-2 py-2 text-center font-medium">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const key = format(d, "yyyy-MM-dd");
                const items = byDay.get(key) ?? [];
                const inMonth = isSameMonth(d, cursor);
                const today = isSameDay(d, new Date());
                return (
                  <div
                    key={key}
                    className={cn(
                      "min-h-[110px] border-b border-r p-1.5 text-xs space-y-1",
                      !inMonth && "bg-muted/20 text-muted-foreground",
                    )}
                  >
                    <div
                      className={cn(
                        "flex items-center justify-between",
                        today && "font-bold text-primary",
                      )}
                    >
                      <span>{format(d, "d")}</span>
                      {items.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">{items.length}</span>
                      )}
                    </div>
                    {items.slice(0, 3).map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setEditing(a)}
                        className="w-full text-left rounded px-1.5 py-1 bg-card hover:bg-accent border truncate flex items-center gap-1.5"
                        title={a.titulo}
                      >
                        <span
                          className={cn("h-1.5 w-1.5 rounded-full shrink-0", TIPO_DOT[a.tipo])}
                        />
                        <span className="truncate">
                          {format(parseISO(a.data_inicio), "HH:mm")} {a.titulo}
                        </span>
                      </button>
                    ))}
                    {items.length > 3 && (
                      <div className="text-[10px] text-muted-foreground px-1">
                        +{items.length - 3} mais
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {agLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4">
                  <Skeleton className="h-9 w-40" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            {!agLoading && agendamentos.length === 0 && (
              <EmptyState
                icon={CalendarDays}
                title="Nenhum agendamento no período"
                description="Mude o mês nos controles acima ou crie um novo compromisso."
                action={
                  <Button size="sm" onClick={() => setOpenNew(true)}>
                    <CalendarPlus className="mr-1 h-4 w-4" /> Novo agendamento
                  </Button>
                }
                className="m-4 border-0"
              />
            )}
            {agendamentos.map((a) => (
              <button
                key={a.id}
                onClick={() => setEditing(a)}
                className="w-full text-left p-4 hover:bg-accent/40 flex flex-col md:flex-row md:items-center gap-2 md:gap-4"
              >
                <div className="md:w-44 shrink-0">
                  <div className="text-sm font-medium capitalize">
                    {format(parseISO(a.data_inicio), "EEE, d 'de' MMM", { locale: ptBR })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(parseISO(a.data_inicio), "HH:mm")} –{" "}
                    {format(parseISO(a.data_fim), "HH:mm")}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", TIPO_DOT[a.tipo])} />
                    <div className="font-medium truncate">{a.titulo}</div>
                    <Badge variant="secondary" className={cn("text-[10px]", STATUS_TONE[a.status])}>
                      {STATUS_LABEL[a.status]}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {TIPO_LABEL[a.tipo]} · {corretorNome(a.corretor_id)}
                    {a.lead_id && ` · Lead: ${leadNome(a.lead_id)}`}
                    {a.local && ` · ${a.local}`}
                  </div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <AgendamentoForm
            title="Editar agendamento"
            initial={editing}
            corretores={corretores}
            leads={leads}
            isAdminOrGestor={isAdmin || isGestor}
            currentUserId={user!.id}
            onSubmit={(patch) =>
              updateMut.mutate({ id: editing.id, patch, leadId: editing.lead_id ?? null })
            }
            onDelete={() => {
              if (confirm("Remover este agendamento?"))
                deleteMut.mutate({ id: editing.id, leadId: editing.lead_id ?? null });
            }}
            pending={updateMut.isPending || deleteMut.isPending}
          />
        </Dialog>
      )}
    </div>
  );
}

type FormProps = {
  title: string;
  initial?: Agendamento;
  corretores: Array<{ id: string; nome: string | null; email: string }>;
  leads: Array<{
    id: string;
    nome: string | null;
    telefone: string | null;
    corretor_id: string | null;
  }>;
  isAdminOrGestor: boolean;
  currentUserId: string;
  onSubmit: (payload: Partial<Agendamento>) => void;
  onDelete?: () => void;
  pending?: boolean;
};

function AgendamentoForm({
  title,
  initial,
  corretores,
  leads,
  isAdminOrGestor,
  currentUserId,
  onSubmit,
  onDelete,
  pending,
}: FormProps) {
  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const [titulo, setTitulo] = useState(initial?.titulo ?? "");
  const [tipo, setTipo] = useState<Agendamento["tipo"]>(initial?.tipo ?? "visita");
  const [status, setStatus] = useState<Agendamento["status"]>(initial?.status ?? "agendado");
  const [leadId, setLeadId] = useState<string>(initial?.lead_id ?? "none");
  const [corretorId, setCorretorId] = useState<string>(initial?.corretor_id ?? currentUserId);
  const [dataInicio, setDataInicio] = useState(
    toLocalInput(initial ? new Date(initial.data_inicio) : inOneHour),
  );
  const [dataFim, setDataFim] = useState(
    toLocalInput(initial ? new Date(initial.data_fim) : inTwoHours),
  );
  const [local, setLocal] = useState(initial?.local ?? "");
  const [descricao, setDescricao] = useState(initial?.descricao ?? "");
  const [lembrete, setLembrete] = useState(initial?.lembrete_minutos ?? 30);
  const [motivoCancel, setMotivoCancel] = useState(initial?.motivo_cancelamento ?? "");

  // Evento para exportação (Google/.ics) com o que está preenchido no form.
  const calendarEvent = (): CalendarEventInput => {
    const leadNome = leadId !== "none" ? leads.find((l) => l.id === leadId)?.nome : null;
    const leadFone = leadId !== "none" ? leads.find((l) => l.id === leadId)?.telefone : null;
    const detalhes = [
      `Tipo: ${TIPO_LABEL[tipo]}`,
      leadNome ? `Lead: ${leadNome}${leadFone ? ` (${leadFone})` : ""}` : null,
      descricao.trim() || null,
    ].filter(Boolean);
    return {
      titulo: titulo.trim() || "Compromisso",
      inicio: new Date(dataInicio),
      fim: new Date(dataFim),
      local: local.trim() || null,
      descricao: detalhes.join("\n"),
    };
  };

  const handle = () => {
    if (!titulo.trim()) return toast.error("Informe um título");
    if (new Date(dataFim) <= new Date(dataInicio))
      return toast.error("Fim deve ser depois do início");

    onSubmit({
      titulo: titulo.trim(),
      tipo,
      status,
      lead_id: leadId === "none" ? null : leadId,
      corretor_id: corretorId,
      data_inicio: new Date(dataInicio).toISOString(),
      data_fim: new Date(dataFim).toISOString(),
      local: local.trim() || null,
      descricao: descricao.trim() || null,
      lembrete_minutos: lembrete,
      motivo_cancelamento: status === "cancelado" ? motivoCancel.trim() || null : null,
    });
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          Preencha os detalhes do compromisso. Datas usam o fuso do seu navegador.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2 space-y-1.5">
          <Label>Título</Label>
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex.: Visita Apto 1204"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as Agendamento["tipo"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPO_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIPO_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as Agendamento["status"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Início</Label>
          <Input
            type="datetime-local"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Fim</Label>
          <Input
            type="datetime-local"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Lead</Label>
          <Select value={leadId} onValueChange={setLeadId}>
            <SelectTrigger>
              <SelectValue placeholder="Sem lead" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Sem lead vinculado —</SelectItem>
              {leads.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.nome ?? "Lead"} {l.telefone ? `· ${l.telefone}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Corretor responsável</Label>
          <Select value={corretorId} onValueChange={setCorretorId} disabled={!isAdminOrGestor}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {corretores.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome ?? c.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isAdminOrGestor && (
            <p className="text-[11px] text-muted-foreground">
              Somente admin/gestor pode atribuir a outro corretor.
            </p>
          )}
        </div>

        <div className="md:col-span-2 space-y-1.5">
          <Label>Local</Label>
          <Input
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            placeholder="Endereço, sala, link..."
          />
        </div>

        <div className="md:col-span-2 space-y-1.5">
          <Label>Descrição</Label>
          <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
        </div>

        <div className="space-y-1.5">
          <Label>Lembrete (antes do horário)</Label>
          <Select value={String(lembrete)} onValueChange={(v) => setLembrete(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {![0, 5, 15, 30, 60, 120, 1440].includes(lembrete) && (
                <SelectItem value={String(lembrete)}>{lembrete} min antes</SelectItem>
              )}
              <SelectItem value="0">Sem lembrete</SelectItem>
              <SelectItem value="5">5 minutos antes</SelectItem>
              <SelectItem value="15">15 minutos antes</SelectItem>
              <SelectItem value="30">30 minutos antes</SelectItem>
              <SelectItem value="60">1 hora antes</SelectItem>
              <SelectItem value="120">2 horas antes</SelectItem>
              <SelectItem value="1440">1 dia antes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {status === "cancelado" && (
          <div className="md:col-span-2 space-y-1.5">
            <Label>Motivo do cancelamento</Label>
            <Input value={motivoCancel} onChange={(e) => setMotivoCancel(e.target.value)} />
          </div>
        )}
      </div>

      {initial && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-xs text-muted-foreground">Adicionar ao calendário:</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              window.open(buildGoogleCalendarUrl(calendarEvent()), "_blank", "noopener")
            }
          >
            <ExternalLink className="mr-1 h-3.5 w-3.5" /> Google Agenda
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadIcs(calendarEvent(), initial.id)}
          >
            <Download className="mr-1 h-3.5 w-3.5" /> .ics (Apple/Outlook)
          </Button>
        </div>
      )}

      <DialogFooter className="gap-2">
        {onDelete && (
          <Button variant="outline" onClick={onDelete} className="mr-auto text-destructive">
            Remover
          </Button>
        )}
        <Button onClick={handle} disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
