import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Building2, Copy, RefreshCw, Eye, EyeOff } from "lucide-react";
import { slugify, webhookUrl, maskToken } from "@/lib/projetos";

export const Route = createFileRoute("/_authenticated/projetos")({
  head: () => ({ meta: [{ title: "Projetos — Seu Metro Quadrado" }] }),
  component: ProjetosPage,
});

function ProjetosPage() {
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const canManage = isAdmin || isGestor;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const projetosQ = useQuery({
    queryKey: ["projetos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos")
        .select("*")
        .is("deleted_at", null)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

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

  // Tokens só são carregados sob demanda via RPC (admin/gestor)
  const [tokens, setTokens] = useState<Record<string, string>>({});

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
        description="Cada projeto tem seu próprio webhook para receber leads externos (Facebook, sites, Zapier)."
        actions={canManage && (
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
        )}
      />

      {projetosQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (projetosQ.data ?? []).length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Building2 className="h-10 w-10 mx-auto mb-2 opacity-40" />
          Nenhum projeto cadastrado ainda.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {(projetosQ.data ?? []).map((p: any) => {
            const token = tokens[p.id];
            const isRevealed = !!revealed[p.id] && !!token;
            const url = token ? webhookUrl(origin, token) : "";
            return (
              <Card key={p.id} className={!p.ativo ? "opacity-60" : ""}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          to="/projetos/$projetoId"
                          params={{ projetoId: p.id }}
                          className="font-medium hover:underline"
                        >
                          {p.nome}
                        </Link>
                        <Badge variant="outline">{p.slug}</Badge>
                        {!p.ativo && <Badge variant="secondary">Inativo</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                        {p.construtora && <span>{p.construtora}</span>}
                        {p.cidade && <span>{p.cidade}</span>}
                      </div>
                    </div>
                    {canManage && (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Ativo</span>
                          <Switch
                            checked={p.ativo}
                            onCheckedChange={(v) => toggleAtivo.mutate({ id: p.id, ativo: v })}
                          />
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}>
                          Editar
                        </Button>
                      </>
                    )}
                  </div>

                  {canManage && (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                          Webhook URL
                        </Label>
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => {
                            if (confirm("Regenerar token? URLs antigas pararão de funcionar.")) {
                              regenMutation.mutate(p.id);
                            }
                          }}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Regenerar
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs bg-background border rounded px-2 py-1.5 font-mono truncate">
                          {token ? (isRevealed ? url : webhookUrl(origin, maskToken(token))) : "•••••• (clique no olho para carregar)"}
                        </code>
                        <Button
                          size="icon" variant="ghost"
                          onClick={async () => {
                            const t = await loadToken(p.id);
                            if (t) setRevealed((r) => ({ ...r, [p.id]: !r[p.id] }));
                          }}
                          title={isRevealed ? "Ocultar" : "Mostrar"}
                        >
                          {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button
                          size="icon" variant="ghost"
                          onClick={async () => {
                            const t = await loadToken(p.id);
                            if (t) copy(webhookUrl(origin, t));
                          }}
                          title="Copiar URL"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Envie POST com JSON: <code>{`{ "nome", "telefone", "email", "origem", "campanha", "utm_source", ... }`}</code>
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
