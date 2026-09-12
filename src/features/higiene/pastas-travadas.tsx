import { Link } from "@tanstack/react-router";
import { ArrowSquareOut, Copy, Warning } from "@phosphor-icons/react";
import { useHigienePastas } from "@/hooks/use-higiene-funil";
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

export function PastasTravadas() {
  const { data, isPending, isError, error, refetch } = useHigienePastas();

  if (isError) {
    return (
      <QueryErrorState
        title="Não foi possível carregar as pastas com pendência."
        error={error}
        onRetry={() => void refetch()}
      />
    );
  }

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title="Nenhuma pasta com documento pendente"
        description="Toda documentação em aberto foi resolvida."
      />
    );
  }

  const fechadas = data.filter((p) => p.fechado_com_pendencia).length;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {data.length} {data.length === 1 ? "pasta" : "pastas"} com documento pendente.
        {fechadas > 0 && (
          <>
            {" "}
            <strong className="text-destructive">
              {fechadas} {fechadas === 1 ? "é de venda já assinada" : "são de vendas já assinadas"}
            </strong>{" "}
            — papel em aberto depois do contrato é o caso mais caro da lista.
          </>
        )}
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20 text-right">Dias</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Fase</TableHead>
              <TableHead>Corretor</TableHead>
              <TableHead className="w-16 text-right">Docs</TableHead>
              <TableHead>O que falta</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((p) => (
              <TableRow key={p.lead_id}>
                <TableCell className="text-right tabular-nums">{p.dias_sem_movimento}</TableCell>
                <TableCell>
                  <div className="font-medium">{p.lead_nome}</div>
                  <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <span>{p.telefone}</span>
                    {p.fechado_com_pendencia && (
                      <StatusBadge intent="danger" bordered>
                        <Warning className="mr-1 h-3 w-3" />
                        venda assinada
                      </StatusBadge>
                    )}
                    {p.pasta_duplicada && (
                      <StatusBadge intent="info" bordered className="gap-1">
                        <Copy className="h-3 w-3" />
                        duplicado
                      </StatusBadge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge hue={LEAD_STATUS_HUE[p.lead_status as LeadStatus]}>
                    {LEAD_STATUS_LABEL[p.lead_status as LeadStatus] ?? p.lead_status}
                  </StatusBadge>
                </TableCell>
                <TableCell className="text-sm">
                  {p.corretor_nome ?? (
                    <StatusBadge intent="danger" bordered>
                      sem corretor
                    </StatusBadge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{p.docs_pendentes}</TableCell>
                <TableCell className="max-w-sm text-sm text-muted-foreground">
                  {p.o_que_falta}
                </TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/leads/$leadId" params={{ leadId: p.lead_id }}>
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
