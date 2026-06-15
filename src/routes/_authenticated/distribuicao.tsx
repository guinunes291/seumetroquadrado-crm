import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, UserPlus2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/distribuicao")({
  head: () => ({ meta: [{ title: "Distribuição — Seu Metro Quadrado" }] }),
  component: DistribuicaoPage,
});

type FilaRow = {
  id: string;
  corretor_id: string;
  posicao: number;
  ativo: boolean;
  max_leads_dia: number;
  leads_recebidos_hoje: number;
  ultima_distribuicao: string | null;
};

type Log = {
  id: string;
  lead_id: string;
  corretor_id: string;
  tipo: string;
  motivo: string | null;
  created_at: string;
};

function DistribuicaoPage() {
  const { isAdmin, isGestor, loading } = useUserRoles();
  const qc = useQueryClient();

  if (!loading && !isAdmin && !isGestor) {
    throw redirect({ to: "/" });
  }

  const { data: corretores } = useQuery({
    queryKey: ["corretores-min"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome, email").eq("ativo", true).order("nome");
      return data ?? [];
    },
  });
  const corretoresMap = useMemo(() => {
    const m = new Map<string, { nome: string; email: string }>();
    (corretores ?? []).forEach((c) => m.set(c.id, { nome: c.nome, email: c.email }));
    return m;
  }, [corretores]);

  const { data: fila } = useQuery({
    queryKey: ["fila"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fila_distribuicao")
        .select("*")
        .order("posicao");
      if (error) throw error;
      return (data ?? []) as FilaRow[];
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["dist-log"],
    queryFn: async () => {
      const { data } = await supabase
        .from("distribution_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      return (data ?? []) as Log[];
    },
  });

  const addToFila = useMutation({
    mutationFn: async (corretorId: string) => {
      const maxPos = Math.max(0, ...((fila ?? []).map((f) => f.posicao)));
      const { error } = await supabase.from("fila_distribuicao").insert({
        corretor_id: corretorId,
        posicao: maxPos + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Corretor adicionado à roleta");
      qc.invalidateQueries({ queryKey: ["fila"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateFila = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<FilaRow> }) => {
      const { error } = await supabase.from("fila_distribuicao").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fila"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeFila = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fila_distribuicao").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido da fila");
      qc.invalidateQueries({ queryKey: ["fila"] });
    },
  });

  const resetCotas = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("fila_distribuicao")
        .update({ leads_recebidos_hoje: 0 })
        .gt("leads_recebidos_hoje", -1); // applies to all
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cotas diárias zeradas");
      qc.invalidateQueries({ queryKey: ["fila"] });
    },
  });

  const swap = (a: FilaRow, b: FilaRow) => {
    updateFila.mutate({ id: a.id, patch: { posicao: b.posicao } });
    updateFila.mutate({ id: b.id, patch: { posicao: a.posicao } });
  };

  const corretoresNaFila = new Set((fila ?? []).map((f) => f.corretor_id));
  const corretoresForaDaFila = (corretores ?? []).filter((c) => !corretoresNaFila.has(c.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Distribuição de Leads"
        description="Gerencie a fila de roleta automática e as cotas diárias dos corretores."
        actions={
          <Button variant="outline" size="sm" onClick={() => resetCotas.mutate()}>
            Zerar cotas do dia
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6 space-y-3">
          <h2 className="text-sm font-semibold">Fila da roleta</h2>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Corretor</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead>Recebidos hoje</TableHead>
                  <TableHead>Máx/dia</TableHead>
                  <TableHead>Última distribuição</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(fila ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhum corretor na fila. Adicione um abaixo.
                    </TableCell>
                  </TableRow>
                )}
                {(fila ?? []).map((row, idx, arr) => {
                  const c = corretoresMap.get(row.corretor_id);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Badge variant="outline">{idx + 1}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{c?.nome ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{c?.email ?? ""}</div>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={row.ativo}
                          onCheckedChange={(v) => updateFila.mutate({ id: row.id, patch: { ativo: v } })}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.leads_recebidos_hoje >= row.max_leads_dia ? "destructive" : "secondary"}>
                          {row.leads_recebidos_hoje}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="w-20 h-8"
                          defaultValue={row.max_leads_dia}
                          min={1}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (v > 0 && v !== row.max_leads_dia) {
                              updateFila.mutate({ id: row.id, patch: { max_leads_dia: v } });
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.ultima_distribuicao
                          ? new Date(row.ultima_distribuicao).toLocaleString("pt-BR")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={idx === 0}
                          onClick={() => swap(row, arr[idx - 1])}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={idx === arr.length - 1}
                          onClick={() => swap(row, arr[idx + 1])}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeFila.mutate(row.id)}
                        >
                          Remover
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {corretoresForaDaFila.length > 0 && (
            <div className="pt-2">
              <div className="text-xs text-muted-foreground mb-2">Adicionar corretor à roleta:</div>
              <div className="flex flex-wrap gap-2">
                {corretoresForaDaFila.map((c) => (
                  <Button
                    key={c.id}
                    size="sm"
                    variant="outline"
                    onClick={() => addToFila.mutate(c.id)}
                  >
                    <UserPlus2 className="h-3.5 w-3.5 mr-1" /> {c.nome}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="text-sm font-semibold mb-3">Últimas distribuições</h2>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Corretor</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(logs ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                      Nenhuma distribuição registrada ainda.
                    </TableCell>
                  </TableRow>
                )}
                {(logs ?? []).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs">
                      {new Date(log.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-sm">
                      {corretoresMap.get(log.corretor_id)?.nome ?? log.corretor_id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{log.tipo}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{log.motivo ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
