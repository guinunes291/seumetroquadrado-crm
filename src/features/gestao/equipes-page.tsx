import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users } from "lucide-react";

type Equipe = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  gestor_id: string | null;
  gestor?: { nome: string; email: string } | null;
  membros_count?: number;
};

export function EquipesPage() {
  const { isAdmin, isGestor } = useUserRoles();
  const { user } = useAuth();
  // Criar/desativar/remover equipe é admin-only; o gestor só edita a PRÓPRIA equipe.
  const podeCriar = isAdmin;
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Equipe | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [gestorId, setGestorId] = useState<string>("none");

  const gestoresQuery = useQuery({
    queryKey: ["gestores-disponiveis"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "gestor"]);
      const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
      if (!ids.length) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, nome, email")
        .in("id", ids)
        .order("nome");
      return data ?? [];
    },
  });

  const equipesQuery = useQuery({
    queryKey: ["equipes"],
    queryFn: async (): Promise<Equipe[]> => {
      const { data, error } = await supabase
        .from("equipes")
        .select("id, nome, descricao, ativo, gestor_id")
        .order("nome");
      if (error) throw error;

      // gestor profile lookup
      const gestorIds = (data ?? []).map((e) => e.gestor_id).filter(Boolean) as string[];
      const gestorMap: Record<string, { nome: string; email: string }> = {};
      if (gestorIds.length) {
        const { data: gestoresData } = await supabase
          .from("profiles")
          .select("id, nome, email")
          .in("id", gestorIds);
        for (const g of gestoresData ?? []) gestorMap[g.id] = { nome: g.nome, email: g.email };
      }

      // membros count
      const { data: membros } = await supabase.from("profiles").select("equipe_id");
      const counts: Record<string, number> = {};
      for (const m of membros ?? []) {
        if (m.equipe_id) counts[m.equipe_id] = (counts[m.equipe_id] ?? 0) + 1;
      }

      return (data ?? []).map((e) => ({
        ...e,
        gestor: e.gestor_id ? (gestorMap[e.gestor_id] ?? null) : null,
        membros_count: counts[e.id] ?? 0,
      }));
    },
  });

  const resetForm = () => {
    setEditing(null);
    setNome("");
    setDescricao("");
    setGestorId("none");
  };

  const startEdit = useCallback((e: Equipe) => {
    setEditing(e);
    setNome(e.nome);
    setDescricao(e.descricao ?? "");
    setGestorId(e.gestor_id ?? "none");
    setOpen(true);
  }, []);

  const upsertMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nome,
        descricao: descricao || null,
        gestor_id: gestorId === "none" ? null : gestorId,
      };
      if (editing) {
        const { error } = await supabase.from("equipes").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("equipes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipes"] });
      qc.invalidateQueries({ queryKey: ["dash", "equipes-count"] });
      toast.success(editing ? "Equipe atualizada" : "Equipe criada");
      setOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const toggleAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("equipes").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipes"] });
      toast.success("Status atualizado");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("equipes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipes"] });
      toast.success("Equipe removida");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const mutateAtivo = toggleAtivo.mutate;
  const mutateRemove = remove.mutate;

  const columns = useMemo<ColumnDef<Equipe, unknown>[]>(
    () => [
      {
        accessorKey: "nome",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Equipe" />,
        meta: { label: "Equipe" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-medium">{row.original.nome}</div>
            {row.original.descricao && (
              <div className="text-xs text-muted-foreground line-clamp-1">
                {row.original.descricao}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "gestor",
        accessorFn: (e) => e.gestor?.nome ?? e.gestor?.email ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Gestor" />,
        meta: { label: "Gestor", hideBelow: "sm" },
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.gestor?.nome ?? row.original.gestor?.email ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "membros_count",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Membros" />,
        meta: { label: "Membros", align: "right", cellClassName: "tabular-nums" },
        cell: ({ row }) => row.original.membros_count ?? 0,
      },
      {
        accessorKey: "ativo",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        meta: { label: "Status", hideBelow: "sm" },
        cell: ({ row }) =>
          row.original.ativo ? <Badge>Ativa</Badge> : <Badge variant="secondary">Inativa</Badge>,
      },
      {
        id: "acoes",
        header: () => <span className="sr-only">Ações</span>,
        enableSorting: false,
        enableHiding: false,
        meta: { align: "right" },
        cell: ({ row }) => (
          <div className="space-x-1 whitespace-nowrap">
            {(isAdmin || (isGestor && row.original.gestor_id === user?.id)) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => startEdit(row.original)}
                aria-label={`Editar equipe ${row.original.nome}`}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {isAdmin && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => mutateAtivo({ id: row.original.id, ativo: !row.original.ativo })}
                >
                  {row.original.ativo ? "Desativar" : "Ativar"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remover equipe ${row.original.nome}`}
                  onClick={() => {
                    if (confirm(`Remover a equipe "${row.original.nome}"?`)) {
                      mutateRemove(row.original.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [isAdmin, isGestor, user?.id, startEdit, mutateAtivo, mutateRemove],
  );

  return (
    <div>
      <PageHeader
        title="Equipes"
        description="Crie equipes comerciais e atribua um gestor."
        actions={
          podeCriar && (
            <Dialog
              open={open}
              onOpenChange={(o) => {
                setOpen(o);
                if (!o) resetForm();
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" />
                  Nova equipe
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editing ? "Editar equipe" : "Nova equipe"}</DialogTitle>
                  <DialogDescription>
                    Defina nome, descrição e o gestor responsável.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="nome">Nome</Label>
                    <Input
                      id="nome"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Ex.: Equipe Centro"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="descricao">Descrição</Label>
                    <Textarea
                      id="descricao"
                      value={descricao}
                      onChange={(e) => setDescricao(e.target.value)}
                      rows={3}
                      placeholder="Resumo, foco da equipe…"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Gestor responsável</Label>
                    <Select value={gestorId} onValueChange={setGestorId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem gestor</SelectItem>
                        {(gestoresQuery.data ?? []).map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.nome || g.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => upsertMutation.mutate()}
                    disabled={!nome.trim() || upsertMutation.isPending}
                  >
                    {upsertMutation.isPending ? "Salvando…" : "Salvar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        }
      />

      <DataTable
        tableId="equipes"
        aria-label="Equipes comerciais"
        columns={columns}
        data={equipesQuery.data ?? []}
        loading={equipesQuery.isLoading}
        error={equipesQuery.isError ? equipesQuery.error : undefined}
        onRetry={() => void equipesQuery.refetch()}
        empty={
          <EmptyState
            icon={Users}
            title="Nenhuma equipe cadastrada."
            description="Crie a primeira equipe comercial e atribua um gestor responsável."
          />
        }
      />
    </div>
  );
}
