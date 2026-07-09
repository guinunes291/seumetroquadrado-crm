import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho de seção padronizado: eyebrow (contexto) + título + ação à direita.
 * Substitui os <h2> ad-hoc para manter a hierarquia consistente entre telas.
 */
export function SectionHeader({
  eyebrow,
  title,
  action,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-2", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </div>
        )}
        <h2 className="font-display truncate text-base font-semibold tracking-tight text-foreground">
          {title}
        </h2>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
