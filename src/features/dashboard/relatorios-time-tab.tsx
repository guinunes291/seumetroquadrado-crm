// Sub-aba TIME dos Relatórios (gestor): ranking com R$ (VGV e ticket por
// corretor), tempo de 1ª resposta, comissões do período por beneficiário e a
// cobrança de follow-up — leads esquecidos por corretor, com os casos mais
// antigos nominais.

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlarmClock, ArrowRight, HandCoins, Timer, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AsyncBoundary } from "@/components/ui/async-boundary";
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
import { useDashboardPorCorretor, useTempoPrimeiraResposta } from "@/features/dashboard/queries";
import {
  comissoesPorBeneficiario,
  esquecidosPorCorretor,
  ticketMedio,
  vgvPorCorretor,
} from "@/features/dashboard/relatorios-derive";
import {
  useComissoesPeriodo,
  useCorretorNomes,
  useLeadsEsquecidos,
} from "@/features/dashboard/relatorios-nominais";
import {
  corretorNome,
  fmtBRL,
  fmtBRLCompacto,
  LeadCell,
  NotaTeto,
  VazioPeriodo,
} from "@/features/dashboard/relatorios-partes";
import { useVendasNominais } from "@/features/dashboard/relatorios-nominais";
import { formatDuration } from "@/lib/duracao";
import { tipoLabel } from "@/lib/comissoes";
import { leadStatusLabel } from "@/lib/leads";
import { ExportarPdfButton } from "@/features/dashboard/exportar-pdf-button";
import type { DocumentoRelatorio } from "@/features/dashboard/relatorios-pdf";

type RelatoriosPdf = typeof import("@/features/dashboard/relatorios-pdf");

type Range = { di: string | null; df: string | null };

const haQuanto = (iso: string) =>
  formatDistanceToNowStrict(parseISO(iso), { locale: ptBR, addSuffix: true });

