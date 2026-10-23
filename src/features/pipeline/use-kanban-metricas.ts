// Quadro Kanban — números derivados do snapshot: linhas das colunas
// visíveis, total do funil, VGV e conversão por etapa e os sinais do topo.
// Recortado de src/components/leads-kanban-board.tsx sem mudança de comportamento.

import { useMemo } from "react";
import {
  computeStageMetrics,
  formatVgvCompact,
  somarSinaisDoFunil,
} from "@/features/pipeline/stage-metrics";
import { FUNNEL_STAGES } from "@/lib/leads";
import type { usePipelineSnapshot } from "./queries";
import type { KanbanColumn } from "./kanban-board-utils";

export function useKanbanMetricas(
  snapshotQuery: Pick<ReturnType<typeof usePipelineSnapshot>, "data">,
  columns: readonly KanbanColumn[],
) {
  // O snapshot devolve TODAS as etapas — restringe às colunas visíveis antes
  // de qualquer métrica, para os chips (total, VGV) não somarem etapas fora
  // da fase.
  const snapshotRows = useMemo(() => {
    const visiveis = new Set<string>(columns.map((c) => c.id));
    return (snapshotQuery.data ?? []).filter((row) => visiveis.has(String(row.etapa)));
  }, [snapshotQuery.data, columns]);
  const snapshotByStage = useMemo(
    () => new Map(snapshotRows.map((row) => [row.etapa, row])),
    [snapshotRows],
  );
  // O gate de "funil vazio" conta o snapshot SEM o filtro de colunas: o
  // snapshot devolve todas as etapas do enum (novo/perdido incluídas), e
  // restringir às colunas visíveis fazia uma base só de leads "novo" parecer
  // vazia no /pipeline cru.
  const pipelineTotal = useMemo(
    () => (snapshotQuery.data ?? []).reduce((sum, row) => sum + Number(row.quantidade), 0),
    [snapshotQuery.data],
  );

  // Economia do funil: VGV por etapa (v3) + % de conversão acumulada vs. etapa
  // anterior — derivado das quantidades, sem histórico. O acumulado é
  // POSICIONAL no funil INTEIRO (FUNNEL_STAGES), mesmo numa fase: lead que
  // avançou além da fronteira segue contando como "chegou até aqui" — truncar
  // nas colunas da fase inverteria o sinal (progresso contado como perda).
  const stageMetrics = useMemo(
    () =>
      computeStageMetrics(
        (snapshotQuery.data ?? []).map((row) => ({
          etapa: String(row.etapa),
          quantidade: Number(row.quantidade),
          vgv: "vgv" in row && row.vgv != null ? Number(row.vgv) : null,
        })),
        FUNNEL_STAGES,
      ),
    [snapshotQuery.data],
  );

  // VGV total do header: soma das etapas VISÍVEIS (snapshotRows já restringe
  // à fase; perdido/pós-venda ficam fora por não serem coluna) — não do
  // stageMetrics, que agora cobre o funil inteiro. null quando o snapshot em
  // uso é a v2 (sem `vgv`).
  const vgvTotal = useMemo(() => {
    let soma = 0;
    let temVgv = false;
    snapshotRows.forEach((row) => {
      if ("vgv" in row && row.vgv != null) {
        temVgv = true;
        soma += Number(row.vgv);
      }
    });
    return temVgv ? soma : null;
  }, [snapshotRows]);
  const vgvTotalLabel = formatVgvCompact(vgvTotal);
  // Os sinais do topo somam as MESMAS linhas das colunas visíveis — o número
  // do topo é sempre a soma do que as colunas mostram.
  const sinaisDoFunil = useMemo(
    () =>
      somarSinaisDoFunil(
        snapshotRows.map((row) => ({
          etapa: String(row.etapa),
          quantidade: row.quantidade,
          followups_vencidos: row.followups_vencidos,
          sem_proxima_acao: row.sem_proxima_acao,
          parados_ha_7_dias: row.parados_ha_7_dias,
        })),
      ),
    [snapshotRows],
  );

  return { snapshotByStage, pipelineTotal, stageMetrics, vgvTotalLabel, sinaisDoFunil };
}
