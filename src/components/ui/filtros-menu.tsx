// Filtros atrás de um botão, com o estado resumido em texto ao lado
// (identidade Lançamento, regra 5): a busca fica visível; período, status,
// etapa e o resto moram num popover "Filtros (2)" e a linha diz o que está
// valendo — "Outubro de 2026 · pendentes · Marina Costa". Acaba com a fileira
// de três Selects colada acima de cada lista.

import type { ReactNode } from "react";
import { Funnel } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function FiltrosMenu({
  ativos,
  resumo,
  children,
  onLimpar,
  align = "end",
  className,
  conteudoClassName,
}: {
  /** Quantos filtros estão fora do padrão — vira o número do botão. */
  ativos: number;
  /** O estado em texto, à esquerda do botão. */
  resumo?: ReactNode;
  /** Os controles dos filtros (Selects, chips), dentro do popover. */
  children: ReactNode;
  /** "Limpar filtros" no pé do popover, quando há algum ativo. */
  onLimpar?: () => void;
  align?: "start" | "center" | "end";
  className?: string;
  conteudoClassName?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {resumo && <span className="text-xs text-muted-foreground">{resumo}</span>}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            aria-label={ativos > 0 ? `Filtros (${ativos} ativos)` : "Filtros"}
          >
            <Funnel className="h-4 w-4" />
            Filtros
            {ativos > 0 && (
              <span
                aria-hidden="true"
                className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold tabular-nums text-primary-foreground"
              >
                {ativos}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align={align} className={cn("w-72 space-y-3", conteudoClassName)}>
          {children}
          {onLimpar && ativos > 0 && (
            <div className="flex justify-end border-t border-border-subtle pt-2">
              <Button variant="ghost" size="sm" onClick={onLimpar}>
                Limpar filtros
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
