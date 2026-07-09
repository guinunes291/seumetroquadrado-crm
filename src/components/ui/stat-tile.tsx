import { TrendingDown, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/utils";
import { INTENT_TEXT, type Intent } from "@/lib/status-tones";
import type { LucideIcon } from "lucide-react";

const INTENT_ICON_BG: Record<Intent, string> = {
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  danger: "bg-destructive/12 text-destructive",
  info: "bg-info/12 text-info",
  neutral: "bg-muted text-muted-foreground",
};

/**
 * KPI premium da Central de Comando: valor em Sora, delta com seta e
 * sparkline de tendência. Evolução do KpiCard — use em telas redesenhadas;
 * o KpiCard continua válido onde ainda não migramos.
 */
export function StatTile({
  title,
  value,
  icon: Icon,
  intent = "neutral",
  delta,
  deltaLabel,
  spark,
  hint,
  loading,
  onClick,
  className,
}: {
  title: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  intent?: Intent;
  /** Variação vs. período anterior (%) — seta ↑ verde / ↓ vermelha. */
  delta?: number;
  /** Sufixo do delta, ex.: "vs. semana passada". */
  deltaLabel?: string;
  /** Série curta para o sparkline de tendência. */
  spark?: number[];
  hint?: React.ReactNode;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const deltaUp = (delta ?? 0) >= 0;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 text-card-foreground shadow-elev-1 transition-shadow",
        onClick && "cursor-pointer hover:shadow-elev-2",
        className,
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        {Icon && (
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              INTENT_ICON_BG[intent],
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>

      {loading ? (
        <>
          <Skeleton className="mt-2 h-8 w-24" />
          <Skeleton className="mt-2 h-3 w-32" />
        </>
      ) : (
        <>
          <div className="font-display animate-count-pop motion-reduce:animate-none mt-1 text-3xl font-semibold tracking-tight tabular-nums">
            {value}
          </div>
          <div className="mt-1 flex items-end justify-between gap-2">
            <div className="min-w-0 text-xs text-muted-foreground">
              {delta !== undefined && (
                <span
                  className={cn(
                    "mr-1 inline-flex items-center gap-0.5 font-medium",
                    deltaUp ? "text-success" : "text-destructive",
                  )}
                >
                  {deltaUp ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {Math.abs(delta).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                </span>
              )}
              {delta !== undefined && deltaLabel ? deltaLabel : hint}
            </div>
            {spark && spark.length > 1 && (
              <span className={cn("shrink-0", INTENT_TEXT[intent === "neutral" ? "info" : intent])}>
                <Sparkline data={spark} />
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Grid padrão de StatTiles (mesma malha do KpiGrid). */
export function StatGrid({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>
  );
}
