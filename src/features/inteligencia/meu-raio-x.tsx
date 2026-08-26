// Meu Raio-X — o BI self-serve do corretor (home do sistema BI para quem não
// é gestão). Mesma régua do Raio-X do Corretor, só que com as fontes que o
// PRÓPRIO corretor pode ler: o drill mensal (self-clause: qualquer caller pede
// o próprio id), as RPCs dashboard_* (auto-escopo pelo caller) e a tabela
// comissoes (policy own-or-gestor). Os blocos de gestão — comparação com o
// time, coorte, exceções do dia e pacing de meta — ficam FORA: as RPCs
// gestao_* lançam 'forbidden' para corretor, e a comparação aqui é com o
// PRÓPRIO período anterior (compararComPeriodoAnterior).

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, FileText, Loader2, Table2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { useAuth } from "@/hooks/use-auth";
import { exportSheetsXlsx } from "@/lib/spreadsheets";
import { dateKey } from "@/lib/periodo";
import { LEAD_STATUS_ORDER, leadStatusLabel, motivoPerdaLabel } from "@/lib/leads";
import {
  EsforcoMensalChart,
  fmtBRL,
  ResultadoMensalChart,
  SeletorPeriodo,
  TabelaMensal,
  usePeriodoRaioX,
} from "./raio-x-blocos";
import {
  compararComPeriodoAnterior,
  evolucaoTrimestral,
  filtrarSerieJanela,
  mesesDesde,
  preencherMesesVazios,
  raioXParaSheets,
  resumoComissoes,
  type ComissaoRow,
} from "./raio-x-derive";
import { montarRelatorioRaioX, type RaioXRelatorioInput } from "./raio-x-relatorio";
import { usePerformanceDrill } from "./queries";
import { rpc } from "@/features/dashboard/queries";

type CarteiraRow = { etapa: string; ordem: number; quantidade: number };
type PerdaRow = { motivo: string; quantidade: number };

/** Etapas terminais não contam como carga ativa no relatório exportado. */
const ETAPAS_TERMINAIS = new Set(["contrato_fechado", "perdido", "pos_venda"]);

