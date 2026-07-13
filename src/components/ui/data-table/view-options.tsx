import { ArrowDown, ArrowUp, Check, Rows3, Settings2 } from "lucide-react";
import type { Table } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TableDensity } from "./use-table-prefs";

/**
 * Controles da tabela: mostrar/ocultar colunas, reordenar (setas — acessível
 * sem drag) e densidade. Tudo persiste por usuário via useTablePrefs.
 */
export function DataTableViewOptions<TData>({
  table,
  density,
  onDensityChange,
  onReset,
}: {
  table: Table<TData>;
  density: TableDensity;
  onDensityChange: (d: TableDensity) => void;
  onReset: () => void;
}) {
  const leafColumns = table
    .getAllLeafColumns()
    .filter((c) => c.id !== "__select" && c.getCanHide());

  const move = (id: string, dir: -1 | 1) => {
    const order = table.getState().columnOrder.length
      ? [...table.getState().columnOrder]
      : table.getAllLeafColumns().map((c) => c.id);
    const idx = order.indexOf(id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= order.length) return;
    // Nunca move para antes da coluna de seleção.
    if (order[target] === "__select") return;
    [order[idx], order[target]] = [order[target], order[idx]];
    table.setColumnOrder(order);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 className="h-4 w-4" />
          <span className="hidden sm:inline">Colunas</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Colunas visíveis</DropdownMenuLabel>
        <div className="max-h-72 overflow-y-auto">
          {leafColumns.map((column) => {
            const label =
              (column.columnDef.meta?.label ??
                (typeof column.columnDef.header === "string"
                  ? column.columnDef.header
                  : column.id)) ||
              column.id;
            const visible = column.getIsVisible();
            return (
              <div
                key={column.id}
                className="flex items-center gap-1 rounded-sm px-2 py-1 hover:bg-accent"
              >
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={visible}
                  onClick={() => column.toggleVisibility(!visible)}
                  className="flex min-h-8 flex-1 cursor-pointer items-center gap-2 text-left text-sm"
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-sm border",
                      visible ? "border-primary bg-primary text-primary-foreground" : "opacity-60",
                    )}
                  >
                    {visible && <Check className="h-3 w-3" />}
                  </span>
                  <span className="flex-1 truncate">{label}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Mover ${label} para cima`}
                  onClick={() => move(column.id, -1)}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Mover ${label} para baixo`}
                  onClick={() => move(column.id, 1)}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-2">
          <Rows3 className="h-3.5 w-3.5" /> Densidade
        </DropdownMenuLabel>
        <div className="flex gap-1 px-2 pb-1.5">
          {(
            [
              ["comfortable", "Confortável"],
              ["compact", "Compacta"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={density === value}
              onClick={() => onDensityChange(value)}
              className={cn(
                "flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors",
                density === value
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <DropdownMenuSeparator />
        <button
          type="button"
          onClick={onReset}
          className="w-full cursor-pointer rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Restaurar padrão
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
