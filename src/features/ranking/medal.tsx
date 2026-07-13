import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Medalha circular do hub de Desempenho: gradiente + relevo de cunhagem
 * (shadow-elev-2 + aro interno + luz superior). Raridade = intensidade —
 * ouro/prata/bronze via classes ESTÁTICAS (o Tailwind precisa enxergar as
 * strings no build). `shine` dispara UMA varredura de brilho (animate-shine),
 * reservada à conquista mais recente — nunca em loop.
 */

export type MedalTier = "ouro" | "prata" | "bronze";
export type MedalSize = "sm" | "md" | "lg" | "xl";

const TIER_CLASSES: Record<MedalTier, string> = {
  ouro: "bg-gradient-gold text-navy-900 shadow-glow-gold",
  prata: "bg-gradient-to-br from-zinc-100 via-zinc-300 to-zinc-500 text-zinc-800",
  bronze: "bg-gradient-to-br from-amber-500 via-amber-700 to-amber-900 text-amber-50",
};

const SIZE_CLASSES: Record<MedalSize, string> = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-xl",
  xl: "h-16 w-16 text-3xl",
};

export function Medal({
  tier = "ouro",
  size = "md",
  locked = false,
  shine = false,
  title,
  className,
  children,
}: {
  tier?: MedalTier;
  size?: MedalSize;
  /** Conquista bloqueada: dessatura e apaga (opacity/grayscale). */
  locked?: boolean;
  /** Varredura de brilho única — só na conquista mais recente. */
  shine?: boolean;
  /** Acessibilidade/tooltip — ex.: "Medalha de ouro — Primeira venda". */
  title?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      role={title ? "img" : undefined}
      aria-label={title}
      title={title}
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold shadow-elev-2",
        TIER_CLASSES[tier],
        SIZE_CLASSES[size],
        locked && "opacity-45 grayscale",
        className,
      )}
    >
      {/* Relevo: aro interno + gradiente de luz de cima para baixo. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[8%] rounded-full border border-white/30"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/25 via-transparent to-black/20"
      />
      <span className="relative leading-none">{children}</span>
      {shine && !locked && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
        >
          <span className="animate-shine absolute inset-y-0 left-0 w-1/2 bg-white/45 blur-[6px]" />
        </span>
      )}
    </span>
  );
}
