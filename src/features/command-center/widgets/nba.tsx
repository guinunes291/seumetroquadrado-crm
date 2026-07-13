import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { NextBestAction } from "@/features/command-center/next-best-action";
import { abrirWhatsMissao, useFilaDeMissoes } from "./use-home-data";
import type { Mission } from "@/features/command-center/derive";
import type { WidgetProps } from "@/features/command-center/widget-registry";

/**
 * Widget hero: a próxima melhor ação, executável em 1 clique. É o ÚNICO
 * widget com `beam-border` — o fio de luz dourado é a assinatura de um
 * hero por tela.
 */
export function NbaWidget(props: WidgetProps) {
  const fila = useFilaDeMissoes(props);

  const hero = (mission: Mission | null, loading?: boolean) => (
    <div className="beam-border rounded-xl">
      <NextBestAction
        mission={mission}
        loading={loading}
        onWhatsApp={abrirWhatsMissao}
        extra={
          <Button
            variant="outline"
            onClick={() => window.dispatchEvent(new Event("open-sprint"))}
            title="Bloco de prospecção focada com fila automática e cronômetro"
          >
            <Zap className="h-4 w-4 text-primary" /> Iniciar Sprint
          </Button>
        }
      />
    </div>
  );

  return (
    <AsyncBoundary
      isLoading={fila.carregando}
      isError={fila.erro}
      error={fila.error}
      errorTitle="Não foi possível montar a sua fila de prioridades."
      onRetry={fila.recarregar}
      loadingFallback={hero(null, true)}
    >
      {hero(fila.missoes[0] ?? null)}
    </AsyncBoundary>
  );
}
