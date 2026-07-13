import { cn } from "@/lib/utils";

/** Tecla de atalho no estilo do design system (header, palette, overlay "?"). */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 items-center justify-center rounded border border-border-subtle bg-muted px-1.5 font-sans text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
