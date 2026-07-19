import { useMemo } from "react";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { DayGoals } from "@/features/command-center/day-goals";
import {
  buildAtividadeCards,
  intervalo,
  somarAtividades,
  useAtividadesDiarias,
  useMetaDiariaAgregada,
  useStreakAtividade,
} from "./use-home-data";
import type { WidgetProps } from "@/features/command-center/widget-registry";

/**
 * Widget de metas do dia: barras de progresso compactas (valor × meta diária)
 * + streak de atividade. Compartilha o período com o widget de produtividade
 * — as queries são as mesmas e o react-query deduplica.
 */
export function MetasWidget(props: WidgetProps) {
  const { periodo } = props;
  const { di, df } = useMemo(() => intervalo(periodo), [periodo]);

  const atividadesQ = useAtividadesDiarias(props, di, df);
  const metaQ = useMetaDiariaAgregada(props);
  const streakQ = useStreakAtividade(props);

  const totais = useMemo(() => somarAtividades(atividadesQ.data), [atividadesQ.data]);
  const cards = buildAtividadeCards(totais, metaQ.data);

  // Metas são diárias: só mostramos progresso de meta no período "hoje".
  const mostrarMeta = periodo === "hoje" && !!metaQ.data;

  return (
    <AsyncBoundary
      isLoading={atividadesQ.isLoading || metaQ.isLoading || streakQ.isLoading}
      isError={atividadesQ.isError || metaQ.isError || streakQ.isError}
      error={atividadesQ.error ?? metaQ.error ?? streakQ.error}
      errorTitle="Não foi possível carregar as metas do dia."
      onRetry={() => {
        void atividadesQ.refetch();
        void metaQ.refetch();
        void streakQ.refetch();
      }}
      loadingFallback={<DayGoals items={[]} streak={0} loading showMeta={false} />}
    >
      <DayGoals
        items={cards.filter((c) => c.key !== "documentacoes")}
        streak={streakQ.data ?? 0}
        showMeta={mostrarMeta}
      />
    </AsyncBoundary>
  );
}