export function RelatoriosTimeTab({ range }: { range: Range }) {
  const rankingQ = useDashboardPorCorretor(range);
  const vendasQ = useVendasNominais(range, null);
  const tempoQ = useTempoPrimeiraResposta(range);
  const comissoesQ = useComissoesPeriodo(range);
  const nomesQ = useCorretorNomes();

  const [diasEsquecido, setDiasEsquecido] = useState(7);
  const esquecidosQ = useLeadsEsquecidos(diasEsquecido, null);

  const porCorretorVgv = useMemo(
    () => vgvPorCorretor(vendasQ.data?.rows ?? []),
    [vendasQ.data?.rows],
  );
  const beneficiarios = useMemo(
    () => comissoesPorBeneficiario(comissoesQ.data ?? []),
    [comissoesQ.data],
  );
  const esquecidosGrupo = useMemo(
    () => esquecidosPorCorretor(esquecidosQ.data?.rows ?? []),
    [esquecidosQ.data?.rows],
  );

  const montarPdf = (pdf: RelatoriosPdf): DocumentoRelatorio => ({
    titulo: "Relatório do Time",
    periodo: pdf.periodoLabelPdf(range),
    blocos: [
      {
        titulo: "Ranking por corretor",
        html: pdf.tabelaPdf(
          [
            "#",
            "Corretor",
            "Leads",
            "Ag.",
            "Visitas",
            "Análise",
            "Fechados",
            "VGV",
            "Ticket",
            "Conv.",
          ],
          (rankingQ.data ?? []).map((r, i) => {
            const extra = porCorretorVgv.get(r.corretor_id);
            const ticket = extra ? ticketMedio(extra.vgv, extra.vendas) : null;
            return [
              `${i + 1}º`,
              r.nome,
              r.leads,
              r.agendamentos,
              r.visitas,
              r.analise,
              r.fechados,
              extra ? fmtBRLCompacto(extra.vgv) : "—",
              ticket === null ? "—" : fmtBRLCompacto(ticket),
              `${r.conversao}%`,
            ];
          }),
          { direita: [2, 3, 4, 5, 6, 7, 8, 9] },
        ),
      },
      {
        titulo: "Tempo de 1ª resposta",
        html: pdf.tabelaPdf(
          ["Corretor", "Leads", "Respondidos", "Média", "Mediana"],
          (tempoQ.data ?? [])
            .slice()
            .sort((a, b) => (a.tempo_mediana_min ?? 1e9) - (b.tempo_mediana_min ?? 1e9))
            .map((r) => [
              corretorNome(r.corretor_id, nomesQ.data),
              r.leads_no_periodo,
              r.leads_respondidos,
              r.tempo_medio_min === null ? "—" : formatDuration(r.tempo_medio_min),
              r.tempo_mediana_min === null ? "—" : formatDuration(r.tempo_mediana_min),
            ]),
          { direita: [1, 2, 3, 4] },
        ),
      },
      {
        titulo: "Comissões do período",
        sub: "líquido por beneficiário; canceladas fora",
        html: pdf.tabelaPdf(
          ["Beneficiário", "Papel", "Pendente", "Paga", "Total"],
          beneficiarios.map((b) => [
            b.nome,
            b.tipos.map((t) => tipoLabel(t)).join(" · "),
            b.pendente > 0 ? fmtBRL(b.pendente) : "—",
            b.paga > 0 ? fmtBRL(b.paga) : "—",
            fmtBRL(b.total),
          ]),
          { direita: [2, 3, 4] },
        ),
      },
      {
        titulo: `Leads esquecidos (sem atividade há ${diasEsquecido}+ dias)`,
        html: pdf.tabelaPdf(
          ["Corretor", "Leads parados", "Mais antigo"],
          esquecidosGrupo.map((g) => [
            corretorNome(g.corretor_id, nomesQ.data),
            g.total,
            haQuanto(g.maisAntigo),
          ]),
          { direita: [1] },
        ),
      },
      {
        titulo: "Os 10 esquecidos mais antigos",
        html: pdf.tabelaPdf(
          ["Cliente", "Corretor", "Etapa", "Parado"],
          (esquecidosQ.data?.rows ?? [])
            .slice(0, 10)
            .map((l) => [
              l.nome,
              corretorNome(l.corretor_id, nomesQ.data),
              leadStatusLabel(l.status),
              haQuanto(l.ultima_atividade_em),
            ]),
        ),
      },
    ],
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ExportarPdfButton
          montar={montarPdf}
          disabled={rankingQ.isLoading || vendasQ.isLoading || esquecidosQ.isLoading}
        />
      </div>
      {/* Ranking com R$ — quem vende e quanto vale o que vende */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4" /> Ranking por corretor
            <Link
              to="/painel-gestor"
              search={{ tab: "time" }}
              className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-primary hover:underline"
            >
              performance completa <ArrowRight className="h-3 w-3" />
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AsyncBoundary
            isLoading={rankingQ.isLoading || vendasQ.isLoading}
            isError={rankingQ.isError}
            error={rankingQ.error}
            errorTitle="Não foi possível carregar o ranking."
            onRetry={() => rankingQ.refetch()}
            loadingFallback={<Skeleton className="h-40 w-full" />}
          >
            {(rankingQ.data?.length ?? 0) === 0 ? (
              <VazioPeriodo />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Corretor</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                      <TableHead className="text-right">Ag.</TableHead>
                      <TableHead className="text-right">Visitas</TableHead>
                      <TableHead className="text-right">Análise</TableHead>
                      <TableHead className="text-right">Fechados</TableHead>
                      <TableHead className="text-right">VGV</TableHead>
                      <TableHead className="text-right">Ticket</TableHead>
                      <TableHead className="text-right">Conv.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(rankingQ.data ?? []).map((r, i) => {
                      const extra = porCorretorVgv.get(r.corretor_id);
                      const ticket = extra ? ticketMedio(extra.vgv, extra.vendas) : null;
                      return (
                        <TableRow key={r.corretor_id}>
                          <TableCell className="text-muted-foreground">{i + 1}º</TableCell>
                          <TableCell className="font-medium truncate max-w-[220px]">
                            {r.nome}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{r.leads}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.agendamentos}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{r.visitas}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.analise}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold text-emerald-600">
                            {r.fechados}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {extra ? fmtBRLCompacto(extra.vgv) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {ticket === null ? "—" : fmtBRLCompacto(ticket)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={r.conversao >= 5 ? "default" : "secondary"}>
                              {r.conversao}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </AsyncBoundary>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Tempo de 1ª resposta */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Timer className="h-4 w-4" /> Tempo de 1ª resposta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AsyncBoundary
              isLoading={tempoQ.isLoading}
              isError={tempoQ.isError}
              error={tempoQ.error}
              errorTitle="Não foi possível carregar o tempo de resposta."
              onRetry={() => tempoQ.refetch()}
              loadingFallback={<Skeleton className="h-40 w-full" />}
            >
              {(tempoQ.data?.length ?? 0) === 0 ? (
                <VazioPeriodo>
                  Sem dado de primeira resposta neste período (depende do registro de interações).
                </VazioPeriodo>
              ) : (
                <div className="overflow-x-auto max-h-[320px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Corretor</TableHead>
                        <TableHead className="text-right">Leads</TableHead>
                        <TableHead className="text-right">Respondidos</TableHead>
                        <TableHead className="text-right">Média</TableHead>
                        <TableHead className="text-right">Mediana</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(tempoQ.data ?? [])
                        .slice()
                        .sort((a, b) => (a.tempo_mediana_min ?? 1e9) - (b.tempo_mediana_min ?? 1e9))
                        .map((r) => (
                          <TableRow key={r.corretor_id}>
                            <TableCell className="font-medium truncate max-w-[180px]">
                              {corretorNome(r.corretor_id, nomesQ.data)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.leads_no_periodo}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.leads_respondidos}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.tempo_medio_min === null ? "—" : formatDuration(r.tempo_medio_min)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.tempo_mediana_min === null
                                ? "—"
                                : formatDuration(r.tempo_mediana_min)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </AsyncBoundary>
          </CardContent>
        </Card>

        {/* Comissões do período */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <HandCoins className="h-4 w-4" /> Comissões do período
              <Link
                to="/comissoes"
                className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-primary hover:underline"
              >
                gestão completa <ArrowRight className="h-3 w-3" />
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AsyncBoundary
              isLoading={comissoesQ.isLoading}
              isError={comissoesQ.isError}
              error={comissoesQ.error}
              errorTitle="Não foi possível carregar as comissões."
              onRetry={() => comissoesQ.refetch()}
              loadingFallback={<Skeleton className="h-40 w-full" />}
            >
              {beneficiarios.length === 0 ? (
                <VazioPeriodo>Sem comissões de vendas assinadas neste período.</VazioPeriodo>
              ) : (
                <div className="overflow-x-auto max-h-[320px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Beneficiário</TableHead>
                        <TableHead>Papel</TableHead>
                        <TableHead className="text-right">Pendente</TableHead>
                        <TableHead className="text-right">Paga</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {beneficiarios.map((b) => (
                        <TableRow key={b.chave}>
                          <TableCell className="font-medium truncate max-w-[180px]">
                            {b.nome}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {b.tipos.map((t) => tipoLabel(t)).join(" · ")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {b.pendente > 0 ? fmtBRL(b.pendente) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-600">
                            {b.paga > 0 ? fmtBRL(b.paga) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            {fmtBRL(b.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Valores líquidos das comissões de vendas assinadas no período (canceladas fora).
                  </p>
                </div>
              )}
            </AsyncBoundary>
          </CardContent>
        </Card>
      </div>

      {/* Leads esquecidos — cobrança de follow-up */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlarmClock className="h-4 w-4" /> Leads esquecidos
            <div className="ml-auto">
              <Select
                value={String(diasEsquecido)}
                onValueChange={(v) => setDiasEsquecido(Number(v))}
              >
                <SelectTrigger className="h-8 w-[190px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">Sem atividade há 3+ dias</SelectItem>
                  <SelectItem value="7">Sem atividade há 7+ dias</SelectItem>
                  <SelectItem value="15">Sem atividade há 15+ dias</SelectItem>
                  <SelectItem value="30">Sem atividade há 30+ dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AsyncBoundary
            isLoading={esquecidosQ.isLoading}
            isError={esquecidosQ.isError}
            error={esquecidosQ.error}
            errorTitle="Não foi possível carregar os leads esquecidos."
            onRetry={() => esquecidosQ.refetch()}
            loadingFallback={<Skeleton className="h-40 w-full" />}
          >
            {(esquecidosQ.data?.rows.length ?? 0) === 0 ? (
              <VazioPeriodo>
                Nenhum lead ativo sem atividade há {diasEsquecido}+ dias. Carteira em dia.
              </VazioPeriodo>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                    Por corretor
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Corretor</TableHead>
                        <TableHead className="text-right">Leads parados</TableHead>
                        <TableHead>Mais antigo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {esquecidosGrupo.map((g) => (
                        <TableRow key={g.corretor_id}>
                          <TableCell className="font-medium truncate max-w-[180px]">
                            {corretorNome(g.corretor_id, nomesQ.data)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{g.total}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {haQuanto(g.maisAntigo)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                    Os 10 mais antigos
                  </p>
                  <ul className="divide-y">
                    {(esquecidosQ.data?.rows ?? []).slice(0, 10).map((l) => (
                      <li key={l.id} className="flex items-center gap-3 py-2">
                        <div className="flex-1 min-w-0">
                          <LeadCell leadId={l.id} nome={l.nome} telefone={l.telefone} />
                          <div className="text-xs text-muted-foreground">
                            {corretorNome(l.corretor_id, nomesQ.data)} · {leadStatusLabel(l.status)}
                          </div>
                        </div>
                        <Badge variant="destructive">{haQuanto(l.ultima_atividade_em)}</Badge>
                      </li>
                    ))}
                  </ul>
                  <NotaTeto
                    mostrando={esquecidosQ.data?.rows.length ?? 0}
                    total={esquecidosQ.data?.total ?? 0}
                  />
                </div>
              </div>
            )}
          </AsyncBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
