// Higiene do Funil — leitura (Fatia 1).
//
// Regra que rege este arquivo: TODA contagem vem de view no banco, nunca de
// soma no cliente. São ~55 mil leads vivos — contar no navegador pagina errado,
// e quando o motor de SLA chegar ele precisa ler exatamente o mesmo número que
// a tela mostra, para que divergência seja impossível por construção em vez de
// virar investigação.
//
// Segunda regra: falha de leitura NUNCA pode virar lista vazia. Uma query que
// explode e uma fila realmente limpa parecem a mesma coisa na tela, e a
// segunda é uma notícia boa. Por isso `selecionar` lança em vez de devolver
// [] — o componente renderiza QueryErrorState, não EmptyState.

import { useQuery } from "@tanstack/react-query";
import {
  supabaseHigiene,
  type HigieneFilaRow,
  type HigienePastaRow,
  type HigieneResumoRow,
} from "@/integrations/supabase/higiene-pendente";

/** Converte erro do PostgREST em exceção. Ver segunda regra acima. */
async function selecionar<T>(
  consulta: PromiseLike<{ data: T | null; error: unknown }>,
): Promise<T> {
  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? null) as T;
}

/** Cabeçalho da tela. */
export function useHigieneResumo() {
  return useQuery({
    queryKey: ["higiene", "resumo"],
    queryFn: () =>
      selecionar<HigieneResumoRow>(supabaseHigiene.from("v_higiene_resumo").select("*").single()),
    // A base se move durante o dia (distribuição a cada 5 min, SDR e follow-up
    // diários). 5 min mantém o cabeçalho honesto sem martelar o banco.
    refetchInterval: 5 * 60 * 1000,
  });
}

export type FiltroFila = {
  corretorId?: string | null;
  /** Quando false, esconde leads cujo relógio veio de escrita em lote. */
  incluirLote?: boolean;
  /** Quando false, esconde leads que nunca foram tocados. */
  incluirNuncaTocado?: boolean;
};

/**
 * A fila de ação. Ordenada por prioridade de fase e depois por tempo parado —
 * a mesma régua de PESO_ETAPA (src/lib/priority.ts), aplicada no banco.
 *
 * O teto de 300 é deliberado: esta tela existe para o gestor AGIR hoje, não
 * para paginar milhares de linhas. Os totais honestos vivem no cabeçalho, que
 * conta a base inteira no banco.
 */
export function useHigieneFila(filtro: FiltroFila = {}) {
  const { corretorId = null, incluirLote = true, incluirNuncaTocado = true } = filtro;
  return useQuery({
    queryKey: ["higiene", "fila", corretorId, incluirLote, incluirNuncaTocado],
    queryFn: () => {
      let q = supabaseHigiene
        .from("v_higiene_fila")
        .select("*")
        .order("prioridade", { ascending: true })
        .order("dias_parado", { ascending: false })
        .limit(300);
      if (corretorId) q = q.eq("corretor_id", corretorId);
      if (!incluirLote) q = q.eq("escrita_em_lote", false);
      if (!incluirNuncaTocado) q = q.eq("nunca_tocado", false);
      return selecionar<HigieneFilaRow[]>(q);
    },
  });
}

/** Pastas com documento pendente: venda quase feita, parada por papel. */
export function useHigienePastas() {
  return useQuery({
    queryKey: ["higiene", "pastas"],
    queryFn: () =>
      selecionar<HigienePastaRow[]>(
        supabaseHigiene
          .from("v_higiene_pastas_travadas")
          .select("*")
          .order("dias_sem_movimento", { ascending: false })
          .limit(200),
      ),
  });
}

/**
 * Feature flag da tela. `undefined` enquanto carrega — o consumidor NÃO pode
 * tratar "ainda não sei" como "desligada", ou a tela pisca vazia a cada visita.
 *
 * Falha de leitura devolve LIGADA de propósito: a alternativa seria uma tela
 * de gestão que some sozinha quando o banco tem um soluço, e sumir em silêncio
 * é pior do que aparecer indevidamente numa rota já protegida por papel.
 */
export function useFlagHigiene() {
  return useQuery({
    queryKey: ["app-flags", "higiene_funil"],
    queryFn: async () => {
      const { data, error } = await supabaseHigiene
        .from("app_flags")
        .select("ativo")
        .eq("chave", "higiene_funil")
        .maybeSingle();
      if (error) return true;
      return data?.ativo ?? true;
    },
    staleTime: 5 * 60 * 1000,
  });
}
