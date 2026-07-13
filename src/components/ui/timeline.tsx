// Timeline vertical do design system — histórico de interações, atividades e
// eventos. Agrupa por dia ("Hoje / Ontem / 12 jul"), ícone por tipo com tom
// semântico, autor/meta e conteúdo. Semântica de lista ordenada (ol/li);
// entrada em cascata via stagger (compositor-only, coberto por reduced-motion).

import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type TimelineItem = {
  id: string;
  icon: LucideIcon;
  /** Tom do ícone (ex.: INTENT_TEXT do status-tones). */
  iconClassName?: string;
  title: React.ReactNode;
  /** Quem fez / direção / resultado — linha auxiliar ao lado do horário. */
  meta?: React.ReactNode;
  content?: React.ReactNode;
  /** ISO date — ordena e agrupa por dia. */
  timestamp: string;
};

function diaLabel(iso: string, hoje: Date): string {
  const d = new Date(iso);
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const h0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  const diff = Math.round((h0 - d0) / 86_400_000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    ...(d.getFullYear() !== hoje.getFullYear() ? { year: "numeric" } : {}),
  });
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function Timeline({
  items,
  groupByDay = true,
  loading,
  empty,
  className,
}: {
  items: TimelineItem[];
  /** Cabeçalhos "Hoje/Ontem/12 jul" entre os grupos. */
  groupByDay?: boolean;
  loading?: boolean;
  empty?: React.ReactNode;
  className?: string;
}) {
  const groups = useMemo(() => {
    if (!groupByDay) return [{ label: null as string | null, items }];
    const hoje = new Date();
    const out: { label: string | null; items: TimelineItem[] }[] = [];
    for (const item of items) {
      const label = diaLabel(item.timestamp, hoje);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(item);
      else out.push({ label, items: [item] });
    }
    return out;
  }, [items, groupByDay]);

  if (loading) {
    return (
      <div className={cn("space-y-3", className)} aria-busy="true">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={className}>
        {empty ?? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nada registrado ainda.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {groups.map((group, gi) => (
        <section key={group.label ?? gi}>
          {group.label && (
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {group.label}
            </h4>
          )}
          <ol className="stagger-children relative space-y-0">
            {group.items.map((item, i) => {
              const Icon = item.icon;
              const last = i === group.items.length - 1;
              return (
                <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {/* trilho vertical */}
                  {!last && (
                    <span
                      aria-hidden="true"
                      className="absolute left-[15px] top-8 h-[calc(100%-1.75rem)] w-px bg-border"
                    />
                  )}
                  <span
                    className={cn(
                      "relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-card shadow-elev-1",
                      item.iconClassName,
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="text-sm font-medium">{item.title}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {hora(item.timestamp)}
                      </span>
                    </div>
                    {item.meta && (
                      <div className="mt-0.5 text-xs text-muted-foreground">{item.meta}</div>
                    )}
                    {item.content && (
                      <div className="mt-1.5 rounded-lg border border-border-subtle bg-surface-2 p-2.5 text-sm text-foreground/90">
                        {item.content}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