export function MeuRaioX({ corretorId }: { corretorId: string }) {
  const { user } = useAuth();
  const periodo = usePeriodoRaioX();
  const { janelaAtual, labelJanela } = periodo;
  const hojeIso = dateKey(new Date());

  // Meses-calendário DENTRO da janela — a base da comparação com o período
  // anterior de igual tamanho. Difere de mesesJanela quando o intervalo
  // personalizado termina antes de hoje (mesesJanela vai até now(), âncora
  // do drill).
  const mesesNaJanela =
    periodo.custom?.from && janelaAtual.de
      ? mesesDesde(janelaAtual.de, janelaAtual.ate ?? hojeIso)
      : periodo.meses;
  // O drill ancora em now(): busca a janela E a janela anterior (cap da MV).
  const mesesDrill = Math.min(24, periodo.mesesJanela + mesesNaJanela);

  const drillQ = usePerformanceDrill(corretorId, mesesDrill);
  const serie = useMemo(
    () => filtrarSerieJanela(drillQ.data ?? [], janelaAtual.de, janelaAtual.ate),
    [drillQ.data, janelaAtual],
  );
  // Sem o corte inferior: os meses ANTES da janela formam a base do "vs.
  // período anterior".
  const serieAteFimDaJanela = useMemo(
    () => filtrarSerieJanela(drillQ.data ?? [], null, janelaAtual.ate),
    [drillQ.data, janelaAtual],
  );
  const comparacao = useMemo(
    () =>
      // Mês sem atividade não vem na MV e o fatiamento é por contagem de
      // linhas: sem o preenchimento, o buraco deslocaria as janelas comparadas.
      compararComPeriodoAnterior(
        preencherMesesVazios(serieAteFimDaJanela, janelaAtual.ate ?? hojeIso),
        mesesNaJanela,
      ),
    [serieAteFimDaJanela, janelaAtual.ate, hojeIso, mesesNaJanela],
  );
  const trimestres = useMemo(() => evolucaoTrimestral(serie), [serie]);

  const carteiraQ = useQuery({
    queryKey: ["meu-raiox:carteira", corretorId],
    staleTime: 60_000,
    queryFn: async (): Promise<CarteiraRow[]> => {
      // dashboard_funil devolve macro-etapas CUMULATIVAS ("Novos", "Visitas"…),
      // não distribuição por status — os links /leads?status=… e a carga ativa
      // saíam errados. O mapa `pipeline` do dashboard_kpis é a foto atual por
      // status EM ABERTO, auto-escopada pelo caller no banco.
      const { data, error } = await rpc("dashboard_kpis", {
        _di: null,
        _df: null,
        _corretor: corretorId,
        _campo_data: "criacao",
      });
      if (error) throw error;
      const pipeline = (data as { pipeline?: Record<string, number> } | null)?.pipeline ?? {};
      return ["novo", ...LEAD_STATUS_ORDER]
        .filter((s) => (pipeline[s] ?? 0) > 0)
        .map((s, i) => ({ etapa: s, ordem: i + 1, quantidade: pipeline[s] ?? 0 }));
    },
  });
  const carteira = useMemo(
    () => [...(carteiraQ.data ?? [])].sort((a, b) => a.ordem - b.ordem),
    [carteiraQ.data],
  );

  const perdasQ = useQuery({
    queryKey: ["meu-raiox:perdas", corretorId, janelaAtual.de, janelaAtual.ate],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PerdaRow[]> => {
      const { data, error } = await rpc("dashboard_motivos_perda", {
        _di: janelaAtual.de,
        // _df é exclusivo no banco (`quando < _df`): meia-noite cortaria o
        // último dia do intervalo — mesma convenção das comissões abaixo.
        _df: janelaAtual.ate ? `${janelaAtual.ate}T23:59:59.999` : null,
        _corretor: corretorId,
        _campo_data: "criacao",
      });
      if (error) throw error;
      return (data ?? []) as PerdaRow[];
    },
  });
  const perdas = useMemo(
    () => [...(perdasQ.data ?? [])].sort((a, b) => b.quantidade - a.quantidade),
    [perdasQ.data],
  );

  const comissoesQ = useQuery({
    queryKey: ["meu-raiox:comissoes", corretorId, janelaAtual.de, janelaAtual.ate],
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
  const comissoes = useMemo(() => resumoComissoes(comissoesQ.data ?? []), [comissoesQ.data]);

  const nome =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.nome as string | undefined) ??
    user?.email ??
    "Corretor";

  const [gerandoPdf, setGerandoPdf] = useState(false);

  /**
   * Insumo do relatório: o que a tela já carregou, sem query extra na hora de
   * exportar. Os blocos gestão-only entram VAZIOS de propósito —
   * montarRelatorioRaioX tolera (verificado) e o documento sai só com a
   * leitura individual: totais, tendência, carteira, perdas e comissões.
   */
  const relatorioInput = (): RaioXRelatorioInput => ({
    nome,
    periodoLabel: labelJanela,
    de: janelaAtual.de,
    ate: janelaAtual.ate,
    geradoEm: new Date(),
    geradoPor: nome,
    incluiBlocosGestao: false,
    presente: null,
    cargaAtiva: carteira
      .filter((r) => !ETAPAS_TERMINAIS.has(r.etapa))
      .reduce((s, r) => s + r.quantidade, 0),
    capacidadePct: null,
    sinal: null,
    comparacoes: [],
    funil: [],
    funilIndisponivel: false,
    coorte: null,
    coberturaMinima: 60,
    serie,
    trimestres,
    carteira: carteira.map((r) => ({
      etapa: r.etapa,
      label: leadStatusLabel(r.etapa),
      quantidade: r.quantidade,
      parados: null,
      vgv: null,
    })),
    excecoes: [],
    perdas: perdas.map((p) => ({
      categoria: p.motivo,
      quantidade: p.quantidade,
      vgv_estimado: null,
      atualizado_em: null,
      label: motivoPerdaLabel(p.motivo) ?? p.motivo,
    })),
    comissoes,
    meta: null,
    atualizadoEm: drillQ.data?.[0]?.atualizado_em ?? null,
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
      // Reusa as abas neutras do export da gestão; a aba Resumo aqui compara
      // com o período anterior (não existe "média do time" no self-serve).
      const abasBase = raioXParaSheets({
        nome,
        comparacoes: [],
        serie,
        funil: [],
        perdas: perdas.map((p) => ({
          categoria: p.motivo,
          quantidade: p.quantidade,
          vgv_estimado: null,
        })),
      }).filter((s) => s.name === "Evolução mensal" || s.name === "Perdas");
      await exportSheetsXlsx(`meu-raio-x-${dateKey(new Date())}`, [
        {
          name: "Resumo",
          rows: [
            {
              Métrica: "Vendas",
              [`Janela (${labelJanela})`]: comparacao.atual.vendas,
              "Janela anterior": comparacao.anterior?.vendas ?? "sem base",
              "Δ %": comparacao.deltaVendasPct ?? "",
            },
            {
              Métrica: "VGV (R$)",
              [`Janela (${labelJanela})`]: comparacao.atual.vgv,
              "Janela anterior": comparacao.anterior?.vgv ?? "sem base",
              "Δ %": comparacao.deltaVgvPct ?? "",
            },
            {
              Métrica: "Visitas realizadas",
              [`Janela (${labelJanela})`]: comparacao.atual.visitas,
              "Janela anterior": comparacao.anterior?.visitas ?? "sem base",
              "Δ %": comparacao.deltaVisitasPct ?? "",
            },
          ],
        },
        ...abasBase,
      ]);
      toast.success("Meu Raio-X exportado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar.");
    }
  };

  const leadsJanela = serie.reduce((s, m) => s + m.leads_recebidos, 0);
  const maxCarteira = Math.max(1, ...carteira.map((x) => x.quantidade));

  /** Hint do KPI quando não dá para mostrar delta (sem base ou base zero). */
  const hintKpi = (anterior: number | undefined, fmt?: (n: number) => string) =>
    comparacao.anterior === null
      ? "sem período anterior completo para comparar"
      : `anterior: ${fmt ? fmt(anterior ?? 0) : (anterior ?? 0)} — base zero, sem %`;

  const deltaLabel = comparacao.anterior
    ? `vs. ${comparacao.anterior.meses} ${comparacao.anterior.meses === 1 ? "mês anterior" : "meses anteriores"}`
    : undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Meu Raio-X"
        description="Seus números na mesma régua do relatório da gestão: evolução, carteira, perdas e comissões."
        actions={
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
                  <FileText className="mr-2 h-4 w-4" /> Relatório PDF
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void exportarPlanilha()}>
                  <Table2 className="mr-2 h-4 w-4" /> Planilha .xlsx (dados brutos)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        {/* Filtro de período: rege KPIs, evolução, perdas e comissões. */}
        <SeletorPeriodo periodo={periodo} />
        {/* Meta/pacing é bloco de gestão — aqui só o caminho até ela. */}
        <p className="text-xs text-muted-foreground">
          Sua meta e o ritmo do mês vivem na{" "}
          <Link to="/hoje" className="underline underline-offset-2 hover:text-foreground">
            Central de Comando
          </Link>
          .
        </p>
      </div>

      {/* 1. KPIs da janela vs. o próprio período anterior */}
      <AsyncBoundary
        isLoading={drillQ.isLoading}
        isError={drillQ.isError}
        error={drillQ.error}
        errorTitle="Não foi possível carregar seus indicadores."
        onRetry={() => void drillQ.refetch()}
        loadingFallback={<Skeleton className="h-24 w-full" />}
      >
        {drillQ.data === null ? (
          <p className="text-sm text-muted-foreground">
            Sem histórico mensal (camada metrics não aplicada) — os indicadores aparecem quando a
            base estiver disponível.
          </p>
        ) : (
          <div className="space-y-2">
            <StatGrid>
              <StatTile
                title="Vendas"
                value={comparacao.atual.vendas}
                delta={comparacao.deltaVendasPct ?? undefined}
                deltaLabel={deltaLabel}
                hint={hintKpi(comparacao.anterior?.vendas)}
              />
              <StatTile
                title="VGV"
                value={fmtBRL(comparacao.atual.vgv)}
                delta={comparacao.deltaVgvPct ?? undefined}
                deltaLabel={deltaLabel}
                hint={hintKpi(comparacao.anterior?.vgv, fmtBRL)}
              />
              <StatTile
                title="Visitas realizadas"
                value={comparacao.atual.visitas}
                delta={comparacao.deltaVisitasPct ?? undefined}
                deltaLabel={deltaLabel}
                hint={hintKpi(comparacao.anterior?.visitas)}
              />
              <StatTile title="Leads recebidos" value={leadsJanela} hint="na janela" />
            </StatGrid>
            {comparacao.anterior && (
              <p className="text-xs text-muted-foreground">
                Comparação: {labelJanela} vs. os {comparacao.anterior.meses} meses imediatamente
                anteriores.
              </p>
            )}
          </div>
        )}
      </AsyncBoundary>

      {/* 2. Evolução mensal (mesmos blocos do Raio-X da gestão) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Minha evolução ({labelJanela})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AsyncBoundary
            isLoading={drillQ.isLoading}
            isError={drillQ.isError}
            error={drillQ.error}
            errorTitle="Não foi possível carregar a evolução mensal."
            onRetry={() => void drillQ.refetch()}
            loadingFallback={<Skeleton className="h-40 w-full" />}
          >
            {serie.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem histórico mensal (camada metrics não aplicada ou período sem atividade).
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
                {trimestres.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    Trimestres:{" "}
                    {trimestres
                      .map((t) => `${t.trimestre}: ${t.vendas}v · ${fmtBRL(t.vgv)}`)
                      .join(" → ")}{" "}
                    <span className="opacity-70">(base do escalonamento de comissão)</span>
                  </p>
                )}
              </>
            )}
          </AsyncBoundary>
        </CardContent>
      </Card>

      {/* 3. Carteira agora + 4. Onde eu mais perco */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Minha carteira agora</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <AsyncBoundary
              isLoading={carteiraQ.isLoading}
              isError={carteiraQ.isError}
              error={carteiraQ.error}
              errorTitle="Não foi possível carregar a sua carteira."
              onRetry={() => void carteiraQ.refetch()}
              loadingFallback={<Skeleton className="h-32 w-full" />}
            >
              {carteira.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem leads na carteira.</p>
              ) : (
                carteira.map((r) => (
                  <div key={r.etapa}>
                    <div className="mb-1 flex justify-between text-xs">
                      <Link
                        to="/leads"
                        search={{ status: r.etapa, corretor: corretorId }}
                        className="text-muted-foreground hover:underline"
                      >
                        {leadStatusLabel(r.etapa)}
                      </Link>
                      <span className="font-medium tabular-nums">{r.quantidade}</span>
                    </div>
                    <div className="h-4 overflow-hidden rounded bg-muted">
                      <div
                        className="h-full bg-primary/70"
                        style={{
                          width: `${Math.max(3, Math.round((r.quantidade / maxCarteira) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </AsyncBoundary>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Onde eu mais perco ({labelJanela})</CardTitle>
          </CardHeader>
          <CardContent>
            <AsyncBoundary
              isLoading={perdasQ.isLoading}
              isError={perdasQ.isError}
              error={perdasQ.error}
              errorTitle="Não foi possível carregar os motivos de perda."
              onRetry={() => void perdasQ.refetch()}
              loadingFallback={<Skeleton className="h-28 w-full" />}
            >
              {perdas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem perdas registradas na janela.</p>
              ) : (
                <ul className="space-y-1.5">
                  {perdas.slice(0, 8).map((p) => (
                    <li key={p.motivo} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        {motivoPerdaLabel(p.motivo) ?? p.motivo}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">{p.quantidade}</span>
                    </li>
                  ))}
                </ul>
              )}
            </AsyncBoundary>
          </CardContent>
        </Card>
      </div>

      {/* 5. Comissões */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" /> Minhas comissões ({labelJanela})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AsyncBoundary
            isLoading={comissoesQ.isLoading}
            isError={comissoesQ.isError}
            error={comissoesQ.error}
            errorTitle="Não foi possível carregar as suas comissões."
            onRetry={() => void comissoesQ.refetch()}
            loadingFallback={<Skeleton className="h-20 w-full" />}
          >
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
                to="/financeiro"
                search={{ tab: "comissoes" }}
                className="text-xs text-muted-foreground hover:underline"
              >
                detalhe →
              </Link>
            </div>
          </AsyncBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
