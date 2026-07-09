import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useReveal } from "@/hooks/use-reveal";

type LpSectionProps = {
  id?: string;
  eyebrow?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  variant?: "light" | "muted" | "navy";
  align?: "left" | "center";
  className?: string;
  children: ReactNode;
};

const VARIANTS = {
  light: "bg-background",
  muted: "bg-muted/50",
  navy: "bg-navy text-white",
} as const;

/** Wrapper padrão das seções da landing: fundo, container e cabeçalho. */
export function LpSection({
  id,
  eyebrow,
  title,
  subtitle,
  variant = "light",
  align = "left",
  className,
  children,
}: LpSectionProps) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  const navy = variant === "navy";

  return (
    <section id={id} className={cn("scroll-mt-16", VARIANTS[variant], className)}>
      <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        {(eyebrow || title || subtitle) && (
          <div
            ref={ref}
            className={cn(
              "mb-10 md:mb-14",
              align === "center" && "mx-auto max-w-2xl text-center",
              visible ? "animate-in fade-in-0 slide-in-from-bottom-4 duration-700" : "opacity-0",
            )}
          >
            {eyebrow && (
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2
                className={cn(
                  "mt-2 text-balance text-3xl font-bold tracking-tight md:text-4xl",
                  navy ? "text-white" : "text-navy",
                )}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p
                className={cn(
                  "mt-4 text-pretty text-base md:text-lg",
                  align === "left" && "max-w-2xl",
                  navy ? "text-white/70" : "text-muted-foreground",
                )}
              >
                {subtitle}
              </p>
            )}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
