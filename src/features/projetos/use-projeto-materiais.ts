// Leitura e escrita dos materiais de venda (projeto_materiais) com degradação
// segura: sem a migration 20260913190000 aplicada, a leitura devolve lista
// vazia e `disponivel: false` — a ficha segue mostrando book e tabela das
// colunas antigas e esconde a gestão de materiais em vez de quebrar.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabasePendente } from "@/integrations/supabase/pendentes";
import { useAuth } from "@/hooks/use-auth";
import { rpcWithFallback } from "@/lib/supabase-errors";
import type { MaterialRow, MaterialValido } from "@/lib/projeto-materiais";

export const MATERIAIS_KEY = (projetoId: string) => ["projeto-materiais", projetoId] as const;

export type MateriaisCarregados = {
  itens: MaterialRow[];
  /** false = a tabela ainda não existe neste banco (migration pendente). */
  disponivel: boolean;
};

const COLUNAS = "id, tipo, titulo, url, descricao, ordem, ativo" as const;

export function useProjetoMateriais(projetoId: string) {
  return useQuery({
    queryKey: MATERIAIS_KEY(projetoId),
    staleTime: 60_000,
    queryFn: (): Promise<MateriaisCarregados> =>
      rpcWithFallback<MateriaisCarregados>(
        async () => {
          const { data, error } = await supabasePendente
            .from("projeto_materiais")
            .select(COLUNAS)
            .eq("projeto_id", projetoId)
            .order("ordem", { ascending: true })
            .order("created_at", { ascending: true });
          if (error) throw error;
          return { itens: (data ?? []) as MaterialRow[], disponivel: true };
        },
        () => ({ itens: [], disponivel: false }),
      ),
  });
}

export type SalvarMaterialInput = MaterialValido & { id?: string; ordem?: number };

/** Insere ou atualiza (quando vem `id`). A RLS decide quem pode. */
export function useSalvarMaterial(projetoId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: SalvarMaterialInput) => {
      const { id, ordem, ...campos } = input;
      if (id) {
        const { error } = await supabasePendente
          .from("projeto_materiais")
          .update({ ...campos, ...(ordem != null ? { ordem } : {}) })
          .eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabasePendente
        .from("projeto_materiais")
        .insert({
          projeto_id: projetoId,
          ...campos,
          ordem: ordem ?? 0,
          criado_por: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (_id, input) => {
      toast.success(input.id ? "Material atualizado" : "Material adicionado à ficha");
      qc.invalidateQueries({ queryKey: MATERIAIS_KEY(projetoId) });
    },
    onError: (e: Error) => toast.error(`Não foi possível salvar o material: ${e.message}`),
  });
}

export function useAlternarMaterialAtivo(projetoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabasePendente
        .from("projeto_materiais")
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_r, { ativo }) => {
      toast.success(ativo ? "Material de volta à ficha" : "Material oculto da ficha");
      qc.invalidateQueries({ queryKey: MATERIAIS_KEY(projetoId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRemoverMaterial(projetoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabasePendente.from("projeto_materiais").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Material removido");
      qc.invalidateQueries({ queryKey: MATERIAIS_KEY(projetoId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Aplica as ordens novas calculadas por `moverMaterial` (lib/projeto-materiais). */
export function useReordenarMateriais(projetoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mudancas: Array<{ id: string; ordem: number }>) => {
      for (const m of mudancas) {
        const { error } = await supabasePendente
          .from("projeto_materiais")
          .update({ ordem: m.ordem })
          .eq("id", m.id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MATERIAIS_KEY(projetoId) }),
    onError: (e: Error) => toast.error(`Não foi possível reordenar: ${e.message}`),
  });
}
