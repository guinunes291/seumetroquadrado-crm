// Aba Agendamentos do dossiê do lead: lista os agendamentos vinculados e
// permite ao corretor criar um novo, confirmar ou reagendar direto daqui.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDots, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AppointmentStageDialog } from "@/components/lead-stage/appointment-stage-dialog";
import { invalidateAgendamentoQueries } from "@/lib/agendamentos";
import { syncAgendamentoGoogle } from "@/lib/google-calendar.functions";
import type { StageLead } from "@/lib/leads";

/**
 * Agendamentos vinculados ao lead. Exportado para o shell da rota reaproveitar
 * a MESMA query (mesma queryKey → um único fetch) no contador da aba,
 * preservando o carregamento lazy via `enabled`.
 */
export function useAgendamentosLead(leadId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["agendamentos-lead", leadId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, titulo, data_inicio, data_fim, status, tipo, local")
        .eq("lead_id", leadId)
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

type Agendamento = {
  id: string;
  titulo: string;
  data_inicio: string;
  data_fim: string | null;
  status: string;
  tipo: string;
  local: string | null;
};

function toLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Modal simples de reagendamento: novo início/fim e status volta para "agendado". */
function ReagendarDialog({
  agendamento,
  leadId,
  onOpenChange,
}: {
  agendamento: Agendamento;
  leadId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const inicioAtual = new Date(agendamento.data_inicio);
  const [inicio, setInicio] = useState(toLocal(inicioAtual));
  const [fim, setFim] = useState(
    toLocal(
      agendamento.data_fim
        ? new Date(agendamento.data_fim)
        : new Date(inicioAtual.getTime() + 60 * 60 * 1000),
    ),
  );

  const mut = useMutation({
    mutationFn: async () => {
      const di = new Date(inicio);
      const df = new Date(fim);
      if (Number.isNaN(di.getTime())) throw new Error("Data de início inválida");
      if (Number.isNaN(df.getTime()) || df <= di)
        throw new Error("O fim deve ser depois do início");
      const { error } = await supabase
        .from("agendamentos")
        .update({
          data_inicio: di.toISOString(),
          data_fim: df.toISOString(),
          status: "remarcado",
        })
        .eq("id", agendamento.id);
      if (error) throw error;
      syncAgendamentoGoogle({ data: { agendamentoId: agendamento.id } }).catch(() => {});
    },
    onSuccess: () => {
      toast.success("Agendamento remarcado");
      invalidateAgendamentoQueries(qc, leadId);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reagendar</DialogTitle>
          <DialogDescription>{agendamento.titulo}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Novo início</Label>
            <Input
              type="datetime-local"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Novo fim</Label>
            <Input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AgendamentosTab({ leadId, lead }: { leadId: string; lead?: StageLead }) {
  const qc = useQueryClient();
  const [novoAberto, setNovoAberto] = useState(false);
  const [reagendar, setReagendar] = useState<Agendamento | null>(null);

  // A aba só monta quando está ativa (Radix desmonta conteúdo inativo),
  // então aqui a query fica sempre habilitada.
  const {
    data: agendamentosData,
    isLoading,
    isError,
    error,
    refetch,
  } = useAgendamentosLead(leadId, true);
  const agendamentos = (agendamentosData ?? []) as Agendamento[];

  const confirmar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("agendamentos")
        .update({ status: "confirmado" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agendamento confirmado com o cliente");
      invalidateAgendamentoQueries(qc, leadId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const novoBotao = lead ? (
    <Button size="sm" onClick={() => setNovoAberto(true)}>
      <Plus className="mr-1.5 h-4 w-4" weight="bold" />
      Novo agendamento
    </Button>
  ) : null;

  const dialogs = (
    <>
      {novoAberto && lead ? (
        <AppointmentStageDialog
          lead={lead}
          moverLead={false}
          onOpenChange={setNovoAberto}
          onDone={() => invalidateAgendamentoQueries(qc, leadId)}
        />
      ) : null}
      {reagendar ? (
        <ReagendarDialog
          agendamento={reagendar}
          leadId={leadId}
          onOpenChange={(o) => !o && setReagendar(null)}
        />
      ) : null}
    </>
  );

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }
  if (isError) {
    return (
      <QueryErrorState
        title="Não foi possível carregar os agendamentos."
        error={error}
        onRetry={() => refetch()}
      />
    );
  }
  if (agendamentos.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{novoBotao}</div>
        <EmptyState
          icon={CalendarDots}
          title="Sem agendamentos vinculados"
          description="Agende uma visita ou reunião para aparecer aqui."
        />
        {dialogs}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-end">{novoBotao}</div>
      <div className="rounded-xl border border-border-subtle bg-card shadow-elev-1">
        <div className="px-6 py-4 divide-y">
          {agendamentos.map((a) => (
            <div key={a.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">{a.titulo}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(a.data_inicio).toLocaleString("pt-BR")}
                  {a.local ? ` · ${a.local}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline">{a.tipo}</Badge>
                <Badge variant="outline">{a.status}</Badge>
                {a.status !== "confirmado" &&
                a.status !== "realizado" &&
                a.status !== "cancelado" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={confirmar.isPending}
                    onClick={() => confirmar.mutate(a.id)}
                  >
                    Confirmar
                  </Button>
                ) : null}
                {a.status !== "realizado" && a.status !== "cancelado" ? (
                  <Button size="sm" variant="ghost" onClick={() => setReagendar(a)}>
                    Reagendar
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
      {dialogs}
    </div>
  );
}
