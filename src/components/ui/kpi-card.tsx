import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Intent } from "@/lib/status-tones";
import type { LucideIcon } from "lucide-react";

const INTENT_ACCENT: Record<Intent, string> = {
  success: "border-success/30",
  warning: "border-warning/30",
  danger: "border-destructive/30",
  info: "border-info/30",
  neutral: "",
};

const INTENT_ICON: Record<Intent, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-info",
  neutral: "text-muted-foreground",
};

type KpiCardProps = {
  title: string;
  value: React.ReactNode;
  /** Linha auxiliar sob o valor (meta, comparação, período). */
  hint?: React.ReactNode;
  icon?: LucideIcon;
  /** Realça a borda e o ícone quando o KPI exige atenção. */
  intent?: Intent;
  loading?: boolean;
  className?: string;
  onClick?: () => void;
};

/**
 * Card de indicador padronizado (dashboard, painel do gestor, relatórios).
 * Sempre use dentro de um `KpiGrid` para manter o grid responsivo consistente.
 */
export function KpiCard({
  title,
  value,
  hint,
  icon: Icon,
  intent = "neutral",
  loading,
  className,
  onClick,
}: KpiCardProps) {
  return (
    <Card
      className={cn(
        INTENT_ACCENT[intent],
        onClick && "cursor-pointer transition-colors hover:bg-muted/50",
        className,
      )}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {Icon && <Icon className={cn("h-4 w-4", INTENT_ICON[intent])} />}
      </CardHeader>
      <CardContent>
        {loading ? (
          <>
            <Skeleton className="h-7 w-20" />
            {hint !== undefined && <Skeleton className="mt-2 h-3 w-28" />}
          </>
        ) : (
          <>
            <div className="font-display text-2xl font-semibold tracking-tight tabular-nums">
              {value}
            </div>
            {hint !== undefined && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Grid padrão de KPIs: 1 col no mobile, 2 no sm, 4 no xl. */
export function KpiGrid({
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
