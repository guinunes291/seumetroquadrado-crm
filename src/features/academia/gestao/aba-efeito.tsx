// Aba "Efeito": para módulo concluído por recomendação, o indicador antes (a
// janela que disparou) contra o depois (a mesma janela contada da conclusão).
// Amostra abaixo de 5 é "indício, não prova": a tela diz isso em voz alta.

import { ChartLineUp } from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { dataBr } from "../formato";
import { formatarIndicador, leituraDoEfeito, rotuloIndicador } from "./derivacao";
import { useEfeito, useEquipeAcademia } from "./gestao-client";

const ROTULO_ESTADO = {
  aguardando: { texto: "Janela ainda aberta", intent: "neutral" },
  melhorou: { texto: "Melhorou", intent: "success" },
  piorou: { texto: "Piorou", intent: "danger" },
  igual: { texto: "Igual", intent: "neutral" },
} as const;

export function AbaEfeito() {
  const efeito = useEfeito();
  const equipe = useEquipeAcademia();

  if (efeito.isError) {
    return (
      <QueryErrorState
        title="Não foi possível carregar o efeito das recomendações."
        error={efeito.error}
        onRetry={() => void efeito.refetch()}
      />
    );
  }
  if (efeito.isPending || equipe.isPending) return <Skeleton className="h-48 w-full" />;
  if (efeito.data === null) {
    return (
      <EmptyState
        icon={ChartLineUp}
        title="O efeito ainda não está no banco."
        description="Rode o SQL da gestão da Academia no editor do Lovable Cloud para liberar esta aba."
      />
    );
  }
  if (efeito.data.length === 0) {
    return (
      <EmptyState
        icon={ChartLineUp}
        title="Nenhum módulo concluído por recomendação ainda."
        description="Quando alguém concluir um módulo que veio de uma recomendação, o antes e o depois aparecem aqui."
      />
    );
  }

  const nomes = new Map(
    (equipe.data?.corretores ?? []).map((c) => [c.corretor_id, c.corretor_nome]),
  );

  return (
    <div className="space-y-2">
      {efeito.data.map((e) => {
        const leitura = leituraDoEfeito(e);
        const rotulo = ROTULO_ESTADO[leitura.estado];
        return (
          <Card key={e.recomendacao_id}>
            <CardContent className="space-y-1 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{nomes.get(e.corretor_id) ?? "Corretor"}</p>
                <StatusBadge intent={rotulo.intent}>{rotulo.texto}</StatusBadge>
                {leitura.estado !== "aguardando" && leitura.indicio && (
                  <StatusBadge intent="warning">Indício, não prova</StatusBadge>
                )}
              </div>
              <p className="text-sm">
                {rotuloIndicador(e.indicador)}: {formatarIndicador(e.indicador, e.valor_antes)}{" "}
                antes
                {" · "}
                {e.valor_depois === null
                  ? `depois só em ${dataBr(e.data_depois)}`
                  : `${formatarIndicador(e.indicador, e.valor_depois)} depois`}
              </p>
              <p className="text-xs text-muted-foreground">
                {e.modulo_codigo ?? "Módulo"} concluído em {dataBr(e.concluida_em)} · amostra{" "}
                {e.amostra_antes ?? 0} antes e {e.amostra_depois ?? 0} depois · janela de{" "}
                {e.janela_dias} dias · regra {e.regra_codigo}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
