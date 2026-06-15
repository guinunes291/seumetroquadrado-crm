import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import {
  LIXEIRA_TABELAS,
  LIXEIRA_LABEL,
  type LixeiraTabela,
  diasAteExpiracao,
  resumoRegistro,
  restaurar,
} from "@/lib/lixeira";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lixeira")({
  component: LixeiraPage,
});

function LixeiraPage() {
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

function ListaLixeira({ tabela }: { tabela: LixeiraTabela }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["lixeira", tabela],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tabela)
        .select("*")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Record<string, unknown>[];
    },
  });

  const restoreMut = useMutation({
    mutationFn: (id: string) => restaurar(tabela, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lixeira", tabela] });
      toast.success("Registro restaurado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Carregando...</CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground flex items-center gap-2">
          <Trash2 className="h-4 w-4" />
          Nenhum registro de {LIXEIRA_LABEL[tabela].toLowerCase()} na lixeira.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {data.length} {data.length === 1 ? "registro" : "registros"} excluído{data.length === 1 ? "" : "s"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.map((row) => {
          const id = String(row.id);
          const deletedAt = (row.deleted_at as string) ?? null;
          const dias = diasAteExpiracao(deletedAt);
          return (
            <div
              key={id}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{resumoRegistro(tabela, row)}</div>
                <div className="text-[11px] text-muted-foreground">
                  Excluído em {deletedAt ? new Date(deletedAt).toLocaleString("pt-BR") : "—"}
                </div>
              </div>
              <Badge variant={dias <= 7 ? "destructive" : "secondary"} className="shrink-0">
                {dias} dia{dias === 1 ? "" : "s"}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() => restoreMut.mutate(id)}
                disabled={restoreMut.isPending}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Restaurar
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
