// Painel lateral curto (identidade Lançamento): ao lado da área principal
// cabem no máximo três. Título com um número/sub à direita, o conteúdo e, se
// houver, UMA ação no pé ("Ver todas", "Ver histórico"). Nasceu na lateral da
// Fila Única (features/fila-unica/fila-lateral.tsx).
//
// O "Painel" de features/ranking/ranking-ui.tsx é outro desenho (ícone,
// descrição, rounded-xl) e continua lá até a Fase 5 do plano, quando o
// Desempenho é recomposto e passa a usar este.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Painel({
  titulo,
  sub,
  acao,
  children,
  className,
}: {
  titulo: string;
  /** O número ou o recorte, à direita do título ("3 visitas", "24 h"). */
  sub?: ReactNode;
  /** A ação única do painel, no pé. */
  acao?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={titulo}
      className={cn(
        "rounded-2xl border border-border-subtle bg-card p-4 text-card-foreground shadow-elev-1",
        className,
      )}
    >
      <h3 className="mb-2 flex items-baseline justify-between gap-2 text-[13.5px] font-semibold">
        {titulo}
        {sub && <span className="text-xs font-medium text-muted-foreground">{sub}</span>}
      </h3>
      {children}
      {acao && <div className="mt-2 text-xs">{acao}</div>}
    </section>
  );
}
