// Consulta das negociações quentes. RLS decide o escopo (gestor vê o time,
// corretor só os seus); aqui só filtramos as etapas perto da venda. O preço
// "a partir de" vem do projeto pelo embed tipado — sem RPC nem escape.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ETAPAS_QUENTES, type LeadQuenteRow } from "./derive";

/** Teto da busca: dos mais recentemente tocados; o ranking corta para 6. */
const LIMITE_BUSCA = 200;

export function useLeadsQuentes(enabled = true) {
  return useQuery({
    queryKey: ["negociacoes-quentes"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<LeadQuenteRow[]> => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, nome, status, temperatura, ultima_interacao, created_at, proximo_followup, projeto_nome, corretor_id, projeto:projetos!leads_projeto_id_fkey(preco_a_partir)",
        )
        .in("status", [...ETAPAS_QUENTES])
        .eq("na_lixeira", false)
        .is("deleted_at", null)
        .order("ultima_interacao", { ascending: false, nullsFirst: false })
        .limit(LIMITE_BUSCA);
      if (error) throw error;
      return (data ?? []).flatMap((r) => {
        const etapa = ETAPAS_QUENTES.find((e) => e === r.status);
        if (!etapa) return [];
        return [
          {
            id: r.id,
            nome: r.nome,
            status: etapa,
            temperatura: r.temperatura,
            ultima_interacao: r.ultima_interacao,
            created_at: r.created_at,
            proximo_followup: r.proximo_followup,
            projeto_nome: r.projeto_nome,
            corretor_id: r.corretor_id,
            preco_a_partir: r.projeto?.preco_a_partir ?? null,
          },
        ];
      });
    },
  });
}
