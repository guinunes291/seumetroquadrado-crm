import { useId, useState, type ReactNode } from "react";
import { SlidersHorizontal, X } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FilterBarProps = {
  children: ReactNode;
  /** Busca/controle primário que continua visível mesmo com filtros recolhidos. */
  primary?: ReactNode;
  /**
   * Atalhos de filtro em formato de chip (status, temperatura, visões salvas).
   * Recolhem junto com os demais filtros no celular — solto na página, viravam
   * uma parede de chips antes do primeiro resultado.
   */
  chips?: ReactNode;
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
  chips,
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

        {/* Ações (modo foco, alternador de visão, lixeira) NÃO são filtros:
            ficam sempre visíveis. No celular caem numa linha própria logo
            abaixo do título; no desktop voltam para a direita do cabeçalho.
            Antes recolhiam junto com os filtros e sumiam da tela pequena. */}
        <div className="flex w-full flex-wrap items-center gap-2 md:ml-auto md:w-auto md:justify-end">
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
        {chips && <div className="mb-3">{chips}</div>}
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
