import { createFileRoute } from "@tanstack/react-router";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Target, Trash2 } from "lucide-react";
import { MESES_PT } from "@/lib/metas";

export const Route = createFileRoute("/_authenticated/metas")({
  head: () => ({ meta: [{ title: "Metas — Seu Metro Quadrado" }] }),
  component: MetasPage,
});

function MetasPage() {
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const canManage = isAdmin || isGestor;
  const qc = useQueryClient();
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const metasQ = useQuery({
    queryKey: ["metas", ano, mes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("metas")
        .select("*, profiles:corretor_id(id, nome), equipes:equipe_id(id, nome)")
        .eq("ano", ano)
        .eq("mes", mes)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const corretoresQ = useQuery({
    queryKey: ["metas:corretores"],
    enabled: canManage,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome").order("nome");
      return data ?? [];
    },
  });

  const equipesQ = useQuery({
    queryKey: ["metas:equipes"],
    enabled: canManage,
    queryFn: async () => {
      const { data } = await supabase.from("equipes").select("id, nome").order("nome");
      return data ?? [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editing?.id) {
        const { error } = await supabase.from("metas").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("metas").insert({ ...payload, criado_por: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Meta atualizada" : "Meta criada");
      setOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["metas"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("metas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Meta removida");
      qc.invalidateQueries({ queryKey: ["metas"] });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const escopo = fd.get("escopo") as string;
    const payload: any = {
      ano,
      mes,
      corretor_id: escopo === "corretor" ? fd.get("corretor_id") : null,
      equipe_id: escopo === "equipe" ? fd.get("equipe_id") : null,
      meta_leads_atendidos: Number(fd.get("meta_leads_atendidos") || 0),
      meta_visitas: Number(fd.get("meta_visitas") || 0),
      meta_vendas: Number(fd.get("meta_vendas") || 0),
      meta_gmv: Number(fd.get("meta_gmv") || 0),
      observacoes: fd.get("observacoes") || null,
    };
    saveMutation.mutate(payload);
  };

  const escopoLabel = (m: any) =>
    m.corretor_id ? `Corretor: ${m.profiles?.nome ?? "—"}`
    : m.equipe_id ? `Equipe: ${m.equipes?.nome ?? "—"}`
    : "Global";

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Metas"
        description="Defina e acompanhe metas mensais por corretor, equipe ou globais."
        actions={
          <div className="flex gap-2">
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES_PT.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canManage && (
              <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" />Nova meta</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>{editing ? "Editar meta" : "Nova meta"}</DialogTitle></DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                      <Label>Escopo</Label>
                      <Select name="escopo" defaultValue={editing?.corretor_id ? "corretor" : editing?.equipe_id ? "equipe" : "global"}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="global">Global</SelectItem>
                          <SelectItem value="corretor">Corretor</SelectItem>
                          <SelectItem value="equipe">Equipe</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Corretor (se aplicável)</Label>
                        <Select name="corretor_id" defaultValue={editing?.corretor_id ?? ""}>
                          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            {(corretoresQ.data ?? []).map((c: any) => (
                              <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Equipe (se aplicável)</Label>
                        <Select name="equipe_id" defaultValue={editing?.equipe_id ?? ""}>
                          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            {(equipesQ.data ?? []).map((e: any) => (
                              <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Atendimentos</Label>
                        <Input type="number" name="meta_leads_atendidos" min={0} defaultValue={editing?.meta_leads_atendidos ?? 0} />
                      </div>
                      <div>
                        <Label>Visitas</Label>
                        <Input type="number" name="meta_visitas" min={0} defaultValue={editing?.meta_visitas ?? 0} />
                      </div>
                      <div>
                        <Label>Vendas</Label>
                        <Input type="number" name="meta_vendas" min={0} defaultValue={editing?.meta_vendas ?? 0} />
                      </div>
                      <div>
                        <Label>GMV (R$)</Label>
                        <Input type="number" step="0.01" name="meta_gmv" min={0} defaultValue={editing?.meta_gmv ?? 0} />
                      </div>
                    </div>
                    <div>
                      <Label>Observações</Label>
                      <Textarea name="observacoes" rows={2} defaultValue={editing?.observacoes ?? ""} />
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
          </div>
        }
      />

      <Card>
        <CardContent className="p-4">
          {metasQ.isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
          ) : (metasQ.data ?? []).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Target className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhuma meta cadastrada para {MESES_PT[mes - 1]}/{ano}.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {(metasQ.data ?? []).map((m: any) => (
                <li key={m.id} className="py-3 flex items-center gap-3">
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      {escopoLabel(m)}
                      <Badge variant="outline">{MESES_PT[m.mes - 1]}/{m.ano}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex gap-3 flex-wrap">
                      <span>Atend.: <b>{m.meta_leads_atendidos}</b></span>
                      <span>Visitas: <b>{m.meta_visitas}</b></span>
                      <span>Vendas: <b>{m.meta_vendas}</b></span>
                      <span>GMV: <b>R$ {Number(m.meta_gmv).toLocaleString("pt-BR")}</b></span>
                    </div>
                  </div>
                  {canManage && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(m); setOpen(true); }}>Editar</Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(m.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
