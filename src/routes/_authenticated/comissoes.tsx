import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
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

// Rota legada mantida para deep-links: o conteúdo vive como aba do hub.
export const Route = createFileRoute("/_authenticated/comissoes")({
  beforeLoad: () => {
    throw redirect({ to: "/projetos", search: { tab: "comissoes" } });
  },
});

const PAGINA_RENDER = 50;
const hoje = () => new Date().toISOString().slice(0, 10);

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

export function ComissoesPage() {
  const qc = useQueryClient();
  const { isAdmin, isGestor, isSuperintendente } = useUserRoles();
  // Espelha a RLS de UPDATE de `comissoes` (admin/gestor/superintendente).
  const canManage = isAdmin || isGestor || isSuperintendente;

  const mesesOpcoes = useMemo(() => ultimosMeses(12), []);
  const [mes, setMes] = useState<string>(mesesOpcoes[0]?.value ?? "todos");
  const [status, setStatus] = useState<string>("all");
  const [beneficiario, setBeneficiario] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(PAGINA_RENDER);

  const [pagarRow, setPagarRow] = useState<ComissaoRow | null>(null);
  const [atribuirRow, setAtribuirRow] = useState<ComissaoRow | null>(null);
  const [beneficiarioEscolhido, setBeneficiarioEscolhido] = useState<string | null>(null);
  const [descontoRow, setDescontoRow] = useState<ComissaoRow | null>(null);

  useEffect(() => {
    setBeneficiarioEscolhido(atribuirRow?.beneficiario_id ?? null);
  }, [atribuirRow]);

  useEffect(() => {
    setVisibleCount(PAGINA_RENDER);
  }, [mes, status, beneficiario]);

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
  const filtered = useMemo(() => {
    if (beneficiario === "all") return rows;
    if (beneficiario === "sem") return rows.filter((r) => !r.beneficiario_id);
    return rows.filter((r) => r.beneficiario_id === beneficiario);
  }, [rows, beneficiario]);
  const visiveis = filtered.slice(0, visibleCount);

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
      const prev = qc.getQueryData<ComissaoRow[]>(activeKey);
      patchCache(id, changes);
      return { prev };
    },
    onError: (err: Error, vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(activeKey, ctx.prev);
      toast.error(err.message, {
        action: { label: "Tentar novamente", onClick: () => updateRef.current?.(vars) },
      });
    },
    onSuccess: (_data, vars) => toast.success(vars.sucesso),
    onSettled: () => qc.invalidateQueries({ queryKey: ["comissoes"] }),
  });
  updateRef.current = updateM.mutate;

  async function exportarXlsx() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(buildExportRows(filtered));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Comissões");
    XLSX.writeFile(wb, `comissoes-${mes === "todos" ? "todas" : mes}.xlsx`);
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
      {canManage && (
        <Button variant="outline" size="sm" onClick={exportarXlsx} disabled={filtered.length === 0}>
          <Download className="w-4 h-4 mr-1.5" /> Exportar
        </Button>
      )}
    </div>
  );

  const reverterComissao = (row: ComissaoRow) =>
    updateM.mutate({
      id: row.id,
      changes: { status: "pendente", data_pagamento: null },
      run: () => reverterComissaoPendente(row.id),
      sucesso: "Comissão revertida para pendente",
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comissões"
        description="Geradas automaticamente a cada venda registrada, uma linha por beneficiário."
        actions={filtros}
      />

      <KpiGrid>
        <KpiCard
          title="VGV do período"
          value={formatBRL2(resumoVendas.vgv)}
          hint={mesLabel}
          icon={TrendingUp}
          loading={vendasQ.isLoading}
        />
        <KpiCard
          title="Comissão imobiliária"
          value={formatBRL2(resumoVendas.comissaoImobiliaria)}
          hint="Prevista sobre as vendas do período"
          icon={Building2}
          loading={vendasQ.isLoading}
        />
        <KpiCard
          title={canManage ? "Comissões pendentes" : "Minha comissão pendente"}
          value={formatBRL2(totais.pendente)}
          hint={mesLabel}
          icon={Clock}
          intent="warning"
          loading={comissoesQ.isLoading}
        />
        <KpiCard
          title={canManage ? "Comissões pagas" : "Minha comissão paga"}
          value={formatBRL2(totais.paga)}
          hint={mesLabel}
          icon={CheckCircle2}
          intent="success"
          loading={comissoesQ.isLoading}
        />
      </KpiGrid>

      {comissoesQ.isLoading ? (
        <div className="h-64 animate-pulse bg-muted rounded-xl" />
      ) : comissoesQ.isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <p className="font-medium">Erro ao carregar as comissões</p>
            <p className="text-sm text-muted-foreground max-w-md">
              {(comissoesQ.error as Error | null)?.message}
            </p>
            <Button variant="outline" onClick={() => comissoesQ.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="Nenhuma comissão por aqui ainda."
          description={
            rows.length > 0
              ? "Nenhuma comissão com os filtros escolhidos — ajuste o período, o status ou o beneficiário."
              : 'As comissões são geradas automaticamente quando uma venda é registrada (etapa "Contrato fechado"). Registre uma venda para vê-las aqui.'
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
      ) : (
        <>
          {/* Tabela (desktop) */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Projeto</TableHead>
                      <TableHead>Beneficiário</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">VGV</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Líquido</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Pagamento</TableHead>
                      {canManage && <TableHead className="w-10"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visiveis.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {row.venda?.data_assinatura
                            ? new Date(`${row.venda.data_assinatura}T12:00:00`).toLocaleDateString(
                                "pt-BR",
                              )
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{row.venda?.projeto_nome ?? "—"}</TableCell>
                        <TableCell className="font-medium">
                          <Beneficiario row={row} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge hue={tipoHue(row.tipo)}>{tipoLabel(row.tipo)}</StatusBadge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBRL2(row.contrato_vgv)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(row.percentual).toLocaleString("pt-BR", {
                            maximumFractionDigits: 3,
                          })}
                          %
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBRL2(row.valor_comissao)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatBRL2(row.valor_liquido)}
                          {Number(row.percentual_desconto) > 0 && (
                            <span className="block text-xs font-normal text-muted-foreground">
                              desc. {Number(row.percentual_desconto).toLocaleString("pt-BR")}%
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge intent={statusIntent(row.status)}>
                            {statusLabel(row.status)}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {row.data_pagamento
                            ? new Date(`${row.data_pagamento}T12:00:00`).toLocaleDateString("pt-BR")
                            : "—"}
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <AcoesLinha
                              row={row}
                              onPagar={setPagarRow}
                              onReverter={reverterComissao}
                              onAtribuir={setAtribuirRow}
                              onDesconto={setDescontoRow}
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {/* Totais do filtro ativo (todas as linhas, não só as visíveis) */}
                    <TableRow className="bg-muted/40 font-medium">
                      <TableCell colSpan={4}>
                        Totais ({filtered.length} comissã{filtered.length === 1 ? "o" : "es"})
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBRL2(totais.vgv)}
                      </TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBRL2(somaValor)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBRL2(somaLiquido)}
                      </TableCell>
                      <TableCell colSpan={canManage ? 3 : 2}></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Cards (mobile) */}
          <div className="md:hidden space-y-2">
            {visiveis.map((row) => (
              <div key={row.id} className="bg-card border rounded-xl p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium leading-tight">
                      <Beneficiario row={row} />
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {row.venda?.projeto_nome ?? "—"}
                      {row.venda?.data_assinatura
                        ? ` · ${new Date(`${row.venda.data_assinatura}T12:00:00`).toLocaleDateString("pt-BR")}`
                        : ""}
                    </p>
                  </div>
                  {canManage && (
                    <AcoesLinha
                      row={row}
                      onPagar={setPagarRow}
                      onReverter={reverterComissao}
                      onAtribuir={setAtribuirRow}
                      onDesconto={setDescontoRow}
                    />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge hue={tipoHue(row.tipo)}>{tipoLabel(row.tipo)}</StatusBadge>
                  <StatusBadge intent={statusIntent(row.status)}>
                    {statusLabel(row.status)}
                  </StatusBadge>
                  {row.data_pagamento && (
                    <span className="text-xs text-muted-foreground">
                      pago em{" "}
                      {new Date(`${row.data_pagamento}T12:00:00`).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </div>
                <div className="flex items-end justify-between text-sm">
                  <span className="text-muted-foreground">
                    {Number(row.percentual).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}%
                    de {formatBRL2(row.contrato_vgv)}
                  </span>
                  <span className="font-semibold">{formatBRL2(row.valor_liquido)}</span>
                </div>
              </div>
            ))}
            <div className="bg-muted/40 border rounded-xl p-3 flex items-center justify-between text-sm font-medium">
              <span>Total líquido ({filtered.length})</span>
              <span>{formatBRL2(somaLiquido)}</span>
            </div>
          </div>

          {filtered.length > visibleCount && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setVisibleCount((c) => c + PAGINA_RENDER)}>
                Carregar mais ({filtered.length - visibleCount} restantes)
              </Button>
            </div>
          )}
        </>
      )}

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
