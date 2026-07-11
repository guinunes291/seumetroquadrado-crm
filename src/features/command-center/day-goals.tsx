import { Flame, Gauge } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type DayGoalItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  value: number;
  meta?: number;
};

/**
 * Instrumentos do dia: metas diárias como barras de progresso compactas +
 * streak de atividade. Pensado para a coluna direita da Central de Comando.
 */
export function DayGoals({
  items,
  streak,
  loading,
  showMeta,
}: {
  items: DayGoalItem[];
  streak: number;
  loading?: boolean;
  /** false quando o período selecionado não é "hoje" (metas são diárias). */
  showMeta: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Gauge className="h-4 w-4 text-primary" /> Metas do dia
          {streak > 0 && (
            <span
              className="ml-auto inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning"
              title={`${streak} dia(s) consecutivos com atividade`}
            >
              <Flame className="h-3.5 w-3.5" /> {streak}d
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <>
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </>
        ) : (
          items.map((c) => {
            const Icon = c.icon;
            const pct =
              showMeta && c.meta ? Math.min(100, Math.round((c.value / c.meta) * 100)) : null;
            const done = pct !== null && pct >= 100;
            return (
              <div key={c.key}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" /> {c.label}
                  </span>
                  <span className="font-display font-semibold tabular-nums">
                    {c.value}
                    {showMeta && c.meta ? (
                      <span className="text-xs font-normal text-muted-foreground">/{c.meta}</span>
                    ) : null}
                  </span>
                </div>
                {pct !== null && (
                  <div
                    className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={`${c.label}: ${pct}% da meta`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                  >
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        done ? "bg-success" : "bg-gradient-gold",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
