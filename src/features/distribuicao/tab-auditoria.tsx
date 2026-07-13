// Aba Auditoria — quem mexeu nas roletas (inclusões, remoções, pausas,
// limites) e as decisões que falharam (sem corretor / erro / exceção).

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScrollText, Users } from "lucide-react";
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { ACAO_PARTICIPANTE_LABEL, roletaLabel, RESULTADO_LABEL } from "@/lib/distribuicao";
import {
  useHistoricoDistribuicao,
  useNomesPerfis,
  useParticipantesLog,
  useRoletas,
  type LogLinha,
  type ParticipanteLogLinha,
} from "./queries";

export function TabAuditoria() {
  const logQ = useParticipantesLog(null);
  const roletasQ = useRoletas();
  const nomesQ = useNomesPerfis();
  // Filtro no servidor: num sistema saudável, 300 linhas de sucesso
  // esconderiam justamente as falhas que esta aba existe para mostrar.
  const falhasQ = useHistoricoDistribuicao({ dias: 30, apenasFalhas: true, limite: 100 });

  const nomes = nomesQ.data;
  const roletaPorId = useMemo(
    () => new Map((roletasQ.data ?? []).map((r) => [r.id, r.slug])),
    [roletasQ.data],
  );

  const participacaoColumns = useMemo<ColumnDef<ParticipanteLogLinha, unknown>[]>(
    () => [
      {
        accessorKey: "created_at",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Quando" />,
        meta: { label: "Quando", cellClassName: "whitespace-nowrap" },
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {format(parseISO(row.original.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
          </span>
        ),
      },
      {
        id: "roleta",
        accessorFn: (l) => roletaLabel(roletaPorId.get(l.roleta_id) ?? null),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Roleta" />,
        meta: { label: "Roleta", hideBelow: "sm" },
        cell: ({ getValue }) => <span className="text-xs">{String(getValue())}</span>,
      },
      {
        id: "corretor",
        accessorFn: (l) => nomes?.get(l.corretor_id) ?? "—",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Corretor" />,
        meta: { label: "Corretor" },
        cell: ({ getValue }) => <span className="font-medium">{String(getValue())}</span>,
      },
      {
        accessorKey: "acao",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Ação" />,
        meta: { label: "Ação" },
        cell: ({ row }) => (
          <StatusBadge
            intent={
              row.original.acao === "incluido" || row.original.acao === "reativado"
                ? "success"
                : row.original.acao === "removido"
                  ? "danger"
                  : "warning"
            }
          >
            {ACAO_PARTICIPANTE_LABEL[row.original.acao] ?? row.original.acao}
          </StatusBadge>
        ),
      },
      {
        accessorKey: "motivo",
        header: "Motivo",
        enableSorting: false,
        meta: { label: "Motivo", hideBelow: "md" },
        cell: ({ row }) => (
          <span className="block max-w-72 truncate text-xs text-muted-foreground">
            {row.original.motivo ?? "—"}
          </span>
        ),
      },
      {
        id: "feito_por",
        accessorFn: (l) => (l.feito_por ? (nomes?.get(l.feito_por) ?? "—") : "sistema/migração"),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Feito por" />,
        meta: { label: "Feito por", hideBelow: "lg" },
        cell: ({ getValue }) => <span className="text-xs">{String(getValue())}</span>,
      },
    ],
    [nomes, roletaPorId],
  );

  const falhasColumns = useMemo<ColumnDef<LogLinha, unknown>[]>(
    () => [
      {
        accessorKey: "created_at",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Quando" />,
        meta: { label: "Quando", cellClassName: "whitespace-nowrap" },
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {format(parseISO(row.original.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
          </span>
        ),
      },
      {
        id: "lead",
        accessorFn: (l) => l.leads?.nome ?? "(lead)",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Lead" />,
        meta: { label: "Lead" },
        cell: ({ getValue }) => <span className="font-medium">{String(getValue())}</span>,
      },
      {
        id: "roleta",
        accessorFn: (l) => roletaLabel(l.roleta_slug),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Roleta" />,
        meta: { label: "Roleta", hideBelow: "sm" },
        cell: ({ getValue }) => <span className="text-xs">{String(getValue())}</span>,
      },
      {
        accessorKey: "resultado",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Resultado" />,
        meta: { label: "Resultado" },
        cell: ({ row }) => (
          <StatusBadge intent={row.original.resultado === "erro" ? "danger" : "warning"}>
            {RESULTADO_LABEL[row.original.resultado] ?? row.original.resultado}
          </StatusBadge>
        ),
      },
      {
        accessorKey: "motivo",
        header: "Motivo",
        enableSorting: false,
        meta: { label: "Motivo", hideBelow: "md" },
        cell: ({ row }) => (
          <span className="block max-w-96 truncate text-xs text-muted-foreground">
            {row.original.motivo ?? "—"}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <section>
        <SectionHeader
          eyebrow="Auditoria"
          title={
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-primary" /> Participação nas roletas — quem incluiu,
              removeu, pausou e quando
            </span>
          }
        />
        <DataTable
          tableId="distribuicao-auditoria"
          aria-label="Log de participação nas roletas"
          columns={participacaoColumns}
          data={logQ.data ?? []}
          loading={logQ.isLoading}
          error={logQ.isError ? logQ.error : undefined}
          onRetry={() => void logQ.refetch()}
          empty={<EmptyState icon={Users} title="Nenhuma mudança de participação registrada" />}
        />
      </section>

      <section>
        <SectionHeader
          eyebrow="Auditoria"
          title={
            <span className="flex items-center gap-1.5">
              <ScrollText className="h-4 w-4 text-primary" /> Decisões com falha (30 dias)
            </span>
          }
        />
        <DataTable
          tableId="distribuicao-auditoria-falhas"
          aria-label="Decisões de distribuição com falha nos últimos 30 dias"
          columns={falhasColumns}
          data={falhasQ.data ?? []}
          loading={falhasQ.isLoading}
          error={falhasQ.isError ? falhasQ.error : undefined}
          onRetry={() => void falhasQ.refetch()}
          empty={
            <EmptyState icon={ScrollText} title="Nenhuma falha de distribuição em 30 dias 👏" />
          }
        />
      </section>
    </div>
  );
}
