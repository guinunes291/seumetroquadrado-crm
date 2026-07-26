import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rpcWithFallback } from "@/lib/supabase-errors";
import {
  montarPainelDegradado,
  normalizarPainelDia,
  type PainelDia,
  type SlaFallbackRow,
  type UrgenteFallbackRow,
} from "./derive";

const rpc = (name: string, args: Record<string, unknown>) => (supabase as any).rpc(name, args);

/**
 * Feed do Painel do Dia. Caminho principal: RPC gestao_painel_dia (migration
 * 20260727112000). Sem a migration aplicada, degrada para a composição de
 * leads_sla_pendentes + dashboard_leads_urgentes — feed parcial com aviso.
 */
export function usePainelDia(enabled = true) {
  return useQuery({
    queryKey: ["gestao:painel-dia"],
    enabled,
    staleTime: 30_000,
    refetchInterval: 2 * 60_000,
    queryFn: async (): Promise<PainelDia> =>
      rpcWithFallback(
        async () => {
          const { data, error } = await rpc("gestao_painel_dia", {});
          if (error) throw error;
          return normalizarPainelDia(data);
        },
        async () => {
          const [sla, urgentes] = await Promise.all([
            rpc("leads_sla_pendentes", { _corretor: null }),
            rpc("dashboard_leads_urgentes", { _corretor: null, _min_minutos: 30 }),
          ]);
          if (sla.error) throw sla.error;
          if (urgentes.error) throw urgentes.error;
          return montarPainelDegradado(
            (sla.data ?? []) as SlaFallbackRow[],
            (urgentes.data ?? []) as UrgenteFallbackRow[],
          );
        },
      ),
  });
}
