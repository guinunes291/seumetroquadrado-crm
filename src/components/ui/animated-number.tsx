import { useCountUp } from "@/hooks/use-count-up";
import { cn } from "@/lib/utils";

/**
 * Número que conta até o valor — KPIs, metas, contagens. Sempre tabular-nums
 * (a largura de cada dígito é fixa: zero layout shift durante a contagem).
 * Sob prefers-reduced-motion o valor aparece direto.
 */
export function AnimatedNumber({
  value,
  format,
  durationMs,
  className,
}: {
  value: number;
  /** Formatação do valor exibido (default: inteiro pt-BR). */
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const display = useCountUp(value, { durationMs });
  const text = format
    ? format(display)
    : Math.round(display).toLocaleString("pt-BR");

  return <span className={cn("tabular-nums", className)}>{text}</span>;
}
