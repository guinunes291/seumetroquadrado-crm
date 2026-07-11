import { useId, useState, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FilterBarProps = {
  children: ReactNode;
  /** Busca/controle primário que continua visível mesmo com filtros recolhidos. */
  primary?: ReactNode;
  activeCount?: number;
  onClear?: () => void;
  resultsLabel?: string;
  actions?: ReactNode;
  title?: string;
  defaultMobileOpen?: boolean;
  className?: string;
  contentClassName?: string;
};

/** Barra de busca/filtros persistente no desktop e recolhível no mobile. */
export function FilterBar({
  children,
  primary,
  activeCount = 0,
  onClear,
  resultsLabel,
  actions,
  title = "Filtros",
  defaultMobileOpen = false,
  className,
  contentClassName,
}: FilterBarProps) {
  const id = useId();
  const [mobileOpen, setMobileOpen] = useState(defaultMobileOpen);
  const titleId = `${id}-title`;
  const contentId = `${id}-content`;

  return (
    <section
      role="search"
      aria-labelledby={titleId}
      className={cn(
        "rounded-xl border bg-card p-3 shadow-elev-1 sm:p-4 [&_button]:min-h-11 [&_input]:min-h-11",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={titleId} className="text-sm font-semibold">
          {title}
          {activeCount > 0 && (
            <span className="ml-1 text-muted-foreground" aria-label={`${activeCount} ativos`}>
              ({activeCount})
            </span>
          )}
        </h2>

        <Button
          type="button"
          variant="outline"
          className="ml-auto min-h-11 md:hidden"
          aria-expanded={mobileOpen}
          aria-controls={contentId}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <SlidersHorizontal aria-hidden="true" />
          {mobileOpen ? "Ocultar filtros" : "Mostrar filtros"}
        </Button>

        <div
          className={cn(
            "w-full flex-wrap items-center justify-between gap-2 md:ml-auto md:flex md:w-auto md:justify-end",
            mobileOpen ? "flex" : "hidden md:flex",
          )}
        >
          {actions}
          {activeCount > 0 && onClear && (
            <Button type="button" variant="ghost" className="min-h-11" onClick={onClear}>
              <X aria-hidden="true" /> Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {primary && <div className="mt-3">{primary}</div>}

      <div
        id={contentId}
        className={cn("mt-3", mobileOpen ? "block" : "hidden md:block", contentClassName)}
      >
        {children}
      </div>

      {resultsLabel && (
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="mt-3 text-sm text-muted-foreground"
        >
          {resultsLabel}
        </p>
      )}
    </section>
  );
}
