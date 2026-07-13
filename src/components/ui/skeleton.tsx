import { cn } from "@/lib/utils";

/**
 * Skeleton único do design system: base discreta + varredura shimmer
 * (idioma premium — o antigo animate-pulse foi aposentado). A varredura é
 * background-position em loop num elemento estático: sem layout, custo nulo.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-shimmer shimmer-surface rounded-md bg-primary/10", className)}
      {...props}
    />
  );
}

export { Skeleton };
