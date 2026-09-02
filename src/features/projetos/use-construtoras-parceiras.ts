// Lista de construtoras parceiras, com degradação segura.
//
// A fonte é a tabela `construtoras_parceiras`. Se a migração ainda não rodou no
// ambiente (ou a leitura falha), a prateleira NÃO pode virar uma lista chapada:
// caímos em PARCEIRAS_PADRAO e a tela continua priorizando quem a operação
// prioriza. `origem` diz de onde veio a lista para a UI avisar quando está no
// modo de segurança (e esconder a gestão, que não teria onde gravar).
//
// 2026-09-02 (decisão 13): a parceira ganhou `logo_url`. A coluna chega com a
// migration da prateleira; sem ela, refazemos o select sem o logo em vez de
// derrubar a lista do banco para o fallback local.

import { useQuery } from "@tanstack/react-query";
import { supabasePendente } from "@/integrations/supabase/pendentes";
import { isMissingColumn } from "@/lib/supabase-errors";
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
    logo_url: null,
  }));
}

export const CONSTRUTORAS_PARCEIRAS_KEY = ["construtoras-parceiras"] as const;

async function lerParceiras(): Promise<Parceira[] | null> {
  const comLogo = await supabasePendente
    .from("construtoras_parceiras")
    .select("id, nome, ordem, ativo, logo_url")
    .order("ordem")
    .order("nome");
  if (!comLogo.error) return comLogo.data ?? [];
  // Tabela existe, coluna nova ainda não: lê sem o logo.
  if (!isMissingColumn(comLogo.error)) return null;
  const semLogo = await supabasePendente
    .from("construtoras_parceiras")
    .select("id, nome, ordem, ativo")
    .order("ordem")
    .order("nome");
  if (semLogo.error) return null;
  return (semLogo.data ?? []).map((p) => ({ ...p, logo_url: null }));
}

export function useConstrutorasParceiras() {
  return useQuery({
    queryKey: CONSTRUTORAS_PARCEIRAS_KEY,
    // A lista muda por decisão comercial, não a cada minuto.
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ParceirasResultado> => {
      // Tabela ausente/sem permissão não é motivo para derrubar a prateleira.
      const linhas = await lerParceiras();
      if (!linhas || linhas.length === 0) return { parceiras: parceirasPadrao(), origem: "padrao" };
      return { parceiras: ordenarParceiras(linhas), origem: "banco" };
    },
  });
}
