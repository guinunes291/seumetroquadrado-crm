// Leitura ÚNICA de public.app_flags para toda a aplicação.
//
// Uma query só (queryKey ["app-flags"]) em vez de uma por chave: a tabela tem
// um punhado de linhas e três telas diferentes perguntam por ela no mesmo
// render. `useFlagHigiene` continua existindo à parte de propósito, com outra
// política de falha (ver abaixo).
//
// POLÍTICA DA ACADEMIA, que é diferente da Higiene:
//   • linha AUSENTE = DESLIGADA. A migration da Academia pode não ter sido
//     aplicada ainda no ambiente vivo; nesse caso a tela não pode aparecer.
//     (A Higiene faz o contrário: falha de leitura devolve LIGADA, porque lá
//     sumir em silêncio uma tela de gestão já protegida por papel é pior.)
//   • CARREGANDO não é desligada. Tratar "ainda não sei" como "off" faria o
//     menu piscar a cada visita.
//   • ERRO de leitura é ERRO. Quem consome numa rota mostra QueryErrorState,
//     nunca tela em branco nem redirect silencioso.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const APP_FLAGS_KEY = ["app-flags"] as const;

export type AppFlags = Record<string, boolean>;

export function useAppFlags() {
  return useQuery<AppFlags>({
    queryKey: APP_FLAGS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("app_flags").select("chave, ativo");
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((f) => [f.chave, f.ativo]));
    },
    staleTime: 5 * 60 * 1000,
  });
}

export type EstadoFlag = {
  /** Só `true` quando a linha existe E está ativa. */
  ligada: boolean;
  carregando: boolean;
  erro: unknown;
  recarregar: () => void;
};

export function useAppFlag(chave: string): EstadoFlag {
  const q = useAppFlags();
  return {
    ligada: q.data?.[chave] ?? false,
    carregando: q.isPending,
    erro: q.error,
    recarregar: () => void q.refetch(),
  };
}
