// Aba Auditoria — quem mexeu nas roletas (inclusões, remoções, pausas,
// limites) e as decisões que falharam (sem corretor / erro / exceção).

import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScrollText, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ACAO_PARTICIPANTE_LABEL, roletaLabel, RESULTADO_LABEL } from "@/lib/distribuicao";
import {
  useHistoricoDistribuicao,
  useNomesPerfis,
  useParticipantesLog,
  useRoletas,
} from "./queries";

export function TabAuditoria() {
  const logQ = useParticipantesLog(null);
  const roletasQ = useRoletas();
  const nomesQ = useNomesPerfis();
  const falhasQ = useHistoricoDistribuicao({ dias: 30 });

  const nomes = nomesQ.data;
  const roletaPorId = new Map((roletasQ.data ?? []).map((r) => [r.id, r.slug]));
  const falhas = (falhasQ.data ?? []).filter((l) => l.resultado !== "sucesso").slice(0, 100);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Users className="h-4 w-4 text-primary" /> Participação nas roletas — quem incluiu,
            removeu, pausou e quando
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {logQ.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (logQ.data ?? []).length === 0 ? (
            <EmptyState title="Nenhuma mudança de participação registrada" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Roleta</TableHead>
                  <TableHead>Corretor</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Feito por</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(logQ.data ?? []).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {format(parseISO(l.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-xs">
                      {roletaLabel(roletaPorId.get(l.roleta_id) ?? null)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {nomes?.get(l.corretor_id) ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        intent={
                          l.acao === "incluido" || l.acao === "reativado"
                            ? "success"
                            : l.acao === "removido"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {ACAO_PARTICIPANTE_LABEL[l.acao] ?? l.acao}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="max-w-72 truncate text-xs text-muted-foreground">
                      {l.motivo ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {l.feito_por ? (nomes?.get(l.feito_por) ?? "—") : "sistema/migração"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <ScrollText className="h-4 w-4 text-primary" /> Decisões com falha (30 dias)
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {falhasQ.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : falhas.length === 0 ? (
            <EmptyState title="Nenhuma falha de distribuição em 30 dias 👏" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Roleta</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {falhas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {format(parseISO(l.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="font-medium">{l.leads?.nome ?? "(lead)"}</TableCell>
                    <TableCell className="text-xs">{roletaLabel(l.roleta_slug)}</TableCell>
                    <TableCell>
                      <StatusBadge intent={l.resultado === "erro" ? "danger" : "warning"}>
                        {RESULTADO_LABEL[l.resultado] ?? l.resultado}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="max-w-96 truncate text-xs text-muted-foreground">
                      {l.motivo ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
