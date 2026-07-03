import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Plus, Pencil, Trash2 } from "lucide-react";

// Rota legada mantida para deep-links: o conteúdo vive como aba do hub.
export const Route = createFileRoute("/_authenticated/equipes")({
  beforeLoad: () => {
    throw redirect({ to: "/painel-gestor", search: { tab: "pessoas" } });
  },
});

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
  const podeCriar = isAdmin || isGestor;
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

  const startEdit = (e: Equipe) => {
    setEditing(e);
    setNome(e.nome);
    setDescricao(e.descricao ?? "");
    setGestorId(e.gestor_id ?? "none");
    setOpen(true);
  };

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

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Equipe</TableHead>
                <TableHead>Gestor</TableHead>
                <TableHead>Membros</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {equipesQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!equipesQuery.isLoading && (equipesQuery.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhuma equipe cadastrada.
                  </TableCell>
                </TableRow>
              )}
              {(equipesQuery.data ?? []).map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <div className="font-medium">{e.nome}</div>
                    {e.descricao && (
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {e.descricao}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {e.gestor?.nome ?? e.gestor?.email ?? "—"}
                  </TableCell>
                  <TableCell>{e.membros_count ?? 0}</TableCell>
                  <TableCell>
                    {e.ativo ? <Badge>Ativa</Badge> : <Badge variant="secondary">Inativa</Badge>}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {podeCriar && (
                      <Button variant="ghost" size="sm" onClick={() => startEdit(e)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {isAdmin && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleAtivo.mutate({ id: e.id, ativo: !e.ativo })}
                        >
                          {e.ativo ? "Desativar" : "Ativar"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Remover a equipe "${e.nome}"?`)) remove.mutate(e.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
