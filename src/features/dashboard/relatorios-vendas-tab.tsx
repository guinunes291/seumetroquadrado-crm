// Sub-aba VENDAS dos Relatórios: cada venda com NOME do cliente e corretor
// responsável (fim do "quem comprou?" que obrigava a abrir a base de leads),
// tendência de 12 meses, top empreendimentos clicável (filtra a tabela),
// conversão por empreendimento e distratos do período.

import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Building2, CheckCircle2, FileX2, TrendingUp, Undo2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { useVendasAprovadas } from "@/features/dashboard/queries";
import {
  agruparVendasPorMes,
  conversaoPorProjeto,
  ticketMedio,
  topProjetos,
  type VendasMes,
} from "@/features/dashboard/relatorios-derive";
import {
  useCorretorNomes,
  useDistratosNominais,
  useLeadsPorProjeto,
  useVendasNominais,
  type VendaNominal,
} from "@/features/dashboard/relatorios-nominais";
import {
  corretorNome,
  dataCurta,
  fmtBRL,
  fmtBRLCompacto,
  LeadCell,
  NotaTeto,
  VazioPeriodo,
} from "@/features/dashboard/relatorios-partes";
import { ExportarPdfButton } from "@/features/dashboard/exportar-pdf-button";
import type { DocumentoRelatorio } from "@/features/dashboard/relatorios-pdf";

type RelatoriosPdf = typeof import("@/features/dashboard/relatorios-pdf");

type Range = { di: string | null; df: string | null };

const RECEBIMENTO_LABEL: Record<string, string> = {
  pendente: "Comissão pendente",
  parcial: "Comissão parcial",
  recebido: "Comissão recebida",
};

const nomeProjeto = (v: VendaNominal) => v.projeto_nome?.trim() || "Sem projeto";

