// Badges de pendência da sidebar. Uma chamada agregada (nav_pendencias,
// SECURITY INVOKER — a RLS recorta por papel) a cada 2 min. Se a RPC ainda
// não existe no ambiente, devolve null e os badges somem — nada quebra.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { rpcWithFallback } from "@/lib/supabase-errors";

export type NavBadges = {
  atendimento: number;
  tarefasVencidas: number;
  agendaHoje: number;
  aprovacoes: number;
};

function parseNavBadges(raw: unknown): NavBadges | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    atendimento: num(o.atendimento),
    tarefasVencidas: num(o.tarefas_vencidas),
    agendaHoje: num(o.agenda_hoje),
    aprovacoes: num(o.aprovacoes),
  };
}

export function useNavBadges(): NavBadges | null {
  const { user } = useAuth();

  const q = useQuery({
    queryKey: ["nav-badges", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          // RPC fora dos types gerados (migration pode não estar aplicada).
          const res = (await supabase.rpc("nav_pendencias" as never)) as {
            data: unknown;
            error: { code?: string; message?: string } | null;
          };
          if (res.error) throw res.error;
          return parseNavBadges(res.data);
        },
        () => null,
      ),
  });

  return q.data ?? null;
}

export { parseNavBadges };
