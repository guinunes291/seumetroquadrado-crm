import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Superfície glass da Central de Comando — usar com moderação (resumo executivo,
 * hero, painéis flutuantes). Para conteúdo denso comum, prefira `Card`.
 */
export const GlassCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    /** Realce dourado para o elemento mais importante da tela. */
    glow?: boolean;
  }
>(({ className, glow, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl glass-panel text-card-foreground shadow-elev-2",
      glow && "shadow-glow-gold",
      className,
    )}
    {...props}
  />
));
GlassCard.displayName = "GlassCard";
