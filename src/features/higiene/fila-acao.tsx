import { Link } from "@tanstack/react-router";
import { ArrowSquareOut, Stack, Warning } from "@phosphor-icons/react";
import { useHigieneFila, type FiltroFila } from "@/hooks/use-higiene-funil";
import { LEAD_STATUS_HUE, LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/leads";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PRIORIDADE_INTENT = { 1: "danger", 2: "warning", 3: "neutral" } as const;

export function FilaAcao({ filtro, prazoDias }: { filtro: FiltroFila; prazoDias?: number }) {
  const { data, isPending, isError, error, refetch } = useHigieneFila(filtro);

  // Falha de leitura não pode se disfarçar de fila limpa: são estados opostos
  // e um deles é notícia boa.
  if (isError) {
    return (
      <QueryErrorState
        title="Não foi possível carregar a fila de higiene."
        error={error}
        onRetry={() => void refetch()}
      />
    );
  }

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title="Nenhum lead parado em fase de ação"
        description={
          <>
            Nenhum lead está há {prazoDias ?? 5}+ dias sem movimento nas fases que geram ação.
            {(filtro.incluirLote === false || filtro.incluirNuncaTocado === false) && (
              <> Há filtros ativos — desligue-os para ver a fila completa.</>
            )}
          </>
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {data.length} {data.length === 1 ? "lead parado" : "leads parados"} em fase de ação,
        {data.length === 300 ? " mostrando os 300 mais urgentes," : ""} ordenados por peso da fase:
        crédito e visita primeiro, porque é onde está o dinheiro.
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Prio</TableHead>
              <TableHead className="w-20 text-right">Dias</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Fase</TableHead>
              <TableHead>Corretor</TableHead>
              <TableHead>O que fazer</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((l) => (
              <TableRow key={l.lead_id}>
                <TableCell>
                  <StatusBadge intent={PRIORIDADE_INTENT[l.prioridade as 1 | 2 | 3] ?? "neutral"}>
                    P{l.prioridade}
                  </StatusBadge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{l.dias_parado}</TableCell>
                <TableCell>
                  <div className="font-medium">{l.nome}</div>
                  <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <span>{l.telefone}</span>
                    {/* Os dois avisos que impedem a fila de mentir. */}
                    {l.escrita_em_lote && (
                      <StatusBadge intent="info" bordered className="gap-1">
                        <Stack className="h-3 w-3" />
                        lote
                      </StatusBadge>
                    )}
                    {l.nunca_tocado && (
                      <StatusBadge intent="warning" bordered>
                        nunca tocado
                      </StatusBadge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge hue={LEAD_STATUS_HUE[l.status as LeadStatus]}>
                    {LEAD_STATUS_LABEL[l.status as LeadStatus] ?? l.status}
                  </StatusBadge>
                </TableCell>
                <TableCell className="text-sm">
                  {l.corretor_nome ?? (
                    <StatusBadge intent="danger" bordered>
                      <Warning className="mr-1 h-3 w-3" />
                      sem corretor
                    </StatusBadge>
                  )}
                </TableCell>
                <TableCell className="max-w-md text-sm text-muted-foreground">
                  {l.acao_sugerida}
                </TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/leads/$leadId" params={{ leadId: l.lead_id }}>
                      Abrir
                      <ArrowSquareOut className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
