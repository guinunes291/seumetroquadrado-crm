// "Onde os clientes somem" — o resumo do funil no topo da Central de Comando
// (identidade Lançamento, como no vídeo de lançamento): uma barra por etapa,
// centrada, a queda na chegada a cada etapa e a "maior perda" destacada. É a
// mesma leitura do funil completo (fila_funil_v1, mesma chave de cache: uma
// chamada só serve os dois) no recorte da base inteira — o resumo precisa
// medir até a venda, e a safra de 30 dias deixa a venda em branco. O funil
// completo, com metas, parados e vazamentos, segue mais abaixo na página
// (#funil) — o "Ver funil" leva até ele.

import { Info, Tray } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserRoles } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  montarFunil,
  resumoDoFunil,
  type LinhaResumoFunil,
} from "@/features/fila-unica/funil-derive";
import { useFilaFunil } from "@/features/fila-unica/use-fila-funil";

/** Os mesmos 30 dias do funil completo: a chave de cache é a mesma. */
const DIAS = 30;

const fmt = (n: number) => n.toLocaleString("pt-BR");

function tituloDaQueda(l: LinhaResumoFunil): string | undefined {
  const p = l.passagem;
  if (!p) return undefined;
  if (p.atual === null) return `${p.label}: ${p.nota ?? "sem dado"}`;
  return `${p.label}: ${p.atual}% chegam aqui · meta da casa ${p.meta}%`;
}

function Linha({ l }: { l: LinhaResumoFunil }) {
  const venda = l.key === "venda";
  return (
    <li
      data-testid="funil-resumo-linha"
      data-maior-perda={l.maiorPerda || undefined}
      className={cn(
        "grid grid-cols-[minmax(0,210px)_minmax(0,1fr)_132px] items-center gap-3 rounded-lg px-2 py-1",
        l.maiorPerda && "bg-destructive/[0.07]",
      )}
    >
      <span className="flex min-w-0 items-baseline justify-between gap-2">
        <span className="truncate text-[13px] font-semibold">{l.label}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {fmt(l.quantidade)}
        </span>
      </span>
      <span className="flex h-7 justify-center" aria-hidden="true">
        <span
          className={cn(
            "h-full rounded-md transition-[width] duration-700 motion-reduce:transition-none",
            l.quantidade === 0
              ? "bg-muted"
              : venda
                ? "bg-gradient-gold"
                : "bg-primary dark:bg-navy-300",
          )}
          style={{ width: `${l.largura * 100}%` }}
        />
      </span>
      <span
        className="flex items-baseline justify-end gap-2 text-right tabular-nums"
        title={tituloDaQueda(l)}
      >
        {l.maiorPerda && (
          <span className="whitespace-nowrap text-[11px] font-medium text-destructive">
            maior perda
          </span>
        )}
        {l.queda !== null ? (
          <b
            className={cn(
              "font-display text-[13px] font-semibold",
              l.maiorPerda ? "text-destructive" : "text-muted-foreground",
            )}
          >
            −{l.queda}%
          </b>
        ) : l.passagem ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : null}
      </span>
    </li>
  );
}

export function FunilResumo({
  corretorId = null,
  className,
}: {
  /** A gestão vendo a fila de um corretor: o funil dele, não o da operação. */
  corretorId?: string | null;
  className?: string;
}) {
  const { isAdmin, isGestor, isSuperintendente } = useUserRoles();
  const daOperacao = (isAdmin || isGestor || isSuperintendente) && !corretorId;
  const q = useFilaFunil(DIAS, corretorId);
  const leitura = q.data ? montarFunil(q.data, "base", { dias: DIAS }) : null;
  const titulo = daOperacao ? "Onde os clientes somem" : "Onde os seus clientes somem";

  return (
    <section
      aria-label={titulo}
      className={cn(
        "flex flex-col rounded-2xl border border-border-subtle bg-card p-5 text-card-foreground",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold">{titulo}</h2>
          <p className="text-xs text-muted-foreground">
            {daOperacao ? "A operação inteira" : "A sua carteira inteira"}, pelo status atual
          </p>
        </div>
        <a
          href="#funil"
          className="shrink-0 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
        >
          Ver funil
        </a>
      </header>

      {q.isPending ? (
        <div className="mt-4 space-y-2" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : q.isError || !leitura ? (
        // O erro detalhado (com "tentar de novo") fica no funil completo.
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0" />
          {q.isError
            ? "Não foi possível montar o funil agora."
            : "Sem dado: o funil ainda não está disponível neste ambiente."}
        </p>
      ) : leitura.total === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Tray className="h-4 w-4 shrink-0" />
          Nenhum lead na carteira ainda.
        </p>
      ) : (
        <>
          <ol className="mt-4 flex flex-1 flex-col justify-between gap-0.5">
            {resumoDoFunil(leitura).map((l) => (
              <Linha key={l.key} l={l} />
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            Queda na chegada a cada etapa — aproximação pelo status atual, não coorte. A maior perda
            é a passagem mais longe da meta da casa.
          </p>
        </>
      )}
    </section>
  );
}
