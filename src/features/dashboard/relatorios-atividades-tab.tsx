// Sub-aba ATIVIDADES dos Relatórios: agendamentos, visitas, análises de
// crédito (todas as situações) e perdidos — SEMPRE com o nome do cliente e o
// corretor responsável, com link direto para a ficha do lead.

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, Eye, FileCheck, RefreshCw, XCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
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
import { useDashboardRedistribuicoes } from "@/features/dashboard/queries";
import {
  useAgendamentosNominais,
  useAnalisesNominais,
  useCorretorNomes,
  usePerdidosNominais,
  useVisitasNominais,
} from "@/features/dashboard/relatorios-nominais";
import {
  corretorNome,
  dataCurta,
  dataHora,
  LeadCell,
  NotaTeto,
  VazioPeriodo,
} from "@/features/dashboard/relatorios-partes";
import { ANALISE_STATUS_LABEL, type AnaliseStatus } from "@/features/leads/analise-credito";
import { motivoPerdaLabel } from "@/lib/leads";
import { ExportarPdfButton } from "@/features/dashboard/exportar-pdf-button";
import type { DocumentoRelatorio } from "@/features/dashboard/relatorios-pdf";

type RelatoriosPdf = typeof import("@/features/dashboard/relatorios-pdf");

type Range = { di: string | null; df: string | null };

const AGENDAMENTO_STATUS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  agendado: { label: "Agendado", variant: "outline" },
  confirmado: { label: "Confirmado", variant: "secondary" },
  realizado: { label: "Realizado", variant: "default" },
  cancelado: { label: "Cancelado", variant: "destructive" },
  nao_compareceu: { label: "Não compareceu", variant: "destructive" },
  remarcado: { label: "Remarcado", variant: "outline" },
};

const AGENDAMENTO_TIPO: Record<string, string> = {
  visita: "Visita",
  reuniao: "Reunião",
  ligacao: "Ligação",
  follow_up: "Follow-up",
  outro: "Outro",
};

const ANALISE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  aprovada: "default",
  aprovada_condicionada: "secondary",
  reprovada: "destructive",
  enviada: "outline",
  pendente: "outline",
};

