// Quadro Kanban — estados sem colunas: erro (com "Tentar novamente"),
// carregando e funil vazio.
// Recortado de src/components/leads-kanban-board.tsx sem mudança de comportamento.

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowClockwise, Warning } from "@phosphor-icons/react";

export function KanbanEstados({
  leadsError,
  leadsLoading,
  pipelineTotal,
  refetchLeads,
}: {
  leadsError: boolean;
  leadsLoading: boolean;
  pipelineTotal: number;
  refetchLeads: () => Promise<void>;
}) {
  return (
    <>
      {leadsError && (
        <Card className="p-8 text-center space-y-3">
          <Warning className="h-8 w-8 mx-auto text-destructive opacity-70" />
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar o quadro. Tente novamente.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetchLeads()}>
            <ArrowClockwise className="h-4 w-4 mr-2" /> Tentar novamente
          </Button>
        </Card>
      )}

      {leadsLoading && !leadsError && (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-72 shrink-0 rounded-lg" />
          ))}
        </div>
      )}

      {!leadsLoading && !leadsError && pipelineTotal === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum lead ativo no funil ainda.
        </p>
      )}
    </>
  );
}
