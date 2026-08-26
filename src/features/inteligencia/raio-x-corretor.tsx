// Raio-X do Corretor — relatório individual de 1 página (aba Time do hub de
// Gestão). É a página da reunião 1:1: resultado vs. time, onde o funil DELE
// trava, evolução 6 meses/trimestral, carteira e exceções de hoje, perdas e
// comissões. Zero SQL novo: compõe as RPCs da camada de gestão.

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  FileText,
  GraduationCap,
  Info,
  Loader2,
  Rocket,
  Table2,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/ui/sparkline";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePainelDia } from "@/features/gestao/painel-dia/use-painel-dia";
import { TIPO_META } from "@/features/gestao/painel-dia/derive";
import { usePacing } from "@/features/metas/pacing-panel";
import { projecaoLinear, semaforo } from "@/features/metas/pacing";
import { useAuth } from "@/hooks/use-auth";
import { exportSheetsXlsx } from "@/lib/spreadsheets";
import { formatDuration } from "@/lib/duracao";
import { dateKey } from "@/lib/periodo";
import { leadStatusLabel, MOTIVO_PERDA_LABEL } from "@/lib/leads";
import { cn } from "@/lib/utils";
import { AtualizadoEm } from "./atualizado-em";
import { agregarCoortes, coorteSemDado } from "./funil-derive";
import { SINAL_LABEL, mediasDoTime, sinalizar } from "./performance-derive";
import {
  EsforcoMensalChart,
  fmtBRL,
  ResultadoMensalChart,
  SeletorPeriodo,
  TabelaMensal,
  usePeriodoRaioX,
} from "./raio-x-blocos";
import {
  compararComTime,
  evolucaoTrimestral,
  filtrarSerieJanela,
  funilLadoALado,
  raioXParaSheets,
  resumoComissoes,
  type ComissaoRow,
} from "./raio-x-derive";
import { montarRelatorioRaioX, type RaioXRelatorioInput } from "./raio-x-relatorio";
import {
  useCoberturaMinima,
  useFunilCoorte,
  useFunilSnapshot,
  useMotivosPerdaGestao,
  usePerformanceCorretores,
  usePerformanceDrill,
  usePerformanceJanela,
} from "./queries";

