import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Phone, Mail, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/kanban")({
  head: () => ({ meta: [{ title: "Kanban — Seu Metro Quadrado" }] }),
  component: KanbanPage,
});

const COLUMNS: { id: string; label: string; tone: string }[] = [
  { id: "novo", label: "Novo", tone: "bg-blue-500/10 border-blue-500/30" },
  { id: "aguardando_atendimento", label: "Aguardando atendimento", tone: "bg-amber-500/10 border-amber-500/30" },
  { id: "em_atendimento", label: "Em atendimento", tone: "bg-violet-500/10 border-violet-500/30" },
  { id: "qualificado", label: "Qualificado", tone: "bg-cyan-500/10 border-cyan-500/30" },
  { id: "agendado", label: "Agendado", tone: "bg-indigo-500/10 border-indigo-500/30" },
  { id: "visita_realizada", label: "Visita realizada", tone: "bg-emerald-500/10 border-emerald-500/30" },
  { id: "proposta_enviada", label: "Proposta enviada", tone: "bg-teal-500/10 border-teal-500/30" },
  { id: "analise_credito", label: "Análise de crédito", tone: "bg-orange-500/10 border-orange-500/30" },
  { id: "contrato_fechado", label: "Contrato fechado", tone: "bg-green-600/15 border-green-600/40" },
  { id: "pos_venda", label: "Pós-venda", tone: "bg-lime-500/10 border-lime-500/30" },
  { id: "perdido", label: "Perdido", tone: "bg-rose-500/10 border-rose-500/30" },
];

type Lead = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string;
  status: string;
  corretor_id: string | null;
  projeto_nome: string | null;
  temperatura: string | null;
};

function KanbanPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const { data: corretores } = useQuery({
    queryKey: ["corretores-min"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome").eq("ativo", true);
      return data ?? [];
    },
  });
  const corretoresMap = useMemo(() => {
    const m = new Map<string, string>();
    (corretores ?? []).forEach((c) => m.set(c.id, c.nome));
    return m;
  }, [corretores]);

  const { data: leads } = useQuery({
    queryKey: ["leads-kanban"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, email, telefone, status, corretor_id, projeto_nome, temperatura")
        .eq("na_lixeira", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("leads")
        .update({ status: status as never, ultima_interacao: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["leads-kanban"] });
      const prev = qc.getQueryData<Lead[]>(["leads-kanban"]);
      qc.setQueryData<Lead[]>(["leads-kanban"], (old) =>
        (old ?? []).map((l) => (l.id === id ? { ...l, status } : l)),
      );
      return { prev };
    },
    onError: (err: Error, _v, ctx) => {
      qc.setQueryData(["leads-kanban"], ctx?.prev);
      toast.error(err.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["leads-kanban"] }),
  });

  const byColumn = useMemo(() => {
    const map = new Map<string, Lead[]>();
    COLUMNS.forEach((c) => map.set(c.id, []));
    const s = search.trim().toLowerCase();
    (leads ?? []).forEach((l) => {
      if (s && !l.nome.toLowerCase().includes(s) && !l.telefone.includes(s)) return;
      map.get(l.status)?.push(l);
    });
    return map;
  }, [leads, search]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kanban de Leads"
        description="Arraste os cards entre as colunas para atualizar o status."
        actions={
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar lead…"
            className="w-64"
          />
        }
      />

      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {COLUMNS.map((col) => {
            const items = byColumn.get(col.id) ?? [];
            return (
              <div
                key={col.id}
                onDragOver={(e) => { e.preventDefault(); setOverCol(col.id); }}
                onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOverCol(null);
                  if (dragId) {
                    const lead = (leads ?? []).find((l) => l.id === dragId);
                    if (lead && lead.status !== col.id) {
                      updateStatus.mutate({ id: dragId, status: col.id });
                    }
                  }
                  setDragId(null);
                }}
                className={cn(
                  "w-72 shrink-0 rounded-lg border-2 border-dashed p-2 transition-colors",
                  col.tone,
                  overCol === col.id && "ring-2 ring-primary/60",
                )}
              >
                <div className="flex items-center justify-between px-1 py-2">
                  <div className="font-semibold text-sm">{col.label}</div>
                  <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
                </div>
                <div className="space-y-2 min-h-[100px]">
                  {items.map((lead) => (
                    <Card
                      key={lead.id}
                      draggable
                      onDragStart={() => setDragId(lead.id)}
                      onDragEnd={() => setDragId(null)}
                      className={cn(
                        "p-2.5 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow bg-background",
                        dragId === lead.id && "opacity-50",
                      )}
                    >
                      <div className="flex items-start gap-1">
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground mt-1 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{lead.nome}</div>
                          {lead.projeto_nome && (
                            <div className="text-[11px] text-muted-foreground truncate">{lead.projeto_nome}</div>
                          )}
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            <span className="truncate">{lead.telefone}</span>
                          </div>
                          {lead.email && (
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              <span className="truncate">{lead.email}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] text-muted-foreground">
                              {lead.corretor_id ? corretoresMap.get(lead.corretor_id) ?? "—" : "sem corretor"}
                            </span>
                            {lead.temperatura && (
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "text-[9px] uppercase",
                                  lead.temperatura === "quente" && "bg-red-500/15 text-red-700 dark:text-red-300",
                                  lead.temperatura === "morno" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                                  lead.temperatura === "frio" && "bg-blue-500/15 text-blue-700 dark:text-blue-300",
                                )}
                              >
                                {lead.temperatura}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
