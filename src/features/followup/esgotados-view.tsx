// Leads com a régua esgotada: completaram todos os toques sem responder.
// A regra assentada (2026-07-17) proíbe auto-perder por falta de contato —
// esta lista existe para a decisão HUMANA: reativar a régua ou descartar
// com motivo (o fluxo perdido padrão, que redistribui quando cabe).

import { useState } from "react";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { cn } from "@/lib/utils";
import { origemLabel } from "@/lib/origem";
import {
  LEAD_STATUS_BADGE_TONE,
  LEAD_STATUS_LABEL,
  MOTIVO_PERDA_LABEL,
  type LeadStatus,
} from "@/lib/leads";
import { REGUA_PADRAO } from "@/lib/regua-followup";
import { carregarRegua, reativarFollowUp } from "@/features/followup/fila-client";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { LeadStageModals, type PerdidoState } from "@/components/lead-stage/lead-stage-modals";
import { Ban, CheckCircle2, RotateCcw } from "lucide-react";

// A coluna followup_esgotado_em é nova (migration followup_regua) e ainda não
// está nos types gerados — o parse zod fail-closed é a fronteira de tipo.
const esgotadoSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  telefone: z.string(),
  status: z.string(),
  temperatura: z.string().nullable(),
  origem: z.string(),
  projeto_nome: z.string().nullable(),
  corretor_id: z.string().uuid().nullable(),
  observacoes: z.string().nullable(),
  followup_esgotado_em: z.string(),
});

type LeadEsgotado = z.infer<typeof esgotadoSchema>;

function esgotadoHa(iso: string): string {
  const dias = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(dias) || dias <= 0) return "esgotado hoje";
  if (dias === 1) return "esgotado há 1 dia";
  return `esgotado há ${dias} dias`;
}

export function EsgotadosView() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [perdidoLead, setPerdidoLead] = useState<PerdidoState>(null);

  const reguaQ = useQuery({
    queryKey: ["followup:regua"],
    staleTime: 5 * 60_000,
    queryFn: carregarRegua,
  });
  const maxToques = (reguaQ.data ?? REGUA_PADRAO).maxToques;

  const esgotadosQ = useQuery({
    queryKey: ["followup:esgotados", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<LeadEsgotado[]> => {
      // Sem filtro de corretor: a RLS recorta a carteira (gestão enxerga o
      // escopo do time pela mesma policy das demais listas de leads).
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, nome, telefone, status, temperatura, origem, projeto_nome, corretor_id, observacoes, followup_esgotado_em",
        )
        .eq("na_lixeira", false)
        .is("deleted_at", null)
        .not("followup_esgotado_em", "is", null)
        .not("status", "in", "(contrato_fechado,pos_venda,perdido)")
        .order("followup_esgotado_em", { ascending: false })
        .limit(200);
      if (error) throw error;
      return z.array(esgotadoSchema).parse(data ?? []);
    },
  });

  useRealtimeInvalidate("leads", [["followup:esgotados"]]);

  const reativar = useMutation({
    mutationFn: (leadId: string) => reativarFollowUp(leadId),
    onSuccess: () => {
      toast.success("Régua reativada — o lead volta à fila do dia para um novo ciclo.");
      void qc.invalidateQueries({ queryKey: ["followup:esgotados"] });
      void qc.invalidateQueries({ queryKey: ["followup:fila"] });
      void qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível reativar a régua."),
  });

  const leads = esgotadosQ.data ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Leads que completaram os {maxToques} toques sem responder. Ninguém é perdido
        automaticamente: reative a régua para um novo ciclo ou descarte com motivo.
      </p>

      {esgotadosQ.isError ? (
        <QueryErrorState
          title="Não foi possível carregar os leads esgotados."
          error={esgotadosQ.error}
          onRetry={() => void esgotadosQ.refetch()}
        />
      ) : esgotadosQ.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Carregando">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : leads.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nenhuma régua esgotada"
          description={`Quando um lead completar os ${maxToques} toques sem responder, ele aparece aqui para a sua decisão: reativar ou descartar.`}
          className="py-16"
        />
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => (
            <Card key={lead.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="truncate font-semibold">{lead.nome}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={cn(LEAD_STATUS_BADGE_TONE[lead.status as LeadStatus])}
                    >
                      {LEAD_STATUS_LABEL[lead.status as LeadStatus] ?? lead.status}
                    </Badge>
                    <TemperatureChip temperatura={lead.temperatura} pulse={false} size="sm" />
                    <Badge variant="secondary" className="bg-destructive/15 text-destructive">
                      {maxToques}/{maxToques} toques
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {esgotadoHa(lead.followup_esgotado_em)} · {origemLabel(lead.origem)}
                    {lead.projeto_nome ? ` · ${lead.projeto_nome}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={reativar.isPending}
                    onClick={() => reativar.mutate(lead.id)}
                  >
                    <RotateCcw className="mr-1 h-4 w-4" /> Reativar régua
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11 border-destructive/40 text-destructive hover:bg-destructive/10"
                    title={`Sugestão de motivo: "${MOTIVO_PERDA_LABEL.sem_contato}"`}
                    onClick={() =>
                      setPerdidoLead({
                        id: lead.id,
                        nome: lead.nome,
                        status: lead.status,
                        corretor_id: lead.corretor_id,
                        projeto_nome: lead.projeto_nome,
                        observacoes: lead.observacoes,
                      })
                    }
                  >
                    <Ban className="mr-1 h-4 w-4" /> Descartar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <LeadStageModals
        modalState={null}
        onModalOpenChange={() => {}}
        perdidoLead={perdidoLead}
        onPerdidoOpenChange={(o) => !o && setPerdidoLead(null)}
        onDone={() => {
          void qc.invalidateQueries({ queryKey: ["followup:esgotados"] });
          void qc.invalidateQueries({ queryKey: ["nav-badges"] });
        }}
      />
    </div>
  );
}
