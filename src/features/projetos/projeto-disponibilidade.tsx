// Disponibilidade por tipologia — a pergunta que o corretor faz com o cliente
// na frente ("tem 2 dorms disponível? a partir de quanto?") respondida numa
// tabela curta, em vez de percorrer a grade unidade a unidade. Deriva de
// `unidades` (lib/unidades.resumoPorTipologia); sem espelho cadastrado, cai
// no texto livre `disponibilidade_resumo` que a gestão escreve na ficha.

import { useMemo } from "react";
import { Buildings } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  calcStats,
  descreverTipologia,
  formatBRL,
  resumoPorTipologia,
  type UnidadeParaResumo,
} from "@/lib/unidades";
import { cn } from "@/lib/utils";

export function ProjetoDisponibilidade({
  unidades,
  loading,
  resumoTexto,
  className,
}: {
  unidades: readonly UnidadeParaResumo[];
  loading?: boolean;
  resumoTexto?: string | null;
  className?: string;
}) {
  const linhas = useMemo(() => resumoPorTipologia(unidades), [unidades]);
  const stats = useMemo(() => calcStats([...unidades]), [unidades]);
  const texto = resumoTexto?.trim() || null;

  if (!loading && unidades.length === 0 && !texto) return null;

  return (
    <section aria-label="Disponibilidade por tipologia" className={className}>
      <SectionHeader
        eyebrow="Espelho"
        title="Disponibilidade"
        action={
          !loading && unidades.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                {stats.disponivel} disponíve{stats.disponivel === 1 ? "l" : "is"}
              </Badge>
              {stats.reservada > 0 && (
                <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
                  {stats.reservada} reservada{stats.reservada === 1 ? "" : "s"}
                </Badge>
              )}
              {stats.vendida > 0 && (
                <Badge variant="outline" className="text-muted-foreground">
                  {stats.vendida} vendida{stats.vendida === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
          ) : undefined
        }
      />
      <div className="overflow-hidden rounded-xl border border-border-subtle bg-card shadow-elev-1">
        {loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : unidades.length === 0 ? (
          <div className="flex items-start gap-3 p-4 text-sm">
            <Buildings
              className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <div className="font-medium">Resumo da gestão</div>
              <p className="text-muted-foreground">{texto}</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipologia</TableHead>
                  <TableHead className="text-right">Disponíveis</TableHead>
                  <TableHead className="text-right">A partir de</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((r) => (
                  <TableRow
                    key={r.chave}
                    className={cn(r.disponiveis === 0 && "text-muted-foreground")}
                  >
                    <TableCell className="font-medium">{descreverTipologia(r)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.disponiveis === 0 ? (
                        <span className="text-xs">esgotada</span>
                      ) : (
                        <>
                          {r.disponiveis}
                          <span className="text-xs text-muted-foreground"> / {r.total}</span>
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.valorMinDisponivel != null ? formatBRL(r.valorMinDisponivel) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {texto && (
              <p className="border-t border-border-subtle px-4 py-2 text-xs text-muted-foreground">
                {texto}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
