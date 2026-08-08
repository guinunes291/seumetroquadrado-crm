// Lista de construtoras parceiras, com degradação segura.
//
// A fonte é a tabela `construtoras_parceiras`. Se a migração ainda não rodou no
// ambiente (ou a leitura falha), a bancada NÃO pode virar uma lista chapada:
// caímos em PARCEIRAS_PADRAO e a tela continua priorizando quem a operação
// prioriza. `origem` diz de onde veio a lista para a UI avisar quando está no
// modo de segurança (e esconder a gestão, que não teria onde gravar).

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ordenarParceiras, PARCEIRAS_PADRAO, type Parceira } from "@/lib/construtoras";

export type ParceirasResultado = {
  parceiras: Parceira[];
  origem: "banco" | "padrao";
};

/** Fallback local com a mesma forma das linhas do banco (ids sintéticos). */
export function parceirasPadrao(): Parceira[] {
  return PARCEIRAS_PADRAO.map((nome, i) => ({
    id: `padrao:${nome}`,
    nome,
    ordem: (i + 1) * 10,
    ativo: true,
  }));
}

export const CONSTRUTORAS_PARCEIRAS_KEY = ["construtoras-parceiras"] as const;

export function useConstrutorasParceiras() {
  return useQuery({
    queryKey: CONSTRUTORAS_PARCEIRAS_KEY,
    // A lista muda por decisão comercial, não a cada minuto.
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ParceirasResultado> => {
      // Escape contido: tabela ainda fora do types.ts gerado — regenerar os
      // types derrete este cast.
      const { data, error } = await supabase
        .from("construtoras_parceiras" as never)
        .select("id, nome, ordem, ativo")
        .order("ordem")
        .order("nome");
      // Tabela ausente/sem permissão não é motivo para derrubar a bancada.
      if (error) return { parceiras: parceirasPadrao(), origem: "padrao" };
      const linhas = (data ?? []) as Parceira[];
      if (linhas.length === 0) return { parceiras: parceirasPadrao(), origem: "padrao" };
      return { parceiras: ordenarParceiras(linhas), origem: "banco" };
    },
  });
}
