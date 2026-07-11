import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type PendingSale = {
  id: string;
  lead_id: string | null;
  corretor_id: string | null;
  projeto_nome: string | null;
  valor_venda: number;
  data_assinatura: string;
  created_at: string;
  leadNome: string;
  corretorNome: string;
};

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function PendingSalesApproval() {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<{
    sale: PendingSale;
    type: "aprovada" | "rejeitada";
  } | null>(null);
  const [reason, setReason] = useState("");

  const query = useQuery({
    queryKey: ["vendas", "pendentes-aprovacao"],
    queryFn: async (): Promise<PendingSale[]> => {
      const { data: sales, error } = await supabase
        .from("vendas")
        .select("id, lead_id, corretor_id, projeto_nome, valor_venda, data_assinatura, created_at")
        .eq("status_venda", "pendente")
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) throw error;

      const leadIds = [
        ...new Set((sales ?? []).flatMap((sale) => (sale.lead_id ? [sale.lead_id] : []))),
      ];
      const corretorIds = [
        ...new Set((sales ?? []).flatMap((sale) => (sale.corretor_id ? [sale.corretor_id] : []))),
      ];
      const [leadsResult, profilesResult] = await Promise.all([
        leadIds.length
          ? supabase.from("leads").select("id, nome").in("id", leadIds)
          : Promise.resolve({ data: [], error: null }),
        corretorIds.length
          ? supabase.from("profiles").select("id, nome").in("id", corretorIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (leadsResult.error) throw leadsResult.error;
      if (profilesResult.error) throw profilesResult.error;
      const leadNames = new Map((leadsResult.data ?? []).map((lead) => [lead.id, lead.nome]));
      const profileNames = new Map(
        (profilesResult.data ?? []).map((profile) => [profile.id, profile.nome]),
      );
      return (sales ?? []).map((sale) => ({
        ...sale,
        leadNome: (sale.lead_id && leadNames.get(sale.lead_id)) || "Lead não identificado",
        corretorNome: (sale.corretor_id && profileNames.get(sale.corretor_id)) || "Sem corretor",
      }));
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!decision) throw new Error("Decisão inválida");
      if (decision.type === "rejeitada" && !reason.trim()) {
        throw new Error("Informe o motivo da rejeição.");
      }
      const { error } = await supabase.rpc("aprovar_venda", {
        p_decisao: decision.type,
        p_motivo: decision.type === "rejeitada" ? reason.trim() : null,
        p_venda_id: decision.sale.id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(decision?.type === "aprovada" ? "Venda aprovada" : "Venda rejeitada");
      setDecision(null);
      setReason("");
      await Promise.all(
        [["vendas"], ["comissoes"], ["leads"], ["leads-kanban"], ["ranking"], ["metricas"]].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const total = useMemo(
    () => (query.data ?? []).reduce((sum, sale) => sum + Number(sale.valor_venda || 0), 0),
    [query.data],
  );

  if (query.isError) {
    return (
      <Card>
        <CardContent role="alert" className="space-y-3 py-6 text-sm">
          <p className="font-medium">Não foi possível carregar as vendas pendentes.</p>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (!query.isLoading && (query.data?.length ?? 0) === 0) return null;

  return (
    <>
      <Card className="border-amber-500/40">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock3 className="h-4 w-4 text-amber-600" aria-hidden="true" />
              Aprovações de venda
            </CardTitle>
            {!query.isLoading && (
              <Badge variant="secondary">
                {query.data?.length ?? 0} pendente(s) · {money(total)}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2" aria-live="polite">
          {query.isLoading ? (
            <div className="h-20 animate-pulse rounded-md bg-muted" />
          ) : (
            query.data?.map((sale) => (
              <div
                key={sale.id}
                className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{sale.leadNome}</p>
                  <p className="text-xs text-muted-foreground">
                    {sale.corretorNome} · {sale.projeto_nome ?? "Sem projeto"} ·{" "}
                    {new Date(`${sale.data_assinatura}T12:00:00`).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <strong className="text-sm tabular-nums">{money(sale.valor_venda)}</strong>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDecision({ sale, type: "rejeitada" })}
                  >
                    <XCircle className="h-4 w-4" aria-hidden="true" /> Rejeitar
                  </Button>
                  <Button size="sm" onClick={() => setDecision({ sale, type: "aprovada" })}>
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Aprovar
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!decision}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) {
            setDecision(null);
            setReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {decision?.type === "aprovada" ? "Aprovar esta venda?" : "Rejeitar esta venda?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {decision?.type === "aprovada"
                ? "A aprovação fechará o lead e lançará ranking, VGV e comissões de forma atômica."
                : "A rejeição não gera comissão nem altera as metas."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {decision?.type === "rejeitada" && (
            <div className="space-y-1.5">
              <Label htmlFor="sale-rejection-reason">Motivo da rejeição *</Label>
              <Textarea
                id="sale-rejection-reason"
                autoFocus
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending || (decision?.type === "rejeitada" && !reason.trim())}
              onClick={(event) => {
                event.preventDefault();
                mutation.mutate();
              }}
            >
              {mutation.isPending ? "Processando…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
