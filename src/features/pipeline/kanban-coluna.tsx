// Quadro Kanban — a coluna de uma etapa: aberta (cabeçalho, sinais, cartões
// e "Carregar mais 20") ou recolhida numa barra.
// Recortado de src/components/leads-kanban-board.tsx sem mudança de comportamento.

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { ArrowsHorizontal } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { SinaisDaColuna } from "@/features/pipeline/resumo-do-funil";
import type { LeadStatus } from "@/lib/leads";
import type { usePointerDnd } from "./use-pointer-dnd";
import type { StagePage } from "./queries";
import type { KanbanColumn } from "./kanban-board-utils";
import type { useKanbanMetricas } from "./use-kanban-metricas";

type Dnd = ReturnType<typeof usePointerDnd>;
type Metricas = ReturnType<typeof useKanbanMetricas>;

type ColunaBase = {
  col: KanbanColumn;
  quantidade: number;
  registerColumn: Dnd["registerColumn"];
  dragging: Dnd["dragging"];
  toggleColapso: (id: LeadStatus) => void;
};

export function KanbanColunaRecolhida({
  col,
  quantidade,
  registerColumn,
  dragging,
  toggleColapso,
}: ColunaBase) {
  return (
    <section
      key={col.id}
      ref={registerColumn(col.id)}
      aria-labelledby={`kanban-col-${col.id}`}
      className={cn(
        "hidden w-10 shrink-0 rounded-xl border-t-2 bg-muted/50 transition-colors md:block dark:bg-card/40",
        col.tone,
        dragging?.overColumnId === col.id && "ring-2 ring-primary/60 bg-primary/5",
      )}
    >
      {/* A barra continua alvo de drop: o rect é cacheado no
            início do arrasto como o de qualquer coluna. */}
      <button
        type="button"
        className="flex min-h-[220px] w-full flex-col items-center gap-2 rounded-lg py-2"
        aria-label={`Expandir coluna ${col.label} (${quantidade} leads)`}
        aria-expanded={false}
        onClick={() => toggleColapso(col.id)}
      >
        <Badge variant="secondary" className="text-[10px] tabular-nums">
          {quantidade}
        </Badge>
        <span
          id={`kanban-col-${col.id}`}
          className="rotate-180 text-xs font-semibold [writing-mode:vertical-rl]"
        >
          {col.label}
        </span>
      </button>
    </section>
  );
}

type KanbanColunaProps = ColunaBase & {
  metrics: ReturnType<Metricas["stageMetrics"]["get"]>;
  vgvLabel: string | null;
  mobileStageAtual: LeadStatus;
  teto65: number | null;
  ocupacao65: number | null;
  snapshotByStage: Metricas["snapshotByStage"];
  extraPages: Partial<Record<LeadStatus, StagePage>>;
  initialPages: Map<LeadStatus, StagePage>;
  loadingMore: LeadStatus | null;
  loadMore: (status: LeadStatus) => Promise<void>;
  children: ReactNode;
};

export function KanbanColuna({
  col,
  quantidade,
  registerColumn,
  dragging,
  toggleColapso,
  metrics,
  vgvLabel,
  mobileStageAtual,
  teto65,
  ocupacao65,
  snapshotByStage,
  extraPages,
  initialPages,
  loadingMore,
  loadMore,
  children,
}: KanbanColunaProps) {
  return (
    <section
      ref={registerColumn(col.id)}
      aria-labelledby={`kanban-col-${col.id}`}
      className={cn(
        // Coluna da identidade Lançamento: painel cinza-claro sem
        // borda, como no vídeo. Fica só o fio de 2px da cor da
        // etapa — com ~10 colunas lado a lado, é o que ajuda a
        // achar a etapa rolando de lado (o vídeo mostra 4).
        "group/col w-full shrink-0 rounded-xl border-t-2 bg-muted/50 p-2.5 transition-colors md:block md:w-72 dark:bg-card/40",
        col.id !== mobileStageAtual && "hidden",
        col.tone,
        dragging?.overColumnId === col.id && "ring-2 ring-primary/60 bg-primary/5",
      )}
    >
      <div className="flex items-center justify-between px-1 py-2">
        <h2 id={`kanban-col-${col.id}`} className="font-display text-sm font-semibold">
          {col.label}
          {col.id === "em_atendimento" && teto65 && (
            <span
              className="ml-1 font-normal tabular-nums text-muted-foreground"
              data-testid="kanban-teto-65"
            >
              · {ocupacao65}/{teto65}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-1">
          {/* A contagem da etapa; o VGV potencial e a conversão
              acumulada (vs. a etapa anterior) ficam na dica — o
              VGV somado de todas as colunas fica no topo. */}
          <span
            className="px-1 font-display text-sm font-semibold tabular-nums text-muted-foreground"
            title={
              [
                vgvLabel ? `VGV ${vgvLabel}` : null,
                metrics?.conversaoPct != null
                  ? `conv. ${metrics.conversaoPct.toLocaleString("pt-BR")}% vs. a etapa anterior`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || undefined
            }
          >
            <AnimatedNumber value={quantidade} />
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-7 w-7 text-muted-foreground hover:text-foreground focus-visible:opacity-100 md:inline-flex md:opacity-0 md:group-hover/col:opacity-100"
            aria-label={`Recolher coluna ${col.label}`}
            title="Recolher coluna"
            onClick={() => toggleColapso(col.id)}
          >
            <ArrowsHorizontal className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {/* Sinais agregados do snapshot, em texto miúdo sob o nome:
          o diagnóstico da etapa sem paginar a coluna inteira. */}
      <SinaisDaColuna
        vencidos={Number(snapshotByStage.get(col.id)?.followups_vencidos ?? 0)}
        semAcao={Number(snapshotByStage.get(col.id)?.sem_proxima_acao ?? 0)}
        parados={Number(snapshotByStage.get(col.id)?.parados_ha_7_dias ?? 0)}
      />
      <div className="space-y-2 min-h-[100px]">
        {children}
        {(extraPages[col.id]?.has_more ?? initialPages.get(col.id)?.has_more) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={loadingMore === col.id}
            onClick={() => void loadMore(col.id)}
          >
            {loadingMore === col.id ? "Carregando…" : "Carregar mais 20"}
          </Button>
        )}
      </div>
    </section>
  );
}