export function RelatoriosVendasTab({
  range,
  scope,
  canSeeAll,
}: {
  range: Range;
  scope: string | null;
  canSeeAll: boolean;
}) {
  const vendasQ = useVendasNominais(range, scope);
  const distratosQ = useDistratosNominais(range, scope);
  const nomesQ = useCorretorNomes(canSeeAll);
  const vendas12Q = useVendasAprovadas(12);
  const leadsProjetoQ = useLeadsPorProjeto(range, canSeeAll);

  const [projetoFiltro, setProjetoFiltro] = useState<string | null>(null);

  const rows = vendasQ.data?.rows ?? [];
  const filtradas = useMemo(
    () => (projetoFiltro ? rows.filter((v) => nomeProjeto(v) === projetoFiltro) : rows),
    [rows, projetoFiltro],
  );
  const vgv = useMemo(() => rows.reduce((s, v) => s + (Number(v.valor_venda) || 0), 0), [rows]);
  const ticket = ticketMedio(vgv, rows.length);
  const top = useMemo(
    () =>
      topProjetos(
        rows.map((v) => ({
          valor_venda: v.valor_venda,
          projeto_nome: v.projeto_nome,
          data_assinatura: v.data_assinatura,
        })),
      ),
    [rows],
  );
  const meses12 = useMemo(() => agruparVendasPorMes(vendas12Q.data ?? []), [vendas12Q.data]);
  const conversao = useMemo(
    () =>
      conversaoPorProjeto(
        leadsProjetoQ.data ?? [],
        rows.map((v) => ({
          projeto_id: v.projeto_id,
          projeto_nome: v.projeto_nome,
          valor_venda: v.valor_venda,
        })),
      ),
    [leadsProjetoQ.data, rows],
  );
  const distratos = distratosQ.data?.rows ?? [];
  const vgvDistratado = useMemo(
    () => distratos.reduce((s, v) => s + (Number(v.valor_venda) || 0), 0),
    [distratos],
  );

  const montarPdf = (pdf: RelatoriosPdf): DocumentoRelatorio => {
    const corretorDe = (id: string | null) => (canSeeAll ? [corretorNome(id, nomesQ.data)] : []);
    const colCorretor = canSeeAll ? ["Corretor"] : [];
    const colVendas = ["Assinatura", "Cliente", ...colCorretor, "Empreendimento", "Valor"];
    return {
      titulo: "Relatório de Vendas",
      periodo: pdf.periodoLabelPdf(range),
      blocos: [
        {
          titulo: "Resultado",
          html: pdf.kpisPdf([
            { label: "Vendas", valor: String(vendasQ.data?.total ?? 0), hint: "aprovadas" },
            { label: "VGV", valor: fmtBRLCompacto(vgv) },
            { label: "Ticket médio", valor: ticket === null ? "—" : fmtBRLCompacto(ticket) },
            {
              label: "Distratos",
              valor: String(distratosQ.data?.total ?? 0),
              hint: vgvDistratado > 0 ? `${fmtBRLCompacto(vgvDistratado)} devolvidos` : undefined,
            },
          ]),
        },
        {
          titulo: "Vendas do período",
          sub: projetoFiltro ? `filtrado: ${projetoFiltro}` : undefined,
          html: pdf.tabelaPdf(
            colVendas,
            filtradas.map((v) => [
              dataCurta(v.data_assinatura),
              v.lead?.nome ?? "—",
              ...corretorDe(v.corretor_id),
              nomeProjeto(v) + (v.unidade ? ` · ${v.unidade}` : ""),
              fmtBRL(Number(v.valor_venda) || 0),
            ]),
            { direita: [colVendas.length - 1] },
          ),
        },
        {
          titulo: "Top empreendimentos",
          html: pdf.tabelaPdf(
            ["Empreendimento", "Vendas", "VGV"],
            top.map((r) => [r.projeto, r.vendas, fmtBRLCompacto(r.vgv)]),
            { direita: [1, 2] },
          ),
        },
        ...(canSeeAll
          ? [
              {
                titulo: "Conversão por empreendimento",
                sub: "leads captados × vendas assinadas no período",
                html: pdf.tabelaPdf(
                  ["Empreendimento", "Leads", "Vendas", "VGV", "Conv."],
                  conversao
                    .slice(0, 20)
                    .map((r) => [
                      r.nome,
                      r.leads.toLocaleString("pt-BR"),
                      r.vendas,
                      fmtBRLCompacto(r.vgv),
                      r.conv_pct === null ? "—" : `${r.conv_pct.toLocaleString("pt-BR")}%`,
                    ]),
                  { direita: [1, 2, 3, 4] },
                ),
              },
            ]
          : []),
        {
          titulo: "Distratos do período",
          html: pdf.tabelaPdf(
            ["Distrato", "Cliente", ...colCorretor, "Empreendimento", "Valor", "Motivo"],
            distratos.map((v) => [
              dataCurta(v.data_distrato),
              v.lead?.nome ?? "—",
              ...corretorDe(v.corretor_id),
              nomeProjeto(v),
              fmtBRL(Number(v.valor_venda) || 0),
              v.motivo_distrato || "—",
            ]),
            { direita: [canSeeAll ? 4 : 3] },
          ),
        },
      ],
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ExportarPdfButton
          montar={montarPdf}
          disabled={vendasQ.isLoading || distratosQ.isLoading}
        />
      </div>
      <StatGrid>
        <StatTile
          title="Vendas no período"
          value={vendasQ.data?.total ?? 0}
          icon={CheckCircle2}
          intent="success"
          loading={vendasQ.isLoading}
          hint="aprovadas, pela data de assinatura"
        />
        <StatTile
          title="VGV"
          value={vgv}
          formatValue={fmtBRLCompacto}
          icon={TrendingUp}
          intent="success"
          loading={vendasQ.isLoading}
        />
        <StatTile
          title="Ticket médio"
          value={ticket === null ? "—" : fmtBRLCompacto(ticket)}
          icon={Building2}
          loading={vendasQ.isLoading}
        />
        <StatTile
          title="Distratos"
          value={distratosQ.data?.total ?? 0}
          icon={Undo2}
          intent={(distratosQ.data?.total ?? 0) > 0 ? "warning" : "neutral"}
          loading={distratosQ.isLoading}
          hint={vgvDistratado > 0 ? `${fmtBRLCompacto(vgvDistratado)} devolvidos` : undefined}
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Vendas do período
              {projetoFiltro && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="ml-auto h-6 gap-1 text-xs"
                  onClick={() => setProjetoFiltro(null)}
                >
                  {projetoFiltro} <X className="h-3 w-3" />
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AsyncBoundary
              isLoading={vendasQ.isLoading}
              isError={vendasQ.isError}
              error={vendasQ.error}
              errorTitle="Não foi possível carregar as vendas."
              onRetry={() => vendasQ.refetch()}
              loadingFallback={<Skeleton className="h-48 w-full" />}
            >
              {filtradas.length === 0 ? (
                <VazioPeriodo>
                  {projetoFiltro
                    ? "Sem vendas deste empreendimento no período."
                    : "Sem vendas aprovadas neste período. Ajuste o filtro de data acima."}
                </VazioPeriodo>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Assinatura</TableHead>
                        <TableHead>Cliente</TableHead>
                        {canSeeAll && <TableHead>Corretor</TableHead>}
                        <TableHead>Empreendimento</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtradas.map((v) => (
                        <TableRow key={v.id}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {dataCurta(v.data_assinatura)}
                          </TableCell>
                          <TableCell>
                            <LeadCell
                              leadId={v.lead?.id ?? v.lead_id}
                              nome={v.lead?.nome}
                              telefone={v.lead?.telefone}
                            />
                          </TableCell>
                          {canSeeAll && (
                            <TableCell className="truncate max-w-[160px]">
                              {corretorNome(v.corretor_id, nomesQ.data)}
                            </TableCell>
                          )}
                          <TableCell className="truncate max-w-[180px]">
                            {nomeProjeto(v)}
                            {v.unidade ? (
                              <span className="text-xs text-muted-foreground"> · {v.unidade}</span>
                            ) : null}
                          </TableCell>
                          <TableCell
                            className="text-right tabular-nums font-medium"
                            title={RECEBIMENTO_LABEL[v.status_recebimento] ?? undefined}
                          >
                            {fmtBRL(Number(v.valor_venda) || 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <NotaTeto mostrando={rows.length} total={vendasQ.data?.total ?? rows.length} />
                </div>
              )}
            </AsyncBoundary>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Top empreendimentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AsyncBoundary
              isLoading={vendasQ.isLoading}
              isError={vendasQ.isError}
              error={vendasQ.error}
              errorTitle="Não foi possível carregar os empreendimentos."
              onRetry={() => vendasQ.refetch()}
              loadingFallback={<Skeleton className="h-40 w-full" />}
            >
              {top.length === 0 ? (
                <VazioPeriodo>Sem vendas aprovadas neste período.</VazioPeriodo>
              ) : (
                <ul className="space-y-2">
                  {top.map((r) => {
                    const maxVgv = Math.max(1, ...top.map((t) => t.vgv));
                    const ativo = projetoFiltro === r.projeto;
                    return (
                      <li key={r.projeto}>
                        <button
                          type="button"
                          className="w-full text-left"
                          title="Ver as vendas deste empreendimento"
                          onClick={() => setProjetoFiltro(ativo ? null : r.projeto)}
                        >
                          <div className="mb-1 flex justify-between gap-2 text-sm">
                            <span
                              className={ativo ? "font-semibold truncate" : "truncate font-medium"}
                            >
                              {r.projeto}
                            </span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              {r.vendas} {r.vendas === 1 ? "venda" : "vendas"} ·{" "}
                              {fmtBRLCompacto(r.vgv)}
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className={ativo ? "h-full bg-primary" : "h-full bg-primary/70"}
                              style={{
                                width: `${Math.max(3, Math.round((r.vgv / maxVgv) * 100))}%`,
                              }}
                            />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </AsyncBoundary>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Clique num empreendimento para ver quem comprou.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Ano mês a mês (12 meses)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            <AsyncBoundary
              className="h-full"
              isLoading={vendas12Q.isLoading}
              isError={vendas12Q.isError}
              error={vendas12Q.error}
              errorTitle="Não foi possível carregar a evolução anual."
              onRetry={() => vendas12Q.refetch()}
              loadingFallback={<Skeleton className="h-full w-full" />}
            >
              {meses12.length === 0 ? (
                <VazioPeriodo>Sem vendas aprovadas nos últimos 12 meses.</VazioPeriodo>
              ) : (
                <EvolucaoMensalChart data={meses12} />
              )}
            </AsyncBoundary>
          </CardContent>
        </Card>

        {canSeeAll ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Conversão por empreendimento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AsyncBoundary
                isLoading={leadsProjetoQ.isLoading || vendasQ.isLoading}
                isError={leadsProjetoQ.isError}
                error={leadsProjetoQ.error}
                errorTitle="Não foi possível carregar a conversão por empreendimento."
                onRetry={() => leadsProjetoQ.refetch()}
                loadingFallback={<Skeleton className="h-40 w-full" />}
              >
                {conversao.length === 0 ? (
                  <VazioPeriodo />
                ) : (
                  <div className="overflow-x-auto max-h-[280px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Empreendimento</TableHead>
                          <TableHead className="text-right">Leads</TableHead>
                          <TableHead className="text-right">Vendas</TableHead>
                          <TableHead className="text-right">VGV</TableHead>
                          <TableHead className="text-right">Conv.</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {conversao.slice(0, 12).map((r) => (
                          <TableRow key={r.nome}>
                            <TableCell className="font-medium truncate max-w-[180px]">
                              {r.nome}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.leads.toLocaleString("pt-BR")}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-semibold text-success">
                              {r.vendas}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmtBRLCompacto(r.vgv)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.conv_pct === null ? (
                                <span
                                  className="text-muted-foreground"
                                  title="Sem leads atribuídos a este empreendimento no período"
                                >
                                  —
                                </span>
                              ) : (
                                <Badge variant={r.conv_pct >= 1 ? "default" : "secondary"}>
                                  {r.conv_pct.toLocaleString("pt-BR")}%
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Leads captados no período × vendas assinadas no período, por produto.
                    </p>
                  </div>
                )}
              </AsyncBoundary>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileX2 className="h-4 w-4" /> Distratos do período
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AsyncBoundary
            isLoading={distratosQ.isLoading}
            isError={distratosQ.isError}
            error={distratosQ.error}
            errorTitle="Não foi possível carregar os distratos."
            onRetry={() => distratosQ.refetch()}
            loadingFallback={<Skeleton className="h-24 w-full" />}
          >
            {distratos.length === 0 ? (
              <VazioPeriodo>Nenhum distrato no período — bom sinal.</VazioPeriodo>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Distrato</TableHead>
                      <TableHead>Cliente</TableHead>
                      {canSeeAll && <TableHead>Corretor</TableHead>}
                      <TableHead>Empreendimento</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {distratos.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {dataCurta(v.data_distrato)}
                        </TableCell>
                        <TableCell>
                          <LeadCell
                            leadId={v.lead?.id ?? v.lead_id}
                            nome={v.lead?.nome}
                            telefone={v.lead?.telefone}
                          />
                        </TableCell>
                        {canSeeAll && (
                          <TableCell className="truncate max-w-[160px]">
                            {corretorNome(v.corretor_id, nomesQ.data)}
                          </TableCell>
                        )}
                        <TableCell className="truncate max-w-[180px]">{nomeProjeto(v)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtBRL(Number(v.valor_venda) || 0)}
                        </TableCell>
                        <TableCell
                          className="truncate max-w-[240px] text-xs text-muted-foreground"
                          title={v.motivo_distrato ?? undefined}
                        >
                          {v.motivo_distrato || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <NotaTeto
                  mostrando={distratos.length}
                  total={distratosQ.data?.total ?? distratos.length}
                />
              </div>
            )}
          </AsyncBoundary>
        </CardContent>
      </Card>
    </div>
  );
}

/** Vendas (barras) e VGV (linha) por mês — tendência de resultado. */
export function EvolucaoMensalChart({ data }: { data: VendasMes[] }) {
  const formatted = data.map((d) => ({
    ...d,
    label: format(parseISO(d.mes), "MMM/yy", { locale: ptBR }),
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={formatted} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="vendas" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis
          yAxisId="vgv"
          orientation="right"
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) =>
            v.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 })
          }
        />
        <Tooltip
          formatter={(value: number, name: string) =>
            name === "VGV"
              ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
              : value
          }
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          yAxisId="vendas"
          dataKey="vendas"
          name="Vendas"
          fill="var(--chart-2)"
          radius={[4, 4, 0, 0]}
        />
        <Line
          yAxisId="vgv"
          type="monotone"
          dataKey="vgv"
          name="VGV"
          stroke="var(--success)"
          strokeWidth={2}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
