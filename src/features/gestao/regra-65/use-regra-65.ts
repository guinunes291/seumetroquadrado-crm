// Leitura da simulação da regra dos 65 (modo sombra). O escopo é decidido no
// banco: gestor vê a equipe; admin/superintendente, a casa inteira e as
// portas. Sem a RPC (banco antes da migration 20261009120600), null — o cartão
// diz "sem dado", nunca uma equipe vazia.
//
// As RPCs não estão nos types gerados; passam pela fronteira `rpc` de
// features/dashboard/queries para não gastar o budget de escapes de tipo.

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { rpc } from "@/features/dashboard/queries";
import {
  parsePortasRegra65,
  parseRegra65,
  type LinhaRegra65,
  type PortasRegra65,
} from "@/features/gestao/regra-65/derive";

export const REGRA_65_KEY = "regra-65:sombra";
export const REGRA_65_PORTAS_KEY = "regra-65:portas";

export function useRegra65Sombra(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [REGRA_65_KEY, user?.id],
    enabled: enabled && !!user,
    // A classificação percorre a carteira inteira de cada corretor: não é
    // leitura para refazer a cada foco de janela.
    staleTime: 5 * 60_000,
    queryFn: () =>
      rpcWithFallback<LinhaRegra65[] | null>(
        async () => {
          const { data, error } = await rpc("em_atendimento_sombra_v1", {});
          if (error) throw error;
          return parseRegra65(data);
        },
        () => null,
      ),
  });
}

/** Número da casa inteira — só admin/superintendente (o banco recusa o resto). */
export function useRegra65Portas(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [REGRA_65_PORTAS_KEY, user?.id],
    enabled: enabled && !!user,
    staleTime: 5 * 60_000,
    queryFn: () =>
      rpcWithFallback<PortasRegra65 | null>(
        async () => {
          const { data, error } = await rpc("em_atendimento_portas_v1", {});
          if (error) throw error;
          return parsePortasRegra65(data);
        },
        () => null,
      ),
  });
}
