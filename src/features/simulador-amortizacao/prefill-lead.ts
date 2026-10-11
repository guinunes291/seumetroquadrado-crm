// Dados do contrato que o dossiê leva para a planilha de amortização. A fonte
// é a APROVAÇÃO DE CRÉDITO vigente do lead (view aprovacoes_credito_vigentes,
// preenchida pelo corretor ou lida do print da Caixa): valor do financiamento,
// taxa, prazo e sistema são exatamente os três dados que a planilha pede.
// Sem aprovação, só a renda informada segue — o resto o corretor digita.

import { useQuery } from "@tanstack/react-query";
import { supabaseAprovacao } from "@/integrations/supabase/aprovacao-pendente";
import { isMissingBackendObject } from "@/lib/supabase-errors";
import { parseValorBR } from "@/lib/simulador";
import type { PrefillSimulador } from "@/features/simulador-amortizacao/estado";

export type AprovacaoParaPlanilha = {
  valor_financiamento: number | null;
  taxa_juros_anual: number | null;
  prazo_meses: number | null;
  sistema_amortizacao: string | null;
  renda_familiar: number | null;
  valor_imovel_simulacao: number | null;
};

const positivo = (v: unknown): number | undefined => {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Pura: aprovação (se houver) + renda do lead → parâmetros da planilha. */
export function prefillDaAprovacao(
  aprovacao: AprovacaoParaPlanilha | null | undefined,
  rendaInformada: string | number | null | undefined,
): PrefillSimulador {
  const rendaLead =
    rendaInformada == null ? undefined : positivo(parseValorBR(String(rendaInformada)));
  if (!aprovacao || !positivo(aprovacao.valor_financiamento)) return { renda: rendaLead };
  const sistema = String(aprovacao.sistema_amortizacao ?? "").toUpperCase();
  return {
    financiamento: positivo(aprovacao.valor_financiamento),
    taxa: positivo(aprovacao.taxa_juros_anual),
    prazo: positivo(aprovacao.prazo_meses),
    sistema: sistema === "SAC" || sistema === "PRICE" ? sistema : undefined,
    // A renda da carta é a que o banco analisou; a do lead é o que ele contou.
    renda: positivo(aprovacao.renda_familiar) ?? rendaLead,
    // "Valor do imóvel" da simulação do banco: é sobre ele que o banco calcula
    // o DFI daquela simulação, então usá-lo faz o seguro bater com a carta.
    avaliacao: positivo(aprovacao.valor_imovel_simulacao),
  };
}

export function useAprovacaoParaPlanilha(leadId: string) {
  return useQuery({
    queryKey: ["aprovacao-para-planilha", leadId],
    staleTime: 60_000,
    queryFn: async (): Promise<AprovacaoParaPlanilha | null> => {
      const { data, error } = await supabaseAprovacao
        .from("aprovacoes_credito_vigentes")
        .select(
          "valor_financiamento, taxa_juros_anual, prazo_meses, sistema_amortizacao, renda_familiar, valor_imovel_simulacao",
        )
        .eq("lead_id", leadId)
        .not("valor_financiamento", "is", null)
        .limit(1)
        .maybeSingle();
      // View ainda não aplicada: o botão segue funcionando, só sem prefill.
      if (error && isMissingBackendObject(error)) return null;
      if (error) throw error;
      return (data as AprovacaoParaPlanilha | null) ?? null;
    },
  });
}
