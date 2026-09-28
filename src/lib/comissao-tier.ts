// Comissionamento por tier trimestral e esteira (origem do lead).
// A regra oficial roda no banco (trigger em `vendas`); aqui só exibimos a
// sugestão e pré-preenchemos o % do corretor no lançamento.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const TIER_LABEL: Record<string, string> = {
  tier_1: "Tier 1",
  tier_2: "Tier 2",
  tier_3: "Tier 3",
  elite: "Tier Elite",
};

export const ESTEIRA_LABEL: Record<string, string> = {
  lead_empresa: "Lead da empresa",
  lead_proprio: "Lead próprio",
  sdr: "Esteira extra (SDR)",
  marquinhos: "Esteira Marquinhos (IA)",
};

export type ComissaoSugerida = {
  tier: string;
  esteira: string;
  pct_share: number;
  vendas_trimestre_anterior: number;
};

/** % do imóvel do corretor = % total da venda × participação do tier/esteira. */
export function percentualCorretor(totalPct: number, share: number): number {
  return Math.round(totalPct * share * 100) / 10000;
}

export function useComissaoSugerida(
  leadId: string | null | undefined,
  corretorId: string | null | undefined,
  data: string,
) {
  return useQuery({
    queryKey: ["comissao-sugerida", leadId, corretorId, data],
    enabled: !!leadId && !!corretorId,
    queryFn: async (): Promise<ComissaoSugerida | null> => {
      const { data: rows, error } = await supabase.rpc("comissao_sugerida_corretor", {
        p_lead: leadId!,
        p_corretor: corretorId!,
        p_data: data || undefined,
      });
      if (error) throw error;
      const r = (rows as ComissaoSugerida[] | null)?.[0];
      return r ? { ...r, pct_share: Number(r.pct_share) } : null;
    },
  });
}
