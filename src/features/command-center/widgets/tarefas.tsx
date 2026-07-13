import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { cn } from "@/lib/utils";
import { contarTarefasAtrasadas, hora, useTarefasDeHoje } from "./use-home-data";
import type { WidgetProps } from "@/features/command-center/widget-registry";

/** Widget de tarefas & follow-ups pendentes do dia, com conclusão em 1 clique. */
export function TarefasWidget(props: WidgetProps) {
  const qc = useQueryClient();
  const tarefasQ = useTarefasDeHoje(props);
  const tarefas = tarefasQ.data ?? [];
  const tarefasAtrasadas = contarTarefasAtrasadas(tarefas);

  const concluirTarefa = useMutation({
    mutationFn: async (id: string) => {
      // `data_conclusao` é o que alimenta o card "Concluídas hoje"; sem isso,
      // marcar como concluída pelo Hoje ficava fora do resumo do dia.
      const { error } = await supabase
        .from("tarefas")
        .update({ status: "concluida", data_conclusao: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa concluída");
      qc.invalidateQueries({ queryKey: ["meu-dia:tarefas"] });
      qc.invalidateQueries({ queryKey: ["meu-dia:atividades"] });
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-warning" /> Tarefas & follow-ups
          {tarefas.length > 0 && <Badge variant="secondary">{tarefas.length}</Badge>}
          {tarefasAtrasadas > 0 && (
            <Badge variant="secondary" className="bg-destructive/15 text-destructive">
              {tarefasAtrasadas} atrasada{tarefasAtrasadas > 1 ? "s" : ""}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <AsyncBoundary
          isLoading={tarefasQ.isLoading}
          isError={tarefasQ.isError}
          error={tarefasQ.error}
          errorTitle="Não foi possível carregar as tarefas."
          onRetry={() => tarefasQ.refetch()}
          loadingFallback={
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          }
        >
          {tarefas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada pendente. 🎉</p>
          ) : (
            tarefas.slice(0, 8).map((t) => {
              const venc = t.data_vencimento ? new Date(t.data_vencimento) : null;
              const atrasada = !!venc && venc.getTime() < Date.now();
              const diasAtraso = venc
                ? Math.floor((Date.now() - venc.getTime()) / (24 * 60 * 60 * 1000))
                : 0;
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-md border p-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{t.titulo}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
                      <span className="capitalize">{t.tipo.replace(/_/g, " ")}</span>
                      {venc && (
                        <span className={cn(atrasada && "text-destructive font-medium")}>
                          ·{" "}
                          {atrasada
                            ? `atrasada há ${diasAtraso === 0 ? "hoje" : `${diasAtraso}d`} (${venc.toLocaleDateString("pt-BR")})`
                            : hora(t.data_vencimento!)}
                        </span>
                      )}
                      {t.lead_id && (
                        <Link
                          to="/leads/$leadId"
                          params={{ leadId: t.lead_id }}
                          className="text-primary hover:underline inline-flex items-center"
                        >
                          · lead <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-success hover:bg-success/10"
                    title="Concluir"
                    disabled={concluirTarefa.isPending}
                    onClick={() => concluirTarefa.mutate(t.id)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          )}
        </AsyncBoundary>
        <Button asChild variant="link" className="h-auto p-0 text-xs">
          <Link to="/agendamentos" search={{ tab: "tarefas" }}>
            ver todas as tarefas
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
