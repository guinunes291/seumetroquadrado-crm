import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/comissoes")({
  head: () => ({ meta: [{ title: "Comissões — Seu Metro Quadrado" }] }),
  component: ComissoesPage,
});

type Comissao = {
  id: string;
  corretor_id: string | null;
  valor_venda: number;
  valor_comissao_total: number;
  valor_corretor: number;
  status: string;
  data_recebimento: string | null;
  created_at: string;
  profiles: { nome: string | null } | null;
};

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  recebido: "Recebido",
  em_disputa: "Em disputa",
};
const STATUS_TONE: Record<string, string> = {
  pendente: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  recebido: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  em_disputa: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};
const fmtBRL = (n: number) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ComissoesPage() {
  const { isAdmin, isGestor } = useUserRoles();
  const canManage = isAdmin || isGestor;
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const comissoesQ = useQuery({
    queryKey: ["comissoes", statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("comissoes" as never)
        .select(
          "id, corretor_id, valor_venda, valor_comissao_total, valor_corretor, status, data_recebimento, created_at, profiles:corretor_id(nome)",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Comissao[];
    },
  });

  const rows = comissoesQ.data ?? [];
  const totais = useMemo(() => {
    return (comissoesQ.data ?? []).reduce(
      (acc, r) => {
        acc.total += Number(r.valor_comissao_total) || 0;
        acc.corretor += Number(r.valor_corretor) || 0;
        acc.vgv += Number(r.valor_venda) || 0;
        return acc;
      },
      { total: 0, corretor: 0, vgv: 0 },
    );
  }, [comissoesQ.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comissões"
        description="Comissões geradas automaticamente a cada venda registrada."
        actions={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="recebido">Recebido</SelectItem>
              <SelectItem value="em_disputa">Em disputa</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">VGV total</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{fmtBRL(totais.vgv)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Comissão imobiliária</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{fmtBRL(totais.total)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {canManage ? "Comissão dos corretores" : "Minha comissão"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-emerald-600">
            {fmtBRL(totais.corretor)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {canManage && <TableHead>Corretor</TableHead>}
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">VGV</TableHead>
                  <TableHead className="text-right">Comissão total</TableHead>
                  <TableHead className="text-right">Corretor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && !comissoesQ.isLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={canManage ? 6 : 5}
                      className="py-10 text-center text-muted-foreground"
                    >
                      Nenhuma comissão por aqui ainda. As comissões são geradas
                      automaticamente quando uma venda é registrada (etapa "Contrato fechado").
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    {canManage && <TableCell>{r.profiles?.nome ?? "—"}</TableCell>}
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">{fmtBRL(r.valor_venda)}</TableCell>
                    <TableCell className="text-right">{fmtBRL(r.valor_comissao_total)}</TableCell>
                    <TableCell className="text-right font-medium text-emerald-600">
                      {fmtBRL(r.valor_corretor)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn(STATUS_TONE[r.status])}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
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
