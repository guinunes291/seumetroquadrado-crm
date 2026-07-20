// Estoque de leads: leads que estão no sistema sem corretor atribuído.
// Fonte única para o gestor "ver o que está encalhado" e distribuir manual
// ou em lote — substitui o antigo auto-arquivamento por tempo parado.
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@/components/ui/data-table";
import { Boxes, ShieldAlert, Send, Sparkles, Search } from "lucide-react";

type EstoqueLead = {
  id: string;
  nome: string;
  telefone: string | null;
  origem: string | null;
  projeto_nome: string | null;
  created_at: string;
  ultima_interacao: string | null;
};

/**
 * Painel do estoque: leads sem corretor esperando distribuição.
 * Regra: `corretor_id IS NULL AND NOT na_lixeira AND status <> 'perdido'` e
 * `<> 'contrato_fechado'`. Ordena pelos mais antigos primeiro (quanto mais
 * tempo parado, mais perigo de esfriar).
 */
export function EstoquePage() {
  const { isAdmin, isGestor } = useUserRoles();
  const podeVer = isAdmin;
  const [busca, setBusca] = useState("");
  const qc = useQueryClient();

  const listaQ = useQuery({
    queryKey: ["gestao:estoque"],
    enabled: podeVer,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, telefone, origem, projeto_nome, created_at, ultima_interacao")
        .is("corretor_id", null)
        .eq("na_lixeira", false)
        .not("status", "in", "(perdido,contrato_fechado,pos_venda)")
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as EstoqueLead[];
    },
    refetchOnWindowFocus: false,
  });

  const distribuirUm = useMutation({
    mutationFn: async (leadId: string) => {
      const { error } = await supabase.rpc("triar_e_distribuir_lead", {
        _lead_id: leadId,
        _gatilho: "estoque_manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead enviado para distribuição");
      void qc.invalidateQueries({ queryKey: ["gestao:estoque"] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao distribuir"),
  });

  const distribuirLote = useMutation({
    mutationFn: async (ids: string[]) => {
      // Distribui em série para respeitar a fila da roleta e os limites por
      // corretor — paralelizar aqui concentraria leads no mesmo apto.
      let ok = 0;
      let fail = 0;
      for (const id of ids) {
        const { error } = await supabase.rpc("triar_e_distribuir_lead", {
          _lead_id: id,
          _gatilho: "estoque_lote",
        });
        if (error) fail += 1;
        else ok += 1;
      }
      return { ok, fail };
    },
    onSuccess: ({ ok, fail }) => {
      if (ok > 0) toast.success(`${ok} lead(s) distribuído(s)`);
      if (fail > 0) toast.error(`${fail} lead(s) não puderam ser distribuídos`);
      void qc.invalidateQueries({ queryKey: ["gestao:estoque"] });
    },
  });

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const lista = listaQ.data ?? [];
    if (!b) return lista;
    return lista.filter(
      (l) =>
        l.nome.toLowerCase().includes(b) ||
        (l.telefone ?? "").toLowerCase().includes(b) ||
        (l.projeto_nome ?? "").toLowerCase().includes(b) ||
        (l.origem ?? "").toLowerCase().includes(b),
    );
  }, [listaQ.data, busca]);

  const totalEstoque = listaQ.data?.length ?? 0;
  const semInteracao = useMemo(
    () => (listaQ.data ?? []).filter((l) => !l.ultima_interacao).length,
    [listaQ.data],
  );
  const antigos = useMemo(() => {
    const limite = Date.now() - 7 * 86_400_000;
    return (listaQ.data ?? []).filter((l) => Date.parse(l.created_at) < limite).length;
  }, [listaQ.data]);

  const columns = useMemo<ColumnDef<EstoqueLead, unknown>[]>(
    () => [
      {
        accessorKey: "nome",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Lead" />,
        meta: { label: "Lead" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.original.nome}</div>
            <div className="truncate text-xs text-muted-foreground">
              {row.original.telefone ?? "—"}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "projeto_nome",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Projeto" />,
        meta: { label: "Projeto", hideBelow: "sm" },
        cell: ({ row }) => <span className="text-sm">{row.original.projeto_nome ?? "—"}</span>,
      },
      {
        accessorKey: "origem",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Origem" />,
        meta: { label: "Origem", hideBelow: "md" },
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize">
            {row.original.origem ?? "—"}
          </Badge>
        ),
      },
      {
        id: "idade",
        accessorFn: (r) => Date.parse(r.created_at),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Parado há" />,
        meta: { label: "Parado há", align: "right", cellClassName: "tabular-nums" },
        cell: ({ row }) => {
          const dias = Math.max(
            0,
            Math.floor((Date.now() - Date.parse(row.original.created_at)) / 86_400_000),
          );
          return (
            <span
              className={dias >= 7 ? "font-semibold text-destructive" : "text-muted-foreground"}
            >
              {dias === 0 ? "hoje" : `${dias}d`}
            </span>
          );
        },
      },
      {
        id: "acoes",
        header: () => <span className="sr-only">Ações</span>,
        enableSorting: false,
        enableHiding: false,
        meta: { align: "right" },
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={() => distribuirUm.mutate(row.original.id)}
            disabled={distribuirUm.isPending}
          >
            <Send className="mr-1 h-3.5 w-3.5" /> Distribuir
          </Button>
        ),
      },
    ],
    [distribuirUm],
  );

  if (!podeVer) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <ShieldAlert className="h-10 w-10" />
          <div className="font-medium">Acesso restrito</div>
          <div className="text-sm">Esta área é exclusiva para gestores e administradores.</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Estoque"
        title={
          <span className="flex items-center gap-1.5">
            <Boxes className="h-4 w-4 text-primary" /> Leads sem corretor
          </span>
        }
      />
      <p className="-mt-4 text-sm text-muted-foreground">
        Leads no CRM que ainda não foram atribuídos a nenhum corretor. Distribua manualmente ou
        envie o lote para a roleta.
      </p>

      <StatGrid>
        <StatTile
          title="No estoque"
          icon={Boxes}
          intent="info"
          loading={listaQ.isLoading}
          value={totalEstoque}
        />
        <StatTile
          title="Sem 1º contato"
          icon={Sparkles}
          intent="warning"
          loading={listaQ.isLoading}
          value={semInteracao}
        />
        <StatTile
          title="Parados há 7+ dias"
          icon={ShieldAlert}
          intent="danger"
          loading={listaQ.isLoading}
          value={antigos}
        />
      </StatGrid>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, telefone, projeto…"
            className="pl-8"
          />
        </div>
        <Button
          onClick={() => distribuirLote.mutate(filtrados.map((l) => l.id).slice(0, 100))}
          disabled={distribuirLote.isPending || filtrados.length === 0}
          className="shrink-0"
        >
          <Send className="mr-1 h-4 w-4" />
          Distribuir {Math.min(filtrados.length, 100)} agora
        </Button>
      </div>

      <DataTable
        tableId="gestao-estoque"
        aria-label="Leads no estoque"
        columns={columns}
        data={filtrados}
        rowKey={(r) => r.id}
        loading={listaQ.isLoading}
        error={listaQ.isError ? listaQ.error : undefined}
        onRetry={() => void listaQ.refetch()}
        empty={
          <EmptyState
            icon={Boxes}
            title="Sem leads no estoque."
            description="Todos os leads ativos já têm corretor. Bom trabalho!"
          />
        }
      />
    </div>
  );
}
