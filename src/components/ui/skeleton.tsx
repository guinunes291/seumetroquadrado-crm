import { cn } from "@/lib/utils";

/**
 * Skeleton único do design system: base discreta + pulso de opacidade.
 * (identidade v3: o shimmer saiu — virou marca registrada de placeholder
 * gerado; o pulso é discreto e some no motion-reduce global.)
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-primary/10", className)} {...props} />;
}

export { Skeleton };
