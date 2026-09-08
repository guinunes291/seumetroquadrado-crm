// Uma leitura atômica por mês: não mistura ranking novo com metas antigas.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { agoraSaoPaulo, dateKey, mesRange } from "@/lib/periodo";
import { snapshotSchema } from "./ranking-campeonato";

export const RANKING_QUERY_KEY = "ranking-campeonato";
export function useHojeSaoPaulo() {
  const [hoje, setHoje] = useState(() => agoraSaoPaulo());
  useEffect(() => {
    const timer = setInterval(() => {
      const agora = agoraSaoPaulo();
      setHoje((atual) => (dateKey(atual) === dateKey(agora) ? atual : agora));
    }, 15_000);
    return () => clearInterval(timer);
  }, []);
  return hoje;
}

export function useRankingData(args: { ano: number; mes: number }) {
  const { user } = useAuth();
  const range = useMemo(() => mesRange(args.ano, args.mes), [args.ano, args.mes]);
  const inicio = dateKey(range.from);
  const fim = dateKey(range.to);
  const query = useQuery({
    queryKey: [RANKING_QUERY_KEY, user?.id, inicio, fim],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ranking_campeonato", {
        _inicio: inicio,
        _fim: fim,
      });
      if (error) throw error;
      const snapshot = snapshotSchema.parse(data);
      if (snapshot.inicio !== inicio || snapshot.fim !== fim)
        throw new Error("O período retornado não corresponde ao solicitado.");
      return snapshot;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    retry: 2,
  });
  useRealtimeInvalidate(
    [
      "atividades_diarias",
      "vendas",
      "metas",
      "configuracao_pontuacao",
      "profiles",
      "equipes",
      "user_roles",
    ],
    [[RANKING_QUERY_KEY]],
    { debounceMs: 2000 },
  );
  return query;
}
export type RankingData = ReturnType<typeof useRankingData>;
