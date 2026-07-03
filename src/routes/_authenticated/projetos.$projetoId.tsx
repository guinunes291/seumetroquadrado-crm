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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Plus, Star, Trash2 } from "lucide-react";
import {
  UNIDADE_STATUS_LABEL,
  UNIDADE_STATUS_TONE,
  UNIDADE_STATUS_DOT,
  type UnidadeStatus,
  formatBRL,
  formatArea,
  calcStats,
  variacaoPercentual,
} from "@/lib/unidades";
import { cn } from "@/lib/utils";
import { ProjetoComercial } from "@/components/projeto-comercial";

export const Route = createFileRoute("/_authenticated/projetos/$projetoId")({
  head: () => ({ meta: [{ title: "Detalhe do projeto — Seu Metro Quadrado" }] }),
  component: ProjetoDetalhePage,
});

const STATUS_OPCOES: UnidadeStatus[] = ["disponivel", "reservada", "vendida", "bloqueada"];

function ProjetoDetalhePage() {
  const { projetoId } = Route.useParams();
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const canManage = isAdmin || isGestor;
  const qc = useQueryClient();
  const [unidadeOpen, setUnidadeOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [focoOpen, setFocoOpen] = useState(false);
  const [unidadeBusca, setUnidadeBusca] = useState("");
  const [unidadeStatusFiltro, setUnidadeStatusFiltro] = useState<string>("todos");

  const projetoQ = useQuery({
    queryKey: ["projeto", projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos").select("*").eq("id", projetoId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const unidadesQ = useQuery({
    queryKey: ["unidades", projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unidades").select("*").eq("projeto_id", projetoId)
        .is("deleted_at", null)
        .order("bloco", { ascending: true })
        .order("identificador", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const historicoQ = useQuery({
    queryKey: ["historico-precos", projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("historico_precos")
        .select("*, unidade:unidades!inner(identificador, bloco, projeto_id)")
        .eq("unidade.projeto_id", projetoId)
        .order("alterado_em", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const focoQ = useQuery({
    queryKey: ["projeto-foco", projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projeto_foco").select("*").eq("projeto_id", projetoId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const focoAtivo = (focoQ.data ?? []).find((f: any) => f.ativo);

  const saveUnidade = useMutation({
    mutationFn: async (payload: any) => {
      if (editing?.id) {
        const { error } = await supabase.from("unidades").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("unidades").insert({
          ...payload, projeto_id: projetoId, criado_por: user?.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Unidade atualizada" : "Unidade criada");
      setUnidadeOpen(false); setEditing(null);
      qc.invalidateQueries({ queryKey: ["unidades", projetoId] });
      qc.invalidateQueries({ queryKey: ["historico-precos", projetoId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: UnidadeStatus }) => {
      const { error } = await supabase.from("unidades").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["unidades", projetoId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteUnidade = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("unidades")
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unidade movida para a lixeira");
      qc.invalidateQueries({ queryKey: ["unidades", projetoId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const ativarFoco = useMutation({
    mutationFn: async (payload: any) => {
      // Desativa foco anterior do projeto
      await supabase.from("projeto_foco").update({ ativo: false, fim: new Date().toISOString() })
        .eq("projeto_id", projetoId).eq("ativo", true);
      const { error } = await supabase.from("projeto_foco").insert({
        projeto_id: projetoId, ...payload, criado_por: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Projeto em foco ativado");
      setFocoOpen(false);
      qc.invalidateQueries({ queryKey: ["projeto-foco", projetoId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const desativarFoco = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projeto_foco")
        .update({ ativo: false, fim: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Foco desativado");
      qc.invalidateQueries({ queryKey: ["projeto-foco", projetoId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmitUnidade = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const num = (k: string) => {
      const v = fd.get(k);
      if (v === null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    saveUnidade.mutate({
      identificador: String(fd.get("identificador")),
      bloco: fd.get("bloco") || null,
      andar: fd.get("andar") || null,
      tipologia: fd.get("tipologia") || null,
      dormitorios: num("dormitorios"),
      suites: num("suites"),
      vagas: num("vagas"),
      area_privativa: num("area_privativa"),
      valor: num("valor"),
      status: (fd.get("status") as UnidadeStatus) || "disponivel",
      observacoes: fd.get("observacoes") || null,
    });
  };

  const handleSubmitFoco = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    ativarFoco.mutate({
      motivo: fd.get("motivo") || null,
      fim: fd.get("fim") ? new Date(String(fd.get("fim"))).toISOString() : null,
    });
  };

  const unidades = unidadesQ.data ?? [];
  const buscaUni = unidadeBusca.trim().toLowerCase();
  const unidadesFiltradas = (unidades as any[]).filter((u) => {
    if (unidadeStatusFiltro !== "todos" && u.status !== unidadeStatusFiltro) return false;
    if (!buscaUni) return true;
    return [u.identificador, u.bloco, u.andar, u.tipologia]
      .filter(Boolean)
      .some((c: string) => String(c).toLowerCase().includes(buscaUni));
  });
  const stats = calcStats(unidades as any);
  const projeto = projetoQ.data;

  const subParts = [
    projeto?.construtora,
    [projeto?.bairro, projeto?.regiao, projeto?.cidade].filter(Boolean).join(" · ") || null,
  ].filter(Boolean) as string[];

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={projeto?.nome ?? "Projeto"}
        description={subParts.join(" — ") || "Gestão completa do empreendimento"}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/projetos"><ArrowLeft className="h-4 w-4 mr-1" />Projetos</Link>
          </Button>
        }
      />

      {projeto && (
        <Card>
          <CardContent className="py-4 px-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <InfoLine label="Metragem">
              {projeto.metragem_min != null || projeto.metragem_max != null
                ? `${projeto.metragem_min ?? "?"}–${projeto.metragem_max ?? "?"} m²`
                : "—"}
            </InfoLine>
            <InfoLine label="Dorms / Suítes">
              {projeto.dorms_min != null || projeto.dorms_max != null
                ? `${projeto.dorms_min ?? "?"}–${projeto.dorms_max ?? "?"} dorms`
                : "—"}
              {projeto.suites ? ` · ${projeto.suites} suíte${projeto.suites === 1 ? "" : "s"}` : ""}
            </InfoLine>
            <InfoLine label="Vagas">
              {projeto.vagas_min != null || projeto.vagas_max != null
                ? `${projeto.vagas_min ?? "?"}–${projeto.vagas_max ?? "?"}`
                : projeto.vagas_observacao || "—"}
            </InfoLine>
            <InfoLine label="Preço a partir de">
              {projeto.sob_consulta
                ? "Sob consulta"
                : projeto.preco_a_partir != null
                  ? formatBRL(projeto.preco_a_partir)
                  : "—"}
            </InfoLine>
            <InfoLine label="Status entrega">
              {[projeto.status_entrega, projeto.ano_entrega ? `${projeto.mes_entrega ? String(projeto.mes_entrega).padStart(2, "0") + "/" : ""}${projeto.ano_entrega}` : null]
                .filter(Boolean)
                .join(" · ") || "—"}
            </InfoLine>
            <InfoLine label="Tipo extra">{projeto.tipo_extra || "—"}</InfoLine>
            <InfoLine label="Status do preço">{projeto.status_preco || "—"}</InfoLine>
            <InfoLine label="Zona SMQ">{projeto.zona_smq || "—"}</InfoLine>
            <InfoLine label="Endereço">
              {[projeto.logradouro, projeto.numero].filter(Boolean).join(", ") || projeto.endereco || "—"}
            </InfoLine>
            <InfoLine label="Fonte">{projeto.fonte || "—"}</InfoLine>
          </CardContent>
        </Card>
      )}

      {focoAtivo && (
        <Card className="border-amber-400/40 bg-amber-50/40">
          <CardContent className="py-3 px-4 flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500 fill-amber-400" />
            <span className="text-sm">
              <strong>Projeto em foco</strong>
              {focoAtivo.motivo ? ` — ${focoAtivo.motivo}` : ""}
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Disponíveis" value={stats.disponivel} />
        <StatCard label="Reservadas" value={stats.reservada} />
        <StatCard label="Vendidas" value={stats.vendida} />
        <StatCard label="VGV disponível" value={formatBRL(stats.vgvDisponivel)} />
      </div>

      <Tabs defaultValue="unidades" className="space-y-4">
        <TabsList>
          <TabsTrigger value="unidades">Unidades</TabsTrigger>
          <TabsTrigger value="comercial">Comercial</TabsTrigger>
          <TabsTrigger value="historico">Histórico de preços</TabsTrigger>
          <TabsTrigger value="foco">Projeto em foco</TabsTrigger>
        </TabsList>

        <TabsContent value="unidades" className="space-y-3">
          {canManage && (
            <div className="flex justify-end">
              <Dialog open={unidadeOpen} onOpenChange={(o) => { setUnidadeOpen(o); if (!o) setEditing(null); }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" />Nova unidade</Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl">
                  <DialogHeader>
                    <DialogTitle>{editing ? "Editar unidade" : "Nova unidade"}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmitUnidade} className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Label htmlFor="identificador">Identificador *</Label>
                      <Input id="identificador" name="identificador" required
                        defaultValue={editing?.identificador} placeholder="ex.: 101, Apto 12A" />
                    </div>
                    <div><Label>Bloco</Label><Input name="bloco" defaultValue={editing?.bloco ?? ""} /></div>
                    <div><Label>Andar</Label><Input name="andar" defaultValue={editing?.andar ?? ""} /></div>
                    <div className="col-span-2"><Label>Tipologia</Label>
                      <Input name="tipologia" defaultValue={editing?.tipologia ?? ""}
                        placeholder="ex.: 2 dorm c/ suíte" /></div>
                    <div><Label>Dormitórios</Label>
                      <Input name="dormitorios" type="number" min="0" defaultValue={editing?.dormitorios ?? ""} /></div>
                    <div><Label>Suítes</Label>
                      <Input name="suites" type="number" min="0" defaultValue={editing?.suites ?? ""} /></div>
                    <div><Label>Vagas</Label>
                      <Input name="vagas" type="number" min="0" defaultValue={editing?.vagas ?? ""} /></div>
                    <div><Label>Área privativa (m²)</Label>
                      <Input name="area_privativa" type="number" step="0.01" defaultValue={editing?.area_privativa ?? ""} /></div>
                    <div><Label>Valor (R$)</Label>
                      <Input name="valor" type="number" step="0.01" defaultValue={editing?.valor ?? ""} /></div>
                    <div><Label>Status</Label>
                      <Select name="status" defaultValue={editing?.status ?? "disponivel"}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUS_OPCOES.map(s => (
                            <SelectItem key={s} value={s}>{UNIDADE_STATUS_LABEL[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2"><Label>Observações</Label>
                      <Input name="observacoes" defaultValue={editing?.observacoes ?? ""} /></div>
                    <DialogFooter className="col-span-2">
                      <Button type="submit" disabled={saveUnidade.isPending}>
                        {saveUnidade.isPending ? "Salvando..." : "Salvar"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {unidades.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Buscar unidade (identificador, bloco, tipologia)…"
                value={unidadeBusca}
                onChange={(e) => setUnidadeBusca(e.target.value)}
                className="max-w-xs"
              />
              <Select value={unidadeStatusFiltro} onValueChange={setUnidadeStatusFiltro}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  {STATUS_OPCOES.map((s) => (
                    <SelectItem key={s} value={s}>{UNIDADE_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              {unidadesQ.isLoading ? (
                <p className="p-6 text-sm text-muted-foreground">Carregando...</p>
              ) : unidades.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground text-center">
                  Nenhuma unidade cadastrada ainda.
                </p>
              ) : unidadesFiltradas.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground text-center">
                  Nenhuma unidade corresponde aos filtros.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Identificador</TableHead>
                      <TableHead>Bloco/Andar</TableHead>
                      <TableHead>Tipologia</TableHead>
                      <TableHead>Área</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      {canManage && <TableHead className="w-20"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unidadesFiltradas.map((u: any) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.identificador}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {[u.bloco, u.andar].filter(Boolean).join(" / ") || "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {u.tipologia || "—"}
                          {u.dormitorios ? (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({u.dormitorios}d{u.suites ? `/${u.suites}s` : ""}{u.vagas ? `/${u.vagas}v` : ""})
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>{formatArea(u.area_privativa)}</TableCell>
                        <TableCell className="font-mono text-sm">{formatBRL(u.valor)}</TableCell>
                        <TableCell>
                          {canManage ? (
                            <Select
                              value={u.status}
                              onValueChange={(v) => updateStatus.mutate({ id: u.id, status: v as UnidadeStatus })}
                            >
                              <SelectTrigger className="h-8 w-36">
                                <span className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      "h-2 w-2 rounded-full shrink-0",
                                      UNIDADE_STATUS_DOT[u.status as UnidadeStatus],
                                    )}
                                  />
                                  <SelectValue />
                                </span>
                              </SelectTrigger>
                              <SelectContent>
                                {STATUS_OPCOES.map(s => (
                                  <SelectItem key={s} value={s}>{UNIDADE_STATUS_LABEL[s]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge
                              variant="outline"
                              className={cn(UNIDADE_STATUS_TONE[u.status as UnidadeStatus])}
                            >
                              {UNIDADE_STATUS_LABEL[u.status as UnidadeStatus]}
                            </Badge>
                          )}
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost"
                                onClick={() => { setEditing(u); setUnidadeOpen(true); }}>
                                Editar
                              </Button>
                              <Button size="icon" variant="ghost"
                                onClick={() => { if (confirm("Remover unidade?")) deleteUnidade.mutate(u.id); }}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comercial">
          {projeto && (
            <ProjetoComercial
              projetoId={projetoId}
              projeto={projeto as never}
              canManage={canManage}
            />
          )}
        </TabsContent>

        <TabsContent value="historico">
          <Card>
            <CardContent className="p-0">
              {historicoQ.isLoading ? (
                <p className="p-6 text-sm text-muted-foreground">Carregando...</p>
              ) : (historicoQ.data ?? []).length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground text-center">
                  Sem alterações de preço registradas.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Unidade</TableHead>
                      <TableHead>De</TableHead>
                      <TableHead>Para</TableHead>
                      <TableHead>Variação</TableHead>
                      <TableHead>Quando</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(historicoQ.data ?? []).map((h: any) => {
                      const variacao = variacaoPercentual(h.valor_anterior, h.valor_novo);
                      return (
                        <TableRow key={h.id}>
                          <TableCell className="font-medium">
                            {h.unidade?.bloco ? `${h.unidade.bloco}/` : ""}{h.unidade?.identificador ?? "—"}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{formatBRL(h.valor_anterior)}</TableCell>
                          <TableCell className="font-mono text-sm">{formatBRL(h.valor_novo)}</TableCell>
                          <TableCell>
                            {variacao !== null && (
                              <span className={variacao >= 0 ? "text-emerald-600" : "text-red-600"}>
                                {variacao >= 0 ? "+" : ""}{variacao.toFixed(1)}%
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(h.alterado_em).toLocaleString("pt-BR")}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="foco" className="space-y-3">
          {canManage && (
            <div className="flex justify-end">
              <Dialog open={focoOpen} onOpenChange={setFocoOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Star className="h-4 w-4 mr-1" />Ativar foco</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Ativar projeto em foco</DialogTitle></DialogHeader>
                  <form onSubmit={handleSubmitFoco} className="space-y-3">
                    <div><Label htmlFor="motivo">Motivo / campanha</Label>
                      <Input id="motivo" name="motivo" placeholder="ex.: Lançamento, meta do mês" /></div>
                    <div><Label htmlFor="fim">Encerrar em (opcional)</Label>
                      <Input id="fim" name="fim" type="datetime-local" /></div>
                    <DialogFooter>
                      <Button type="submit" disabled={ativarFoco.isPending}>Ativar</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              {focoQ.isLoading ? (
                <p className="p-6 text-sm text-muted-foreground">Carregando...</p>
              ) : (focoQ.data ?? []).length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground text-center">
                  Este projeto nunca foi destacado.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Início</TableHead>
                      <TableHead>Fim</TableHead>
                      <TableHead>Status</TableHead>
                      {canManage && <TableHead></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(focoQ.data ?? []).map((f: any) => (
                      <TableRow key={f.id}>
                        <TableCell>{f.motivo || "—"}</TableCell>
                        <TableCell className="text-xs">{new Date(f.inicio).toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-xs">
                          {f.fim ? new Date(f.fim).toLocaleString("pt-BR") : "—"}
                        </TableCell>
                        <TableCell>
                          {f.ativo ? <Badge>Ativo</Badge> : <Badge variant="outline">Encerrado</Badge>}
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            {f.ativo && (
                              <Button size="sm" variant="ghost"
                                onClick={() => desativarFoco.mutate(f.id)}>
                                Encerrar
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="py-3 px-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold mt-0.5">{value}</div>
      </CardContent>
    </Card>
  );
}

function InfoLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}
