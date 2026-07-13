// Histórico de alterações de preço das unidades — mesma consulta e colunas da
// rota, revestidas com o design system (hairline + elev-1, estados de
// carregamento/vazio padronizados).

import { History } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
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
import { formatBRL, variacaoPercentual } from "@/lib/unidades";
import type { Tables } from "@/integrations/supabase/types";

export type HistoricoPrecoRow = Tables<"historico_precos"> & {
  unidade: { identificador: string; bloco: string | null; projeto_id: string } | null;
};

export function HistoricoPrecos({
  historico,
  loading,
}: {
  historico: HistoricoPrecoRow[];
  loading?: boolean;
}) {
  return (
    <section aria-label="Histórico de preços">
      <SectionHeader eyebrow="Preços" title="Histórico de alterações" />
      <div className="overflow-hidden rounded-xl border border-border-subtle bg-card shadow-elev-1">
        {loading ? (
          <div className="space-y-2 p-4" aria-busy="true">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        ) : historico.length === 0 ? (
          <EmptyState
            icon={History}
            title="Sem alterações de preço registradas."
            description="Toda mudança no valor de uma unidade aparece aqui automaticamente."
            className="m-4 border-0"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unidade</TableHead>
                <TableHead>De</TableHead>
                <TableHead>Para</TableHead>
                <TableHead>Variação</TableHead>
                <TableHead>Quando</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historico.map((h) => {
                const variacao = variacaoPercentual(h.valor_anterior, h.valor_novo);
                return (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">
                      {h.unidade?.bloco ? `${h.unidade.bloco}/` : ""}
                      {h.unidade?.identificador ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatBRL(h.valor_anterior)}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{formatBRL(h.valor_novo)}</TableCell>
                    <TableCell>
                      {variacao !== null && (
                        <span className={variacao >= 0 ? "text-success" : "text-destructive"}>
                          {variacao >= 0 ? "+" : ""}
                          {variacao.toFixed(1)}%
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(h.alterado_em).toLocaleString("pt-BR")}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}