export function RaioXCorretor({
  corretorId,
  onVoltar,
}: {
  corretorId: string;
  onVoltar: () => void;
}) {
  const hoje = new Date();
  // Mês/dia no calendário LOCAL: toISOString virava o mês em UTC às 21h de
  // Brasília no último dia do mês — o painel de performance consultava um
  // mês ainda inexistente e aparecia vazio.
  const mesAtual = dateKey(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  // Um único filtro de período rege TODAS as janelas de análise — inclusive
  // os KPIs do topo: presets 3/6/12 meses ou intervalo personalizado. O grão
  // da camada metrics é mensal, então datas valem pelos meses que as contêm.
  const periodo = usePeriodoRaioX();
  const { janelaAtual, labelJanela } = periodo;
  const filtrosDele = useMemo(
    () => ({ ...janelaAtual, corretor: corretorId }),
    [corretorId, janelaAtual],
  );
  const filtrosTime = janelaAtual;
  const mesesDrill = periodo.mesesJanela;

  const perfQ = usePerformanceCorretores(mesAtual);
  const perfJanelaQ = usePerformanceJanela(janelaAtual);
  const drillQ = usePerformanceDrill(corretorId, mesesDrill);
  const coorteDeleQ = useFunilCoorte(filtrosDele, null);
  const coorteTimeQ = useFunilCoorte(filtrosTime, null);
  const snapshotQ = useFunilSnapshot(corretorId);
  const excecoesQ = usePainelDia(true, corretorId);
  const perdasQ = useMotivosPerdaGestao(filtrosDele);
  const pacingQ = usePacing(hoje.getFullYear(), hoje.getMonth() + 1);
  const coberturaMin = useCoberturaMinima().data ?? 60;

  const comissoesQ = useQuery({
    queryKey: ["raiox:comissoes", corretorId, janelaAtual.de, janelaAtual.ate],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ComissaoRow[]> => {
      let q = supabase
        .from("comissoes")
        .select("status, valor_liquido, valor_comissao")
        .eq("beneficiario_id", corretorId)
        .gte("created_at", `${janelaAtual.de ?? "1900-01-01"}T00:00:00`);
      if (janelaAtual.ate) q = q.lte("created_at", `${janelaAtual.ate}T23:59:59.999`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ComissaoRow[];
    },
  });

  const time = perfQ.data?.rows ?? [];
  const corretor = time.find((r) => r.corretor_id === corretorId);
  const medias = useMemo(() => mediasDoTime(time), [time]);
  const sinal = corretor ? sinalizar(corretor, medias) : null;
  // KPIs do topo e comparações vs. time na JANELA selecionada (a identidade,
  // a carga e o sinal de gestão continuam sendo leituras do mês/agora).
  const timeJanela = perfJanelaQ.data?.rows ?? [];
  const corretorJanela = timeJanela.find((r) => r.corretor_id === corretorId);
  const comparacoes = useMemo(
    () => (corretorJanela ? compararComTime(corretorJanela, timeJanela) : []),
    [corretorJanela, timeJanela],
  );

  const coorteDele = useMemo(
    () => (coorteDeleQ.data ? agregarCoortes(coorteDeleQ.data) : null),
    [coorteDeleQ.data],
  );
  const coorteTime = useMemo(
    () => (coorteTimeQ.data ? agregarCoortes(coorteTimeQ.data) : null),
    [coorteTimeQ.data],
  );
  const funil = useMemo(() => funilLadoALado(coorteDele, coorteTime), [coorteDele, coorteTime]);
  const funilSemDado = coorteDele === null || coorteSemDado(coorteDele.cobertura_pct, coberturaMin);

  const serie = useMemo(
    () => filtrarSerieJanela(drillQ.data ?? [], janelaAtual.de, janelaAtual.ate),
    [drillQ.data, janelaAtual],
  );
  const trimestres = useMemo(() => evolucaoTrimestral(serie), [serie]);
  const comissoes = useMemo(() => resumoComissoes(comissoesQ.data ?? []), [comissoesQ.data]);

  const metaDele = pacingQ.data?.por_corretor.find((c) => c.corretor_id === corretorId);
  const du = pacingQ.data?.dias_uteis;
  const projVgv = metaDele && du ? projecaoLinear(metaDele.vgv, du.passados, du.total) : null;
  const farol = metaDele ? semaforo(projVgv, metaDele.meta_gmv) : "neutro";

  const { user } = useAuth();
  const [gerandoPdf, setGerandoPdf] = useState(false);

  /**
   * Insumo do relatório em PDF. Junta o que a tela já carregou — nada de query
   * extra na hora de exportar: o que o gestor vê é o que sai no papel.
   */
  const relatorioInput = (): RaioXRelatorioInput => ({
    nome: corretor?.nome ?? "Corretor",
    periodoLabel: labelJanela,
    de: janelaAtual.de,
    ate: janelaAtual.ate,
    geradoEm: new Date(),
    geradoPor:
      (user?.user_metadata?.full_name as string | undefined) ??
      (user?.user_metadata?.nome as string | undefined) ??
      user?.email ??
      null,
    presente: corretor?.presente ?? null,
    cargaAtiva: corretor?.carga_ativa ?? 0,
    capacidadePct: corretor?.capacidade_pct ?? null,
    sinal,
    comparacoes,
    funil,
    funilIndisponivel: funilSemDado,
    coorte: coorteDele,
    coberturaMinima: coberturaMin,
    serie,
    trimestres,
    carteira: (snapshotQ.data?.rows ?? []).map((r) => ({
      etapa: r.etapa,
      label: leadStatusLabel(r.etapa),
      quantidade: r.quantidade,
      parados: r.parados,
      vgv: r.vgv,
    })),
    excecoes: (excecoesQ.data?.excecoes ?? []).map((e) => ({
      tipo: e.tipo,
      tipoLabel: TIPO_META[e.tipo].label,
      leadNome: e.lead_nome,
    })),
    perdas: (perdasQ.data?.rows ?? []).map((p) => ({
      ...p,
      label: MOTIVO_PERDA_LABEL[p.categoria as keyof typeof MOTIVO_PERDA_LABEL] ?? p.categoria,
    })),
    comissoes,
    meta:
      metaDele && metaDele.meta_gmv > 0
        ? {
            metaVgv: metaDele.meta_gmv,
            metaVendas: metaDele.meta_vendas,
            realizadoVgv: metaDele.vgv,
            realizadoVendas: metaDele.vendas,
            projecaoVgv: projVgv,
            farol,
            diasUteis: du ?? null,
          }
        : null,
    atualizadoEm: corretor?.atualizado_em ?? null,
  });

  const exportarPdf = async () => {
    setGerandoPdf(true);
    try {
      const { imprimirRaioX } = await import("./raio-x-pdf");
      imprimirRaioX(montarRelatorioRaioX(relatorioInput()));
      toast.success("Relatório pronto — escolha “Salvar como PDF” na impressão.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar o PDF.");
    } finally {
      setGerandoPdf(false);
    }
  };

  const exportarPlanilha = async () => {
    try {
      await exportSheetsXlsx(
        `raio-x-${(corretor?.nome ?? "corretor").toLowerCase().replace(/\s+/g, "-")}`,
        [
          ...raioXParaSheets({
            nome: corretor?.nome ?? "Corretor",
            comparacoes,
            serie,
            funil,
            perdas: perdasQ.data?.rows ?? [],
          }),
        ],
      );
      toast.success("Raio-X exportado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar.");
    }
  };

  if (perfQ.isLoading) return <Skeleton className="h-96 w-full" />;
  if (!corretor) {
    return (
      <div className="space-y-3">
        <Button size="sm" variant="ghost" onClick={onVoltar}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Time
        </Button>
        <p className="text-sm text-muted-foreground">
          Corretor não encontrado no seu escopo (ou fora da equipe).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Barra de ações */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onVoltar}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Time
          </Button>
          {/* Filtro de período: rege KPIs, funil, evolução, perdas e comissões. */}
          <SeletorPeriodo periodo={periodo} />
        </div>
        <div className="flex items-center gap-2">
          <AtualizadoEm quando={corretor.atualizado_em} />
          <Button asChild size="sm" variant="outline">
            <Link to="/leads" search={{ corretor: corretorId }}>
              Ver leads
            </Link>
          </Button>
          {/* Ação principal = relatório em PDF (o material da 1:1). A planilha
              continua disponível para quem vai fatiar os números no Excel. */}
          <div className="inline-flex">
            <Button
              size="sm"
              className="rounded-r-none"
              onClick={exportarPdf}
              disabled={gerandoPdf}
            >
              {gerandoPdf ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-1 h-4 w-4" />
              )}
              Relatório PDF
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  className="rounded-l-none border-l border-primary-foreground/25 px-2"
                  aria-label="Outros formatos de exportação"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void exportarPdf()}>
                  <FileText className="mr-2 h-4 w-4" /> Relatório PDF (1:1)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void exportarPlanilha()}>
                  <Table2 className="mr-2 h-4 w-4" /> Planilha .xlsx (dados brutos)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* 1. Cabeçalho de resultado */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-display flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
          {corretor.nome
            .split(" ")
            .slice(0, 2)
            .map((p) => p[0])
            .join("")}
        </span>
        <div className="min-w-0">
          <h2 className="font-display truncate text-xl font-semibold">{corretor.nome}</h2>
          <p className="text-xs text-muted-foreground">
            {corretor.presente ? "presente hoje" : "ausente hoje"} · carga {corretor.carga_ativa}
            {corretor.capacidade_pct != null && ` (${corretor.capacidade_pct}% da capacidade)`}
            {metaDele && metaDele.meta_gmv > 0 && (
              <>
                {" · meta "}
                {fmtBRL(metaDele.meta_gmv)}{" "}
                <span
                  className={cn(
                    farol === "verde" && "text-success",
                    farol === "ambar" && "text-warning",
                    farol === "vermelho" && "text-destructive",
                  )}
                >
                  (
                  {farol === "verde"
                    ? "no ritmo"
                    : farol === "ambar"
                      ? "atenção"
                      : farol === "vermelho"
                        ? "risco"
                        : "sem base"}
                  )
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {perfJanelaQ.data?.degradado && (
        <p className="flex items-center gap-1 text-xs text-warning">
          <Info className="h-3 w-3 shrink-0" />
          Modo degradado: os números abaixo são do mês corrente — aplique a migration
          gestao_performance_corretores_janela para que respeitem o período.
        </p>
      )}
      {perfJanelaQ.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <StatGrid>
          {comparacoes
            .filter((c) =>
              ["vendas", "vgv", "visitas_realizadas", "primeira_resposta"].includes(c.chave),
            )
            .map((c) => {
              const acima =
                c.deltaPct !== null && (c.menorMelhor ? c.deltaPct < 0 : c.deltaPct > 0);
              return (
                <StatTile
                  key={c.chave}
                  title={c.label}
                  value={
                    c.chave === "vgv"
                      ? c.valor === null
                        ? "—"
                        : fmtBRL(c.valor)
                      : c.chave === "primeira_resposta"
                        ? formatDuration(c.valor)
                        : (c.valor ?? "—")
                  }
                  intent={c.deltaPct === null ? "neutral" : acima ? "success" : "warning"}
                  hint={
                    c.mediaTime === null ? (
                      "média do time: sem amostra"
                    ) : (
                      <span>
                        time:{" "}
                        {c.chave === "vgv"
                          ? fmtBRL(c.mediaTime)
                          : c.chave === "primeira_resposta"
                            ? formatDuration(c.mediaTime)
                            : Math.round(c.mediaTime * 10) / 10}
                        {c.deltaPct !== null && (
                          <span
                            className={cn(
                              "ml-1 font-medium",
                              acima ? "text-success" : "text-warning",
                            )}
                          >
                            ({c.deltaPct > 0 ? "+" : ""}
                            {c.deltaPct}%)
                          </span>
                        )}
                      </span>
                    )
                  }
                />
              );
            })}
        </StatGrid>
      )}

      {/* 2. Sinal de gestão */}
      <Card
        className={cn(
          sinal === "mentoria" && "border-warning/40 bg-warning/5",
          sinal === "dar_mais_lead" && "border-success/40 bg-success/5",
        )}
      >
        <CardContent className="flex items-center gap-3 p-3 text-sm">
          {sinal === "mentoria" ? (
            <GraduationCap className="h-4 w-4 shrink-0 text-warning" />
          ) : sinal === "dar_mais_lead" ? (
            <Rocket className="h-4 w-4 shrink-0 text-success" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span>
            {sinal
              ? SINAL_LABEL[sinal]
              : "Dentro do padrão do time no mês (esforço e conversão na média)."}
            <span className="ml-1 text-xs text-muted-foreground">
              — {corretor.contatos} contatos · {corretor.vendas} vendas em{" "}
              {corretor.leads_recebidos} leads
            </span>
          </span>
        </CardContent>
      </Card>

      {/* 3. Funil dele × time */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Onde o funil dele trava ({labelJanela}, coorte)
            <AtualizadoEm quando={coorteDeleQ.data?.[0]?.atualizado_em} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {coorteDeleQ.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : funilSemDado ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4 shrink-0" />
              Sem dado suficiente: cobertura de histórico abaixo de {coberturaMin}% na janela (ou
              camada metrics não aplicada) — as taxas seriam enganosas.
            </p>
          ) : (
            <>
              <div className="mb-4 h-[220px]">
                <FunilComparadoChart data={funil} nome={corretor.nome.split(" ")[0]} />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Etapa</TableHead>
                    <TableHead className="text-right">Ele(a)</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                    <TableHead className="text-right">Gap</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {funil.map((f) => (
                    <TableRow key={f.etapa}>
                      <TableCell className="font-medium">{f.etapa}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {f.minhaTaxa === null ? "—" : `${f.minhaTaxa}%`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {f.taxaTime === null ? "—" : `${f.taxaTime}%`}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular-nums",
                          f.gapPp !== null && f.gapPp < -5 && "text-destructive",
                          f.gapPp !== null && f.gapPp > 5 && "text-success",
                        )}
                      >
                        {f.gapPp === null ? "—" : `${f.gapPp > 0 ? "+" : ""}${f.gapPp} p.p.`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {/* 4. Evolução + trimestres */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Evolução ({labelJanela})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {drillQ.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : serie.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem histórico mensal (camada metrics não aplicada ou corretor sem atividade).
            </p>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="h-[220px]">
                  <ResultadoMensalChart serie={serie} />
                </div>
                <div className="h-[220px]">
                  <EsforcoMensalChart serie={serie} />
                </div>
              </div>
              <TabelaMensal serie={serie} />
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Sparkline data={serie.map((m) => m.vendas)} /> vendas
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Sparkline data={serie.map((m) => Number(m.vgv))} /> VGV
                </span>
                {trimestres.length > 1 && (
                  <span>
                    Trimestres:{" "}
                    {trimestres
                      .map((t) => `${t.trimestre}: ${t.vendas}v · ${fmtBRL(t.vgv)}`)
                      .join(" → ")}{" "}
                    <span className="opacity-70">(base do escalonamento de comissão)</span>
                  </span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 5. Carteira agora + exceções de hoje */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Carteira agora</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {snapshotQ.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (snapshotQ.data?.rows ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem leads ativos na carteira.</p>
            ) : (
              (snapshotQ.data?.rows ?? []).map((r) => {
                const max = Math.max(1, ...(snapshotQ.data?.rows ?? []).map((x) => x.quantidade));
                return (
                  <div key={r.etapa}>
                    <div className="mb-1 flex justify-between text-xs">
                      <Link
                        to="/leads"
                        search={{ status: r.etapa, corretor: corretorId }}
                        className="text-muted-foreground hover:underline"
                      >
                        {leadStatusLabel(r.etapa)}
                      </Link>
                      <span className="tabular-nums">
                        <span className="font-medium">{r.quantidade}</span>
                        {r.parados != null && r.parados > 0 && (
                          <span className="ml-2 text-destructive">{r.parados} parados</span>
                        )}
                      </span>
                    </div>
                    <div className="h-4 overflow-hidden rounded bg-muted">
                      <div
                        className="h-full bg-primary/70"
                        style={{ width: `${Math.max(3, Math.round((r.quantidade / max) * 100))}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" /> Exceções abertas hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            {excecoesQ.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (excecoesQ.data?.excecoes ?? []).length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-success" /> Nenhuma exceção agora.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {(excecoesQ.data?.excecoes ?? []).slice(0, 8).map((e) => (
                  <li key={`${e.tipo}:${e.lead_id}`} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="shrink-0 px-1.5 py-0 font-normal">
                      {TIPO_META[e.tipo].label}
                    </Badge>
                    <Link
                      to="/leads/$leadId"
                      params={{ leadId: e.lead_id }}
                      className="min-w-0 truncate hover:underline"
                    >
                      {e.lead_nome}
                    </Link>
                  </li>
                ))}
                {(excecoesQ.data?.excecoes ?? []).length > 8 && (
                  <li className="text-xs text-muted-foreground">
                    +{(excecoesQ.data?.excecoes ?? []).length - 8} — ver no Painel do Dia
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 6. Perdas dele + 7. Comissões */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Onde ele(a) mais perde ({labelJanela})</CardTitle>
          </CardHeader>
          <CardContent>
            {perdasQ.isLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : (perdasQ.data?.rows ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem perdas registradas na janela.</p>
            ) : (
              <div className="h-[220px]">
                <PerdasChart rows={(perdasQ.data?.rows ?? []).slice(0, 6)} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4" /> Comissões ({labelJanela})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {comissoesQ.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <span>
                  <span className="font-display text-2xl font-semibold tabular-nums text-success">
                    {fmtBRL(comissoes.pago)}
                  </span>
                  <span className="ml-1 text-xs text-muted-foreground">pagas</span>
                </span>
                <span>
                  <span className="font-display text-2xl font-semibold tabular-nums">
                    {fmtBRL(comissoes.aberto)}
                  </span>
                  <span className="ml-1 text-xs text-muted-foreground">em aberto</span>
                </span>
                <Link
                  to="/ranking"
                  search={{ tab: "comissoes" }}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  detalhe →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gráficos exclusivos da leitura de gestão (os de evolução mensal moraram
// aqui e mudaram para raio-x-blocos, onde o Meu Raio-X também os consome)
// ---------------------------------------------------------------------------

/** Funil comparado: taxa de passagem dele × time, por etapa. */
function FunilComparadoChart({
  data,
  nome,
}: {
  data: Array<{ etapa: string; minhaTaxa: number | null; taxaTime: number | null }>;
  nome: string;
}) {
  const rows = data.map((f) => ({
    etapa: f.etapa,
    corretor: f.minhaTaxa,
    time: f.taxaTime,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="etapa" tick={{ fontSize: 10 }} interval={0} />
        <YAxis tick={{ fontSize: 11 }} unit="%" />
        <Tooltip formatter={(value: number) => `${value}%`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="corretor" name={nome} fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="time" name="Média do time" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Perdas por categoria (barras horizontais; VGV estimado no tooltip). */
function PerdasChart({
  rows,
}: {
  rows: Array<{ categoria: string; quantidade: number; vgv_estimado: number | null }>;
}) {
  const data = rows.map((p) => ({
    categoria: MOTIVO_PERDA_LABEL[p.categoria as keyof typeof MOTIVO_PERDA_LABEL] ?? p.categoria,
    quantidade: p.quantidade,
    vgv: p.vgv_estimado != null ? Number(p.vgv_estimado) : null,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="categoria"
          tick={{ fontSize: 11 }}
          width={150}
          interval={0}
        />
        <Tooltip
          formatter={(
            value: number,
            _name: string,
            item: { payload?: { vgv?: number | null } },
          ) => {
            const vgv = item?.payload?.vgv;
            return vgv != null
              ? [
                  `${value} leads · ~${vgv.toLocaleString("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 })} (estimado)`,
                  "Perdas",
                ]
              : [`${value} leads`, "Perdas"];
          }}
        />
        <Bar dataKey="quantidade" fill="var(--chart-2)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
