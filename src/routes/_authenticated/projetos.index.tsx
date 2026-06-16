import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Building2, Upload } from "lucide-react";
import { slugify, webhookUrl } from "@/lib/projetos";
import { ImportProjetosDialog } from "@/components/import-projetos-dialog";
import { ProjetoCard, type ProjetoRow } from "@/components/projeto-card";
import {
  ProjetosFilters,
  applyFilters,
  emptyFilters,
  type Filters,
} from "@/components/projetos-filters";

export const Route = createFileRoute("/_authenticated/projetos/")({
  head: () => ({ meta: [{ title: "Projetos — Seu Metro Quadrado" }] }),
  component: ProjetosPage,
});

function ProjetosPage() {
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const canManage = isAdmin || isGestor;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<Filters>(emptyFilters);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const projetosQ = useQuery({
    queryKey: ["projetos", canManage ? "all" : "ativos"],
    queryFn: async () => {
      let q = supabase.from("projetos").select("*").is("deleted_at", null);
      if (!canManage) q = q.eq("ativo", true);
      const { data, error } = await q.order("nome");
      if (error) throw error;
      return (data ?? []) as ProjetoRow[];
    },
  });

  const all = projetosQ.data ?? [];
  const filtered = useMemo(() => applyFilters(all, filters), [all, filters]);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editing?.id) {
        const { error } = await supabase.from("projetos").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("projetos").insert({ ...payload, criado_por: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Projeto atualizado" : "Projeto criado");
      setOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["projetos"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const loadToken = async (id: string): Promise<string | null> => {
    if (tokens[id]) return tokens[id];
    const { data, error } = await supabase.rpc("get_projeto_webhook_token", { _projeto_id: id });
    if (error) { toast.error(error.message); return null; }
    const t = (data as string) ?? "";
    setTokens((s) => ({ ...s, [id]: t }));
    return t;
  };

  const regenMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("regenerar_webhook_token", { _projeto_id: id });
      if (error) throw error;
      setTokens((s) => ({ ...s, [id]: (data as string) ?? "" }));
    },
    onSuccess: () => {
      toast.success("Token regenerado");
      qc.invalidateQueries({ queryKey: ["projetos"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("projetos").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projetos"] }),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nome = String(fd.get("nome"));
    const payload: any = {
      nome,
      slug: String(fd.get("slug") || slugify(nome)),
      construtora: fd.get("construtora") || null,
      cidade: fd.get("cidade") || null,
      observacoes: fd.get("observacoes") || null,
    };
    saveMutation.mutate(payload);
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Projetos / Empreendimentos"
        description={
          canManage
            ? "Catálogo de empreendimentos. Cada projeto tem seu próprio webhook para receber leads externos."
            : "Catálogo de empreendimentos disponíveis para indicação."
        }
        actions={canManage && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />Importar projetos
            </Button>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Novo projeto</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editing ? "Editar projeto" : "Novo projeto"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <Label htmlFor="nome">Nome do empreendimento</Label>
                    <Input id="nome" name="nome" required defaultValue={editing?.nome} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="slug">Slug</Label>
                      <Input id="slug" name="slug" placeholder="auto" defaultValue={editing?.slug} />
                    </div>
                    <div>
                      <Label htmlFor="cidade">Cidade</Label>
                      <Input id="cidade" name="cidade" defaultValue={editing?.cidade ?? ""} />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="construtora">Construtora</Label>
                    <Input id="construtora" name="construtora" defaultValue={editing?.construtora ?? ""} />
                  </div>
                  <div>
                    <Label htmlFor="observacoes">Observações</Label>
                    <Input id="observacoes" name="observacoes" defaultValue={editing?.observacoes ?? ""} />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? "Salvando..." : "Salvar"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      />

      <ImportProjetosDialog open={importOpen} onOpenChange={setImportOpen} />

      {projetosQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : all.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Building2 className="h-10 w-10 mx-auto mb-2 opacity-40" />
          Nenhum projeto cadastrado ainda.
        </CardContent></Card>
      ) : (
        <>
          <ProjetosFilters projetos={all} filters={filters} onChange={setFilters} />

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {filtered.length} {filtered.length === 1 ? "projeto" : "projetos"}
              {filtered.length !== all.length && ` de ${all.length}`}
            </span>
          </div>

          {filtered.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Building2 className="h-10 w-10 mx-auto mb-2 opacity-40" />
              Nenhum projeto corresponde aos filtros aplicados.
            </CardContent></Card>
          ) : (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((p) => {
                const token = tokens[p.id];
                return (
                  <ProjetoCard
                    key={p.id}
                    projeto={p}
                    canManage={canManage}
                    origin={origin}
                    token={token}
                    revealed={!!revealed[p.id]}
                    onToggleAtivo={(ativo) => toggleAtivo.mutate({ id: p.id, ativo })}
                    onEdit={() => { setEditing(p); setOpen(true); }}
                    onLoadToken={() => loadToken(p.id)}
                    onRegen={() => regenMutation.mutate(p.id)}
                    onToggleReveal={() => setRevealed((r) => ({ ...r, [p.id]: !r[p.id] }))}
                    onCopyUrl={async () => {
                      const t = await loadToken(p.id);
                      if (t) copy(webhookUrl(origin, t));
                    }}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
