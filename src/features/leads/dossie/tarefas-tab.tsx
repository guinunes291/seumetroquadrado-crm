// Aba Tarefas do dossiê do lead: lista vinculada + criar/concluir/adiar sem
// sair do dossiê (mesma semântica do card do Hoje: concluir grava
// data_conclusao para entrar no "Concluídas hoje").

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ListTodo, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  TAREFA_TIPOS,
  TAREFA_PRIORIDADES,
  TIPO_LABEL as TAREFA_TIPO_LABEL,
  PRIORIDADE_LABEL as TAREFA_PRIORIDADE_LABEL,
  type TarefaTipo,
  type TarefaPrioridade,
} from "@/lib/tarefas";

/**
 * Tarefas vinculadas ao lead. Exportado para o shell da rota reaproveitar a
 * MESMA query (mesma queryKey → um único fetch) no contador da aba.
 */
export function useTarefasLead(leadId: string) {
  return useQuery({
    queryKey: ["tarefas-lead", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefas")
        .select("id, titulo, status, data_vencimento, prioridade")
        .eq("lead_id", leadId)
        .order("data_vencimento", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function TarefasTab({
  leadId,
  corretorId,
}: {
  leadId: string;
  /** Corretor dono do lead — novas tarefas vão para ele (fallback: usuário logado). */
  corretorId: string | null;
}) {
  const qc = useQueryClient();
  const { data: tarefas = [], isLoading, isError, error, refetch } = useTarefasLead(leadId);

  // "+ Tarefa" inline: cria uma tarefa já vinculada a este lead, sem ir até a página de Tarefas.
  const [tarefaOpen, setTarefaOpen] = useState(false);
  const [tarefaForm, setTarefaForm] = useState({
    titulo: "",
    tipo: "follow_up" as TarefaTipo,
    prioridade: "media" as TarefaPrioridade,
    data_vencimento: "",
  });

  const criarTarefa = useMutation({
    mutationFn: async () => {
      const titulo = tarefaForm.titulo.trim();
      if (titulo.length < 2) throw new Error("Informe o título da tarefa.");
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      const { error } = await supabase.from("tarefas").insert({
        titulo,
        tipo: tarefaForm.tipo,
        prioridade: tarefaForm.prioridade,
        status: "pendente",
        lead_id: leadId,
        corretor_id: corretorId ?? uid,
        criado_por: uid,
        data_vencimento: tarefaForm.data_vencimento
          ? new Date(tarefaForm.data_vencimento).toISOString()
          : null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa criada");
      setTarefaOpen(false);
      setTarefaForm({ titulo: "", tipo: "follow_up", prioridade: "media", data_vencimento: "" });
      qc.invalidateQueries({ queryKey: ["tarefas-lead", leadId] });
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Concluir/adiar tarefas direto da aba Tarefas — evita ir até /agendamentos
  // só para bater "feito". Mesma semântica do card do Hoje: grava data_conclusao
  // para entrar no "Concluídas hoje".
  const concluirTarefa = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tarefas")
        .update({ status: "concluida", data_conclusao: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa concluída");
      qc.invalidateQueries({ queryKey: ["tarefas-lead", leadId] });
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const adiarTarefa = useMutation({
    mutationFn: async ({ id, ms }: { id: string; ms: number }) => {
      const novo = new Date(Date.now() + ms).toISOString();
      const { error } = await supabase
        .from("tarefas")
        .update({ data_vencimento: novo } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa adiada");
      qc.invalidateQueries({ queryKey: ["tarefas-lead", leadId] });
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setTarefaOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nova tarefa
        </Button>
      </div>
      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : isError ? (
        <QueryErrorState
          title="Não foi possível carregar as tarefas."
          error={error}
          onRetry={() => refetch()}
        />
      ) : tarefas.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="Sem tarefas vinculadas"
          description="Crie uma tarefa para agendar o próximo passo com este lead."
        />
      ) : (
        <div className="rounded-xl border border-border-subtle bg-card shadow-elev-1">
          <div className="px-6 py-4 divide-y">
            {tarefas.map((t) => {
              const venc = t.data_vencimento ? new Date(t.data_vencimento) : null;
              const aberta = t.status === "pendente" || t.status === "em_andamento";
              const atrasada = aberta && !!venc && venc.getTime() < Date.now();
              const diasAtraso = venc
                ? Math.floor((Date.now() - venc.getTime()) / (24 * 60 * 60 * 1000))
                : 0;
              return (
                <div key={t.id} className="py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{t.titulo}</div>
                    <div
                      className={cn(
                        "text-xs text-muted-foreground",
                        atrasada && "text-destructive font-medium",
                      )}
                    >
                      {venc
                        ? atrasada
                          ? `atrasada há ${diasAtraso === 0 ? "hoje" : `${diasAtraso}d`} · ${venc.toLocaleString("pt-BR")}`
                          : venc.toLocaleString("pt-BR")
                        : "Sem prazo"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline">{t.status}</Badge>
                    <Badge variant="outline">{t.prioridade}</Badge>
                    {aberta && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
                          disabled={concluirTarefa.isPending}
                          onClick={() => concluirTarefa.mutate(t.id)}
                        >
                          Concluir
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7">
                              Adiar
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => adiarTarefa.mutate({ id: t.id, ms: 60 * 60 * 1000 })}
                            >
                              +1 hora
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                adiarTarefa.mutate({ id: t.id, ms: 24 * 60 * 60 * 1000 })
                              }
                            >
                              +1 dia
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                adiarTarefa.mutate({ id: t.id, ms: 7 * 24 * 60 * 60 * 1000 })
                              }
                            >
                              +1 semana
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={tarefaOpen} onOpenChange={setTarefaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova tarefa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>
                Título <span className="text-destructive">*</span>
              </Label>
              <Input
                value={tarefaForm.titulo}
                onChange={(e) => setTarefaForm({ ...tarefaForm, titulo: e.target.value })}
                placeholder="Ex.: Ligar para retomar o atendimento"
                maxLength={160}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select
                  value={tarefaForm.tipo}
                  onValueChange={(v) => setTarefaForm({ ...tarefaForm, tipo: v as TarefaTipo })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAREFA_TIPOS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TAREFA_TIPO_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade</Label>
                <Select
                  value={tarefaForm.prioridade}
                  onValueChange={(v) =>
                    setTarefaForm({ ...tarefaForm, prioridade: v as TarefaPrioridade })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAREFA_PRIORIDADES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {TAREFA_PRIORIDADE_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Vencimento</Label>
              <Input
                type="datetime-local"
                value={tarefaForm.data_vencimento}
                onChange={(e) => setTarefaForm({ ...tarefaForm, data_vencimento: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarefaOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => criarTarefa.mutate()} disabled={criarTarefa.isPending}>
              Criar tarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
