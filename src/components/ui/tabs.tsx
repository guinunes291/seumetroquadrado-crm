import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

type TabsListProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
  /**
   * Pill deslizante sob a aba ativa (SMQ Motion). Desliza como uma gota: a
   * borda da frente vai antes e a de trás alcança (`.tab-pill` em styles.css).
   * A medição usa offsetLeft/offsetTop (imune a scroll da faixa) e acompanha
   * a altura da aba, então serve também à faixa que quebra em duas linhas.
   * Ligado por padrão desde 2026-10: parado, o pill tem o mesmo fundo e
   * sombra do trigger ativo clássico, então nenhuma tela muda de cara — só
   * ganha o movimento. `indicator={false}` volta ao clássico.
   */
  indicator?: boolean;
};

/** Bordas como variáveis CSS (`.tab-pill` em styles.css) + posição vertical. */
function pillStyle(p: { l: number; r: number; t: number; h: number }): React.CSSProperties {
  const style: React.CSSProperties & Record<"--pill-l" | "--pill-r", string> = {
    "--pill-l": `${p.l}px`,
    "--pill-r": `${p.r}px`,
    top: p.t,
    height: p.h,
  };
  return style;
}

const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, TabsListProps>(
  ({ className, indicator = true, children, ...props }, ref) => {
    const innerRef = React.useRef<React.ElementRef<typeof TabsPrimitive.List>>(null);
    React.useImperativeHandle(ref, () => innerRef.current!);
    const [pill, setPill] = React.useState<{
      l: number;
      r: number;
      t: number;
      h: number;
      dir: "dir" | "esq";
    } | null>(null);

    const measure = React.useCallback(() => {
      const list = innerRef.current;
      if (!list) return;
      const active = list.querySelector<HTMLElement>('[data-state="active"]');
      if (!active) {
        setPill(null);
        return;
      }
      const l = active.offsetLeft;
      const r = l + active.offsetWidth;
      // A direção decide qual borda lidera; num resize (mesma aba) mantém a anterior.
      setPill((prev) => ({
        l,
        r,
        t: active.offsetTop,
        h: active.offsetHeight,
        dir: !prev || l === prev.l ? (prev?.dir ?? "dir") : l < prev.l ? "esq" : "dir",
      }));
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
            data-dir={pill.dir}
            className="tab-pill absolute left-0 -z-10 rounded-md bg-background shadow motion-reduce:transition-none"
            style={pillStyle(pill)}
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
