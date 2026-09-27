// A trava de navegação do Modo Obrigatório.
//
// Duas camadas, as duas lendo a MESMA query (mesma chave, mesmo cache):
//   * exigirProcessoObrigatorio — no beforeLoad do shell e do /inicio: o
//     redirect acontece antes de a tela renderizar, sem piscar;
//   * useModoObrigatorio + ModoObrigatorioGuard — durante a sessão: o polling
//     de 1 minuto é o que faz a trava "contínua" (lead que chega às 15h trava
//     de novo sem o corretor precisar navegar).

import { redirect } from "@tanstack/react-router";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  lerModoObrigatorio,
  MODO_LIVRE,
  MODO_OBRIGATORIO_KEY,
  type ModoObrigatorio,
} from "@/features/modo-obrigatorio/client";
import { ROTA_OBRIGATORIO, rotaPermitidaTravado } from "@/features/modo-obrigatorio/rotas";

const STALE_MS = 30 * 1000;
const POLL_MS = 60 * 1000;

function opcoesQuery(uid: string | undefined) {
  return {
    queryKey: [MODO_OBRIGATORIO_KEY, uid ?? null] as const,
    queryFn: lerModoObrigatorio,
    staleTime: STALE_MS,
  };
}

export function idsDaLista(m: ModoObrigatorio): string[] {
  return m.itens.map((i) => i.lead_id);
}

/** beforeLoad: travado e fora das rotas permitidas → /obrigatorio. */
export async function exigirProcessoObrigatorio(
  queryClient: QueryClient,
  uid: string,
  pathname: string,
): Promise<void> {
  let modo: ModoObrigatorio;
  try {
    modo = await queryClient.fetchQuery(opcoesQuery(uid));
  } catch {
    modo = MODO_LIVRE;
  }
  if (modo.travado && !rotaPermitidaTravado(pathname, idsDaLista(modo))) {
    throw redirect({ to: ROTA_OBRIGATORIO });
  }
}

export function useModoObrigatorio() {
  const { user } = useAuth();
  return useQuery({
    ...opcoesQuery(user?.id),
    enabled: Boolean(user?.id),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });
}

/** Só o booleano e o total — para menus e cabeçalho. */
export function useTravado(): { travado: boolean; total: number } {
  const { data } = useModoObrigatorio();
  return { travado: data?.travado ?? false, total: data?.total ?? 0 };
}
