// Kanban da cadência — onde está cada cliente que ainda não respondeu.
//
// Quatro colunas, uma por etapa: Lead chegou, 1º follow-up, 2º follow-up e
// encerramento. Diferente da Fila do Dia (só o que vence hoje ou já venceu),
// aqui aparece a cadência INTEIRA do corretor, inclusive quem só vence
// amanhã — é a visão de "quantos estão em cada ponto", não a lista de
// trabalho.
//
// Sem arrastar card, de propósito: a etapa anda com ligação e WhatsApp
// registrados, e quem a faz andar é o motor no banco. Arrastar seria a
// autodeclaração que a validação dos 100% existe para eliminar. Para agir, o
// card abre a ficha e o cabeçalho leva à Fila do Dia.

import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, Envelope } from "@phosphor-icons/react";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  agruparPorEtapa,
  fetchKanbanCadencia,
  type CadenciaItem,
} from "@/features/cadencia/client";
import {
  ETAPAS_CADENCIA,
  rotuloPrazo,
  rotuloProgresso,
  type EtapaCadencia,
} from "@/features/cadencia/templates";

/** Os nomes das colunas são os do dono da operação, palavra por palavra. */
const COLUNAS: Record<EtapaCadencia, { titulo: string; tarefa: string }> = {
  D0: { titulo: "Clientes que chegaram hoje", tarefa: "Abertura + 2 ligações + WhatsApp" },
  D1: { titulo: "Clientes para o 1º follow-up", tarefa: "2 ligações + WhatsApp" },
  D2: { titulo: "Clientes para o 2º follow-up", tarefa: "2 ligações + WhatsApp" },
  D3: { titulo: "Clientes para o follow-up de encerramento", tarefa: "Mensagem de encerramento" },
};

export function KanbanCadenciaView() {
  const { user } = useAuth();

  const kanban = useQuery({
    queryKey: ["cadencia:kanban", user?.id],
    queryFn: () => fetchKanbanCadencia(),
    enabled: Boolean(user?.id),
  });

  const colunas = useMemo(() => agruparPorEtapa(kanban.data?.itens ?? []), [kanban.data]);

  if (kanban.isLoading) {
    return (
      <div
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-busy="true"
        aria-label="Carregando o Kanban"
      >
        {ETAPAS_CADENCIA.map((e) => (
          <Skeleton key={e} className="h-64 w-full" />
        ))}
      </div>
    );
  }

  if (kanban.isError) {
    return <QueryErrorState error={kanban.error as Error} onRetry={() => void kanban.refetch()} />;
  }

  const itens = kanban.data?.itens ?? [];
  const total = kanban.data?.total ?? 0;

  if (itens.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle}
        title="Nenhum cliente na cadência"
        description="Todo lead novo que chega para você entra aqui, na coluna dos que chegaram hoje, e anda sozinho a cada etapa cumprida."
        className="py-16"
      />
    );
  }

  const atrasados = itens.filter((i) => i.atrasado).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          <strong className="text-foreground">{total}</strong> cliente{total === 1 ? "" : "s"} na
          cadência
        </span>
        {atrasados > 0 && (
          <Badge variant="destructive">
            {atrasados} atrasado{atrasados > 1 ? "s" : ""}
          </Badge>
        )}
        {total > itens.length && (
          // O teto da leitura cortou: dizer quantos ficaram de fora em vez de
          // deixar o corretor achar que a carteira é menor do que é.
          <span>· mostrando {itens.length}</span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ETAPAS_CADENCIA.map((etapa) => (
          <Coluna key={etapa} etapa={etapa} itens={colunas[etapa]} />
        ))}
      </div>
    </div>
  );
}

function Coluna({ etapa, itens }: { etapa: EtapaCadencia; itens: CadenciaItem[] }) {
  const { titulo, tarefa } = COLUNAS[etapa];
  return (
    <section
      aria-label={titulo}
      className="flex min-w-0 flex-col rounded-lg border bg-muted/30 p-3"
    >
      <header className="mb-3 space-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold leading-tight">{titulo}</h2>
          <Badge variant="secondary" className="shrink-0">
            {itens.length}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{tarefa}</p>
      </header>

      {itens.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Ninguém nesta etapa.</p>
      ) : (
        <ul className="space-y-2 xl:max-h-[70vh] xl:overflow-y-auto xl:pr-1">
          {itens.map((item) => (
            <CardDoKanban key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CardDoKanban({ item }: { item: CadenciaItem }) {
  return (
    <li>
      <Card className={cn(item.atrasado && "border-destructive/50")}>
        <CardContent className="space-y-1.5 p-3">
          <Link
            to="/leads/$leadId"
            params={{ leadId: item.id }}
            className="block truncate text-sm font-medium hover:underline"
          >
            {item.nome}
          </Link>
          {item.projeto_nome && (
            <p className="truncate text-xs text-muted-foreground">{item.projeto_nome}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {rotuloProgresso(item, { semEtapa: true })}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant={item.atrasado ? "destructive" : "outline"}
              className="text-[11px] font-normal"
            >
              {rotuloPrazo(item.prazo, item.atrasado)}
            </Badge>
            {item.reativado && (
              <Badge variant="secondary" className="text-[11px] font-normal">
                Reativado
              </Badge>
            )}
            {item.telefone_suspeito && (
              <Badge variant="outline" className="gap-1 text-[11px] font-normal">
                <Envelope size={11} weight="bold" /> Só e-mail
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
