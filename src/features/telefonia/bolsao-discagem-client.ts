// A sessão de discagem do corretor sobre o BOLSÃO, como o servidor a
// devolve: anonimizada (telefone MASCARADO, sem dono anterior) e com o que
// já aconteceu em cada lead (discado / atendeu / entrou na carteira).
//
// A fila NÃO nasce no navegador: a tcplus-campanha reserva o lote pela RPC
// discador_bolsao_reservar_v1 (service_role) e o corretor só lê a própria
// sessão por bolsao_discagem_minha_v1. A RPC não está nos types gerados —
// passa pela fronteira `rpc` de features/dashboard/queries, como o Bolsão
// já faz, e o retorno é validado com zod FAIL-CLOSED.
//
// Banco antigo (sem a migration): `rpcWithFallback` devolve null e a tela
// diz "indisponível", nunca "sessão vazia".

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { rpc } from "@/features/dashboard/queries";

export const DISCAGEM_KEY = "bolsao-discagem-minha";

const linhaSchema = z.object({
  lead_id: z.string().uuid(),
  nome: z.string(),
  telefone_mascarado: z.string().nullable(),
  status: z.string(),
  projeto_nome: z.string().nullable(),
  dias_parado: z.number().int(),
  modo: z.enum(["campanha", "um_a_um"]),
  list_id: z.string().nullable(),
  reservado_em: z.string(),
  expira_em: z.string(),
  assumido_em: z.string().nullable(),
  discado: z.boolean(),
  atendido: z.boolean(),
});

export type LinhaDiscagem = z.infer<typeof linhaSchema>;

export function parseDiscagem(input: unknown): LinhaDiscagem[] {
  return z.array(linhaSchema).parse(input ?? []);
}

export async function listarMinhaDiscagem(): Promise<LinhaDiscagem[] | null> {
  return rpcWithFallback<LinhaDiscagem[] | null>(
    async () => {
      const { data, error } = await rpc("bolsao_discagem_minha_v1", {});
      if (error) throw error;
      return parseDiscagem(data);
    },
    () => null,
  );
}

export type ResumoDiscagem = {
  total: number;
  discados: number;
  atendidos: number;
  naCarteira: number;
};

export function resumoDiscagem(linhas: readonly LinhaDiscagem[]): ResumoDiscagem {
  let discados = 0;
  let atendidos = 0;
  let naCarteira = 0;
  for (const l of linhas) {
    if (l.discado) discados += 1;
    if (l.atendido) atendidos += 1;
    if (l.assumido_em) naCarteira += 1;
  }
  return { total: linhas.length, discados, atendidos, naCarteira };
}

/** O próximo lead a trabalhar no um a um: o primeiro ainda não discado; se
 *  todos já foram, o primeiro da lista. */
export function indiceInicial(linhas: readonly LinhaDiscagem[]): number {
  const i = linhas.findIndex((l) => !l.discado);
  return i === -1 ? 0 : i;
}

/**
 * A sessão viva do corretor. Reconsulta a cada 15 s enquanto há reserva
 * (o webhook muda discado/atendido/assumido sem o navegador saber) e o
 * realtime de `chamadas` (no chamador) encurta esse intervalo.
 */
export function useMinhaDiscagem() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [DISCAGEM_KEY, user?.id],
    enabled: !!user,
    staleTime: 5_000,
    refetchInterval: (q) => ((q.state.data?.length ?? 0) > 0 ? 15_000 : false),
    refetchIntervalInBackground: false,
    queryFn: listarMinhaDiscagem,
  });
}
