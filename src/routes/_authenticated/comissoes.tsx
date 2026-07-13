import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
  Clock,
  Download,
  HandCoins,
  MoreVertical,
  Percent,
  RotateCcw,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { PageHeader } from "@/components/page-header";
import { PendingSalesApproval } from "@/components/pending-sales-approval";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile, StatGrid } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listComissoes,
  listVendasPeriodo,
  marcarComissaoPaga,
  reverterComissaoPendente,
  atribuirBeneficiario,
  aplicarDesconto,
  computeTotais,
  computeResumoVendas,
  beneficiariosDasLinhas,
  buildExportRows,
  calcularLiquido,
  parsePercent,
  mesBounds,
  parseMesValue,
  ultimosMeses,
  statusLabel,
  statusIntent,
  tipoLabel,
  tipoHue,
  formatBRL2,
  round2,
  type ComissaoRow,
  type ComissaoStatus,
} from "@/lib/comissoes";
import { exportRowsXlsx } from "@/lib/spreadsheets";

// Rota legada mantida para deep-links: o conteúdo vive como aba do hub.
export const Route = createFileRoute("/_authenticated/comissoes")({
  beforeLoad: () => {
    throw redirect({ to: "/projetos", search: { tab: "comissoes" } });
  },
});

// Data local (não UTC): à noite no Brasil o toISOString já virou o dia seguinte.
const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function Beneficiario({ row }: { row: ComissaoRow }) {
  if (row.beneficiario_nome) return <span>{row.beneficiario_nome}</span>;
  return <span className="text-muted-foreground italic">{tipoLabel(row.tipo)} — a atribuir</span>;
}