function StatusAgendamento({ status }: { status: string }) {
  const cfg = AGENDAMENTO_STATUS[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

export function RelatoriosAtividadesTab({
  range,
  scope,
  canSeeAll,
}: {
  range: Range;
  scope: string | null;
  canSeeAll: boolean;
}) {
  const agendamentosQ = useAgendamentosNominais(range, scope);
  const visitasQ = useVisitasNominais(range, scope);
  const analisesQ = useAnalisesNominais(range, scope);
  const perdidosQ = usePerdidosNominais(range, scope);
  const redistQ = useDashboardRedistribuicoes(range, canSeeAll);
  const nomesQ = useCorretorNomes(canSeeAll);

  const [analiseFiltro, setAnaliseFiltro] = useState<string>("todas");
  const analises = analisesQ.data?.rows ?? [];
  const analisesFiltradas = useMemo(
    () =>
      analiseFiltro === "todas" ? analises : analises.filter((a) => a.status === analiseFiltro),
    [analises, analiseFiltro],
  );

  const montarPdf = (pdf: RelatoriosPdf): DocumentoRelatorio => {
    const corretorDe = (id: string | null) => (canSeeAll ? [corretorNome(id, nomesQ.data)] : []);
    const colCorretor = canSeeAll ? ["Corretor"] : [];
    const statusDe = (s: string) => AGENDAMENTO_STATUS[s]?.label ?? s;
    return {
      titulo: "Relatório de Atividades",
      periodo: pdf.periodoLabelPdf(range),
      blocos: [
        {
          titulo: "Agendamentos criados",
          sub: `${(agendamentosQ.data?.total ?? 0).toLocaleString("pt-BR")} no período`,
          html: pdf.tabelaPdf(
            ["Cliente", ...colCorretor, "Para quando", "Tipo", "Status"],
            (agendamentosQ.data?.rows ?? []).map((a) => [
              a.lead?.nome ?? "—",
              ...corretorDe(a.corretor_id),
              dataHora(a.data_inicio),
              AGENDAMENTO_TIPO[a.tipo] ?? a.tipo,
              statusDe(a.status),
            ]),
          ),
        },
        {
          titulo: "Visitas do período",
          sub: `${(visitasQ.data?.total ?? 0).toLocaleString("pt-BR")} marcadas, pelo dia da visita`,
          html: pdf.tabelaPdf(
            ["Dia da visita", "Cliente", ...colCorretor, "Status"],
            (visitasQ.data?.rows ?? []).map((a) => [
              dataHora(a.data_inicio),
              a.lead?.nome ?? "—",
              ...corretorDe(a.corretor_id),
              statusDe(a.status),
            ]),
          ),
        },
        {
          titulo: "Análises de crédito",
          sub:
            analiseFiltro === "todas"
              ? "todas as situações"
              : (ANALISE_STATUS_LABEL[analiseFiltro as AnaliseStatus] ?? analiseFiltro),
          html: pdf.tabelaPdf(
            ["Atualizada em", "Cliente", ...colCorretor, "Situação", "Observações"],
            analisesFiltradas.map((a) => [
              dataCurta(a.updated_at),
              a.lead?.nome ?? "—",
              ...corretorDe(a.corretor_id),
              ANALISE_STATUS_LABEL[a.status as AnaliseStatus] ?? a.status,
              a.observacoes || "—",
            ]),
          ),
        },
        {
          titulo: "Perdidos do período",
          sub: `${(perdidosQ.data?.total ?? 0).toLocaleString("pt-BR")} leads, pela data da perda`,
          html: pdf.tabelaPdf(
            ["Quando", "Cliente", ...colCorretor, "Motivo", "Empreendimento"],
            (perdidosQ.data?.rows ?? []).map((l) => [
              dataCurta(l.data_perda),
              l.nome,
              ...corretorDe(l.corretor_id),
              motivoPerdaLabel(l.motivo_perda_categoria) ?? l.motivo_perdido ?? "—",
              l.projeto_nome ?? "—",
            ]),
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
          disabled={
            agendamentosQ.isLoading ||
            visitasQ.isLoading ||
            analisesQ.isLoading ||
            perdidosQ.isLoading
          }
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Agendamentos criados no período */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Agendamentos criados
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {agendamentosQ.data
                  ? `${agendamentosQ.data.total.toLocaleString("pt-BR")} no período`
                  : ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AsyncBoundary
              isLoading={agendamentosQ.isLoading}
              isError={agendamentosQ.isError}
              error={agendamentosQ.error}
              errorTitle="Não foi possível carregar os agendamentos."
              onRetry={() => agendamentosQ.refetch()}
              loadingFallback={<Skeleton className="h-48 w-full" />}
            >
              {(agendamentosQ.data?.rows.length ?? 0) === 0 ? (
                <VazioPeriodo>Nenhum agendamento criado no período.</VazioPeriodo>
              ) : (
                <div className="overflow-x-auto max-h-[360px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        {canSeeAll && <TableHead>Corretor</TableHead>}
                        <TableHead>Para quando</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(agendamentosQ.data?.rows ?? []).map((a) => (
                        <TableRow key={a.id}>
                          <TableCell>
                            <LeadCell
                              leadId={a.lead?.id ?? a.lead_id}
                              nome={a.lead?.nome}
                              telefone={a.lead?.telefone}
                            />
                          </TableCell>
                          {canSeeAll && (
                            <TableCell className="truncate max-w-[140px]">
                              {corretorNome(a.corretor_id, nomesQ.data)}
                            </TableCell>
                          )}
                          <TableCell className="whitespace-nowrap text-xs">
                            {dataHora(a.data_inicio)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {AGENDAMENTO_TIPO[a.tipo] ?? a.tipo}
                          </TableCell>
                          <TableCell>
                            <StatusAgendamento status={a.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <NotaTeto
                    mostrando={agendamentosQ.data?.rows.length ?? 0}
                    total={agendamentosQ.data?.total ?? 0}
                  />
                </div>
              )}
            </AsyncBoundary>
          </CardContent>
        </Card>

        {/* Visitas do período (pelo dia da visita) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4" /> Visitas do período
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {visitasQ.data ? `${visitasQ.data.total.toLocaleString("pt-BR")} marcadas` : ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AsyncBoundary
              isLoading={visitasQ.isLoading}
              isError={visitasQ.isError}
              error={visitasQ.error}
              errorTitle="Não foi possível carregar as visitas."
              onRetry={() => visitasQ.refetch()}
              loadingFallback={<Skeleton className="h-48 w-full" />}
            >
              {(visitasQ.data?.rows.length ?? 0) === 0 ? (
                <VazioPeriodo>Nenhuma visita marcada para o período.</VazioPeriodo>
              ) : (
                <div className="overflow-x-auto max-h-[360px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dia da visita</TableHead>
                        <TableHead>Cliente</TableHead>
                        {canSeeAll && <TableHead>Corretor</TableHead>}
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(visitasQ.data?.rows ?? []).map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {dataHora(a.data_inicio)}
                          </TableCell>
                          <TableCell>
                            <LeadCell
                              leadId={a.lead?.id ?? a.lead_id}
                              nome={a.lead?.nome}
                              telefone={a.lead?.telefone}
                            />
                          </TableCell>
                          {canSeeAll && (
                            <TableCell className="truncate max-w-[140px]">
                              {corretorNome(a.corretor_id, nomesQ.data)}
                            </TableCell>
                          )}
                          <TableCell>
                            <StatusAgendamento status={a.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <NotaTeto
                    mostrando={visitasQ.data?.rows.length ?? 0}
                    total={visitasQ.data?.total ?? 0}
                  />
                </div>
              )}
            </AsyncBoundary>
          </CardContent>
        </Card>
      </div>

      {/* Análises de crédito — todas as situações */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileCheck className="h-4 w-4" /> Análises de crédito
            <div className="ml-auto">
              <Select value={analiseFiltro} onValueChange={setAnaliseFiltro}>
                <SelectTrigger className="h-8 w-[210px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as situações</SelectItem>
                  {(Object.keys(ANALISE_STATUS_LABEL) as AnaliseStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {ANALISE_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AsyncBoundary
            isLoading={analisesQ.isLoading}
            isError={analisesQ.isError}
            error={analisesQ.error}
            errorTitle="Não foi possível carregar as análises."
            onRetry={() => analisesQ.refetch()}
            loadingFallback={<Skeleton className="h-40 w-full" />}
          >
            {analisesFiltradas.length === 0 ? (
              <VazioPeriodo>Nenhuma análise movimentada no período.</VazioPeriodo>
            ) : (
              <div className="overflow-x-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Atualizada em</TableHead>
                      <TableHead>Cliente</TableHead>
                      {canSeeAll && <TableHead>Corretor</TableHead>}
                      <TableHead>Situação</TableHead>
                      <TableHead>Observações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analisesFiltradas.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {dataCurta(a.updated_at)}
                        </TableCell>
                        <TableCell>
                          <LeadCell
                            leadId={a.lead?.id ?? a.lead_id}
                            nome={a.lead?.nome}
                            telefone={a.lead?.telefone}
                          />
                        </TableCell>
                        {canSeeAll && (
                          <TableCell className="truncate max-w-[140px]">
                            {corretorNome(a.corretor_id, nomesQ.data)}
                          </TableCell>
                        )}
                        <TableCell>
                          <Badge variant={ANALISE_VARIANT[a.status] ?? "outline"}>
                            {ANALISE_STATUS_LABEL[a.status as AnaliseStatus] ?? a.status}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className="truncate max-w-[260px] text-xs text-muted-foreground"
                          title={a.observacoes ?? undefined}
                        >
                          {a.observacoes || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <NotaTeto mostrando={analises.length} total={analisesQ.data?.total ?? 0} />
              </div>
            )}
          </AsyncBoundary>
        </CardContent>
      </Card>

      {/* Perdidos do período, com motivo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <XCircle className="h-4 w-4" /> Perdidos do período
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {perdidosQ.data ? `${perdidosQ.data.total.toLocaleString("pt-BR")} leads` : ""}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AsyncBoundary
            isLoading={perdidosQ.isLoading}
            isError={perdidosQ.isError}
            error={perdidosQ.error}
            errorTitle="Não foi possível carregar os perdidos."
            onRetry={() => perdidosQ.refetch()}
            loadingFallback={<Skeleton className="h-40 w-full" />}
          >
            {(perdidosQ.data?.rows.length ?? 0) === 0 ? (
              <VazioPeriodo>Nenhum lead perdido no período.</VazioPeriodo>
            ) : (
              <div className="overflow-x-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Cliente</TableHead>
                      {canSeeAll && <TableHead>Corretor</TableHead>}
                      <TableHead>Motivo</TableHead>
                      <TableHead>Empreendimento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(perdidosQ.data?.rows ?? []).map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {dataCurta(l.data_perda)}
                        </TableCell>
                        <TableCell>
                          <LeadCell leadId={l.id} nome={l.nome} telefone={l.telefone} />
                        </TableCell>
                        {canSeeAll && (
                          <TableCell className="truncate max-w-[140px]">
                            {corretorNome(l.corretor_id, nomesQ.data)}
                          </TableCell>
                        )}
                        <TableCell className="text-xs">
                          {motivoPerdaLabel(l.motivo_perda_categoria) ?? l.motivo_perdido ?? "—"}
                        </TableCell>
                        <TableCell className="truncate max-w-[160px] text-xs text-muted-foreground">
                          {l.projeto_nome ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <NotaTeto
                  mostrando={perdidosQ.data?.rows.length ?? 0}
                  total={perdidosQ.data?.total ?? 0}
                />
              </div>
            )}
          </AsyncBoundary>
        </CardContent>
      </Card>

      {/* Redistribuições (operacional — antes vivia no fim do Resumo) */}
      {canSeeAll && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="h-4 w-4" /> Redistribuições recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AsyncBoundary
              isLoading={redistQ.isLoading}
              isError={redistQ.isError}
              error={redistQ.error}
              errorTitle="Não foi possível carregar as redistribuições."
              onRetry={() => redistQ.refetch()}
              loadingFallback={<Skeleton className="h-40 w-full" />}
            >
              <RedistTable rows={redistQ.data ?? []} />
            </AsyncBoundary>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const REDIST_TIPO_LABEL: Record<string, string> = {
  automatica: "Automática",
  manual: "Manual",
  redistribuicao: "Redistribuição",
};

function RedistTable({
  rows,
}: {
  rows: Array<{
    quando: string;
    lead_id: string;
    lead_nome: string;
    corretor_nome: string;
    tipo: string;
    motivo: string;
  }>;
}) {
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">Sem redistribuições no período.</p>;
  return (
    <div className="overflow-x-auto max-h-[280px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quando</TableHead>
            <TableHead>Lead</TableHead>
            <TableHead>Corretor</TableHead>
            <TableHead>Tipo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(0, 30).map((r, i) => (
            <TableRow key={`${r.lead_id}-${i}`}>
              <TableCell className="text-xs whitespace-nowrap">
                {format(parseISO(r.quando), "dd/MM HH:mm", { locale: ptBR })}
              </TableCell>
              <TableCell className="font-medium truncate max-w-[200px]">
                <Link
                  to="/leads/$leadId"
                  params={{ leadId: r.lead_id }}
                  className="hover:underline"
                >
                  {r.lead_nome ?? "—"}
                </Link>
              </TableCell>
              <TableCell className="truncate max-w-[160px]">{r.corretor_nome}</TableCell>
              <TableCell>
                <Badge variant="outline">{REDIST_TIPO_LABEL[r.tipo] ?? r.tipo}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
