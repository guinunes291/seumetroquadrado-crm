import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useUndoableMutation } from "@/hooks/use-undoable-mutation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Plus, CheckCircle2, Clock, AlertTriangle, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TAREFA_STATUS,
  TAREFA_TIPOS,
  TAREFA_PRIORIDADES,
  STATUS_LABEL,
  TIPO_LABEL,
  PRIORIDADE_LABEL,
  isAtrasada,
  statusBadgeClass,
  prioridadeBadgeClass,
  type TarefaStatus,
  type TarefaTipo,
  type TarefaPrioridade,
} from "@/lib/tarefas";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

// Rota legada mantida para deep-links: o conteúdo vive como aba do hub.
export const Route = createFileRoute("/_authenticated/tarefas")({
  beforeLoad: () => {
    throw redirect({ to: "/agendamentos", search: { tab: "tarefas" } });
  },
});

type TarefaRow = Tables<"tarefas"> & {
  leads: { id: string; nome: string | null } | null;
  profiles: { id: string; nome: string | null } | null;
};

type TarefaPayload = Partial<TablesInsert<"tarefas">>;

export function TarefasPage() {
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const canManageAll = isAdmin || isGestor;
  const qc = useQueryClient();

  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [quickTitulo, setQuickTitulo] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TarefaRow | null>(null);

  const tarefasQuery = useQuery({
    queryKey: ["tarefas", { canManageAll }],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefas")
        .select("*, leads(id, nome), profiles!tarefas_corretor_id_fkey(id, nome)")
        .is("deleted_at", null)
        .order("data_vencimento", { ascending: true, nullsFirst: false });
      if (error) throw error;
      // Fronteira explícita: o hint `profiles!tarefas_corretor_id_fkey` resolve
      // no PostgREST, mas os types gerados não conhecem essa relação.
      return (data ?? []) as unknown as TarefaRow[];
    },
  });

  useRealtimeInvalidate("tarefas", [["tarefas"]]);

  const leadsQuery = useQuery({
    queryKey: ["tarefas:leads-opt"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, nome")
        .is("deleted_at", null)
        .order("nome")
        .limit(200);
      return data ?? [];
    },
  });

  const corretoresQuery = useQuery({
    queryKey: ["tarefas:corretores-opt"],
    enabled: canManageAll,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome").order("nome");
      return data ?? [];
    },
  });

  const tarefasFiltradas = useMemo(() => {
    const list = tarefasQuery.data ?? [];
    return list.filter((t) => {
      if (filtroStatus !== "todos" && t.status !== filtroStatus) return false;
      if (filtroTipo !== "todos" && t.tipo !== filtroTipo) return false;
      if (busca && !t.titulo?.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [tarefasQuery.data, filtroStatus, filtroTipo, busca]);

  const counts = useMemo(() => {
    const list = tarefasQuery.data ?? [];
    return {
      pendentes: list.filter((t) => t.status === "pendente").length,
      em_andamento: list.filter((t) => t.status === "em_andamento").length,
      atrasadas: list.filter((t) => isAtrasada(t)).length,
      concluidas_hoje: list.filter(
        (t) =>
          t.status === "concluida" &&
          t.data_conclusao &&
          new Date(t.data_conclusao).toDateString() === new Date().toDateString(),
      ).length,
    };
  }, [tarefasQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (payload: TarefaPayload) => {
      if (editing?.id) {
        const { error } = await supabase.from("tarefas").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tarefas").insert({
          ...payload,
          corretor_id: payload.corretor_id ?? user?.id,
          criado_por: user?.id,
        } as TablesInsert<"tarefas">);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Tarefa atualizada" : "Tarefa criada");
      setDialogOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Concluir tarefa usa o padrão universal de Desfazer (delayed): o círculo
  // marca na hora via patch otimista — defensivo, pois o cache sob ["tarefas"]
  // pode guardar um array puro OU o shape { rows } — e o servidor só é chamado
  // quando a janela de 5s do toast expira. Desfazer = restaurar os snapshots.
  const concluirTarefa = useUndoableMutation<{ id: string; resultado?: string }>({
    mode: "delayed",
    message: () => "Tarefa concluída",
    mutationFn: async ({ id, resultado }) => {
      const { error } = await supabase
        .from("tarefas")
        .update({ status: "concluida", data_conclusao: new Date().toISOString(), resultado })
        .eq("id", id);
      if (error) throw error;
    },
    optimistic: {
      keys: [["tarefas"]],
      apply: (cached, { id }) => {
        const concluir = (rows: unknown[]) =>
          rows.map((r) => {
            const row = r && typeof r === "object" ? (r as { id?: unknown }) : null;
            return row && row.id === id
              ? { ...row, status: "concluida", data_conclusao: new Date().toISOString() }
              : r;
          });
        if (Array.isArray(cached)) return concluir(cached);
        if (cached && typeof cached === "object") {
          const c = cached as { rows?: unknown };
          if (Array.isArray(c.rows)) return { ...cached, rows: concluir(c.rows) };
        }
        return cached;
      },
    },
    invalidateKeys: [["tarefas"]],
    errorMessage: "Não foi possível concluir a tarefa",
  });

  // Snooze: adia o vencimento da tarefa para agora + N (1h / 1 dia / 1 semana).
  const snoozeMutation = useMutation({
    mutationFn: async ({ id, ms }: { id: string; ms: number }) => {
      const novo = new Date(Date.now() + ms).toISOString();
      const { error } = await supabase
        .from("tarefas")
        .update({ data_vencimento: novo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa adiada");
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Quick-add: cria uma tarefa só com o título (padrões follow-up / média / pendente).
  const quickAdd = useMutation({
    mutationFn: async () => {
      const titulo = quickTitulo.trim();
      if (!titulo) throw new Error("Escreva o título da tarefa.");
      const payload: TarefaPayload = {
        titulo,
        tipo: "follow_up",
        status: "pendente",
        prioridade: "media",
        criado_por: user?.id,
      };
      if (canManageAll) payload.corretor_id = user?.id;
      const { error } = await supabase.from("tarefas").insert(payload as TablesInsert<"tarefas">);
      if (error) throw error;
    },
    onSuccess: () => {
      setQuickTitulo("");
      toast.success("Tarefa criada");
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload: TarefaPayload = {
      titulo: fd.get("titulo") as string,
      descricao: (fd.get("descricao") as string) || null,
      tipo: fd.get("tipo") as TarefaTipo,
      status: fd.get("status") as TarefaStatus,
      prioridade: fd.get("prioridade") as TarefaPrioridade,
      lead_id: (() => {
        const v = fd.get("lead_id") as string;
        return v && v !== "__none__" ? v : null;
      })(),
      data_vencimento: fd.get("data_vencimento")
        ? new Date(fd.get("data_vencimento") as string).toISOString()
        : null,
    };
    if (canManageAll) payload.corretor_id = (fd.get("corretor_id") as string) || user?.id;
    saveMutation.mutate(payload);
  };

  const temFiltros = filtroStatus !== "todos" || filtroTipo !== "todos" || busca.trim() !== "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tarefas"
        description="Centralize follow-ups e atividades do seu funil."
        actions={
          <Dialog
            open={dialogOpen}
            onOpenChange={(o) => {
              setDialogOpen(o);
              if (!o) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova tarefa
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <Label htmlFor="titulo">Título</Label>
                  <Input id="titulo" name="titulo" required defaultValue={editing?.titulo} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tipo</Label>
                    <Select name="tipo" defaultValue={editing?.tipo ?? "follow_up"}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TAREFA_TIPOS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {TIPO_LABEL[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Prioridade</Label>
                    <Select name="prioridade" defaultValue={editing?.prioridade ?? "media"}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TAREFA_PRIORIDADES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {PRIORIDADE_LABEL[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Status</Label>
                    <Select name="status" defaultValue={editing?.status ?? "pendente"}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TAREFA_STATUS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="data_vencimento">Vencimento</Label>
                    <Input
                      id="data_vencimento"
                      name="data_vencimento"
                      type="datetime-local"
                      defaultValue={
                        editing?.data_vencimento
                          ? format(parseISO(editing.data_vencimento), "yyyy-MM-dd'T'HH:mm")
                          : ""
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label>Lead vinculado (opcional)</Label>
                  <Select name="lead_id" defaultValue={editing?.lead_id ?? "__none__"}>
                    <SelectTrigger>
                      <SelectValue placeholder="Nenhum" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhum</SelectItem>
                      {(leadsQuery.data ?? []).map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {canManageAll && (
                  <div>
                    <Label>Atribuir ao corretor</Label>
                    <Select name="corretor_id" defaultValue={editing?.corretor_id ?? user?.id}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(corretoresQuery.data ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label htmlFor="descricao">Descrição</Label>
                  <Textarea
                    id="descricao"
                    name="descricao"
                    rows={3}
                    defaultValue={editing?.descricao ?? ""}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          title="Pendentes"
          value={counts.pendentes}
          icon={Clock}
          intent="warning"
          loading={tarefasQuery.isLoading}
        />
        <StatTile
          title="Em andamento"
          value={counts.em_andamento}
          icon={Clock}
          intent="info"
          loading={tarefasQuery.isLoading}
        />
        <StatTile
          title="Atrasadas"
          value={counts.atrasadas}
          icon={AlertTriangle}
          intent="danger"
          loading={tarefasQuery.isLoading}
        />
        <StatTile
          title="Concluídas hoje"
          value={counts.concluidas_hoje}
          icon={CheckCircle2}
          intent="success"
          loading={tarefasQuery.isLoading}
        />
      </div>

      <Card className="border-border-subtle shadow-elev-1">
        <CardContent className="p-4 space-y-4">
          {/* Quick-add: adicionar tarefa rápida sem abrir o modal. */}
          <div className="flex gap-2">
            <Input
              placeholder="Adicionar tarefa rápida (Enter para salvar)…"
              value={quickTitulo}
              onChange={(e) => setQuickTitulo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && quickTitulo.trim()) quickAdd.mutate();
              }}
            />
            <Button
              variant="outline"
              disabled={!quickTitulo.trim() || quickAdd.isPending}
              onClick={() => quickAdd.mutate()}
            >
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </div>

          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Buscar..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="max-w-xs"
            />
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos status</SelectItem>
                {TAREFA_STATUS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos tipos</SelectItem>
                {TAREFA_TIPOS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIPO_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {tarefasQuery.isLoading ? (
            <div className="space-y-4 py-2" aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="mt-1 h-5 w-5 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : tarefasQuery.isError ? (
            <QueryErrorState
              title="Não foi possível carregar as tarefas."
              error={tarefasQuery.error}
              onRetry={() => tarefasQuery.refetch()}
            />
          ) : tarefasFiltradas.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              title="Nenhuma tarefa encontrada"
              description={
                temFiltros
                  ? "Ajuste a busca ou os filtros para ver outras tarefas."
                  : "Crie a primeira pela linha rápida acima ou em “Nova tarefa”."
              }
              action={
                temFiltros ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setBusca("");
                      setFiltroStatus("todos");
                      setFiltroTipo("todos");
                    }}
                  >
                    Limpar filtros
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y">
              {tarefasFiltradas.map((t) => {
                const atrasada = isAtrasada(t);
                return (
                  <li key={t.id} className="py-3 flex items-start gap-3">
                    <button
                      onClick={() => concluirTarefa.mutate({ id: t.id })}
                      disabled={t.status === "concluida"}
                      className={cn(
                        "mt-1 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 press-scale",
                        t.status === "concluida"
                          ? "bg-success border-success text-success-foreground"
                          : "border-muted-foreground/40 hover:border-primary",
                      )}
                      aria-label="Concluir"
                    >
                      {t.status === "concluida" && <CheckCircle2 className="h-3 w-3" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            "font-medium",
                            t.status === "concluida" && "line-through text-muted-foreground",
                          )}
                        >
                          {t.titulo}
                        </span>
                        <Badge variant="outline" className={statusBadgeClass(t.status)}>
                          {STATUS_LABEL[t.status]}
                        </Badge>
                        <Badge variant="outline" className={prioridadeBadgeClass(t.prioridade)}>
                          {PRIORIDADE_LABEL[t.prioridade]}
                        </Badge>
                        <Badge variant="secondary">{TIPO_LABEL[t.tipo]}</Badge>
                        {atrasada && <Badge variant="destructive">Atrasada</Badge>}
                      </div>
                      {t.descricao && (
                        <p className="text-sm text-muted-foreground mt-0.5">{t.descricao}</p>
                      )}
                      <div className="text-xs text-muted-foreground mt-1 flex gap-3 flex-wrap">
                        {t.data_vencimento && (
                          <span>
                            Vence:{" "}
                            {format(parseISO(t.data_vencimento), "dd/MM/yyyy HH:mm", {
                              locale: ptBR,
                            })}
                          </span>
                        )}
                        {t.leads?.nome && <span>Lead: {t.leads.nome}</span>}
                        {canManageAll && t.profiles?.nome && (
                          <span>Corretor: {t.profiles.nome}</span>
                        )}
                      </div>
                    </div>
                    {t.status !== "concluida" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" title="Adiar">
                            <Clock className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => snoozeMutation.mutate({ id: t.id, ms: 60 * 60 * 1000 })}
                          >
                            Adiar 1 hora
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              snoozeMutation.mutate({ id: t.id, ms: 24 * 60 * 60 * 1000 })
                            }
                          >
                            Adiar 1 dia
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              snoozeMutation.mutate({ id: t.id, ms: 7 * 24 * 60 * 60 * 1000 })
                            }
                          >
                            Adiar 1 semana
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(t);
                        setDialogOpen(true);
                      }}
                    >
                      Editar
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
