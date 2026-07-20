import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Link2,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  ExternalLink,
  Search,
  BarChart2,
} from "lucide-react";

type LinkUtil = {
  id: string;
  titulo: string;
  descricao: string | null;
  url: string;
  categoria: string;
  status: "ativo" | "inativo";
  created_at: string;
  criado_por: string | null;
};

type AcessoRow = {
  id: string;
  created_at: string;
  user_id: string;
  link_id: string;
  link: { titulo: string; categoria: string } | null;
};

type FormState = {
  titulo: string;
  descricao: string;
  url: string;
  categoria: string;
  status: "ativo" | "inativo";
};

const EMPTY_FORM: FormState = {
  titulo: "",
  descricao: "",
  url: "",
  categoria: "",
  status: "ativo",
};

function formatDataHora(d: string) {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LinksUteisPage() {
  const { isAdmin, isGestor, loading: rolesLoading } = useUserRoles();
  const canManage = isAdmin;
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState<string>("__all__");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<LinkUtil | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);

  const {
    data: links = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["links-uteis", canManage],
    queryFn: async (): Promise<LinkUtil[]> => {
      const { data, error } = await supabase
        .from("links_uteis")
        .select("*")
        .order("categoria", { ascending: true })
        .order("titulo", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LinkUtil[];
    },
  });

  const {
    data: acessos = [],
    isLoading: acessosLoading,
    isError: acessosIsError,
    error: acessosError,
    refetch: refetchAcessos,
  } = useQuery({
    queryKey: ["links-uteis-acessos"],
    enabled: canManage,
    queryFn: async (): Promise<AcessoRow[]> => {
      const { data, error } = await supabase
        .from("links_uteis_acessos")
        .select("id, created_at, user_id, link_id, link:links_uteis(titulo, categoria)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as AcessoRow[];
    },
  });

  const userIds = useMemo(() => Array.from(new Set(acessos.map((a) => a.user_id))), [acessos]);

  const { data: nomes = {} } = useQuery({
    queryKey: ["profiles-nomes", userIds.join(",")],
    enabled: canManage && userIds.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.from("profiles").select("id, nome").in("id", userIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((p) => {
        map[p.id as string] = (p.nome as string) ?? "";
      });
      return map;
    },
  });

  const categorias = useMemo(
    () => Array.from(new Set(links.map((l) => l.categoria))).sort(),
    [links],
  );

  const linksVisiveis = useMemo(() => {
    const term = search.trim().toLowerCase();
    return links.filter((l) => {
      if (!canManage && l.status !== "ativo") return false;
      if (categoria !== "__all__" && l.categoria !== categoria) return false;
      if (!term) return true;
      return (
        l.titulo.toLowerCase().includes(term) ||
        (l.descricao ?? "").toLowerCase().includes(term) ||
        l.categoria.toLowerCase().includes(term)
      );
    });
  }, [links, search, categoria, canManage]);

  const linksPorCategoria = useMemo(() => {
    const map = new Map<string, LinkUtil[]>();
    linksVisiveis.forEach((l) => {
      if (!map.has(l.categoria)) map.set(l.categoria, []);
      map.get(l.categoria)!.push(l);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [linksVisiveis]);

  const registrarAcesso = useMutation({
    mutationFn: async (link: LinkUtil) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      await supabase.from("links_uteis_acessos").insert({
        link_id: link.id,
        user_id: u.user.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["links-uteis-acessos"] });
    },
  });

  function abrirLink(link: LinkUtil) {
    registrarAcesso.mutate(link);
    window.open(link.url, "_blank", "noopener,noreferrer");
  }

  const createMut = useMutation({
    mutationFn: async () => {
      if (!form.titulo.trim() || !form.url.trim() || !form.categoria.trim()) {
        throw new Error("Título, URL e categoria são obrigatórios.");
      }
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("links_uteis").insert({
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim() || null,
        url: form.url.trim(),
        categoria: form.categoria.trim(),
        status: form.status,
        criado_por: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Link criado");
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ["links-uteis"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: async (payload: Partial<LinkUtil> & { id: string }) => {
      const { id, ...rest } = payload;
      const { error } = await supabase.from("links_uteis").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Link atualizado");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["links-uteis"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("links_uteis").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Link removido");
      qc.invalidateQueries({ queryKey: ["links-uteis"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openEdit(link: LinkUtil) {
    setEditing(link);
    setEditForm({
      titulo: link.titulo,
      descricao: link.descricao ?? "",
      url: link.url,
      categoria: link.categoria,
      status: link.status,
    });
  }

  function salvarEdicao() {
    if (!editing) return;
    if (!editForm.titulo.trim() || !editForm.url.trim() || !editForm.categoria.trim()) {
      toast.error("Título, URL e categoria são obrigatórios.");
      return;
    }
    updateMut.mutate({
      id: editing.id,
      titulo: editForm.titulo.trim(),
      descricao: editForm.descricao.trim() || null,
      url: editForm.url.trim(),
      categoria: editForm.categoria.trim(),
      status: editForm.status,
    });
  }

  if (rolesLoading) {
    return (
      <div className="space-y-4" role="status" aria-busy="true" aria-label="Carregando links úteis">
        <Skeleton className="h-14 w-full max-w-md rounded-md" />
        <Skeleton className="h-10 w-64 rounded-md" />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const totalAtivos = links.filter((l) => l.status === "ativo").length;

  return (
    <div>
      <PageHeader
        title="Links Úteis"
        description="Centralize portais, tabelas, grupos e materiais de apoio para o time encontrar tudo em um lugar só."
        actions={
          canManage ? (
            <Dialog
              open={createOpen}
              onOpenChange={(v) => {
                setCreateOpen(v);
                if (!v) setForm(EMPTY_FORM);
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" /> Novo link
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Novo link</DialogTitle>
                </DialogHeader>
                <LinkFormFields form={form} setForm={setForm} categoriasSugeridas={categorias} />
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={() => createMut.mutate()} loading={createMut.isPending}>
                    Criar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null
        }
      />

      <Tabs defaultValue="catalogo">
        <TabsList>
          <TabsTrigger value="catalogo">
            <Link2 className="h-4 w-4 mr-2" /> Catálogo ({totalAtivos})
          </TabsTrigger>
          {canManage && (
            <>
              <TabsTrigger value="gerenciar">Gerenciar</TabsTrigger>
              <TabsTrigger value="relatorio">
                <BarChart2 className="h-4 w-4 mr-2" /> Acessos
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="catalogo" className="mt-4 space-y-4">
          <div className="flex flex-col md:flex-row gap-2 md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por título, descrição ou categoria…"
                className="pl-9"
              />
            </div>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger className="w-full md:w-56">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as categorias</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : isError ? (
            <QueryErrorState
              title="Não foi possível carregar os links."
              error={error}
              onRetry={() => refetch()}
            />
          ) : linksPorCategoria.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Link2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <div className="font-medium">Nenhum link encontrado</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {canManage
                    ? 'Clique em "Novo link" para começar.'
                    : "Peça ao gestor para cadastrar links úteis aqui."}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {linksPorCategoria.map(([cat, items]) => (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-sm font-semibold tracking-tight">{cat}</h2>
                    <Badge variant="outline" className="text-[10px]">
                      {items.length}
                    </Badge>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {items.map((l) => (
                      <Card key={l.id} className="group hover:border-primary/50 transition-colors">
                        <CardContent className="pt-5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <Link2 className="h-4 w-4 text-primary shrink-0" />
                                <div className="font-medium truncate">{l.titulo}</div>
                              </div>
                              {l.descricao && (
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                  {l.descricao}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground/80 mt-2 truncate">
                                {l.url}
                              </p>
                            </div>
                            {l.status === "inativo" && (
                              <Badge variant="secondary" className="text-[10px]">
                                Inativo
                              </Badge>
                            )}
                          </div>
                          <div className="mt-4 flex items-center justify-between gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => abrirLink(l)}
                              className="flex-1"
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Abrir link
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {canManage && (
          <TabsContent value="gerenciar" className="mt-4">
            {isLoading ? (
              <div className="space-y-2" aria-busy="true">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-md" />
                ))}
              </div>
            ) : isError ? (
              <QueryErrorState
                title="Não foi possível carregar os links."
                error={error}
                onRetry={() => refetch()}
              />
            ) : links.length === 0 ? (
              <EmptyState
                icon={Link2}
                title="Nenhum link cadastrado ainda"
                description="Crie o primeiro link para centralizar portais, tabelas e materiais do time."
                action={
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" /> Novo link
                  </Button>
                }
                className="py-12"
              />
            ) : (
              <div className="border rounded-xl overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Título</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {links.map((link) => (
                      <TableRow key={link.id}>
                        <TableCell>
                          <div className="font-medium text-sm">{link.titulo}</div>
                          {link.descricao && (
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              {link.descricao}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {link.categoria}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <p className="text-xs text-muted-foreground truncate">{link.url}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant={link.status === "ativo" ? "default" : "secondary"}>
                            {link.status === "ativo" ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title={link.status === "ativo" ? "Desativar" : "Ativar"}
                              aria-label={
                                link.status === "ativo"
                                  ? `Desativar "${link.titulo}"`
                                  : `Ativar "${link.titulo}"`
                              }
                              onClick={() =>
                                updateMut.mutate({
                                  id: link.id,
                                  status: link.status === "ativo" ? "inativo" : "ativo",
                                })
                              }
                            >
                              {link.status === "ativo" ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar"
                              aria-label={`Editar "${link.titulo}"`}
                              onClick={() => openEdit(link)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Excluir"
                              aria-label={`Excluir "${link.titulo}"`}
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm(`Excluir "${link.titulo}"?`)) {
                                  deleteMut.mutate(link.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        )}

        {canManage && (
          <TabsContent value="relatorio" className="mt-4">
            {acessosLoading ? (
              <div className="space-y-2" aria-busy="true">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-md" />
                ))}
              </div>
            ) : acessosIsError ? (
              <QueryErrorState
                title="Não foi possível carregar o relatório de acessos."
                error={acessosError}
                onRetry={() => refetchAcessos()}
              />
            ) : acessos.length === 0 ? (
              <EmptyState
                icon={BarChart2}
                title="Nenhum acesso registrado ainda"
                description="Quando o time abrir links do catálogo, os acessos aparecem aqui."
                className="py-12"
              />
            ) : (
              <div className="border rounded-xl overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Corretor</TableHead>
                      <TableHead>Link</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Data / Hora</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {acessos.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium text-sm">
                          {nomes[row.user_id] || "—"}
                        </TableCell>
                        <TableCell className="text-sm">{row.link?.titulo ?? "—"}</TableCell>
                        <TableCell>
                          {row.link?.categoria ? (
                            <Badge variant="outline" className="text-xs">
                              {row.link.categoria}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDataHora(row.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="px-4 py-2 border-t text-xs text-muted-foreground">
                  Exibindo os últimos {acessos.length} acessos
                </div>
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar link</DialogTitle>
          </DialogHeader>
          <LinkFormFields form={editForm} setForm={setEditForm} categoriasSugeridas={categorias} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarEdicao} loading={updateMut.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LinkFormFields({
  form,
  setForm,
  categoriasSugeridas,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  categoriasSugeridas: string[];
}) {
  return (
    <div className="space-y-4 py-2">
      <div>
        <Label>Título *</Label>
        <Input
          value={form.titulo}
          onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
          placeholder="Ex.: Tabela de comissões 2026"
          className="mt-1"
          maxLength={150}
        />
      </div>
      <div>
        <Label>Descrição</Label>
        <Textarea
          value={form.descricao}
          onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
          placeholder="Breve descrição do link…"
          className="mt-1"
          rows={2}
          maxLength={500}
        />
      </div>
      <div>
        <Label>URL *</Label>
        <Input
          type="url"
          value={form.url}
          onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
          placeholder="https://…"
          className="mt-1"
        />
      </div>
      <div>
        <Label>Categoria *</Label>
        <Input
          value={form.categoria}
          onChange={(e) => setForm((p) => ({ ...p, categoria: e.target.value }))}
          placeholder="Ex.: WhatsApp, Tabelas, Portais…"
          className="mt-1"
          list="links-categorias-list"
        />
        {categoriasSugeridas.length > 0 && (
          <datalist id="links-categorias-list">
            {categoriasSugeridas.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Digite uma categoria existente ou crie uma nova.
        </p>
      </div>
      <div>
        <Label>Status</Label>
        <Select
          value={form.status}
          onValueChange={(v) => setForm((p) => ({ ...p, status: v as "ativo" | "inativo" }))}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
