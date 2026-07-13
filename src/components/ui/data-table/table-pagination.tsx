import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DataTablePaginationProps = {
  page: number; // 1-based
  pageSize: number;
  /** Total de registros quando conhecido (mostra "Página X de Y"). */
  total?: number;
  /** Sem total: controla o botão "Próxima" diretamente. */
  hasNext?: boolean;
  onPageChange: (page: number) => void;
  /** Quantos itens a página atual tem (rodapé "N de total"). */
  currentCount?: number;
};

/** Rodapé de paginação do DataTable — compacto, teclado-navegável. */
export function DataTablePagination({
  page,
  pageSize,
  total,
  hasNext,
  onPageChange,
  currentCount,
}: DataTablePaginationProps) {
  const totalPages = total != null ? Math.max(1, Math.ceil(total / pageSize)) : null;
  const canPrev = page > 1;
  const canNext = totalPages != null ? page < totalPages : (hasNext ?? false);

  return (
    <div className="flex items-center justify-between gap-2 px-1 py-2 text-sm text-muted-foreground">
      <span className="tabular-nums">
        {total != null
          ? `${total.toLocaleString("pt-BR")} registro${total === 1 ? "" : "s"}`
          : currentCount != null
            ? `${currentCount} nesta página`
            : null}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-20 text-center tabular-nums">
          Página {page}
          {totalPages != null ? ` de ${totalPages}` : ""}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
