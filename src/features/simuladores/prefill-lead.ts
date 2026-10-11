// O que o dossiê leva para os Simuladores. Mesma fonte da planilha de
// amortização (features/simulador-amortizacao/prefill-lead): a APROVAÇÃO DE
// CRÉDITO vigente do lead. Do lado da construtora, o que importa é o que vem
// do banco: financiamento, subsídio, FGTS e a parcela (para a renda
// comprometida). Sem aprovação, só a renda informada segue.

import { useQuery } from "@tanstack/react-query";
import { supabaseAprovacao } from "@/integrations/supabase/aprovacao-pendente";
import { isMissingBackendObject } from "@/lib/supabase-errors";
import { parseValorBR } from "@/lib/simulador";
import type { PrefillFluxo } from "@/features/simuladores/estado";

export type AprovacaoParaFluxo = {
  valor_financiamento: number | null;
  valor_subsidio: number | null;
  valor_fgts: number | null;
  valor_parcela: number | null;
  renda_familiar: number | null;
};

const positivo = (v: unknown): number | undefined => {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Pura: aprovação (se houver) + renda do lead → campos do simulador. */
export function prefillFluxoDaAprovacao(
  aprovacao: AprovacaoParaFluxo | null | undefined,
  rendaInformada: string | number | null | undefined,
): PrefillFluxo {
  const rendaLead =
    rendaInformada == null ? undefined : positivo(parseValorBR(String(rendaInformada)));
  if (!aprovacao || !positivo(aprovacao.valor_financiamento)) return { renda: rendaLead };
  return {
    financiamento: positivo(aprovacao.valor_financiamento),
    subsidio: positivo(aprovacao.valor_subsidio),
    fgts: positivo(aprovacao.valor_fgts),
    parcela: positivo(aprovacao.valor_parcela),
    // A renda da carta é a que o banco analisou; a do lead é o que ele contou.
    renda: positivo(aprovacao.renda_familiar) ?? rendaLead,
  };
}

export function useAprovacaoParaFluxo(leadId: string) {
  return useQuery({
    queryKey: ["aprovacao-para-fluxo", leadId],
    staleTime: 60_000,
    queryFn: async (): Promise<AprovacaoParaFluxo | null> => {
      const { data, error } = await supabaseAprovacao
        .from("aprovacoes_credito_vigentes")
        .select("valor_financiamento, valor_subsidio, valor_fgts, valor_parcela, renda_familiar")
        .eq("lead_id", leadId)
        .not("valor_financiamento", "is", null)
        .limit(1)
        .maybeSingle();
      // View ainda não aplicada: o botão segue funcionando, só sem prefill.
      if (error && isMissingBackendObject(error)) return null;
      if (error) throw error;
      return (data as AprovacaoParaFluxo | null) ?? null;
    },
  });
}
