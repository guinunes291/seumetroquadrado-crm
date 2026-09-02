import { useMemo } from "react";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { DayGoals } from "@/features/command-center/day-goals";
import { diaSaoPaulo } from "@/features/metas-dia/metas-dia";
import { useMetaDeHoje, useRealizadoHoje } from "@/features/metas-dia/use-metas-dia";
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
 *
 * Um número só em todas as telas: quando o corretor declarou as metas no popup
 * do dia, as linhas de agendamentos e documentações usam a META DECLARADA e o
 * MESMO realizado do card flutuante (mesmas queries → react-query deduplica).
 * Sem resposta de hoje, cai na meta sugerida pelo gestor (metas_diarias).
 */
export function MetasWidget(props: WidgetProps) {
  const { periodo } = props;
  const { di, df } = useMemo(() => intervalo(periodo), [periodo]);
  const dia = diaSaoPaulo();

  const atividadesQ = useAtividadesDiarias(props, di, df);
  const metaQ = useMetaDiariaAgregada(props);
  const streakQ = useStreakAtividade(props);
  const declaradaQ = useMetaDeHoje(dia);
  const realizadoQ = useRealizadoHoje(dia, periodo === "hoje" && !!declaradaQ.data);

  const totais = useMemo(() => somarAtividades(atividadesQ.data), [atividadesQ.data]);
  const cards = useMemo(() => {
    const base = buildAtividadeCards(totais, metaQ.data);
    const declarada = periodo === "hoje" ? declaradaQ.data : null;
    if (!declarada) return base.filter((c) => c.key !== "documentacoes");
    const r = realizadoQ.data;
    return base
      .map((c) => {
        if (c.key === "agendamentos") {
          return { ...c, value: r?.agendamentos ?? c.value, meta: declarada.meta_agendamentos };
        }
        if (c.key === "documentacoes") {
          return { ...c, value: r?.documentacoes ?? c.value, meta: declarada.meta_documentacoes };
        }
        return c;
      })
      .filter((c) => c.key !== "documentacoes" || declarada.meta_documentacoes > 0);
  }, [totais, metaQ.data, declaradaQ.data, realizadoQ.data, periodo]);

  // Metas são diárias: só mostramos progresso de meta no período "hoje".
  const mostrarMeta = periodo === "hoje" && (!!metaQ.data || !!declaradaQ.data);

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
        void declaradaQ.refetch();
      }}
      loadingFallback={<DayGoals items={[]} streak={0} loading showMeta={false} />}
    >
      <DayGoals items={cards} streak={streakQ.data ?? 0} showMeta={mostrarMeta} />
    </AsyncBoundary>
  );
}
