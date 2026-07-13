// Faixa de cartões do dossiê: Status (com SLA e motivo de perda), Origem e
// Última interação. A query do SLA mora aqui porque só este bloco a consome
// (mesma fonte do Kanban: view leads_com_sla, filtrada no banco por corretor).

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SlaBadge } from "@/components/sla-badge";
import { TransferSlaBadge, useTransferTimeouts } from "@/components/transfer-sla-badge";
import { formatRelativeTime } from "@/lib/interacoes";
import { leadStatusLabel, motivoPerdaLabel } from "@/lib/leads";
import type { DossieLead } from "@/features/leads/dossie/types";

export function LeadStatusCards({ leadId, lead }: { leadId: string; lead: DossieLead }) {
  // SLA do lead (mesma fonte do Kanban: view leads_com_sla). O RPC aceita
  // `_corretor` e filtra no banco — evita varrer todos os leads para 1 badge.
  const transferTimeouts = useTransferTimeouts();

  const { data: slaInfo } = useQuery({
    queryKey: ["lead-sla", leadId, lead.corretor_id ?? null],
    queryFn: async () => {
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args?: Record<string, unknown>,
        ) => Promise<{
          data: Array<{ lead_id: string; sla_minutos: number }> | null;
          error: unknown;
        }>
      )("leads_com_sla", { _corretor: lead.corretor_id ?? null });
      if (error) throw error;
      return (data ?? []).find((r) => r.lead_id === leadId) ?? null;
    },
    staleTime: 60_000,
  });

  return (
    <div className="grid gap-4 md:grid-cols-3 mb-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {leadStatusLabel(lead.status)}
            </Badge>
            {lead.temperatura && <Badge variant="outline">{lead.temperatura}</Badge>}
            {slaInfo && (
              <SlaBadge
                slaMinutos={slaInfo.sla_minutos}
                referencia={
                  (lead as { data_distribuicao?: string | null }).data_distribuicao ??
                  lead.created_at
                }
              />
            )}
            <TransferSlaBadge
              leadId={lead.id}
              origem={lead.origem}
              status={lead.status}
              dataDistribuicao={
                (lead as { data_distribuicao?: string | null }).data_distribuicao ?? null
              }
              tentativas={
                (lead as { tentativas_redistribuicao?: number | null }).tentativas_redistribuicao ??
                0
              }
              timeouts={transferTimeouts}
              viaWebhook={(lead as { via_webhook?: boolean | null }).via_webhook ?? null}
            />
          </div>
          {lead.status === "perdido" &&
            (lead as { motivo_perda_categoria?: string | null }).motivo_perda_categoria && (
              <div className="text-xs text-muted-foreground">
                <Badge variant="destructive" className="text-xs">
                  Perdido —{" "}
                  {motivoPerdaLabel(
                    (lead as { motivo_perda_categoria?: string | null }).motivo_perda_categoria,
                  )}
                </Badge>
                {(lead as { motivo_perdido?: string | null }).motivo_perdido && (
                  <p className="mt-1 whitespace-pre-wrap">
                    {(lead as { motivo_perdido?: string | null }).motivo_perdido}
                  </p>
                )}
              </div>
            )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Origem</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {lead.origem}
          {lead.campanha && (
            <div className="text-xs text-muted-foreground mt-1">{lead.campanha}</div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Última interação</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {lead.ultima_interacao ? formatRelativeTime(lead.ultima_interacao) : "—"}
        </CardContent>
      </Card>
    </div>
  );
}
