// Quadro Kanban — o topo do quadro: campo de busca com o "VGV no funil" (só
// sem busca controlada) e as abas de etapa do celular.
// Recortado de src/components/leads-kanban-board.tsx sem mudança de comportamento.

import type { Dispatch, SetStateAction } from "react";
import { Input } from "@/components/ui/input";
import { ResponsiveTabs } from "@/components/ui/responsive-tabs";
import { LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/leads";
import type { KanbanColumn } from "./kanban-board-utils";
import type { useKanbanMetricas } from "./use-kanban-metricas";

export function KanbanBuscaEVgv({
  resumo,
  vgvTotalLabel,
  search,
  setSearch,
}: {
  resumo: boolean;
  vgvTotalLabel: string | null;
  search: string;
  setSearch: (valor: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1 sm:items-end">
      {/* Só aparece com o snapshot v3 aplicado (a v2 não traz `vgv`). Com
            o resumo, o VGV já é o primeiro número do topo. */}
      {!resumo && vgvTotalLabel && (
        <span
          className="text-xs font-medium tabular-nums text-gold-700 dark:text-gold-400"
          title="Soma do VGV potencial das etapas ativas do funil"
        >
          VGV no funil: {vgvTotalLabel}
        </span>
      )}
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar lead…"
        aria-label="Buscar leads no funil"
        className="min-h-11 w-full sm:w-64"
      />
    </div>
  );
}

export function KanbanAbasMobile({
  columns,
  mobileStageAtual,
  setMobileStage,
  setAnnouncement,
  teto65,
  ocupacao65,
  snapshotByStage,
}: {
  columns: readonly KanbanColumn[];
  mobileStageAtual: LeadStatus;
  setMobileStage: Dispatch<SetStateAction<LeadStatus>>;
  setAnnouncement: (texto: string) => void;
  teto65: number | null;
  ocupacao65: number | null;
  snapshotByStage: ReturnType<typeof useKanbanMetricas>["snapshotByStage"];
}) {
  return (
    <div className="md:hidden">
      <ResponsiveTabs
        value={mobileStageAtual}
        onValueChange={(value) => {
          const stage = value as LeadStatus;
          setMobileStage(stage);
          setAnnouncement(`Etapa exibida: ${LEAD_STATUS_LABEL[stage]}.`);
        }}
        ariaLabel="Etapa exibida no funil"
        listClassName="w-full sm:w-full"
        items={columns.map((column) => ({
          value: column.id,
          label:
            column.id === "em_atendimento" && teto65 && ocupacao65 !== null
              ? `${column.label} · ${ocupacao65}/${teto65}`
              : `${column.label} · ${Number(snapshotByStage.get(column.id)?.quantidade ?? 0)}`,
        }))}
      >
        {null}
      </ResponsiveTabs>
    </div>
  );
}
