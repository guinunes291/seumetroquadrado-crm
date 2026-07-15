import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CrmInviteDialog } from "@/components/crm-invite-dialog";
import { toast } from "sonner";
import { Search, AlertTriangle, Check, X, Pencil, Users } from "lucide-react";

type AppRole = "admin" | "superintendente" | "gestor" | "corretor";

type CorretorRow = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  cargo: string | null;
  ativo: boolean;
  status_conta: "pendente" | "ativa" | "bloqueada";
  equipe_id: string | null;
  equipe?: { nome: string } | null;
  roles: AppRole[];
};

export function CorretoresPage() {
  const { isAdmin, isGestor, isSuperintendente } = useUserRoles();
  const { user } = useAuth();
  const veTodos = isAdmin || isSuperintendente;
  const qc = useQueryClient();

  // Para gestor (não admin/super), descobrir escopo: sua equipe + equipes que ele lidera.
  const escopoGestorQuery = useQuery({
    queryKey: ["gestor-escopo", user?.id],
    enabled: !!user?.id && isGestor && !veTodos,
    queryFn: async () => {
      const [{ data: prof }, { data: eqs }] = await Promise.all([
        supabase.from("profiles").select("equipe_id").eq("id", user!.id).maybeSingle(),
        supabase.from("equipes").select("id").eq("gestor_id", user!.id),
      ]);
      const ids = new Set<string>();
      if (prof?.equipe_id) ids.add(prof.equipe_id);
      (eqs ?? []).forEach((e) => ids.add(e.id));
      return Array.from(ids);
    },
  });
  const equipeIds = escopoGestorQuery.data;
  const escopoPronto = veTodos || !isGestor || escopoGestorQuery.isSuccess;
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
    queryKey: ["corretores", veTodos ? "all" : (equipeIds ?? []).sort().join(","), user?.id],
    enabled: escopoPronto,
    queryFn: async (): Promise<CorretorRow[]> => {
      let q = supabase
        .from("profiles")
        .select(
          "id, nome, email, telefone, cargo, ativo, status_conta, equipe_id, equipe:equipes(nome)",
        )
        .order("nome");

      // Gestor (não admin/super) enxerga apenas sua(s) equipe(s) — e sempre a si mesmo.
      if (!veTodos && isGestor) {
        const ids = equipeIds ?? [];
        if (ids.length === 0) {
          q = q.eq("id", user?.id ?? "");
        } else {
          const inList = ids.map((v) => `"${v}"`).join(",");
          q = q.or(`equipe_id.in.(${inList}),id.eq.${user?.id ?? ""}`);
        }
      }

      const { data: profiles, error } = await q;
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
      toast.success("Elegibilidade para distribuição atualizada");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const updateAccountStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "ativa" | "bloqueada" }) => {
      const { data, error } = await supabase.functions.invoke("crm-convites", {
        body: { acao: "definir_status", usuario_id: id, status },
      });
      if (error || !data?.ok) {
        throw new Error(
          data?.error === "status_update_failed"
            ? "A conta não pôde ser alterada. Confirme que existe outro admin ativo."
            : "Não foi possível alterar a conta.",
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["corretores"] });
      toast.success("Estado da conta atualizado");
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

  const semTelefone = (corretoresQuery.data ?? []).filter(
    (c) => c.ativo && c.status_conta === "ativa" && !c.telefone,
  ).length;

  const lista = (corretoresQuery.data ?? []).filter((c) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      c.nome.toLowerCase().includes(s) ||
      c.email.toLowerCase().includes(s) ||
      (c.telefone ?? "").toLowerCase().includes(s)
    );
  });

  const equipes = equipesQuery.data;
  const mutateAtivo = updateAtivo.mutate;
  const mutateAccountStatus = updateAccountStatus.mutate;
  const mutateEquipe = updateEquipe.mutate;
  const mutateRole = setRole.mutate;
  const mutateTelefone = updateTelefone.mutateAsync;

  const columns = useMemo<ColumnDef<CorretorRow, unknown>[]>(
    () => [
      {
        accessorKey: "nome",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Nome" />,
        meta: { label: "Nome" },
        cell: ({ row }) => <span className="font-medium">{row.original.nome || "—"}</span>,
      },
      {
        accessorKey: "email",
        header: ({ column }) => <DataTableColumnHeader column={column} title="E-mail" />,
        meta: { label: "E-mail", hideBelow: "md" },
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.email}</span>,
      },
      {
        id: "telefone",
        header: "Telefone",
        enableSorting: false,
        meta: { label: "Telefone", hideBelow: "lg" },
        cell: ({ row }) =>
          isAdmin ? (
            <TelefoneCell
              valor={row.original.telefone}
              onSave={(v) => mutateTelefone({ id: row.original.id, telefone: v })}
            />
          ) : row.original.telefone ? (
            <span className="text-muted-foreground">{row.original.telefone}</span>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> Sem telefone
            </Badge>
          ),
      },
      {
        id: "equipe",
        header: "Equipe",
        enableSorting: false,
        meta: { label: "Equipe", hideBelow: "lg" },
        cell: ({ row }) =>
          isAdmin ? (
            <Select
              value={row.original.equipe_id ?? "none"}
              onValueChange={(v) =>
                mutateEquipe({ id: row.original.id, equipe_id: v === "none" ? null : v })
              }
            >
              <SelectTrigger className="h-8 w-[160px]">
                <SelectValue placeholder="Sem equipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem equipe</SelectItem>
                {(equipes ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            (row.original.equipe?.nome ?? <span className="text-muted-foreground">—</span>)
          ),
      },
      {
        id: "papel",
        header: "Papel",
        enableSorting: false,
        meta: { label: "Papel", hideBelow: "sm" },
        cell: ({ row }) =>
          isAdmin ? (
            <Select
              value={row.original.roles[0] ?? "corretor"}
              onValueChange={(v) => mutateRole({ user_id: row.original.id, role: v as AppRole })}
            >
              <SelectTrigger className="h-8 w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="gestor">Gestor</SelectItem>
                <SelectItem value="superintendente">Superintendente</SelectItem>
                <SelectItem value="corretor">Corretor</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <div className="flex gap-1 flex-wrap">
              {row.original.roles.map((r) => (
                <Badge key={r} variant="secondary" className="capitalize">
                  {r}
                </Badge>
              ))}
            </div>
          ),
      },
      {
        id: "distribuicao",
        header: () => <span title="Elegibilidade operacional e da roleta">Distribuição</span>,
        enableSorting: false,
        meta: { label: "Distribuição" },
        cell: ({ row }) =>
          isAdmin ? (
            <Button
              variant={row.original.ativo ? "outline" : "default"}
              size="sm"
              onClick={() => mutateAtivo({ id: row.original.id, ativo: !row.original.ativo })}
            >
              {row.original.ativo ? "Pausar" : "Ativar"}
            </Button>
          ) : row.original.ativo ? (
            <Badge>Elegível</Badge>
          ) : (
            <Badge variant="secondary">Pausado</Badge>
          ),
      },
      {
        id: "conta",
        header: () => <span title="Acesso ao CRM e sessões">Conta</span>,
        enableSorting: false,
        meta: { label: "Conta" },
        cell: ({ row }) =>
          isAdmin ? (
            <Button
              variant={row.original.status_conta === "ativa" ? "outline" : "default"}
              size="sm"
              onClick={() =>
                row.original.status_conta === "ativa"
                  ? setConfirmBlock({ id: row.original.id, nome: row.original.nome })
                  : mutateAccountStatus({ id: row.original.id, status: "ativa" })
              }
            >
              {row.original.status_conta === "ativa" ? "Bloquear" : "Liberar"}
            </Button>
          ) : row.original.status_conta === "ativa" ? (
            <Badge>Ativa</Badge>
          ) : row.original.status_conta === "pendente" ? (
            <Badge variant="secondary">Pendente</Badge>
          ) : (
            <Badge variant="destructive">Bloqueada</Badge>
          ),
      },
    ],
    [isAdmin, equipes, mutateAtivo, mutateAccountStatus, mutateEquipe, mutateRole, mutateTelefone],
  );

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
          (isAdmin || isGestor) && (
            <CrmInviteDialog equipes={equipesQuery.data ?? []} canAssignPrivilegedRoles={isAdmin} />
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

      <DataTable
        tableId="corretores"
        aria-label="Corretores do CRM"
        columns={columns}
        data={lista}
        loading={corretoresQuery.isLoading}
        error={corretoresQuery.isError ? corretoresQuery.error : undefined}
        onRetry={() => void corretoresQuery.refetch()}
        empty={
          <EmptyState
            icon={Users}
            title={q ? "Nenhum corretor para essa busca." : "Nenhum corretor cadastrado ainda."}
            description={
              q
                ? "Ajuste o termo de busca ou limpe o campo."
                : "Convide as primeiras pessoas pelo botão acima."
            }
          />
        }
      />

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
                if (confirmBlock) {
                  updateAccountStatus.mutate({ id: confirmBlock.id, status: "bloqueada" });
                }
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
