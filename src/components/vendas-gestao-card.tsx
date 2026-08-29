// Gestão de vendas na aba "Comissões & Aprovação" do hub Dinheiro:
// registrar DISTRATO (cancela a venda aprovada e estorna comissões/VGV pelo
// caminho auditado do banco) e EXCLUIR venda (admin, via RPC excluir_venda —
// só vendas sem lançamento no ledger, o histórico financeiro é imutável).
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileMinus2, MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Hue } from "@/lib/status-tones";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type StatusVenda = "rascunho" | "pendente" | "aprovada" | "rejeitada" | "cancelada";

type VendaGestao = {
  id: string;
  projeto_nome: string | null;
  unidade: string | null;
  valor_venda: number;
  data_assinatura: string;
  status_venda: StatusVenda;
  distrato: boolean;
  data_distrato: string | null;
  motivo_distrato: string | null;
  corretor_id: string | null;
  corretorNome: string;
};

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

const fmtData = (d: string | null) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—";

const hojeLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const statusHue = (s: StatusVenda): Hue =>
  s === "aprovada" ? "green" : s === "cancelada" || s === "rejeitada" ? "rose" : "amber";

const statusLabel: Record<StatusVenda, string> = {
  rascunho: "Rascunho",
  pendente: "Pendente",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
  cancelada: "Cancelada",
};

