import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { useUndoableMutation } from "@/hooks/use-undoable-mutation";
import {
  LIXEIRA_TABELAS,
  LIXEIRA_LABEL,
  type LixeiraTabela,
  diasAteExpiracao,
  resumoRegistro,
  restaurar,
  softDelete,
} from "@/lib/lixeira";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Trash2 } from "lucide-react";

export function LixeiraPage() {
  const { isAdmin } = useUserRoles();
  const [tab, setTab] = useState<LixeiraTabela>("leads");

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Lixeira" description="Restaure registros excluídos." />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Apenas administradores podem acessar a lixeira.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lixeira"
        description="Registros excluídos ficam aqui por 90 dias antes de serem apagados em definitivo."
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as LixeiraTabela)}>
        <TabsList className="flex-wrap h-auto">
          {LIXEIRA_TABELAS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {LIXEIRA_LABEL[t]}
            </TabsTrigger>
          ))}
        </TabsList>
        {LIXEIRA_TABELAS.map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <ListaLixeira tabela={t} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

type LixeiraRow = Record<string, unknown>;

function ListaLixeira({ tabela }: { tabela: LixeiraTabela }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["lixeira", tabela],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tabela)
        .select("*")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as LixeiraRow[];
    },
  });

  // Restaurar com Desfazer (modo "compensate"): a restauração efetiva JÁ —
  // o registro precisa voltar a operar sem espera — e o Desfazer aplica a
  // inversa natural (softDelete devolve o registro à lixeira).
  const restaurarUndo = useUndoableMutation<{ id: string; resumo: string }>({
    mode: "compensate",
    message: (v) => `"${v.resumo}" restaurado`,
    mutationFn: ({ id }) => restaurar(tabela, id),
    inverseFn: ({ id }) => softDelete(tabela, id),
    optimistic: {
      keys: [["lixeira", tabela]],
      apply: (cached, { id }) =>
        Array.isArray(cached)
          ? cached.filter((r) => String((r as { id?: unknown }).id) !== id)
          : cached,
    },
    errorMessage: "Não foi possível restaurar o registro",
  });

  const mutateRestaurar = restaurarUndo.mutate;

  const columns = useMemo<ColumnDef<LixeiraRow, unknown>[]>(
    () => [
      {
        id: "registro",
        accessorFn: (row) => resumoRegistro(tabela, row),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Registro" />,
        meta: { label: "Registro" },
        cell: ({ row }) => (
          <span className="font-medium">{resumoRegistro(tabela, row.original)}</span>
        ),
      },
      {
        id: "excluido_em",
        accessorFn: (row) => String(row.deleted_at ?? ""),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Excluído em" />,
        meta: { label: "Excluído em", hideBelow: "sm" },
        cell: ({ row }) => {
          const deletedAt = (row.original.deleted_at as string) ?? null;
          return (
            <span className="text-xs text-muted-foreground">
              {deletedAt ? new Date(deletedAt).toLocaleString("pt-BR") : "—"}
            </span>
          );
        },
      },
      {
        id: "expira",
        accessorFn: (row) => diasAteExpiracao((row.deleted_at as string) ?? null),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Expira em" />,
        meta: { label: "Expira em" },
        cell: ({ row }) => {
          const dias = diasAteExpiracao((row.original.deleted_at as string) ?? null);
          return (
            <Badge variant={dias <= 7 ? "destructive" : "secondary"}>
              {dias} dia{dias === 1 ? "" : "s"}
            </Badge>
          );
        },
      },
      {
        id: "acoes",
        header: () => <span className="sr-only">Ações</span>,
        enableSorting: false,
        enableHiding: false,
        meta: { align: "right" },
        cell: ({ row }) => {
          const id = String(row.original.id);
          const resumo = resumoRegistro(tabela, row.original);
          return (
            <Button
              size="sm"
              variant="outline"
              onClick={() => mutateRestaurar({ id, resumo })}
              aria-label={`Restaurar ${resumo}`}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Restaurar
            </Button>
          );
        },
      },
    ],
    [tabela, mutateRestaurar],
  );

  const total = (data ?? []).length;

  return (
    <div>
      {total > 0 && (
        <SectionHeader
          eyebrow="Lixeira"
          title={`${total} ${total === 1 ? "registro excluído" : "registros excluídos"}`}
        />
      )}
      <DataTable
        tableId="lixeira"
        aria-label={`Registros de ${LIXEIRA_LABEL[tabela].toLowerCase()} na lixeira`}
        columns={columns}
        data={data ?? []}
        loading={isLoading}
        error={isError ? error : undefined}
        onRetry={() => void refetch()}
        empty={
          <EmptyState
            icon={Trash2}
            title={`Nenhum registro de ${LIXEIRA_LABEL[tabela].toLowerCase()} na lixeira.`}
            description="Registros excluídos aparecem aqui e podem ser restaurados por 90 dias."
          />
        }
      />
    </div>
  );
}
