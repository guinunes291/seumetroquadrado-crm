import { createFileRoute, redirect } from "@tanstack/react-router";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Target, Trash2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  MESES_PT,
  computeAgentMetrics,
  progressoMeta,
  type LeadSlim,
  type AgendamentoSlim,
  type VendaAprovadaSlim,
} from "@/lib/metas";

// Realizado agregado aplicável a uma meta (corretor, equipe ou global).
type RealizadoView = { leads_atendidos: number; visitas: number; vendas: number; vgv: number };

// Rota legada mantida para deep-links: o conteúdo vive como aba do hub.
export const Route = createFileRoute("/_authenticated/metas")({
  beforeLoad: () => {
    throw redirect({ to: "/ranking", search: { tab: "metas" } });
  },
});

export function MetasPage() {
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
        .select("*")
        .eq("ano", ano)
        .eq("mes", mes)
        .order("created_at");
      if (error) throw error;
      const rows = data ?? [];
      const corretorIds = Array.from(new Set(rows.map((r: any) => r.corretor_id).filter(Boolean)));
      const equipeIds = Array.from(new Set(rows.map((r: any) => r.equipe_id).filter(Boolean)));
      const [profilesRes, equipesRes] = await Promise.all([
        corretorIds.length
          ? supabase
              .from("profiles")
              .select("id, nome")
              .in("id", corretorIds as string[])
          : Promise.resolve({ data: [] as any[] }),
        equipeIds.length
          ? supabase
              .from("equipes")
              .select("id, nome")
              .in("id", equipeIds as string[])
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const profMap = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p.nome]));
      const eqMap = new Map((equipesRes.data ?? []).map((e: any) => [e.id, e.nome]));
      return rows.map((r: any) => ({
        ...r,
        profiles: r.corretor_id ? { id: r.corretor_id, nome: profMap.get(r.corretor_id) } : null,
        equipes: r.equipe_id ? { id: r.equipe_id, nome: eqMap.get(r.equipe_id) } : null,
      }));
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

  // Realizado do mês (para barras "realizado vs meta"). Reusa computeAgentMetrics.
  const realizadoQ = useQuery({
    queryKey: ["metas-realizado", ano, mes],
    queryFn: async () => {
      const ini = new Date(ano, mes - 1, 1).toISOString();
      const fim = new Date(ano, mes, 1).toISOString();
      const [leadsRes, agendRes, vendasRes, profsRes] = await Promise.all([
        supabase
          .from("leads")
          .select("status, corretor_id, created_at")
          .gte("created_at", ini)
          .lt("created_at", fim),
        supabase
          .from("agendamentos")
          .select("status, corretor_id, data_inicio")
          .gte("data_inicio", ini)
          .lt("data_inicio", fim),
        supabase
          .from("vendas")
          .select("status_venda, corretor_id, valor_venda, aprovado_em")
          .eq("status_venda", "aprovada")
          .gte("aprovado_em", ini)
          .lt("aprovado_em", fim),
        supabase.from("profiles").select("id, equipe_id"),
      ]);
      const map = computeAgentMetrics(
        (leadsRes.data ?? []) as LeadSlim[],
        (agendRes.data ?? []) as AgendamentoSlim[],
        ano,
        mes,
        (vendasRes.data ?? []) as VendaAprovadaSlim[],
      );
      // VGV realizado por corretor: somente vendas aprovadas no mês.
      const vgvMap = new Map<string, number>();
      for (const v of (vendasRes.data ?? []) as Array<{
        corretor_id: string | null;
        valor_venda: number | string;
      }>) {
        if (!v.corretor_id) continue;
        vgvMap.set(v.corretor_id, (vgvMap.get(v.corretor_id) ?? 0) + (Number(v.valor_venda) || 0));
      }
      // Mapa corretor → equipe (para agregar metas de equipe).
      const equipeDe = new Map<string, string>();
      for (const p of (profsRes.data ?? []) as Array<{ id: string; equipe_id: string | null }>) {
        if (p.equipe_id) equipeDe.set(p.id, p.equipe_id);
      }
      const zero = (): RealizadoView => ({ leads_atendidos: 0, visitas: 0, vendas: 0, vgv: 0 });
      const total = zero();
      const porEquipe = new Map<string, RealizadoView>();
      const getEq = (id: string) => {
        let e = porEquipe.get(id);
        if (!e) {
          e = zero();
          porEquipe.set(id, e);
        }
        return e;
      };
      for (const m of map.values()) {
        total.leads_atendidos += m.leads_atendidos;
        total.visitas += m.visitas;
        total.vendas += m.vendas;
        const eq = equipeDe.get(m.corretor_id);
        if (eq) {
          const e = getEq(eq);
          e.leads_atendidos += m.leads_atendidos;
          e.visitas += m.visitas;
          e.vendas += m.vendas;
        }
      }
      for (const [cid, vgv] of vgvMap) {
        total.vgv += vgv;
        const eq = equipeDe.get(cid);
        if (eq) getEq(eq).vgv += vgv;
      }
      return { map, vgvMap, total, porEquipe };
    },
  });

  // Realizado aplicável a uma meta: corretor → o dele; equipe → agregado; global → total.
  const realizadoDaMeta = (m: any): RealizadoView => {
    const vazio: RealizadoView = { leads_atendidos: 0, visitas: 0, vendas: 0, vgv: 0 };
    const r = realizadoQ.data;
    if (!r) return vazio;
    if (m.corretor_id) {
      const met = r.map.get(m.corretor_id);
      return {
        leads_atendidos: met?.leads_atendidos ?? 0,
        visitas: met?.visitas ?? 0,
        vendas: met?.vendas ?? 0,
        vgv: r.vgvMap.get(m.corretor_id) ?? 0,
      };
    }
    if (m.equipe_id) return r.porEquipe.get(m.equipe_id) ?? vazio;
    return r.total;
  };

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
    const corretorId = (fd.get("corretor_id") as string) || "";
    const equipeId = (fd.get("equipe_id") as string) || "";

    // Valida o escopo no cliente: sem isso um escopo "corretor"/"equipe" sem
    // seleção mandava corretor_id/equipe_id="" ao banco (erro cru de UUID).
    if (escopo === "corretor" && !corretorId) {
      toast.error("Selecione o corretor da meta.");
      return;
    }
    if (escopo === "equipe" && !equipeId) {
      toast.error("Selecione a equipe da meta.");
      return;
    }

    const payload: any = {
      ano,
      mes,
      corretor_id: escopo === "corretor" ? corretorId : null,
      equipe_id: escopo === "equipe" ? equipeId : null,
      meta_leads_atendidos: Number(fd.get("meta_leads_atendidos") || 0),
      meta_visitas: Number(fd.get("meta_visitas") || 0),
      meta_vendas: Number(fd.get("meta_vendas") || 0),
      meta_gmv: Number(fd.get("meta_gmv") || 0),
      observacoes: fd.get("observacoes") || null,
    };
    saveMutation.mutate(payload);
  };

  const escopoLabel = (m: any) =>
    m.corretor_id
      ? `Corretor: ${m.profiles?.nome ?? "—"}`
      : m.equipe_id
        ? `Equipe: ${m.equipes?.nome ?? "—"}`
        : "Global";

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Metas"
        description="Defina e acompanhe metas mensais por corretor, equipe ou globais."
        actions={
          <div className="flex gap-2">
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES_PT.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canManage && (
              <Dialog
                open={open}
                onOpenChange={(o) => {
                  setOpen(o);
                  if (!o) setEditing(null);
                }}
              >
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Nova meta
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{editing ? "Editar meta" : "Nova meta"}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                      <Label>Escopo</Label>
                      <Select
                        name="escopo"
                        defaultValue={
                          editing?.corretor_id
                            ? "corretor"
                            : editing?.equipe_id
                              ? "equipe"
                              : "global"
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
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
                          <SelectTrigger>
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            {(corretoresQ.data ?? []).map((c: any) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Equipe (se aplicável)</Label>
                        <Select name="equipe_id" defaultValue={editing?.equipe_id ?? ""}>
                          <SelectTrigger>
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            {(equipesQ.data ?? []).map((e: any) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Atendimentos</Label>
                        <Input
                          type="number"
                          name="meta_leads_atendidos"
                          min={0}
                          defaultValue={editing?.meta_leads_atendidos ?? 0}
                        />
                      </div>
                      <div>
                        <Label>Visitas</Label>
                        <Input
                          type="number"
                          name="meta_visitas"
                          min={0}
                          defaultValue={editing?.meta_visitas ?? 0}
                        />
                      </div>
                      <div>
                        <Label>Vendas</Label>
                        <Input
                          type="number"
                          name="meta_vendas"
                          min={0}
                          defaultValue={editing?.meta_vendas ?? 0}
                        />
                      </div>
                      <div>
                        <Label>GMV (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          name="meta_gmv"
                          min={0}
                          defaultValue={editing?.meta_gmv ?? 0}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Observações</Label>
                      <Textarea
                        name="observacoes"
                        rows={2}
                        defaultValue={editing?.observacoes ?? ""}
                      />
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
              <p className="text-sm">
                Nenhuma meta cadastrada para {MESES_PT[mes - 1]}/{ano}.
              </p>
              {canManage && (
                <Button
                  className="mt-3"
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setOpen(true);
                  }}
                >
                  Criar meta para {MESES_PT[mes - 1]}/{ano}
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y">
              {(metasQ.data ?? []).map((m: any) => (
                <li key={m.id} className="py-3 flex items-center gap-3">
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      {escopoLabel(m)}
                      <Badge variant="outline">
                        {MESES_PT[m.mes - 1]}/{m.ano}
                      </Badge>
                    </div>
                    {(() => {
                      const r = realizadoDaMeta(m);
                      const fmtBRL = (n: number) =>
                        `R$ ${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
                      const bars = [
                        {
                          label: "Atendidos",
                          real: r.leads_atendidos,
                          meta: Number(m.meta_leads_atendidos) || 0,
                        },
                        { label: "Visitas", real: r.visitas, meta: Number(m.meta_visitas) || 0 },
                        { label: "Vendas", real: r.vendas, meta: Number(m.meta_vendas) || 0 },
                        { label: "GMV", real: r.vgv, meta: Number(m.meta_gmv) || 0, money: true },
                      ];
                      return (
                        <div className="mt-2 space-y-1.5 max-w-md">
                          {bars.map((b) => (
                            <div key={b.label}>
                              <div className="flex justify-between text-[11px] text-muted-foreground">
                                <span>{b.label}</span>
                                <span>
                                  <b className="text-foreground">
                                    {b.money ? fmtBRL(b.real) : b.real}
                                  </b>{" "}
                                  / {b.money ? fmtBRL(b.meta) : b.meta}
                                </span>
                              </div>
                              <Progress value={progressoMeta(b.real, b.meta)} className="h-1.5" />
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  {canManage && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(m);
                          setOpen(true);
                        }}
                      >
                        Editar
                      </Button>
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
