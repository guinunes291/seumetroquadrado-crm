import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TAREFA_STATUS, TAREFA_TIPOS, TAREFA_PRIORIDADES,
  STATUS_LABEL, TIPO_LABEL, PRIORIDADE_LABEL,
  isAtrasada, statusBadgeClass, prioridadeBadgeClass,
  type TarefaStatus, type TarefaTipo, type TarefaPrioridade,
} from "@/lib/tarefas";

export const Route = createFileRoute("/_authenticated/tarefas")({
  head: () => ({ meta: [{ title: "Tarefas — Seu Metro Quadrado" }] }),
  component: TarefasPage,
});

function TarefasPage() {
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const canManageAll = isAdmin || isGestor;
  const qc = useQueryClient();

  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const tarefasQuery = useQuery({
    queryKey: ["tarefas", { canManageAll }],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefas")
        .select("*, leads(id, nome), profiles!tarefas_corretor_id_fkey(id, nome)")
        .is("deleted_at", null)
        .order("data_vencimento", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const leadsQuery = useQuery({
    queryKey: ["tarefas:leads-opt"],
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("id, nome").is("deleted_at", null).order("nome").limit(200);
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
    return list.filter((t: any) => {
      if (filtroStatus !== "todos" && t.status !== filtroStatus) return false;
      if (filtroTipo !== "todos" && t.tipo !== filtroTipo) return false;
      if (busca && !t.titulo?.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [tarefasQuery.data, filtroStatus, filtroTipo, busca]);

  const counts = useMemo(() => {
    const list = tarefasQuery.data ?? [];
    return {
      pendentes: list.filter((t: any) => t.status === "pendente").length,
      em_andamento: list.filter((t: any) => t.status === "em_andamento").length,
      atrasadas: list.filter((t: any) => isAtrasada(t)).length,
      concluidas_hoje: list.filter((t: any) =>
        t.status === "concluida" &&
        t.data_conclusao &&
        new Date(t.data_conclusao).toDateString() === new Date().toDateString(),
      ).length,
    };
  }, [tarefasQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editing?.id) {
        const { error } = await supabase.from("tarefas").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tarefas").insert({
          ...payload,
          corretor_id: payload.corretor_id ?? user?.id,
          criado_por: user?.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Tarefa atualizada" : "Tarefa criada");
      setDialogOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const concluirMutation = useMutation({
    mutationFn: async ({ id, resultado }: { id: string; resultado?: string }) => {
      const { error } = await supabase
        .from("tarefas")
        .update({ status: "concluida", data_conclusao: new Date().toISOString(), resultado })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa concluída");
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload: any = {
      titulo: fd.get("titulo"),
      descricao: fd.get("descricao") || null,
      tipo: fd.get("tipo"),
      status: fd.get("status"),
      prioridade: fd.get("prioridade"),
      lead_id: (fd.get("lead_id") as string) || null,
      data_vencimento: fd.get("data_vencimento") ? new Date(fd.get("data_vencimento") as string).toISOString() : null,
    };
    if (canManageAll) payload.corretor_id = fd.get("corretor_id") || user?.id;
    saveMutation.mutate(payload);
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Tarefas"
        description="Centralize follow-ups e atividades do seu funil."
        actions={
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Nova tarefa</Button>
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
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TAREFA_TIPOS.map((t) => <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <input type="hidden" name="tipo" />
                  </div>
                  <div>
                    <Label>Prioridade</Label>
                    <Select name="prioridade" defaultValue={editing?.prioridade ?? "media"}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TAREFA_PRIORIDADES.map((p) => <SelectItem key={p} value={p}>{PRIORIDADE_LABEL[p]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Status</Label>
                    <Select name="status" defaultValue={editing?.status ?? "pendente"}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TAREFA_STATUS.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="data_vencimento">Vencimento</Label>
                    <Input
                      id="data_vencimento"
                      name="data_vencimento"
                      type="datetime-local"
                      defaultValue={editing?.data_vencimento ? format(parseISO(editing.data_vencimento), "yyyy-MM-dd'T'HH:mm") : ""}
                    />
                  </div>
                </div>
                <div>
                  <Label>Lead vinculado (opcional)</Label>
                  <Select name="lead_id" defaultValue={editing?.lead_id ?? ""}>
                    <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nenhum</SelectItem>
                      {(leadsQuery.data ?? []).map((l: any) => (
                        <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {canManageAll && (
                  <div>
                    <Label>Atribuir ao corretor</Label>
                    <Select name="corretor_id" defaultValue={editing?.corretor_id ?? user?.id}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(corretoresQuery.data ?? []).map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label htmlFor="descricao">Descrição</Label>
                  <Textarea id="descricao" name="descricao" rows={3} defaultValue={editing?.descricao ?? ""} />
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Clock className="h-4 w-4 text-amber-500" />} label="Pendentes" value={counts.pendentes} />
        <StatCard icon={<Clock className="h-4 w-4 text-blue-500" />} label="Em andamento" value={counts.em_andamento} />
        <StatCard icon={<AlertTriangle className="h-4 w-4 text-red-500" />} label="Atrasadas" value={counts.atrasadas} />
        <StatCard icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} label="Concluídas hoje" value={counts.concluidas_hoje} />
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-3">
            <Input placeholder="Buscar..." value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-xs" />
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos status</SelectItem>
                {TAREFA_STATUS.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos tipos</SelectItem>
                {TAREFA_TIPOS.map((t) => <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {tarefasQuery.isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Carregando...</div>
          ) : tarefasFiltradas.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Nenhuma tarefa encontrada.</div>
          ) : (
            <ul className="divide-y">
              {tarefasFiltradas.map((t: any) => {
                const atrasada = isAtrasada(t);
                return (
                  <li key={t.id} className="py-3 flex items-start gap-3">
                    <button
                      onClick={() => concluirMutation.mutate({ id: t.id })}
                      disabled={t.status === "concluida"}
                      className={cn(
                        "mt-1 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0",
                        t.status === "concluida"
                          ? "bg-green-500 border-green-500 text-white"
                          : "border-muted-foreground/40 hover:border-primary",
                      )}
                      aria-label="Concluir"
                    >
                      {t.status === "concluida" && <CheckCircle2 className="h-3 w-3" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("font-medium", t.status === "concluida" && "line-through text-muted-foreground")}>
                          {t.titulo}
                        </span>
                        <Badge variant="outline" className={statusBadgeClass(t.status)}>
                          {STATUS_LABEL[t.status as TarefaStatus]}
                        </Badge>
                        <Badge variant="outline" className={prioridadeBadgeClass(t.prioridade)}>
                          {PRIORIDADE_LABEL[t.prioridade as TarefaPrioridade]}
                        </Badge>
                        <Badge variant="secondary">{TIPO_LABEL[t.tipo as TarefaTipo]}</Badge>
                        {atrasada && <Badge variant="destructive">Atrasada</Badge>}
                      </div>
                      {t.descricao && <p className="text-sm text-muted-foreground mt-0.5">{t.descricao}</p>}
                      <div className="text-xs text-muted-foreground mt-1 flex gap-3 flex-wrap">
                        {t.data_vencimento && (
                          <span>Vence: {format(parseISO(t.data_vencimento), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                        )}
                        {t.leads?.nome && <span>Lead: {t.leads.nome}</span>}
                        {canManageAll && t.profiles?.nome && <span>Corretor: {t.profiles.nome}</span>}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setDialogOpen(true); }}>
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

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">{icon}</div>
        <div>
          <div className="text-2xl font-semibold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
