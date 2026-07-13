// Aba Agendamentos do dossiê do lead: lista somente-leitura dos agendamentos
// vinculados. A query é lazy — o shell da rota só habilita quando a aba abre
// (evita fetch em toda visita ao dossiê).

import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";

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
        .select("id, titulo, data_inicio, status, tipo, local")
        .eq("lead_id", leadId)
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function AgendamentosTab({ leadId }: { leadId: string }) {
  // A aba só monta quando está ativa (Radix desmonta conteúdo inativo),
  // então aqui a query fica sempre habilitada.
  const {
    data: agendamentosData,
    isLoading,
    isError,
    error,
    refetch,
  } = useAgendamentosLead(leadId, true);
  const agendamentos = agendamentosData ?? [];

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
      <EmptyState
        icon={CalendarDays}
        title="Sem agendamentos vinculados"
        description="Agende uma visita ou reunião para aparecer aqui."
      />
    );
  }
  return (
    <div className="rounded-xl border border-border-subtle bg-card shadow-elev-1">
      <div className="px-6 py-4 divide-y">
        {agendamentos.map((a) => (
          <div key={a.id} className="py-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{a.titulo}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(a.data_inicio).toLocaleString("pt-BR")}
                {a.local ? ` · ${a.local}` : ""}
              </div>
            </div>
            <div className="flex gap-1">
              <Badge variant="outline">{a.tipo}</Badge>
              <Badge variant="outline">{a.status}</Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
