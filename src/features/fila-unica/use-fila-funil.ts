// Funil das etapas — leitura de fila_funil_v1 (safra de N dias + base inteira
// numa chamada). O escopo é decidido no banco: corretor vê a própria carteira,
// gestão vê a operação que o papel alcança. Sem a RPC (banco antigo), a
// query devolve null e a tela diz "sem dado" — nunca um funil vazio fingindo
// que a carteira está zerada.

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { rpc } from "@/features/dashboard/queries";
import type { FunilRow } from "@/features/fila-unica/funil-derive";

const rowSchema = z.object({
  recorte: z.string(),
  etapa: z.string(),
  ordem: z.number(),
  quantidade: z.number(),
  parados: z.number(),
});

export function parseFunilRows(input: unknown): FunilRow[] {
  return z.array(rowSchema).parse(input ?? []);
}

export const FILA_UNICA_FUNIL_KEY = "fila-unica:funil";

export function useFilaFunil(dias = 30, corretorId: string | null = null) {
  const { user } = useAuth();
  // O funil muda quando um lead muda de etapa ou recebe contato — e isso pode
  // acontecer nesta mesma tela. As ações da página invalidam a chave; o
  // realtime cobre o que acontece em outra aba ou no bot.
  useRealtimeInvalidate(["leads", "interacoes"], [[FILA_UNICA_FUNIL_KEY]]);
  return useQuery({
    queryKey: [FILA_UNICA_FUNIL_KEY, user?.id, dias, corretorId],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: () =>
      rpcWithFallback<FunilRow[] | null>(
        async () => {
          const { data, error } = await rpc("fila_funil_v1", {
            _dias: dias,
            _corretor: corretorId,
          });
          if (error) throw error;
          return parseFunilRows(data);
        },
        () => null,
      ),
  });
}
