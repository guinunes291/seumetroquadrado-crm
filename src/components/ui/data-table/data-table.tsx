// DataTable premium — a tabela única do design system.
// Sort por coluna (client ou servidor), colunas visíveis/ordem/densidade
// persistidas por usuário, seleção múltipla p/ ações em massa, skeleton de
// células, erro/vazio padronizados, paginação OU virtualização para listas
// longas. Headless por baixo (@tanstack/react-table + react-virtual).

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type RowData,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Checkbox } from "@/components/ui/checkbox";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DataTablePagination, type DataTablePaginationProps } from "./table-pagination";
import { DataTableViewOptions } from "./view-options";
import { useTablePrefs, type TableDensity } from "./use-table-prefs";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Nome exibido no seletor de colunas (default: header string). */
    label?: string;
    align?: "left" | "right" | "center";
    /** Esconde a coluna abaixo do breakpoint (mobile-first). */
    hideBelow?: "sm" | "md" | "lg" | "xl";
    headerClassName?: string;
    cellClassName?: string;
  }
}

const HIDE_BELOW: Record<string, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

const ALIGN: Record<string, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

const ROW_HEIGHT: Record<TableDensity, number> = { comfortable: 44, compact: 36 };

export type DataTableProps<TData> = {
  /** Identificador estável — chave das preferências (`table:${tableId}`). */
  tableId: string;
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  rowKey?: (row: TData) => string;
  loading?: boolean;
  skeletonRows?: number;
  error?: unknown;
  onRetry?: () => void;
  /** Estado vazio (use <EmptyState/> com CTA). */
  empty?: React.ReactNode;
  enableSelection?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (ids: Set<string>) => void;
  /** Sort controlado (servidor). Sem estes props o sort é client-side. */
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  manualSorting?: boolean;
  pagination?: DataTablePaginationProps;
  /** Vira lista virtualizada acima de N linhas (exclusivo com pagination). */
  virtualizeOver?: number;
  density?: TableDensity;
  stickyHeader?: boolean;
  onRowClick?: (row: TData) => void;
  rowClassName?: (row: TData) => string | undefined;
  /** Slot no toolbar, à esquerda do botão Colunas. */
  toolbar?: React.ReactNode;
  /** Esconde o toolbar inteiro (tabelas embutidas simples). */
  hideToolbar?: boolean;
  className?: string;
  "aria-label"?: string;
};

function defaultRowKey<TData>(row: TData): string {
  return String((row as { id?: string | number }).id ?? "");
}

