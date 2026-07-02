import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, Mail, GripVertical, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { FUNNEL_STAGES, LEAD_STATUS_LABEL, resolveStageAction, type LeadStatus } from "@/lib/leads";
import { useLeadStatusMutation } from "@/hooks/use-lead-status";
import { LeadStageMenu } from "@/components/lead-stage-menu";
import {
  LeadStageModals,
  type StageModalState,
  type PerdidoState,
} from "@/components/lead-stage/lead-stage-modals";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { SlaBadge } from "@/components/sla-badge";

const COLUMN_TONE: Record<LeadStatus, string> = {
  novo: "bg-blue-500/10 border-blue-500/30",
  aguardando_atendimento: "bg-amber-500/10 border-amber-500/30",
  aguardando_retorno: "bg-yellow-500/10 border-yellow-500/30",
  em_atendimento: "bg-violet-500/10 border-violet-500/30",
  qualificado: "bg-cyan-500/10 border-cyan-500/30",
  agendado: "bg-indigo-500/10 border-indigo-500/30",
  visita_realizada: "bg-emerald-500/10 border-emerald-500/30",
  proposta_enviada: "bg-teal-500/10 border-teal-500/30",
  analise_credito: "bg-orange-500/10 border-orange-500/30",
  contrato_fechado: "bg-green-600/15 border-green-600/40",
  pos_venda: "bg-lime-500/10 border-lime-500/30",
  perdido: "bg-rose-500/10 border-rose-500/30",
};

const COLUMNS = FUNNEL_STAGES.map((id) => ({
  id,
  label: LEAD_STATUS_LABEL[id],
  tone: COLUMN_TONE[id],
}));

type Lead = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string;
  status: string;
  corretor_id: string | null;
  projeto_id: string | null;
  projeto_nome: string | null;
  observacoes: string | null;
  temperatura: string | null;
  origem: string | null;
  data_distribuicao: string | null;
  created_at: string;
};

type SlaRow = {
  lead_id: string;
  sla_minutos: number;
  minutos_decorridos: number;
  sla_status: string;
};

/**
 * Quadro Kanban dos leads. Extraído da antiga rota `/kanban` para ser usado como
 * uma das visões (toggle Lista/Kanban) dentro de `/leads` — consolidação Fase 1.
 * A rota `/kanban` permanece como redirect de compatibilidade.
 */
export function KanbanBoard() {
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

  const {
    data: leads,
    isLoading: leadsLoading,
    isError: leadsError,
    refetch: refetchLeads,
  } = useQuery({
    queryKey: ["leads-kanban"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, nome, email, telefone, status, corretor_id, projeto_id, projeto_nome, observacoes, temperatura, origem, data_distribuicao, created_at",
        )
        .eq("na_lixeira", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const { data: slaRows } = useQuery({
    queryKey: ["leads-sla"],
    queryFn: async () => {
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args?: Record<string, unknown>,
        ) => Promise<{ data: SlaRow[] | null; error: unknown }>
      )("leads_com_sla");
      if (error) throw error;
      return (data ?? []) as SlaRow[];
    },
    staleTime: 60_000,
  });

  const slaMap = useMemo(() => {
    const m = new Map<string, SlaRow>();
    (slaRows ?? []).forEach((r) => m.set(r.lead_id, r));
    return m;
  }, [slaRows]);

  // Substitui polling por realtime
  useRealtimeInvalidate("leads", [["leads-kanban"], ["leads-sla"]]);

  const [modalState, setModalState] = useState<StageModalState>(null);
  const [perdidoLead, setPerdidoLead] = useState<PerdidoState>(null);

  const updateStatus = useLeadStatusMutation({ optimisticKeys: [["leads-kanban"]] });

  // Roteia a etapa escolhida (no menu ou ao arrastar): direta, modal ou perdido.
  const routeStage = (lead: Lead, target: LeadStatus) => {
    if (lead.status === target) return;
    const action = resolveStageAction(target);
    if (action.kind === "direct") updateStatus.mutate({ id: lead.id, status: target });
    else if (action.kind === "modal") setModalState({ modal: action.modal, lead });
    else setPerdidoLead(lead);
  };

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
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Arraste os cards entre as colunas para atualizar o status.
        </p>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar lead…"
          className="w-64"
        />
      </div>

      {leadsError && (
        <Card className="p-8 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 mx-auto text-destructive opacity-70" />
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar o quadro. Tente novamente.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetchLeads()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente
          </Button>
        </Card>
      )}

      {leadsLoading && !leadsError && (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-72 shrink-0 rounded-lg" />
          ))}
        </div>
      )}

      {!leadsLoading && !leadsError && (leads ?? []).length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum lead ativo no funil ainda.
        </p>
      )}

      {!leadsLoading && !leadsError && (leads ?? []).length > 0 && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {COLUMNS.map((col) => {
              const items = byColumn.get(col.id) ?? [];
              return (
                <div
                  key={col.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverCol(col.id);
                  }}
                  onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOverCol(null);
                    if (dragId) {
                      const lead = (leads ?? []).find((l) => l.id === dragId);
                      if (lead) routeStage(lead, col.id as LeadStatus);
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
                    <Badge variant="secondary" className="text-[10px]">
                      {items.length}
                    </Badge>
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
                              <div className="text-[11px] text-muted-foreground truncate">
                                {lead.projeto_nome}
                              </div>
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
                            <div className="flex items-center justify-between mt-2 gap-1 flex-wrap">
                              <span className="text-[10px] text-muted-foreground">
                                {lead.corretor_id
                                  ? (corretoresMap.get(lead.corretor_id) ?? "—")
                                  : "sem corretor"}
                              </span>
                              {(lead.status === "novo" ||
                                lead.status === "aguardando_atendimento") &&
                                slaMap.get(lead.id) && (
                                  <SlaBadge
                                    compact
                                    slaMinutos={slaMap.get(lead.id)!.sla_minutos}
                                    referencia={lead.data_distribuicao ?? lead.created_at}
                                  />
                                )}
                              {lead.temperatura && (
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "text-[9px] uppercase",
                                    lead.temperatura === "quente" &&
                                      "bg-red-500/15 text-red-700 dark:text-red-300",
                                    lead.temperatura === "morno" &&
                                      "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                                    lead.temperatura === "frio" &&
                                      "bg-blue-500/15 text-blue-700 dark:text-blue-300",
                                  )}
                                >
                                  {lead.temperatura}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <LeadStageMenu
                            lead={lead}
                            onPickDirect={(target) =>
                              updateStatus.mutate({ id: lead.id, status: target })
                            }
                            onPickModal={(modal) => setModalState({ modal, lead })}
                            onPickPerdido={() => setPerdidoLead(lead)}
                          />
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <LeadStageModals
        modalState={modalState}
        onModalOpenChange={(o) => !o && setModalState(null)}
        perdidoLead={perdidoLead}
        onPerdidoOpenChange={(o) => !o && setPerdidoLead(null)}
      />
    </div>
  );
}
