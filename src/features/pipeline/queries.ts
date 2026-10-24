// Pipeline — camada de dados do quadro Kanban (KanbanBoard, em
// src/components/leads-kanban-board.tsx): perfis para o nome do corretor,
// página de cada etapa, snapshot do funil e SLA dos cards pendentes.
// Recortado de src/components/leads-kanban-board.tsx sem mudança de comportamento.

import { useQueries, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { rpcWithFallback } from "@/lib/supabase-errors";
import type { LeadStatus } from "@/lib/leads";

export type Lead = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string;
  status: string;
  corretor_id: string | null;
  projeto_id: string | null;
  projeto_nome: string | null;
  observacoes: string | null;
  temperatura: string | null;
  origem: string | null;
  data_distribuicao: string | null;
  tentativas_redistribuicao: number | null;
  via_webhook: boolean | null;
  created_at: string;
  ultima_interacao: string | null;
};

const LeadSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  email: z.string().nullable(),
  telefone: z.string(),
  status: z.string(),
  corretor_id: z.string().uuid().nullable(),
  projeto_id: z.string().uuid().nullable(),
  projeto_nome: z.string().nullable(),
  observacoes: z.string().nullable(),
  temperatura: z.string().nullable(),
  origem: z.string().nullable(),
  data_distribuicao: z.string().nullable(),
  tentativas_redistribuicao: z.number().nullable(),
  via_webhook: z.boolean().nullable(),
  created_at: z.string(),
  ultima_interacao: z.string().nullable(),
});
const StagePageSchema = z.object({
  items: z.array(LeadSchema),
  has_more: z.boolean(),
  next_cursor: z.object({ created_at: z.string(), id: z.string().uuid() }).nullable(),
});
export type StagePage = z.infer<typeof StagePageSchema>;

export type SlaRow = {
  lead_id: string;
  status: string;
  sla_minutos: number;
  minutos_decorridos: number;
  sla_status: string;
};

export function useCorretoresMin() {
  return useQuery({
    queryKey: ["corretores-min"],
    retry: 3,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Lista de corretores vazia");
      return data;
    },
  });
}

// Só as colunas visíveis viram query — fase com menos colunas = menos RPCs.
export function usePipelineStagePages(
  columns: readonly { id: LeadStatus }[],
  debouncedSearch: string,
  corretorFiltro: string | undefined,
) {
  return useQueries({
    queries: columns.map((column) => ({
      queryKey: ["pipeline-stage-v2", column.id, debouncedSearch, corretorFiltro ?? null],
      queryFn: async (): Promise<StagePage> => {
        const { data, error } = await supabase.rpc("pipeline_stage_page_v2", {
          _status: column.id,
          _query: debouncedSearch || undefined,
          _corretor_id: corretorFiltro,
          _limit: 20,
          _cursor: undefined,
        });
        if (error) throw error;
        return StagePageSchema.parse(data);
      },
    })),
  });
}

// Snapshot v3 traz o VGV por etapa; sem a migration aplicada, cai para a v2
// e os chips de valor simplesmente não aparecem (rpcWithFallback).
export function usePipelineSnapshot(debouncedSearch: string, corretorFiltro: string | undefined) {
  return useQuery({
    queryKey: ["pipeline-snapshot-v2", debouncedSearch, corretorFiltro ?? null],
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const { data, error } = await supabase.rpc("pipeline_snapshot_v3", {
            _query: debouncedSearch || undefined,
            _corretor_id: corretorFiltro,
          });
          if (error) throw error;
          return data as {
            etapa: LeadStatus;
            quantidade: number;
            followups_vencidos: number;
            sem_proxima_acao: number;
            parados_ha_7_dias: number;
            vgv?: number;
          }[];
        },
        async () => {
          const { data, error } = await supabase.rpc("pipeline_snapshot_v2", {
            _query: debouncedSearch || undefined,
            _corretor_id: corretorFiltro,
          });
          if (error) throw error;
          return data;
        },
      ),
  });
}

/** Próxima página de uma etapa, a partir do cursor da página anterior. */
export async function buscarPaginaDaEtapa(
  status: LeadStatus,
  debouncedSearch: string,
  corretorFiltro: string | undefined,
  cursor: NonNullable<StagePage["next_cursor"]>,
): Promise<StagePage> {
  const { data, error } = await supabase.rpc("pipeline_stage_page_v2", {
    _status: status,
    _query: debouncedSearch || undefined,
    _corretor_id: corretorFiltro,
    _limit: 20,
    _cursor: cursor,
  });
  if (error) throw error;
  const page = StagePageSchema.parse(data);
  return page;
}

// SLA serve só para o badge dos cards em novo/aguardando — a RPC estreita
// (leads_sla_pendentes) devolve apenas esse recorte em vez de varrer todos
// os leads ativos da org (a varredura completa estourou statement timeout em
// produção). Poll de 2min mantém a query fora do caminho quente; sem a
// migration aplicada, cai para a leads_com_sla antiga filtrando no cliente.
export function useLeadsSla() {
  return useQuery({
    queryKey: ["leads-sla"],
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const { data, error } = await supabase.rpc("leads_sla_pendentes", {
            _corretor: undefined,
          });
          if (error) throw error;
          return (data ?? []) as unknown as SlaRow[];
        },
        async () => {
          const { data, error } = await supabase.rpc("leads_com_sla", { _corretor: undefined });
          if (error) throw error;
          return ((data ?? []) as SlaRow[]).filter(
            (r) => r.status === "novo" || r.status === "aguardando_atendimento",
          );
        },
      ),
    staleTime: 120_000,
    refetchInterval: 120_000,
  });
}
