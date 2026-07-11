import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

import { QueryErrorState } from "@/components/ui/query-error-state";
import { cn } from "@/lib/utils";

export type AsyncBoundaryProps = {
  children: ReactNode;
  isLoading: boolean;
  isError?: boolean;
  error?: unknown;
  errorTitle?: string;
  onRetry?: () => void;
  loadingFallback?: ReactNode;
  loadingLabel?: string;
  className?: string;
};

/**
 * Mantém os três estados de uma consulta mutuamente exclusivos. O erro tem
 * precedência sobre o carregamento para nunca se disfarçar de estado vazio.
 */
export function AsyncBoundary({
  children,
  isLoading,
  isError = false,
  error,
  errorTitle,
  onRetry,
  loadingFallback,
  loadingLabel = "Carregando dados…",
  className,
}: AsyncBoundaryProps) {
  if (isError) {
    return (
      <QueryErrorState title={errorTitle} error={error} onRetry={onRetry} className={className} />
    );
  }

  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={loadingLabel}
        className={className}
      >
        {loadingFallback ?? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-sm text-muted-foreground">
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span>{loadingLabel}</span>
          </div>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
