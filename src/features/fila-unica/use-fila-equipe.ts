// A fila vista pelo gestor — leitura de fila_equipe_v1 (uma linha por
// corretor do escopo). O escopo é decidido no banco: gestor vê a equipe,
// admin/superintendente veem a operação e a linha "Sem corretor"; corretor
// recebe 42501 e a tela nem chama. Sem a RPC (banco antigo), null — a seção
// diz "sem dado", nunca uma equipe vazia.

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { rpc } from "@/features/dashboard/queries";

const rowSchema = z.object({
  corretor_id: z.string().uuid().nullable(),
  nome: z.string(),
  carteira_ativa: z.number(),
  vencidos: z.number(),
  sem_proximo_passo: z.number(),
  fundo_parado: z.number(),
  // numeric chega como string pelo PostgREST.
  em_jogo: z.coerce.number(),
});

export type FilaEquipeRow = z.infer<typeof rowSchema>;

export function parseFilaEquipe(input: unknown): FilaEquipeRow[] {
  return z.array(rowSchema).parse(input ?? []);
}

export const FILA_UNICA_EQUIPE_KEY = "fila-unica:equipe";

export function useFilaEquipe(enabled = true) {
  const { user } = useAuth();
  useRealtimeInvalidate(["leads", "tarefas", "agendamentos"], [[FILA_UNICA_EQUIPE_KEY]]);
  return useQuery({
    queryKey: [FILA_UNICA_EQUIPE_KEY, user?.id],
    enabled: enabled && !!user,
    staleTime: 60_000,
    queryFn: () =>
      rpcWithFallback<FilaEquipeRow[] | null>(
        async () => {
          const { data, error } = await rpc("fila_equipe_v1", {});
          if (error) throw error;
          return parseFilaEquipe(data);
        },
        () => null,
      ),
  });
}
