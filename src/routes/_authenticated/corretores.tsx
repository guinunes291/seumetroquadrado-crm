import { createFileRoute } from "@tanstack/react-router";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { UserPlus, Search, AlertTriangle, Check, X, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/corretores")({
  head: () => ({
    meta: [{ title: "Corretores — Seu Metro Quadrado" }],
  }),
  component: CorretoresPage,
});

type AppRole = "admin" | "gestor" | "corretor";

type CorretorRow = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  cargo: string | null;
  ativo: boolean;
  equipe_id: string | null;
  equipe?: { nome: string } | null;
  roles: AppRole[];
};

export function CorretoresPage() {
  const { isAdmin, isGestor } = useUserRoles();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  // Confirmação antes de bloquear um corretor (ação destrutiva: perde acesso).
  const [confirmBlock, setConfirmBlock] = useState<{ id: string; nome: string } | null>(null);

  const equipesQuery = useQuery({
    queryKey: ["equipes", "list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipes").select("id, nome").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const corretoresQuery = useQuery({
    queryKey: ["corretores"],
    queryFn: async (): Promise<CorretorRow[]> => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, nome, email, telefone, cargo, ativo, equipe_id, equipe:equipes(nome)")
        .order("nome");
      if (error) throw error;

      const ids = (profiles ?? []).map((p) => p.id);
      let rolesByUser: Record<string, AppRole[]> = {};
      if (ids.length) {
        const { data: rolesData } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", ids);
        rolesByUser = (rolesData ?? []).reduce<Record<string, AppRole[]>>((acc, r) => {
          (acc[r.user_id] ||= []).push(r.role as AppRole);
          return acc;
        }, {});
      }

      return (profiles ?? []).map((p) => ({
        ...p,
        equipe: Array.isArray(p.equipe) ? (p.equipe[0] ?? null) : p.equipe,
        roles: rolesByUser[p.id] ?? [],
      })) as CorretorRow[];
    },
  });

  const updateAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("profiles").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["corretores"] });
      toast.success("Status atualizado");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const updateEquipe = useMutation({
    mutationFn: async ({ id, equipe_id }: { id: string; equipe_id: string | null }) => {
      const { error } = await supabase.from("profiles").update({ equipe_id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["corretores"] });
      toast.success("Equipe atualizada");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const updateTelefone = useMutation({
    mutationFn: async ({ id, telefone }: { id: string; telefone: string }) => {
      const digits = telefone.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 13) {
        throw new Error("Telefone inválido. Use DDD + número (ex.: (11) 90000-0000).");
      }
      const { error } = await supabase.from("profiles").update({ telefone }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["corretores"] });
      toast.success("Telefone atualizado");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const setRole = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: AppRole }) => {
      // remove papéis existentes (1 role por user, simplificação)
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", user_id);
      if (delErr) throw delErr;
      const { error } = await supabase.from("user_roles").insert({ user_id, role });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["corretores"] });
      toast.success("Papel atualizado");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const semTelefone = (corretoresQuery.data ?? []).filter((c) => c.ativo && !c.telefone).length;

  const lista = (corretoresQuery.data ?? []).filter((c) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      c.nome.toLowerCase().includes(s) ||
      c.email.toLowerCase().includes(s) ||
      (c.telefone ?? "").toLowerCase().includes(s)
    );
  });

  if (!isAdmin && !isGestor) {
    return (
      <div>
        <PageHeader title="Corretores" description="Gestão de usuários do CRM." />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Apenas administradores e gestores podem acessar esta página.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Corretores"
        description="Gestão dos usuários do CRM, papéis e equipes."
        actions={
          isAdmin && (
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="h-4 w-4" />
                  Como adicionar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Como adicionar um corretor</DialogTitle>
                  <DialogDescription>
                    Nesta fase inicial, a entrada de novos usuários é via auto-cadastro: peça para o
                    corretor acessar a tela <strong>/auth</strong> e criar a conta com o e-mail
                    profissional. Ele aparecerá aqui logo após o primeiro login, e você poderá
                    definir o papel e a equipe dele.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => navigator.clipboard?.writeText(window.location.origin + "/auth")}
                  >
                    Copiar link /auth
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        }
      />

      {semTelefone > 0 && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {semTelefone} corretor{semTelefone > 1 ? "es ativos estão" : " ativo está"} sem telefone
          cadastrado. Sem telefone, o webhook não consegue distribuir leads para ele
          {semTelefone > 1 ? "s" : ""}.
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, e-mail ou telefone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Equipe</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {corretoresQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!corretoresQuery.isLoading && lista.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum corretor cadastrado ainda.
                  </TableCell>
                </TableRow>
              )}
              {lista.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email}</TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <TelefoneCell
                        valor={c.telefone}
                        onSave={(v) => updateTelefone.mutateAsync({ id: c.id, telefone: v })}
                      />
                    ) : c.telefone ? (
                      <span className="text-muted-foreground">{c.telefone}</span>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" /> Sem telefone
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <Select
                        value={c.equipe_id ?? "none"}
                        onValueChange={(v) =>
                          updateEquipe.mutate({ id: c.id, equipe_id: v === "none" ? null : v })
                        }
                      >
                        <SelectTrigger className="h-8 w-[160px]">
                          <SelectValue placeholder="Sem equipe" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem equipe</SelectItem>
                          {(equipesQuery.data ?? []).map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      (c.equipe?.nome ?? <span className="text-muted-foreground">—</span>)
                    )}
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <Select
                        value={c.roles[0] ?? "corretor"}
                        onValueChange={(v) => setRole.mutate({ user_id: c.id, role: v as AppRole })}
                      >
                        <SelectTrigger className="h-8 w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="gestor">Gestor</SelectItem>
                          <SelectItem value="corretor">Corretor</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex gap-1 flex-wrap">
                        {c.roles.map((r) => (
                          <Badge key={r} variant="secondary" className="capitalize">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <Button
                        variant={c.ativo ? "outline" : "default"}
                        size="sm"
                        onClick={() =>
                          c.ativo
                            ? setConfirmBlock({ id: c.id, nome: c.nome })
                            : updateAtivo.mutate({ id: c.id, ativo: true })
                        }
                      >
                        {c.ativo ? "Bloquear" : "Reativar"}
                      </Button>
                    ) : c.ativo ? (
                      <Badge>Ativo</Badge>
                    ) : (
                      <Badge variant="destructive">Bloqueado</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mt-3 text-xs text-muted-foreground">
        <Label className="font-medium">Como funcionam os papéis</Label>
        <ul className="list-disc pl-5 mt-1 space-y-0.5">
          <li>
            <strong>Admin</strong>: acesso total — pode gerenciar equipes, corretores e papéis.
          </li>
          <li>
            <strong>Gestor</strong>: gerencia a própria equipe e ações operacionais.
          </li>
          <li>
            <strong>Corretor</strong>: operação do dia a dia.
          </li>
        </ul>
      </div>

      <AlertDialog open={!!confirmBlock} onOpenChange={(o) => !o && setConfirmBlock(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bloquear {confirmBlock?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              O corretor perderá o acesso imediatamente e sairá da fila de distribuição. Você pode
              reativá-lo depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmBlock) updateAtivo.mutate({ id: confirmBlock.id, ativo: false });
                setConfirmBlock(null);
              }}
            >
              Bloquear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TelefoneCell({
  valor,
  onSave,
}: {
  valor: string | null;
  onSave: (v: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(valor ?? "");
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        {valor ? (
          <span className="text-muted-foreground">{valor}</span>
        ) : (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" /> Sem telefone
          </Badge>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => {
            setVal(valor ?? "");
            setEditing(true);
          }}
          aria-label="Editar telefone"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="(11) 90000-0000"
        className="h-8 w-[160px]"
      />
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            await onSave(val.trim());
            setEditing(false);
          } catch {
            // toast já é exibido pela mutation
          } finally {
            setSaving(false);
          }
        }}
        aria-label="Salvar"
      >
        <Check className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={() => setEditing(false)}
        aria-label="Cancelar"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
