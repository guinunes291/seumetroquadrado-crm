// O nome de um corretor pelo id — para a gestão que abre a tela de outro
// corretor (`?corretor=`) ver de quem é ("Vendo a base de Marina Costa").
// Leitura simples em `profiles`; a RLS decide se a gestão pode ver.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useNomeDoCorretor(corretorId: string | undefined) {
  return useQuery({
    queryKey: ["nome-do-corretor", corretorId],
    enabled: !!corretorId,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", corretorId as string)
        .maybeSingle();
      if (error) throw error;
      return data?.nome ?? null;
    },
  });
}
