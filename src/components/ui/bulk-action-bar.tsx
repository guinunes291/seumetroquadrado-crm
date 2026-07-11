import type { ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type BulkActionBarProps = {
  selectedCount: number;
  children: ReactNode;
  onClear: () => void;
  entityLabel?: string;
  className?: string;
};

/** Ações em lote fixas no rodapé mobile e contextuais no desktop. */
export function BulkActionBar({
  selectedCount,
  children,
  onClear,
  entityLabel = "item",
  className,
}: BulkActionBarProps) {
  if (selectedCount <= 0) return null;

  const plural = selectedCount === 1 ? entityLabel : `${entityLabel}s`;
  const announcement = `${selectedCount} ${plural} selecionado${selectedCount === 1 ? "" : "s"}`;

  return (
    <section
      role="region"
      aria-label="Ações em lote"
      className={cn(
        "fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-30 rounded-xl border bg-background/95 p-2 shadow-elev-3 backdrop-blur md:static md:z-auto md:bg-muted/40 md:shadow-none",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="shrink-0 px-1 text-sm font-medium"
        >
          {announcement}
        </p>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overscroll-x-contain [&_a]:min-h-11 [&_button]:min-h-11">
          {children}
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="min-h-11 min-w-11 shrink-0"
          aria-label="Limpar seleção"
          title="Limpar seleção"
          onClick={onClear}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}
