import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StickyActionRailProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  children: ReactNode;
  label?: string;
  statusMessage?: string;
  mobileOnly?: boolean;
};

/** Toolbar fixa com safe-area para as ações comerciais primárias no mobile. */
export function StickyActionRail({
  children,
  label = "Ações principais",
  statusMessage,
  mobileOnly = true,
  className,
  ...props
}: StickyActionRailProps) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className={cn(
        "fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-30 mx-auto flex max-w-lg items-stretch gap-1 rounded-2xl border bg-background/95 p-2 shadow-elev-3 backdrop-blur [&_a]:min-h-11 [&_button]:min-h-11 [&_button]:min-w-0",
        mobileOnly && "md:hidden",
        className,
      )}
      {...props}
    >
      {statusMessage && (
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {statusMessage}
        </span>
      )}
      {children}
    </div>
  );
}
