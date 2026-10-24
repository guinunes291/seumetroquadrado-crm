// Projetos em Foco — peças da prateleira: chip de zona, grade/lista, corredor
// da parceira, lista incremental e o esqueleto de carregamento.
// Recortado de projetos-foco-page.tsx sem mudança de comportamento.

import { useEffect, useRef, useState } from "react";
import { CaretRight, Star } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { iniciais, type Corredor, type ItemPrateleira } from "@/lib/prateleira";
import { cn } from "@/lib/utils";
import { PlacaLogo } from "./placa-logo";

/** Cards por lote no carregamento incremental. */
export const LOTE = 24;
/** Cards por corredor de parceira antes do "ver todos". */
const POR_CORREDOR = 8;

export function Chip({
  ativo,
  onClick,
  label,
  contagem,
}: {
  ativo: boolean;
  onClick: () => void;
  label: string;
  contagem: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "press-scale inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        ativo
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border-subtle bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
      )}
    >
      <span className="max-w-[12rem] truncate">{label}</span>
      <span className="tabular-nums opacity-70">{contagem}</span>
    </button>
  );
}

export function Grade({ view, children }: { view: "grade" | "lista"; children: React.ReactNode }) {
  return view === "grade" ? (
    <div className="stagger-children grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {children}
    </div>
  ) : (
    <div className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-card shadow-elev-1">
      {children}
    </div>
  );
}

export function CorredorParceira({
  corredor,
  view,
  renderCard,
  onVerTodos,
}: {
  corredor: Corredor;
  view: "grade" | "lista";
  renderCard: (item: ItemPrateleira) => React.ReactNode;
  onVerTodos: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const mostrados = corredor.itens.slice(0, POR_CORREDOR);
  const restantes = corredor.itens.length - mostrados.length;
  const painelId = `corredor-${corredor.chave}`;
  return (
    <div className="rounded-xl border border-border-subtle bg-card shadow-elev-1">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-controls={painelId}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-muted/50"
      >
        {corredor.logo ? (
          <PlacaLogo logo={corredor.logo} nome={corredor.titulo} tamanho="md" />
        ) : (
          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-gold-500/30 bg-gradient-command shadow-elev-1">
            <span className="font-display text-sm font-semibold text-gold-300">
              {iniciais(corredor.titulo)}
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-display flex items-center gap-2 text-base font-semibold tracking-tight">
            <Star
              className="h-4 w-4 text-gold-600 dark:text-gold-300"
              aria-label="Construtora parceira"
            />
            {corredor.titulo}
            <Badge variant="outline" className="text-[10px]">
              {corredor.itens.length}
            </Badge>
          </h3>
        </div>
        <CaretRight
          aria-hidden="true"
          className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${aberto ? "rotate-90" : ""}`}
        />
      </button>
      {aberto && (
        <div id={painelId} className="space-y-3 border-t border-border-subtle p-3">
          <Grade view={view}>{mostrados.map(renderCard)}</Grade>
          {restantes > 0 && (
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={onVerTodos}>
                Ver todos ({corredor.itens.length})
                <CaretRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Lista longa em lotes: primeira pintura leve, o resto entra ao rolar. */
export function Incremental({
  itens,
  limite,
  onMais,
  view,
  renderCard,
}: {
  itens: ItemPrateleira[];
  limite: number;
  onMais: () => void;
  view: "grade" | "lista";
  renderCard: (item: ItemPrateleira) => React.ReactNode;
}) {
  const sentinela = useRef<HTMLDivElement>(null);
  const temMais = itens.length > limite;

  useEffect(() => {
    if (!temMais || !sentinela.current || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onMais();
      },
      { rootMargin: "400px 0px" },
    );
    obs.observe(sentinela.current);
    return () => obs.disconnect();
  }, [temMais, onMais]);

  return (
    <div className="space-y-4">
      <Grade view={view}>{itens.slice(0, limite).map(renderCard)}</Grade>
      {temMais && (
        <div ref={sentinela} className="flex justify-center">
          <Button variant="outline" onClick={onMais}>
            Mostrar mais ({itens.length - limite} restantes)
          </Button>
        </div>
      )}
    </div>
  );
}

export function PrateleiraSkeleton({ view }: { view: "grade" | "lista" }) {
  return (
    <div aria-busy="true" className="space-y-4">
      <Skeleton className="h-56 rounded-2xl" />
      <Grade view={view}>
        {Array.from({ length: 8 }).map((_, i) =>
          view === "grade" ? (
            <Skeleton key={i} className="h-[24rem] rounded-xl" />
          ) : (
            <Skeleton key={i} className="h-28 rounded-none" />
          ),
        )}
      </Grade>
    </div>
  );
}
