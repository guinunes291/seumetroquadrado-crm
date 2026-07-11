import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type ResponsiveTabItem = {
  value: string;
  label: ReactNode;
  accessibleLabel?: string;
  disabled?: boolean;
};

export type ResponsiveTabsProps = {
  value: string;
  onValueChange: (value: string) => void;
  items: readonly ResponsiveTabItem[];
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
  listClassName?: string;
};

/**
 * Tabs que preservam o padrão ARIA/teclado do Radix e viram uma faixa
 * horizontal rolável em telas estreitas, sem reduzir os alvos de toque.
 */
export function ResponsiveTabs({
  value,
  onValueChange,
  items,
  children,
  ariaLabel = "Seções",
  className,
  listClassName,
}: ResponsiveTabsProps) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className={className}>
      <div className="max-w-full overflow-hidden">
        <TabsList
          aria-label={ariaLabel}
          className={cn(
            "flex h-auto min-h-11 w-full max-w-full justify-start gap-1 overflow-x-auto overscroll-x-contain rounded-xl p-1 sm:w-fit",
            listClassName,
          )}
        >
          {items.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              disabled={item.disabled}
              aria-label={item.accessibleLabel}
              aria-current={value === item.value ? "page" : undefined}
              className="min-h-11 shrink-0 px-4 py-2"
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {children}
    </Tabs>
  );
}

export const ResponsiveTabsContent = TabsContent;