export function DataTable<TData>({
  tableId,
  columns,
  data,
  rowKey = defaultRowKey,
  loading,
  skeletonRows = 8,
  error,
  onRetry,
  empty,
  enableSelection,
  selected,
  onSelectedChange,
  sorting: sortingProp,
  onSortingChange,
  manualSorting,
  pagination,
  virtualizeOver = 80,
  density: densityProp,
  stickyHeader = true,
  onRowClick,
  rowClassName,
  toolbar,
  hideToolbar,
  className,
  "aria-label": ariaLabel,
}: DataTableProps<TData>) {
  const {
    prefs,
    density: prefDensity,
    setHidden,
    setOrder,
    setSort,
    setDensity,
    reset,
  } = useTablePrefs(tableId);
  const density = densityProp ?? prefDensity;

  // ---- Sort: controlado externamente (servidor) OU interno + persistido.
  const [internalSorting, setInternalSorting] = React.useState<SortingState>(() =>
    prefs.sort ? [{ id: prefs.sort.id, desc: prefs.sort.desc }] : [],
  );
  const sorting = sortingProp ?? internalSorting;
  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    if (!sortingProp) setInternalSorting(next);
    onSortingChange?.(next);
    setSort(next[0] ? { id: next[0].id, desc: next[0].desc } : null);
  };

  // ---- Colunas: seleção injetada + visibilidade/ordem persistidas.
  const allColumns = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!enableSelection) return columns;
    const selectCol: ColumnDef<TData, unknown> = {
      id: "__select",
      enableSorting: false,
      enableHiding: false,
      size: 36,
      header: () => {
        const keys = data.map(rowKey);
        const all = keys.length > 0 && keys.every((k) => selected?.has(k));
        const some = !all && keys.some((k) => selected?.has(k));
        return (
          <Checkbox
            checked={all ? true : some ? "indeterminate" : false}
            onCheckedChange={(v) => {
              const next = new Set(selected);
              if (v) keys.forEach((k) => next.add(k));
              else keys.forEach((k) => next.delete(k));
              onSelectedChange?.(next);
            }}
            aria-label="Selecionar todos desta página"
          />
        );
      },
      cell: ({ row }) => {
        const k = rowKey(row.original);
        return (
          <Checkbox
            checked={selected?.has(k) ?? false}
            onCheckedChange={(v) => {
              const next = new Set(selected);
              if (v) next.add(k);
              else next.delete(k);
              onSelectedChange?.(next);
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label="Selecionar linha"
          />
        );
      },
    };
    return [selectCol, ...columns];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, enableSelection, selected, onSelectedChange, data]);

  const columnVisibility = React.useMemo<VisibilityState>(() => {
    const vis: VisibilityState = {};
    for (const id of prefs.hidden ?? []) vis[id] = false;
    return vis;
  }, [prefs.hidden]);

  const table = useReactTable({
    data,
    columns: allColumns,
    state: {
      sorting,
      columnVisibility,
      columnOrder: prefs.order ?? [],
    },
    onSortingChange: handleSortingChange,
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnVisibility) : updater;
      setHidden(
        Object.entries(next)
          .filter(([, visible]) => visible === false)
          .map(([id]) => id),
      );
    },
    onColumnOrderChange: (updater) => {
      const current = prefs.order ?? [];
      const next = typeof updater === "function" ? updater(current) : updater;
      setOrder(next.length ? next : undefined);
    },
    manualSorting,
    enableSortingRemoval: true,
    getCoreRowModel: getCoreRowModel(),
    ...(manualSorting ? {} : { getSortedRowModel: getSortedRowModel() }),
  });

  const rows = table.getRowModel().rows;
  const virtualized = !pagination && data.length > virtualizeOver;

  // ---- Virtualização por linhas de altura fixa (spacer rows preservam a
  // semântica de <table>). Só o miolo visível entra no DOM.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT[density],
    overscan: 12,
    enabled: virtualized,
  });

  const virtualItems = virtualized ? rowVirtualizer.getVirtualItems() : null;
  const paddingTop = virtualItems && virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems && virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  const visibleLeafCount = table.getVisibleLeafColumns().length;

  const cellPad = density === "compact" ? "px-2 py-1.5" : "p-2";
  const rowH = density === "compact" ? "h-9" : "h-11";

  const bodyRows = (list: typeof rows) =>
    list.map((row) => {
      const original = row.original;
      return (
        <tr
          key={row.id}
          data-row-key={rowKey(original)}
          onClick={
            onRowClick
              ? (e) => {
                  const el = e.target as HTMLElement;
                  // Cliques em controles internos não abrem a linha.
                  if (
                    el.closest(
                      "button, a, input, select, textarea, [role=menuitem], [role=checkbox], [data-no-row-click]",
                    )
                  )
                    return;
                  onRowClick(original);
                }
              : undefined
          }
          className={cn(
            "border-b border-border-subtle transition-colors",
            rowH,
            onRowClick && "cursor-pointer hover:bg-muted/50",
            !onRowClick && "hover:bg-muted/30",
            rowClassName?.(original),
          )}
        >
          {row.getVisibleCells().map((cell) => {
            const meta = cell.column.columnDef.meta;
            return (
              <td
                key={cell.id}
                className={cn(
                  cellPad,
                  "align-middle",
                  meta?.align && ALIGN[meta.align],
                  meta?.hideBelow && HIDE_BELOW[meta.hideBelow],
                  meta?.cellClassName,
                )}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            );
          })}
        </tr>
      );
    });

  return (
    <div className={cn("space-y-2", className)}>
      {!hideToolbar && (
        <div className="flex items-center justify-end gap-2">
          {toolbar}
          <DataTableViewOptions
            table={table}
            density={density}
            onDensityChange={setDensity}
            onReset={reset}
          />
        </div>
      )}

      <div
        ref={scrollRef}
        className={cn(
          "rounded-xl border border-border-subtle bg-card shadow-elev-1",
          "overflow-x-auto",
          virtualized && "max-h-[70vh] overflow-y-auto",
        )}
      >
        <table className="w-full caption-bottom text-sm" aria-label={ariaLabel}>
          <thead
            className={cn(
              "[&_tr]:border-b [&_tr]:border-border-subtle",
              stickyHeader && "sticky top-0 z-10 bg-card/95 backdrop-blur-sm",
            )}
          >
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      aria-sort={
                        sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : undefined
                      }
                      style={
                        header.column.columnDef.size
                          ? { width: header.column.columnDef.size }
                          : undefined
                      }
                      className={cn(
                        "h-10 whitespace-nowrap text-left align-middle font-medium text-muted-foreground",
                        cellPad,
                        meta?.align && ALIGN[meta.align],
                        meta?.hideBelow && HIDE_BELOW[meta.hideBelow],
                        meta?.headerClassName,
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {error ? (
              <tr>
                <td colSpan={visibleLeafCount} className="p-4">
                  <QueryErrorState
                    error={error}
                    title="Não foi possível carregar os dados."
                    onRetry={onRetry}
                  />
                </td>
              </tr>
            ) : loading ? (
              Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={`sk-${i}`} className={cn("border-b border-border-subtle", rowH)}>
                  {table.getVisibleLeafColumns().map((col) => {
                    const meta = col.columnDef.meta;
                    return (
                      <td
                        key={col.id}
                        className={cn(cellPad, meta?.hideBelow && HIDE_BELOW[meta.hideBelow])}
                      >
                        <Skeleton
                          className={cn("h-4", col.id === "__select" ? "w-4" : "w-full max-w-32")}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={visibleLeafCount} className="p-6">
                  {empty ?? (
                    <p className="text-center text-sm text-muted-foreground">
                      Nenhum registro encontrado.
                    </p>
                  )}
                </td>
              </tr>
            ) : virtualized && virtualItems ? (
              <>
                {paddingTop > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={visibleLeafCount} style={{ height: paddingTop, padding: 0 }} />
                  </tr>
                )}
                {bodyRows(virtualItems.map((vi) => rows[vi.index]))}
                {paddingBottom > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={visibleLeafCount} style={{ height: paddingBottom, padding: 0 }} />
                  </tr>
                )}
              </>
            ) : (
              bodyRows(rows)
            )}
          </tbody>
        </table>
      </div>

      {pagination && !loading && !error && <DataTablePagination {...pagination} />}
      {virtualized && (
        <p className="px-1 text-xs text-muted-foreground tabular-nums">
          {data.length.toLocaleString("pt-BR")} registros — rolagem virtualizada
        </p>
      )}
    </div>
  );
}
