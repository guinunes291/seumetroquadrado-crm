// Comissionamento por tier trimestral e esteira (origem do lead).
// A regra oficial roda no banco (trigger em `vendas`); aqui só exibimos a
// sugestão e pré-preenchemos o % do corretor no lançamento.
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { parsePercent, type SplitTexto } from "@/lib/comissoes";
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

/**
 * Liga a sugestão do tier ao formulário da venda: preenche o % do corretor
 * sempre que o lead, o corretor, a data ou o % total mudam. Para quem não é
 * gestão, o campo fica travado (o banco reaplica a regra no lançamento).
 */
export function useTierNoSplit(args: {
  leadId: string | null | undefined;
  corretorId: string | null | undefined;
  data: string;
  percentuais: SplitTexto;
  setPercentuais: (fn: (prev: SplitTexto) => SplitTexto) => void;
  gestao: boolean;
}) {
  const { data: sug } = useComissaoSugerida(args.leadId, args.corretorId, args.data);
  const total = parsePercent(args.percentuais.total);
  const { setPercentuais } = args;
  useEffect(() => {
    if (!sug || total === null) return;
    const v = percentualCorretor(total, sug.pct_share).toFixed(2);
    setPercentuais((prev) => (prev.corretor === v ? prev : { ...prev, corretor: v }));
  }, [sug, total, setPercentuais]);

  const infoTier = sug
    ? `${TIER_LABEL[sug.tier] ?? sug.tier} (${sug.vendas_trimestre_anterior} vendas no trimestre anterior) · ${ESTEIRA_LABEL[sug.esteira] ?? sug.esteira}: corretor recebe ${sug.pct_share}% da comissão total.`
    : null;
  return {
    infoTier,
    travados: args.gestao ? [] : (["corretor"] as Array<keyof SplitTexto>),
    /** Corretor vê só o próprio % do tier; a gestão ajusta o % da imobiliária na aprovação. */
    somenteTier: args.gestao
      ? null
      : {
          pctShare: sug?.pct_share ?? null,
          tier: sug ? (TIER_LABEL[sug.tier] ?? sug.tier) : null,
          esteira: sug ? (ESTEIRA_LABEL[sug.esteira] ?? sug.esteira) : null,
        },
  };
}
