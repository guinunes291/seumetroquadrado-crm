// Tabela de unidades via DataTable do design system (tableId "unidades"):
// sort por coluna, colunas visíveis e densidade persistidas por usuário.
// A edição inline de status é a MESMA da grade — mutation compartilhada pela
// rota via `onChangeStatus`; editar/excluir seguem com o gestor.

import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@/components/ui/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UNIDADE_STATUS_DOT,
  UNIDADE_STATUS_LABEL,
  UNIDADE_STATUS_TONE,
  formatArea,
  formatBRL,
  type UnidadeStatus,
} from "@/lib/unidades";
import { cn } from "@/lib/utils";
import { UNIDADE_STATUS_OPCOES, type UnidadeRow } from "./unidades-grid";

export function UnidadesTable({
  unidades,
  loading,
  canManage,
  onChangeStatus,
  onEdit,
  onDelete,
  empty,
}: {
  unidades: UnidadeRow[];
  loading?: boolean;
  canManage: boolean;
  onChangeStatus: (id: string, status: UnidadeStatus) => void;
  onEdit: (unidade: UnidadeRow) => void;
  onDelete: (unidade: UnidadeRow) => void;
  empty?: React.ReactNode;
}) {
  const columns = useMemo<ColumnDef<UnidadeRow, unknown>[]>(() => {
    const base: ColumnDef<UnidadeRow, unknown>[] = [
      {
        accessorKey: "identificador",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Identificador" />,
        meta: { label: "Identificador" },
        cell: ({ row }) => <span className="font-medium">{row.original.identificador}</span>,
      },
      {
        id: "bloco_andar",
        accessorFn: (u) => [u.bloco, u.andar].filter(Boolean).join(" / "),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Bloco/Andar" />,
        meta: { label: "Bloco/Andar", hideBelow: "sm" },
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground">{String(getValue()) || "—"}</span>
        ),
      },
      {
        accessorKey: "tipologia",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Tipologia" />,
        meta: { label: "Tipologia", hideBelow: "md" },
        cell: ({ row }) => {
          const u = row.original;
          return (
            <span className="text-sm">
              {u.tipologia || "—"}
              {u.dormitorios ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({u.dormitorios}d{u.suites ? `/${u.suites}s` : ""}
                  {u.vagas ? `/${u.vagas}v` : ""})
                </span>
              ) : null}
            </span>
          );
        },
      },
      {
        accessorKey: "area_privativa",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Área" />,
        meta: { label: "Área", hideBelow: "md" },
        cell: ({ row }) => <span>{formatArea(row.original.area_privativa)}</span>,
      },
      {
        accessorKey: "valor",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Valor" />,
        meta: { label: "Valor" },
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums">{formatBRL(row.original.valor)}</span>
        ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        meta: { label: "Status" },
        cell: ({ row }) => {
          const u = row.original;
          return canManage ? (
            <Select
              value={u.status}
              onValueChange={(v) => onChangeStatus(u.id, v as UnidadeStatus)}
            >
              <SelectTrigger className="h-8 w-36" data-no-row-click>
                <span className="flex items-center gap-2">
                  <span
                    className={cn("h-2 w-2 shrink-0 rounded-full", UNIDADE_STATUS_DOT[u.status])}
                  />
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                {UNIDADE_STATUS_OPCOES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {UNIDADE_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline" className={cn(UNIDADE_STATUS_TONE[u.status])}>
              {UNIDADE_STATUS_LABEL[u.status]}
            </Badge>
          );
        },
      },
    ];

    if (canManage) {
      base.push({
        id: "acoes",
        header: "",
        enableSorting: false,
        enableHiding: false,
        size: 96,
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => onEdit(row.original)}>
              Editar
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Remover unidade ${row.original.identificador}`}
              onClick={() => onDelete(row.original)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      });
    }

    return base;
  }, [canManage, onChangeStatus, onEdit, onDelete]);

  return (
    <DataTable
      tableId="unidades"
      aria-label="Unidades do empreendimento"
      columns={columns}
      data={unidades}
      loading={loading}
      empty={empty}
    />
  );
}