export function VendasGestaoCard({
  mes,
  isAdmin,
}: {
  /** Filtro "YYYY-MM" da página, ou "todos". */
  mes: string;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<"todas" | StatusVenda>("todas");
  const [distratoVenda, setDistratoVenda] = useState<VendaGestao | null>(null);
  const [dataDistrato, setDataDistrato] = useState(hojeLocal());
  const [motivo, setMotivo] = useState("");
  const [excluirVenda, setExcluirVenda] = useState<VendaGestao | null>(null);
  const [motivoExclusao, setMotivoExclusao] = useState("");

  const bounds = useMemo(() => {
    if (mes === "todos") return null;
    const [ano, m] = mes.split("-").map(Number);
    if (!ano || !m) return null;
    const ini = `${ano}-${String(m).padStart(2, "0")}-01`;
    const fimD = new Date(ano, m, 1);
    const fim = `${fimD.getFullYear()}-${String(fimD.getMonth() + 1).padStart(2, "0")}-01`;
    return { ini, fim };
  }, [mes]);

  const vendasQ = useQuery({
    queryKey: ["vendas-gestao", mes, filtro],
    queryFn: async (): Promise<VendaGestao[]> => {
      let q = supabase
        .from("vendas")
        .select(
          "id, projeto_nome, unidade, valor_venda, data_assinatura, status_venda, distrato, data_distrato, motivo_distrato, corretor_id",
        )
        .order("data_assinatura", { ascending: false })
        .limit(200);
      if (filtro !== "todas") q = q.eq("status_venda", filtro);
      if (bounds) q = q.gte("data_assinatura", bounds.ini).lt("data_assinatura", bounds.fim);
      const { data, error } = await q;
      if (error) throw error;
      const ids = [...new Set((data ?? []).flatMap((v) => (v.corretor_id ? [v.corretor_id] : [])))];
      const { data: perfis } = ids.length
        ? await supabase.from("profiles").select("id, nome").in("id", ids)
        : { data: [] as Array<{ id: string; nome: string }> };
      const nomes = new Map((perfis ?? []).map((p) => [p.id, p.nome]));
      return (data ?? []).map((v) => ({
        ...(v as Omit<VendaGestao, "corretorNome">),
        corretorNome: (v.corretor_id && nomes.get(v.corretor_id)) || "Sem corretor",
      }));
    },
  });

  const invalidarTudo = async () => {
    await Promise.all(
      [
        ["vendas-gestao"],
        ["vendas"],
        ["comissoes"],
        ["comissoes-vendas"],
        ["financeiro-fechamento"],
        ["ranking"],
        ["metricas"],
        ["nav-badges"],
      ].map((queryKey) => qc.invalidateQueries({ queryKey })),
    );
  };

  const distratoM = useMutation({
    mutationFn: async () => {
      if (!distratoVenda) throw new Error("Venda inválida");
      if (!motivo.trim()) throw new Error("Informe o motivo do distrato.");
      const { error } = await supabase
        .from("vendas")
        .update({
          distrato: true,
          data_distrato: dataDistrato,
          motivo_distrato: motivo.trim(),
        })
        .eq("id", distratoVenda.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Distrato registrado — comissões e metas estornadas.");
      setDistratoVenda(null);
      setMotivo("");
      await invalidarTudo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirM = useMutation({
    mutationFn: async () => {
      if (!excluirVenda) throw new Error("Venda inválida");
      const motivoLimpo = motivoExclusao.trim();
      // Venda aprovada/distratada só sai pelo caminho administrativo, que
      // desfaz comissões, VGV e metas sem registrar distrato.
      if (excluirVenda.status_venda === "aprovada" || excluirVenda.distrato) {
        if (motivoLimpo.length < 10) throw new Error("Descreva o motivo (mínimo 10 caracteres).");
        const { error } = await supabase.rpc("excluir_venda_lancamento_errado", {
          p_venda_id: excluirVenda.id,
          p_motivo: motivoLimpo,
        });
        if (error) throw error;
        return;
      }
      const { error } = await supabase.rpc("excluir_venda", {
        p_venda_id: excluirVenda.id,
        p_motivo: motivoLimpo || undefined,
      });
      if (error) throw error;
    },

    onSuccess: async () => {
      toast.success("Venda excluída.");
      setExcluirVenda(null);
      setMotivoExclusao("");
      await invalidarTudo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Vendas — distrato e exclusão</CardTitle>
            <Select value={filtro} onValueChange={(v) => setFiltro(v as typeof filtro)}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as vendas</SelectItem>
                <SelectItem value="aprovada">Aprovadas</SelectItem>
                <SelectItem value="pendente">Pendentes</SelectItem>
                <SelectItem value="rascunho">Rascunhos</SelectItem>
                <SelectItem value="rejeitada">Rejeitadas</SelectItem>
                <SelectItem value="cancelada">Canceladas / distratadas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-2" aria-live="polite">
          {vendasQ.isLoading ? (
            <div className="h-20 animate-pulse rounded-md bg-muted" />
          ) : vendasQ.isError ? (
            <div role="alert" className="space-y-2 text-sm">
              <p>Não foi possível carregar as vendas.</p>
              <Button size="sm" variant="outline" onClick={() => void vendasQ.refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : (vendasQ.data?.length ?? 0) === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Nenhuma venda no período.</p>
          ) : (
            vendasQ.data?.map((venda) => (
              <div
                key={venda.id}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {venda.projeto_nome ?? "Sem projeto"}
                    {venda.unidade ? ` · ${venda.unidade}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {venda.corretorNome} · {fmtData(venda.data_assinatura)}
                    {venda.distrato ? ` · distrato em ${fmtData(venda.data_distrato)}` : ""}
                  </p>
                </div>
                <strong className="text-sm tabular-nums">{money(venda.valor_venda)}</strong>
                <StatusBadge hue={statusHue(venda.status_venda)}>
                  {venda.distrato ? "Distratada" : statusLabel[venda.status_venda]}
                </StatusBadge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" title="Ações da venda">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {venda.status_venda === "aprovada" && !venda.distrato && (
                      <DropdownMenuItem
                        onClick={() => {
                          setDistratoVenda(venda);
                          setDataDistrato(hojeLocal());
                          setMotivo("");
                        }}
                      >
                        <FileMinus2 className="mr-2 h-4 w-4" /> Registrar distrato
                      </DropdownMenuItem>
                    )}
                    {isAdmin && (
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => {
                          setExcluirVenda(venda);
                          setMotivoExclusao("");
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />{" "}
                        {venda.status_venda === "aprovada" || venda.distrato
                          ? "Excluir venda (lançamento errado)"
                          : "Excluir venda"}
                      </DropdownMenuItem>
                    )}

                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!distratoVenda}
        onOpenChange={(open) => !open && !distratoM.isPending && setDistratoVenda(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar distrato</DialogTitle>
            <DialogDescription>
              A venda passa a cancelada e o sistema estorna automaticamente as comissões, o VGV e as
              metas do corretor. A ação é auditada e não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="distrato-data">Data do distrato</Label>
              <Input
                id="distrato-data"
                type="date"
                value={dataDistrato}
                max={hojeLocal()}
                onChange={(e) => setDataDistrato(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="distrato-motivo">Motivo do distrato *</Label>
              <Textarea
                id="distrato-motivo"
                maxLength={1000}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={distratoM.isPending}
              onClick={() => setDistratoVenda(null)}
            >
              Cancelar
            </Button>
            <Button
              disabled={distratoM.isPending || !motivo.trim() || !dataDistrato}
              onClick={() => distratoM.mutate()}
            >
              {distratoM.isPending ? "Processando…" : "Confirmar distrato"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!excluirVenda}
        onOpenChange={(open) => !open && !excluirM.isPending && setExcluirVenda(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir venda</DialogTitle>
            <DialogDescription>
              A venda e suas comissões são apagadas definitivamente. Vendas aprovadas precisam de
              distrato antes, e vendas com lançamento financeiro no histórico não podem ser
              excluídas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="exclusao-motivo">Motivo (opcional, fica na auditoria)</Label>
            <Textarea
              id="exclusao-motivo"
              maxLength={1000}
              value={motivoExclusao}
              onChange={(e) => setMotivoExclusao(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={excluirM.isPending}
              onClick={() => setExcluirVenda(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={excluirM.isPending}
              onClick={() => excluirM.mutate()}
            >
              {excluirM.isPending ? "Excluindo…" : "Excluir definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