// Fora do componente de página para não remontar as linhas a cada render.
function AcoesLinha({
  row,
  onPagar,
  onReverter,
  onAtribuir,
  onDesconto,
}: {
  row: ComissaoRow;
  onPagar: (row: ComissaoRow) => void;
  onReverter: (row: ComissaoRow) => void;
  onAtribuir: (row: ComissaoRow) => void;
  onDesconto: (row: ComissaoRow) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title="Ações da comissão">
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {row.status !== "paga" && (
          <DropdownMenuItem onClick={() => onPagar(row)}>
            <CheckCircle2 className="w-4 h-4 mr-2" /> Marcar como paga
          </DropdownMenuItem>
        )}
        {row.status === "paga" && (
          <DropdownMenuItem onClick={() => onReverter(row)}>
            <RotateCcw className="w-4 h-4 mr-2" /> Reverter para pendente
          </DropdownMenuItem>
        )}
        {row.status !== "paga" && (
          <DropdownMenuItem onClick={() => onAtribuir(row)}>
            <UserPlus className="w-4 h-4 mr-2" />
            {row.beneficiario_id ? "Alterar beneficiário" : "Atribuir beneficiário"}
          </DropdownMenuItem>
        )}
        {row.status !== "paga" && (
          <DropdownMenuItem onClick={() => onDesconto(row)}>
            <Percent className="w-4 h-4 mr-2" /> Aplicar desconto
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const fmtDataCurta = (d: string | null | undefined) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—";

export function ComissoesPage() {
  const qc = useQueryClient();
  const { isAdmin, isGestor, isSuperintendente } = useUserRoles();
  // Espelha a RLS de UPDATE de `comissoes` (admin/gestor/superintendente).
  const canManage = isAdmin || isGestor || isSuperintendente;

  const mesesOpcoes = useMemo(() => ultimosMeses(12), []);
  const [mes, setMes] = useState<string>(mesesOpcoes[0]?.value ?? "todos");
  const [status, setStatus] = useState<string>("all");
  const [beneficiario, setBeneficiario] = useState<string>("all");

  const [pagarRow, setPagarRow] = useState<ComissaoRow | null>(null);
  const [atribuirRow, setAtribuirRow] = useState<ComissaoRow | null>(null);
  const [beneficiarioEscolhido, setBeneficiarioEscolhido] = useState<string | null>(null);
  const [descontoRow, setDescontoRow] = useState<ComissaoRow | null>(null);

  useEffect(() => {
    setBeneficiarioEscolhido(atribuirRow?.beneficiario_id ?? null);
  }, [atribuirRow]);

  const bounds = useMemo(() => {
    if (mes === "todos") return null;
    const p = parseMesValue(mes);
    return p ? mesBounds(p.ano, p.mes) : null;
  }, [mes]);

  useRealtimeInvalidate(["comissoes", "vendas"], [["comissoes"], ["comissoes-vendas"]]);

  const comissoesQ = useQuery({
    queryKey: ["comissoes", mes, status],
    queryFn: () =>
      listComissoes({
        mes: bounds,
        status: status === "all" ? null : (status as ComissaoStatus),
      }),
  });

  const vendasQ = useQuery({
    queryKey: ["comissoes-vendas", mes],
    queryFn: () => listVendasPeriodo(bounds),
  });

  // Perfis para a ação "Atribuir beneficiário" (gestão).
  const profilesQ = useQuery({
    queryKey: ["profiles-beneficiario"],
    enabled: !!atribuirRow,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => comissoesQ.data ?? [], [comissoesQ.data]);

  // Reseta o filtro de beneficiário quando o valor escolhido deixa de existir
  // nos dados carregados (troca de mês/status ou reatribuição) — senão o
  // Select fica órfão, em branco, com a lista vazia sem explicação.
  useEffect(() => {
    if (beneficiario === "all" || !comissoesQ.data) return;
    const existe =
      beneficiario === "sem"
        ? comissoesQ.data.some((r) => !r.beneficiario_id)
        : comissoesQ.data.some((r) => r.beneficiario_id === beneficiario);
    if (!existe) setBeneficiario("all");
  }, [beneficiario, comissoesQ.data]);

  const filtered = useMemo(() => {
    if (beneficiario === "all") return rows;
    if (beneficiario === "sem") return rows.filter((r) => !r.beneficiario_id);
    return rows.filter((r) => r.beneficiario_id === beneficiario);
  }, [rows, beneficiario]);

  const totais = useMemo(() => computeTotais(filtered), [filtered]);
  const resumoVendas = useMemo(() => computeResumoVendas(vendasQ.data ?? []), [vendasQ.data]);
  const beneficiarios = useMemo(() => beneficiariosDasLinhas(rows), [rows]);
  const temSemBeneficiario = useMemo(() => rows.some((r) => !r.beneficiario_id), [rows]);
  const somaValor = useMemo(
    () => round2(filtered.reduce((acc, r) => acc + (Number(r.valor_comissao) || 0), 0)),
    [filtered],
  );
  const somaLiquido = useMemo(
    () => round2(filtered.reduce((acc, r) => acc + (Number(r.valor_liquido) || 0), 0)),
    [filtered],
  );

  const mesLabel =
    mes === "todos" ? "Todo o período" : (mesesOpcoes.find((m) => m.value === mes)?.label ?? mes);
  // Os cards de pendente/paga refletem os filtros de status/beneficiário —
  // o hint precisa dizer isso para não parecer o total do mês.
  const hintComissoes =
    status !== "all" || beneficiario !== "all" ? `${mesLabel} · com filtros ativos` : mesLabel;

  // --- Mutations com update otimista sobre a query ativa -------------------
  const activeKey = useMemo(() => ["comissoes", mes, status] as const, [mes, status]);

  function patchCache(id: string, changes: Partial<ComissaoRow>) {
    qc.setQueryData<ComissaoRow[]>(activeKey, (cache) =>
      cache ? cache.map((r) => (r.id === id ? { ...r, ...changes } : r)) : cache,
    );
  }

  type UpdateVars = {
    id: string;
    changes: Partial<ComissaoRow>;
    run: () => Promise<void>;
    sucesso: string;
  };
  const updateRef = useRef<((vars: UpdateVars) => void) | null>(null);
  const updateM = useMutation({
    mutationFn: ({ run }: UpdateVars) => run(),
    onMutate: async ({ id, changes }) => {
      await qc.cancelQueries({ queryKey: ["comissoes"] });
      // Captura a key do momento do mutate: se o usuário trocar o filtro
      // antes do erro, o rollback precisa restaurar a key onde o patch caiu.
      const key = activeKey;
      const prev = qc.getQueryData<ComissaoRow[]>(key);
      patchCache(id, changes);
      return { prev, key };
    },
    onError: (err: Error, vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error(err.message, {
        action: { label: "Tentar novamente", onClick: () => updateRef.current?.(vars) },
      });
    },
    onSuccess: (_data, vars) => toast.success(vars.sucesso),
    onSettled: () => qc.invalidateQueries({ queryKey: ["comissoes"] }),
  });
  updateRef.current = updateM.mutate;

  async function exportarXlsx() {
    try {
      await exportRowsXlsx(buildExportRows(filtered), {
        sheetName: "Comissões",
        fileName: `comissoes-${mes === "todos" ? "todas" : mes}.xlsx`,
      });
    } catch {
      toast.error("Não foi possível exportar a planilha. Verifique a conexão e tente novamente.");
    }
  }

  const filtros = (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={mes} onValueChange={setMes}>
        <SelectTrigger className="w-[190px]">
          <SelectValue placeholder="Período" />
        </SelectTrigger>
        <SelectContent>
          {mesesOpcoes.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
          <SelectItem value="todos">Todo o período</SelectItem>
        </SelectContent>
      </Select>
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os status</SelectItem>
          <SelectItem value="pendente">Pendente</SelectItem>
          <SelectItem value="paga">Paga</SelectItem>
          <SelectItem value="cancelada">Cancelada</SelectItem>
        </SelectContent>
      </Select>
      {canManage && (beneficiarios.length > 0 || temSemBeneficiario) && (
        <Select value={beneficiario} onValueChange={setBeneficiario}>
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="Beneficiário" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os beneficiários</SelectItem>
            {temSemBeneficiario && <SelectItem value="sem">Sem beneficiário</SelectItem>}
            {beneficiarios.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button variant="outline" size="sm" onClick={exportarXlsx} disabled={filtered.length === 0}>
        <Download className="w-4 h-4 mr-1.5" /> Exportar
      </Button>
    </div>
  );

  const mutateUpdate = updateM.mutate;
  const reverterComissao = useCallback(
    (row: ComissaoRow) =>
      mutateUpdate({
        id: row.id,
        changes: { status: "pendente", data_pagamento: null },
        run: () => reverterComissaoPendente(row.id),
        sucesso: "Comissão revertida para pendente",
      }),
    [mutateUpdate],
  );

  const columns = useMemo<ColumnDef<ComissaoRow, unknown>[]>(() => {
    const cols: ColumnDef<ComissaoRow, unknown>[] = [
      {
        id: "data",
        accessorFn: (r) => r.venda?.data_assinatura ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Data" />,
        meta: { label: "Data", hideBelow: "sm" },
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {fmtDataCurta(row.original.venda?.data_assinatura)}
          </span>
        ),
      },
      {
        id: "projeto",
        accessorFn: (r) => r.venda?.projeto_nome ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Projeto" />,
        meta: { label: "Projeto", hideBelow: "md" },
        cell: ({ row }) => (
          <span className="text-sm">{row.original.venda?.projeto_nome ?? "—"}</span>
        ),
      },
      {
        id: "beneficiario",
        accessorFn: (r) => r.beneficiario_nome ?? tipoLabel(r.tipo),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Beneficiário" />,
        meta: { label: "Beneficiário" },
        cell: ({ row }) => (
          <span className="font-medium">
            <Beneficiario row={row.original} />
          </span>
        ),
      },
      {
        id: "tipo",
        accessorFn: (r) => tipoLabel(r.tipo),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
        meta: { label: "Tipo", hideBelow: "lg" },
        cell: ({ row }) => (
          <StatusBadge hue={tipoHue(row.original.tipo)}>{tipoLabel(row.original.tipo)}</StatusBadge>
        ),
      },
      {
        id: "vgv",
        accessorFn: (r) => Number(r.contrato_vgv) || 0,
        header: ({ column }) => <DataTableColumnHeader column={column} title="VGV" />,
        meta: {
          label: "VGV",
          align: "right",
          hideBelow: "xl",
          cellClassName: "tabular-nums whitespace-nowrap",
        },
        cell: ({ row }) => formatBRL2(row.original.contrato_vgv),
      },
      {
        id: "percentual",
        accessorFn: (r) => Number(r.percentual) || 0,
        header: ({ column }) => <DataTableColumnHeader column={column} title="%" />,
        meta: {
          label: "Percentual",
          align: "right",
          hideBelow: "xl",
          cellClassName: "tabular-nums",
        },
        cell: ({ row }) => (
          <>
            {Number(row.original.percentual).toLocaleString("pt-BR", {
              maximumFractionDigits: 3,
            })}
            %
          </>
        ),
      },
      {
        id: "valor",
        accessorFn: (r) => Number(r.valor_comissao) || 0,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Valor" />,
        meta: {
          label: "Valor",
          align: "right",
          hideBelow: "lg",
          cellClassName: "tabular-nums whitespace-nowrap",
        },
        cell: ({ row }) => formatBRL2(row.original.valor_comissao),
      },
      {
        id: "liquido",
        accessorFn: (r) => Number(r.valor_liquido) || 0,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Líquido" />,
        meta: {
          label: "Líquido",
          align: "right",
          cellClassName: "tabular-nums whitespace-nowrap",
        },
        cell: ({ row }) => (
          <span className="font-medium">
            {formatBRL2(row.original.valor_liquido)}
            {Number(row.original.percentual_desconto) > 0 && (
              <span className="block text-xs font-normal text-muted-foreground">
                desc. {Number(row.original.percentual_desconto).toLocaleString("pt-BR")}%
              </span>
            )}
          </span>
        ),
      },
      {
        id: "status",
        accessorFn: (r) => statusLabel(r.status),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        meta: { label: "Status" },
        cell: ({ row }) => (
          <StatusBadge intent={statusIntent(row.original.status)}>
            {statusLabel(row.original.status)}
          </StatusBadge>
        ),
      },
      {
        id: "pagamento",
        accessorFn: (r) => r.data_pagamento ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Pagamento" />,
        meta: { label: "Pagamento", hideBelow: "xl" },
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {fmtDataCurta(row.original.data_pagamento)}
          </span>
        ),
      },
    ];
    if (canManage) {
      cols.push({
        id: "acoes",
        header: () => <span className="sr-only">Ações</span>,
        enableSorting: false,
        enableHiding: false,
        size: 48,
        cell: ({ row }) => (
          <AcoesLinha
            row={row.original}
            onPagar={setPagarRow}
            onReverter={reverterComissao}
            onAtribuir={setAtribuirRow}
            onDesconto={setDescontoRow}
          />
        ),
      });
    }
    return cols;
  }, [canManage, reverterComissao]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comissões"
        description="Geradas somente após a aprovação gerencial da venda."
        actions={filtros}
      />

      {canManage && <PendingSalesApproval />}

      <StatGrid>
        <StatTile
          title={canManage ? "VGV do período" : "Meu VGV do período"}
          value={formatBRL2(resumoVendas.vgv)}
          hint={mesLabel}
          icon={TrendingUp}
          loading={vendasQ.isLoading}
        />
        <StatTile
          title={canManage ? "Comissão imobiliária" : "Comissão sobre minhas vendas"}
          value={formatBRL2(resumoVendas.comissaoImobiliaria)}
          hint={
            canManage
              ? "Prevista sobre as vendas do período"
              : "Prevista sobre as minhas vendas do período"
          }
          icon={Building2}
          loading={vendasQ.isLoading}
        />
        <StatTile
          title={canManage ? "Comissões pendentes" : "Minha comissão pendente"}
          value={formatBRL2(totais.pendente)}
          hint={hintComissoes}
          icon={Clock}
          intent="warning"
          loading={comissoesQ.isLoading}
        />
        <StatTile
          title={canManage ? "Comissões pagas" : "Minha comissão paga"}
          value={formatBRL2(totais.paga)}
          hint={hintComissoes}
          icon={CheckCircle2}
          intent="success"
          loading={comissoesQ.isLoading}
        />
      </StatGrid>

      <div className="space-y-2">
        <DataTable
          tableId="comissoes"
          aria-label="Comissões"
          columns={columns}
          data={filtered}
          loading={comissoesQ.isLoading}
          error={comissoesQ.isError ? comissoesQ.error : undefined}
          onRetry={() => void comissoesQ.refetch()}
          empty={
            <EmptyState
              icon={HandCoins}
              title="Nenhuma comissão por aqui ainda."
              description={
                rows.length > 0
                  ? "Nenhuma comissão com os filtros escolhidos — ajuste o período, o status ou o beneficiário."
                  : "As comissões aparecem depois que a gestão aprova uma venda pendente."
              }
              action={
                rows.length > 0 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setStatus("all");
                      setBeneficiario("all");
                      setMes("todos");
                    }}
                  >
                    Limpar filtros
                  </Button>
                ) : undefined
              }
            />
          }
        />

        {/* Totais do filtro ativo (todas as linhas, não só as visíveis) */}
        {!comissoesQ.isLoading && !comissoesQ.isError && filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-xl border border-border-subtle bg-muted/40 px-4 py-3 text-sm">
            <span className="font-medium">
              Totais ({filtered.length} {filtered.length === 1 ? "comissão" : "comissões"})
            </span>
            <span className="flex flex-wrap items-center gap-x-6 gap-y-1 tabular-nums">
              <span className="text-muted-foreground">
                VGV <span className="font-medium text-foreground">{formatBRL2(totais.vgv)}</span>
              </span>
              <span className="text-muted-foreground">
                Valor <span className="font-medium text-foreground">{formatBRL2(somaValor)}</span>
              </span>
              <span className="text-muted-foreground">
                Líquido{" "}
                <span className="font-semibold text-foreground">{formatBRL2(somaLiquido)}</span>
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Dialog: marcar como paga */}
      <Dialog open={!!pagarRow} onOpenChange={(o) => !o && setPagarRow(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Marcar comissão como paga</DialogTitle>
            <DialogDescription>
              {pagarRow?.beneficiario_nome ?? tipoLabel(pagarRow?.tipo ?? "")} ·{" "}
              {formatBRL2(pagarRow?.valor_liquido ?? 0)}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!pagarRow) return;
              const fd = new FormData(e.currentTarget);
              const data = String(fd.get("data_pagamento") ?? "");
              if (!data || data > hoje()) {
                toast.error("Informe uma data de pagamento válida (não futura).");
                return;
              }
              updateM.mutate({
                id: pagarRow.id,
                changes: { status: "paga", data_pagamento: data },
                run: () => marcarComissaoPaga(pagarRow.id, data),
                sucesso: "Comissão marcada como paga",
              });
              setPagarRow(null);
            }}
          >
            <div>
              <Label htmlFor="data_pagamento">Data do pagamento</Label>
              <Input
                id="data_pagamento"
                name="data_pagamento"
                type="date"
                defaultValue={hoje()}
                max={hoje()}
                className="mt-1"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPagarRow(null)}>
                Cancelar
              </Button>
              <Button type="submit">Confirmar pagamento</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: atribuir/alterar beneficiário */}
      <Dialog open={!!atribuirRow} onOpenChange={(o) => !o && setAtribuirRow(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {atribuirRow?.beneficiario_id ? "Alterar beneficiário" : "Atribuir beneficiário"}
            </DialogTitle>
            <DialogDescription>
              Comissão de {tipoLabel(atribuirRow?.tipo ?? "").toLowerCase()} ·{" "}
              {formatBRL2(atribuirRow?.valor_liquido ?? 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Beneficiário</Label>
              <Select value={beneficiarioEscolhido ?? ""} onValueChange={setBeneficiarioEscolhido}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={profilesQ.isLoading ? "Carregando…" : "Selecione…"} />
                </SelectTrigger>
                <SelectContent>
                  {(profilesQ.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome ?? "Sem nome"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAtribuirRow(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={!beneficiarioEscolhido}
                onClick={() => {
                  if (!atribuirRow) return;
                  const perfil = (profilesQ.data ?? []).find((p) => p.id === beneficiarioEscolhido);
                  if (!perfil) {
                    toast.error("Selecione o beneficiário.");
                    return;
                  }
                  updateM.mutate({
                    id: atribuirRow.id,
                    changes: { beneficiario_id: perfil.id, beneficiario_nome: perfil.nome },
                    run: () => atribuirBeneficiario(atribuirRow.id, perfil.id, perfil.nome ?? ""),
                    sucesso: `Beneficiário definido: ${perfil.nome}`,
                  });
                  setAtribuirRow(null);
                }}
              >
                Salvar
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: aplicar desconto */}
      <DescontoDialog
        row={descontoRow}
        onOpenChange={(o) => !o && setDescontoRow(null)}
        onConfirm={(row, pct) => {
          const liquido = calcularLiquido(row.valor_comissao, pct);
          updateM.mutate({
            id: row.id,
            changes: { percentual_desconto: pct, valor_liquido: liquido },
            run: () => aplicarDesconto(row.id, pct, liquido),
            sucesso: `Desconto aplicado · líquido ${formatBRL2(liquido)}`,
          });
          setDescontoRow(null);
        }}
      />
    </div>
  );
}

function DescontoDialog({
  row,
  onOpenChange,
  onConfirm,
}: {
  row: ComissaoRow | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (row: ComissaoRow, pct: number) => void;
}) {
  const [texto, setTexto] = useState("");
  useEffect(() => {
    if (row) setTexto(String(row.percentual_desconto || ""));
  }, [row]);

  const pct = parsePercent(texto);
  const valido = pct !== null && pct >= 0 && pct <= 100;
  const liquido = row && valido ? calcularLiquido(row.valor_comissao, pct) : null;

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Aplicar desconto</DialogTitle>
          <DialogDescription>
            Desconto percentual sobre a comissão (ex.: antecipação). Valor bruto:{" "}
            {formatBRL2(row?.valor_comissao ?? 0)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="desconto-pct">Desconto (%)</Label>
          <Input
            id="desconto-pct"
            inputMode="decimal"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex: 10"
            className="max-w-32"
          />
          {texto.trim() !== "" && !valido && (
            <p className="text-xs text-destructive">Informe um percentual entre 0 e 100.</p>
          )}
          {liquido !== null && (
            <p className="text-sm text-muted-foreground">
              Valor líquido resultante: <span className="font-medium">{formatBRL2(liquido)}</span>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!valido}
            onClick={() => row && valido && onConfirm(row, pct)}
          >
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
