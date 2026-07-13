import { Link } from "@tanstack/react-router";
import { CalendarCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { hora, useAgendaDeHoje } from "./use-home-data";
import type { WidgetProps } from "@/features/command-center/widget-registry";

/** Widget da agenda de hoje: visitas/reuniões do dia no escopo selecionado. */
export function HojeAgendaWidget(props: WidgetProps) {
  const agendaQ = useAgendaDeHoje(props);
  const agenda = agendaQ.data ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <CalendarCheck className="h-4 w-4 text-info" /> Agenda de hoje
          {agenda.length > 0 && <Badge variant="secondary">{agenda.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <AsyncBoundary
          isLoading={agendaQ.isLoading}
          isError={agendaQ.isError}
          error={agendaQ.error}
          errorTitle="Não foi possível carregar a agenda."
          onRetry={() => agendaQ.refetch()}
          loadingFallback={
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          }
        >
          {agenda.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem compromissos hoje.</p>
          ) : (
            agenda.map((a) => {
              const row = (
                <>
                  <div className="text-sm font-medium">
                    <span className="font-display tabular-nums text-muted-foreground">
                      {hora(a.data_inicio)}
                    </span>{" "}
                    {a.titulo}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {a.tipo}
                    {a.local ? ` · ${a.local}` : ""}
                  </div>
                </>
              );
              return (
                <div key={a.id} className="rounded-md border p-2">
                  {a.lead_id ? (
                    <Link to="/leads/$leadId" params={{ leadId: a.lead_id }} className="block">
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </div>
              );
            })
          )}
        </AsyncBoundary>
        <Button asChild variant="link" className="h-auto p-0 text-xs">
          <Link to="/agendamentos">ver agenda completa</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
