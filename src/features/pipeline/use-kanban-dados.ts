// Quadro Kanban — dados do quadro: páginas por etapa (com "Carregar mais"),
// snapshot do funil, nomes dos corretores, SLA e o realtime que reidrata.
// Recortado de src/components/leads-kanban-board.tsx sem mudança de comportamento.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { LeadStatus } from "@/lib/leads";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useTransferTimeouts } from "@/components/transfer-sla-badge";
import {
  buscarPaginaDaEtapa,
  useCorretoresMin,
  useLeadsSla,
  usePipelineSnapshot,
  usePipelineStagePages,
  type SlaRow,
  type StagePage,
} from "./queries";
import type { KanbanColumn } from "./kanban-board-utils";

export function useKanbanDados(
  columns: readonly KanbanColumn[],
  debouncedSearch: string,
  corretorFiltro: string | undefined,
) {
  const [extraPages, setExtraPages] = useState<Partial<Record<LeadStatus, StagePage>>>({});
  const [loadingMore, setLoadingMore] = useState<LeadStatus | null>(null);

  const { data: corretores } = useCorretoresMin();
  const corretoresMap = useMemo(() => {
    const m = new Map<string, string>();
    (corretores ?? []).forEach((c) => m.set(c.id, c.nome));
    return m;
  }, [corretores]);

  // Só as colunas visíveis viram query — fase com menos colunas = menos RPCs.
  const stageQueries = usePipelineStagePages(columns, debouncedSearch, corretorFiltro);
  // Snapshot v3 com fallback para a v2 (ver usePipelineSnapshot).
  const snapshotQuery = usePipelineSnapshot(debouncedSearch, corretorFiltro);

  useEffect(() => setExtraPages({}), [debouncedSearch, corretorFiltro]);

  const initialPages = useMemo(
    () =>
      new Map<LeadStatus, StagePage>(
        columns.flatMap((column, index) => {
          const page = stageQueries[index]?.data;
          return page ? [[column.id, page] as const] : [];
        }),
      ),
    [stageQueries, columns],
  );
  const leads = useMemo(() => {
    const seen = new Set<string>();
    return columns
      .flatMap((column) => [
        ...(initialPages.get(column.id)?.items ?? []),
        ...(extraPages[column.id]?.items ?? []),
      ])
      .filter((lead) => (seen.has(lead.id) ? false : (seen.add(lead.id), true)));
  }, [extraPages, initialPages, columns]);
  const leadsLoading = stageQueries.some((query) => query.isLoading) || snapshotQuery.isLoading;
  const leadsError = stageQueries.some((query) => query.isError) || snapshotQuery.isError;
  const refetchLeads = async () => {
    setExtraPages({});
    await Promise.all([...stageQueries.map((query) => query.refetch()), snapshotQuery.refetch()]);
  };

  const loadMore = async (status: LeadStatus) => {
    const base = initialPages.get(status);
    const extra = extraPages[status];
    const cursor = extra?.next_cursor ?? base?.next_cursor;
    if (!cursor || loadingMore) return;
    setLoadingMore(status);
    try {
      const page = await buscarPaginaDaEtapa(status, debouncedSearch, corretorFiltro, cursor);
      setExtraPages((current) => ({
        ...current,
        [status]: {
          ...page,
          items: [...(current[status]?.items ?? []), ...page.items],
        },
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar mais leads.");
    } finally {
      setLoadingMore(null);
    }
  };

  // SLA só para o badge dos cards em novo/aguardando (ver useLeadsSla).
  const { data: slaRows } = useLeadsSla();

  const slaMap = useMemo(() => {
    const m = new Map<string, SlaRow>();
    (slaRows ?? []).forEach((r) => m.set(r.lead_id, r));
    return m;
  }, [slaRows]);
  const transferTimeouts = useTransferTimeouts();

  // Realtime só reidrata as páginas/contagens do quadro. O SLA (query pesada de
  // toda a org) fica fora daqui — atualiza por poll — para não refazê-lo a cada
  // mudança em `leads`.
  useRealtimeInvalidate("leads", [["pipeline-stage-v2"], ["pipeline-snapshot-v2"]]);

  return {
    extraPages,
    setExtraPages,
    loadingMore,
    corretoresMap,
    snapshotQuery,
    initialPages,
    leads,
    leadsLoading,
    leadsError,
    refetchLeads,
    loadMore,
    slaMap,
    transferTimeouts,
  };
}
