import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

type TabsListProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
  /**
   * Pill deslizante sob a aba ativa (SMQ Motion). O movimento é transform;
   * a medição usa offsetLeft/offsetWidth (imune a scroll da faixa).
   * Opt-in — o visual clássico (bg no trigger) continua o default.
   */
  indicator?: boolean;
};

const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, TabsListProps>(
  ({ className, indicator = false, children, ...props }, ref) => {
    const innerRef = React.useRef<React.ElementRef<typeof TabsPrimitive.List>>(null);
    React.useImperativeHandle(ref, () => innerRef.current!);
    const [pill, setPill] = React.useState<{ x: number; w: number } | null>(null);

    const measure = React.useCallback(() => {
      const list = innerRef.current;
      if (!list) return;
      const active = list.querySelector<HTMLElement>('[data-state="active"]');
      if (!active) {
        setPill(null);
        return;
      }
      setPill({ x: active.offsetLeft, w: active.offsetWidth });
    }, []);

    React.useLayoutEffect(() => {
      if (!indicator) return;
      measure();
      const list = innerRef.current;
      if (!list || typeof MutationObserver === "undefined") return;
      const mo = new MutationObserver(measure);
      mo.observe(list, { attributes: true, subtree: true, attributeFilter: ["data-state"] });
      const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
      ro?.observe(list);
      return () => {
        mo.disconnect();
        ro?.disconnect();
      };
    }, [indicator, measure]);

    return (
      <TabsPrimitive.List
        ref={innerRef}
        className={cn(
          "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
          indicator && "has-indicator relative isolate",
          className,
        )}
        {...props}
      >
        {indicator && pill && (
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-0 -z-10 rounded-md bg-background shadow motion-reduce:transition-none transition-[transform,width] duration-200"
            style={{ transform: `translateX(${pill.x}px)`, width: pill.w }}
          />
        )}
        {children}
      </TabsPrimitive.List>
    );
  },
);
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
      // Com o pill deslizante da lista, o trigger ativo fica transparente —
      // é o pill que carrega o fundo/sombra e desliza entre as abas.
      "[.has-indicator_&]:data-[state=active]:bg-transparent [.has-indicator_&]:data-[state=active]:shadow-none",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
