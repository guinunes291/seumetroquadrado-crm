import { Radar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { cn } from "@/lib/utils";
import { contarTarefasAtrasadas, useFilaDeMissoes, useTarefasDeHoje } from "./use-home-data";
import type { WidgetProps } from "@/features/command-center/widget-registry";

/**
 * Widget do radar de risco: contadores do que pode virar perda (SLA estourado,
 * leads sem próxima ação e tarefas atrasadas). Reusa as queries da fila de
 * missões e das tarefas — o react-query deduplica pela queryKey.
 */
export function RadarWidget(props: WidgetProps) {
  const fila = useFilaDeMissoes(props);
  const tarefasQ = useTarefasDeHoje(props);
  const tarefasAtrasadas = contarTarefasAtrasadas(tarefasQ.data ?? []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Radar className="h-4 w-4 text-destructive" /> Radar de risco
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <AsyncBoundary
          isLoading={fila.carregando || tarefasQ.isLoading}
          isError={fila.erro || tarefasQ.isError}
          error={fila.error ?? tarefasQ.error}
          errorTitle="Não foi possível carregar o radar de risco."
          onRetry={() => {
            fila.recarregar();
            void tarefasQ.refetch();
          }}
          loadingFallback={
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          }
        >
          <div className="flex items-center justify-between rounded-md border p-2">
            <span className="text-muted-foreground">SLA estourado</span>
            <Badge
              variant="secondary"
              className={cn(fila.slaEstourados > 0 && "bg-destructive/15 text-destructive")}
            >
              {fila.slaEstourados}
            </Badge>
          </div>
          <div className="flex items-center justify-between rounded-md border p-2">
            <span className="text-muted-foreground">Sem próxima ação</span>
            <Badge
              variant="secondary"
              className={cn(fila.semAcaoCount > 0 && "bg-warning/15 text-warning")}
            >
              {fila.semAcaoCount}
            </Badge>
          </div>
          <div className="flex items-center justify-between rounded-md border p-2">
            <span className="text-muted-foreground">Tarefas atrasadas</span>
            <Badge
              variant="secondary"
              className={cn(tarefasAtrasadas > 0 && "bg-warning/15 text-warning")}
            >
              {tarefasAtrasadas}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Tudo isso já está priorizado na fila de missões ao lado.
          </p>
        </AsyncBoundary>
      </CardContent>
    </Card>
  );
}
