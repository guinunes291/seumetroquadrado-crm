import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { Column } from "@tanstack/react-table";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho de coluna ordenável — ciclo asc → desc → sem ordenação.
 * O aria-sort vive no <th> (aplicado pelo DataTable); aqui é só o controle.
 */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
}) {
  if (!column.getCanSort()) {
    return <span className={cn("text-sm font-medium", className)}>{title}</span>;
  }

  const sorted = column.getIsSorted();

  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(undefined)}
      aria-label={
        sorted === "asc"
          ? `${title} — ordenado crescente; clique para decrescente`
          : sorted === "desc"
            ? `${title} — ordenado decrescente; clique para limpar`
            : `Ordenar por ${title}`
      }
      className={cn(
        "group -ml-1 inline-flex min-h-8 cursor-pointer items-center gap-1 rounded px-1 text-sm font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        sorted ? "text-foreground" : "text-muted-foreground",
        className,
      )}
    >
      {title}
      {sorted === "asc" ? (
        <ArrowUp className="h-3.5 w-3.5 text-primary" />
      ) : sorted === "desc" ? (
        <ArrowDown className="h-3.5 w-3.5 text-primary" />
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
      )}
    </button>
  );
}
