// Quem assina o PDF da planilha: o corretor logado (nome, telefone e CRECI do
// perfil), no mesmo padrão do comparativo da Vitrine. Sem perfil, o PDF sai
// sem o bloco do consultor em vez de quebrar.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { ConsultorPdf } from "@/features/simulador-amortizacao/planilha-pdf";

export function useConsultorPdf() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["planilha-consultor", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ConsultorPdf | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("nome, telefone, creci")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}
