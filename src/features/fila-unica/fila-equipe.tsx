// "A mesma fila, vista pelo gestor" — a tabela do mockup: por corretor,
// carteira ativa (contra o teto de 40), próximos passos vencidos, sem próximo
// passo, fundo do funil parado e o dinheiro em jogo, com "Ver a fila" abrindo
// a Fila Única daquele corretor. A linha "Sem corretor" (admin) leva à
// Higiene, porque estoque sem dono é assunto de lá. Quem precisa de ajuda
// hoje não é quem tem mais leads: a ordem vem do banco (fundo parado, depois
// vencidos).

import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { LIMITE_FILA, formatarEmJogo } from "@/features/fila-unica/derive";
import { useFilaEquipe, type FilaEquipeRow } from "@/features/fila-unica/use-fila-equipe";

/** "37 / 40" com a barra; acima do teto vira "40 / 40" em vermelho. */
function Medidor({ n }: { n: number }) {
  const acima = n > LIMITE_FILA;
  const mostrado = Math.min(n, LIMITE_FILA);
  return (
    <span
      className="inline-flex items-center justify-end gap-2"
      title={acima ? `${n} leads vivos — acima do teto de ${LIMITE_FILA}` : `${n} leads vivos`}
    >
      <span className={cn("tabular-nums", acima && "font-bold text-destructive")}>
        {mostrado} / {LIMITE_FILA}
      </span>
      <span className="h-1.5 w-[72px] overflow-hidden rounded-full bg-info/15">
        <span
          className={cn("block h-full rounded-full", acima ? "bg-destructive" : "bg-info")}
          style={{ width: `${(mostrado / LIMITE_FILA) * 100}%` }}
        />
      </span>
    </span>
  );
}

function Numero({ n }: { n: number }) {
  return <span className={cn("tabular-nums", n > 0 && "font-bold text-destructive")}>{n}</span>;
}

function Linha({ r, atual }: { r: FilaEquipeRow; atual: string | null }) {
  const semDono = r.corretor_id === null;
  return (
    <TableRow
      data-testid="fila-equipe-linha"
      data-atual={atual !== null && atual === r.corretor_id ? "" : undefined}
      className={cn(atual !== null && atual === r.corretor_id && "bg-muted/40")}
    >
      <TableCell className={cn("font-semibold", semDono && "text-muted-foreground")}>
        {r.nome}
        {semDono && (
          <small className="block text-[11.5px] font-normal text-muted-foreground">
            estoque da pré-venda, sem dono
          </small>
        )}
      </TableCell>
      <TableCell className="text-right">
        {semDono ? (
          <span className="tabular-nums text-muted-foreground">
            {r.carteira_ativa.toLocaleString("pt-BR")}
          </span>
        ) : (
          <Medidor n={r.carteira_ativa} />
        )}
      </TableCell>
      <TableCell className="text-right">{semDono ? "—" : <Numero n={r.vencidos} />}</TableCell>
      <TableCell className="text-right">
        {semDono ? "—" : <Numero n={r.sem_proximo_passo} />}
      </TableCell>
      <TableCell className="text-right">{semDono ? "—" : <Numero n={r.fundo_parado} />}</TableCell>
      <TableCell className="text-right tabular-nums">
        {r.em_jogo > 0 ? formatarEmJogo(r.em_jogo) : "—"}
      </TableCell>
      <TableCell className="text-right">
        {semDono ? (
          <Button asChild size="sm" variant="ghost">
            <Link to="/higiene-funil">Abrir higiene</Link>
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link to="/fila" search={{ corretor: r.corretor_id ?? undefined }}>
              Ver a fila
            </Link>
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

export function FilaEquipe({
  atual = null,
  className,
}: {
  atual?: string | null;
  className?: string;
}) {
  const q = useFilaEquipe();
  return (
    <section aria-label="A mesma fila, vista pelo gestor" className={cn("space-y-3", className)}>
      <div>
        <h2 className="font-display text-base font-semibold md:text-lg">
          A mesma fila, vista pelo gestor
        </h2>
        <p className="text-xs text-muted-foreground md:text-sm">
          Quem precisa de ajuda hoje não é quem tem mais leads. É quem tem{" "}
          <b className="text-foreground">fundo do funil parado</b> e{" "}
          <b className="text-foreground">próximos passos vencidos</b>.
        </p>
      </div>
      <div className="rounded-2xl border border-border-subtle bg-card text-card-foreground shadow-elev-1">
        {q.isPending ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : q.isError ? (
          <div className="p-4">
            <QueryErrorState
              title="Não foi possível ler a equipe."
              error={q.error}
              onRetry={() => q.refetch()}
            />
          </div>
        ) : !q.data ? (
          <p className="p-4 text-xs text-muted-foreground">
            Sem dado: a leitura por corretor ainda não está disponível neste ambiente.
          </p>
        ) : q.data.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">Nenhum corretor no seu escopo.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Corretor</TableHead>
                    <TableHead className="text-right">Carteira ativa</TableHead>
                    <TableHead className="text-right">Vencidos</TableHead>
                    <TableHead className="text-right">Sem próximo passo</TableHead>
                    <TableHead className="text-right">Fundo do funil parado</TableHead>
                    <TableHead className="text-right">Dinheiro em jogo</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q.data.map((r) => (
                    <Linha key={r.corretor_id ?? "sem-dono"} r={r} atual={atual} />
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="px-4 pb-3 pt-2 text-xs text-muted-foreground">
              Carteira ativa = leads vivos com dono, contra o teto de {LIMITE_FILA} da fila.
              Vencidos, sem próximo passo e fundo parado seguem as réguas da própria fila; o
              dinheiro em jogo é o VGV pelo preço de tabela do projeto de interesse.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
