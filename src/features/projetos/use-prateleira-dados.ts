// Leituras da prateleira, todas com degradação segura (decisão 26: o servidor
// entra com fallback; sem a migration aplicada a tela nunca quebra).
//
//   • catálogo: projetos ativos + carimbos de atualização (colunas novas → se
//     ausentes, refaz o select antigo);
//   • campanhas: projeto_foco ativos (+ arte_url, idem);
//   • demanda: RPC projetos_demanda_v1 (ausente → mapa vazio, sem selos).
//
// As chaves ficam sob "projetos-foco" para o Materiais e a ficha invalidarem
// tudo de uma vez ao salvar.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabasePendente } from "@/integrations/supabase/pendentes";
import { PROJETO_CRM_SELECT } from "@/lib/projetos-query";
import { rpcWithFallback, selectWithColumnFallback } from "@/lib/supabase-errors";
import type { Demanda, FocoRow, ProjetoPrateleiraRow } from "@/lib/prateleira";

const PRATELEIRA_SELECT = `${PROJETO_CRM_SELECT},preco_atualizado_em,tabela_atualizada_em` as const;

export const PRATELEIRA_KEYS = {
  catalogo: ["projetos-foco", "catalogo"] as const,
  campanhas: ["projetos-foco", "campanhas"] as const,
  demanda: ["projetos-foco", "demanda"] as const,
};

export function useProjetosPrateleira() {
  return useQuery({
    queryKey: PRATELEIRA_KEYS.catalogo,
    staleTime: 60_000,
    queryFn: (): Promise<ProjetoPrateleiraRow[]> =>
      selectWithColumnFallback(
        async () => {
          const { data, error } = await supabasePendente
            .from("projetos")
            .select(PRATELEIRA_SELECT)
            .is("deleted_at", null)
            .eq("ativo", true)
            .order("nome");
          if (error) throw error;
          return (data ?? []) as ProjetoPrateleiraRow[];
        },
        async () => {
          const { data, error } = await supabase
            .from("projetos")
            .select(PROJETO_CRM_SELECT)
            .is("deleted_at", null)
            .eq("ativo", true)
            .order("nome");
          if (error) throw error;
          return (data ?? []) as ProjetoPrateleiraRow[];
        },
      ),
  });
}

export function useFocosPrateleira() {
  return useQuery({
    queryKey: PRATELEIRA_KEYS.campanhas,
    staleTime: 60_000,
    queryFn: (): Promise<FocoRow[]> =>
      selectWithColumnFallback(
        async () => {
          const { data, error } = await supabasePendente
            .from("projeto_foco")
            .select("id, projeto_id, motivo, inicio, fim, ativo, arte_url")
            .eq("ativo", true)
            .order("inicio", { ascending: false });
          if (error) throw error;
          return data ?? [];
        },
        async () => {
          const { data, error } = await supabase
            .from("projeto_foco")
            .select("id, projeto_id, motivo, inicio, fim, ativo")
            .eq("ativo", true)
            .order("inicio", { ascending: false });
          if (error) throw error;
          return (data ?? []).map((f) => ({ ...f, arte_url: null }));
        },
      ),
  });
}

export function useDemandaPrateleira() {
  return useQuery({
    queryKey: PRATELEIRA_KEYS.demanda,
    // Prova social interna: não precisa ser ao vivo.
    staleTime: 2 * 60_000,
    queryFn: (): Promise<Map<string, Demanda>> =>
      rpcWithFallback(
        async () => {
          const { data, error } = await supabasePendente.rpc("projetos_demanda_v1");
          if (error) throw error;
          return new Map((data ?? []).map((d) => [d.projeto_id, d]));
        },
        () => new Map<string, Demanda>(),
      ),
  });
}
