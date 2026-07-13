import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { addMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  List as ListIcon,
  MapPinned,
} from "lucide-react";
import { syncAgendamentoGoogle } from "@/lib/google-calendar.functions";
import { invalidateAgendamentoQueries } from "@/lib/agendamentos";
import { AgendaCalendar } from "@/features/agenda/agenda-calendar";
import { AgendaTimeline } from "@/features/agenda/agenda-timeline";
import { AgendamentoForm } from "@/features/agenda/agendamento-form";
import { STATUS_LABEL, STATUS_OPTIONS, type Agendamento } from "@/features/agenda/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TarefasPage } from "@/routes/_authenticated/tarefas";

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
            <div className="font-display text-lg font-semibold capitalize min-w-[180px] text-center">
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
        <AgendaCalendar
          cursor={cursor}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          agendamentos={agendamentos}
          onSelect={setEditing}
        />
      ) : (
        <AgendaTimeline
          agendamentos={agendamentos}
          loading={agLoading}
          corretorNome={corretorNome}
          leadNome={leadNome}
          onSelect={setEditing}
          onCreate={() => setOpenNew(true)}
        />
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
