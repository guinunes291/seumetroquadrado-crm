// Financeiro · DRE — resultado por unidade (SMQ Bruno/Sheldon/Guilherme) e
// consolidado da rede, com a cascata da planilha oficial. Módulo 100% aditivo:
// o cálculo vive no banco (RPC dre_calcular, tabelas dre_*) e esta tela só
// apresenta — filtros, cards, grade Jan–Dez, drill-down por célula, avisos e
// comparação com o orçado. A configuração (equipe, despesas, parâmetros...)
// é uma visão irmã em dre-config.tsx.
import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowSquareOut,
  DownloadSimple,
  FileText,
  Printer,
  Sliders,
  Warning,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile, StatGrid } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { exportRowsXlsx } from "@/lib/spreadsheets";
import {
  DRE_LINHAS,
  MESES_CURTOS,
  dreData,
  dreMoeda,
  dreMoeda2,
  dreValor,
  downloadCsv,
  fetchDreAvisos,
  fetchDreDrillDespesas,
  fetchDreDrillVendas,
  fetchDreGrade,
  fetchDreOrcamento,
  fetchDreUnidades,
  imprimirDrePdf,
  type DreGrade,
  type DreLinhaDef,
  type DreModoPct,
  type DreRegime,
} from "@/lib/dre";

const DreConsolidado = lazy(() =>
  import("@/features/financeiro/dre-consolidado").then((m) => ({ default: m.DreConsolidado })),
);
const DreConfig = lazy(() =>
  import("@/features/financeiro/dre-config").then((m) => ({ default: m.DreConfig })),
);

const REDE = "rede";

type Drill = { def: DreLinhaDef; mes: number };

export function DrePage() {
  const { isAdmin, isGestor } = useUserRoles();
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;

  const [view, setView] = useState<"demonstrativo" | "configuracao">("demonstrativo");
  const [configAba, setConfigAba] = useState<string>("equipe");
  const [unidadeSel, setUnidadeSel] = useState<string>(REDE);
  const [ano, setAno] = useState(anoAtual);
  const [regime, setRegime] = useState<DreRegime>("competencia");
  const [modoPct, setModoPct] = useState<DreModoPct>("venda");
  const [comparar, setComparar] = useState(false);
  const [drill, setDrill] = useState<Drill | null>(null);

  const unidadeId = unidadeSel === REDE ? null : unidadeSel;
  const podeVer = isAdmin || isGestor;

  const unidadesQuery = useQuery({
    queryKey: ["dre", "unidades"],
    queryFn: fetchDreUnidades,
    enabled: podeVer,
  });
  const gradeQuery = useQuery({
    queryKey: ["dre", "grade", unidadeId, ano, regime, modoPct],
    queryFn: () => fetchDreGrade(unidadeId, ano, regime, modoPct),
    enabled: podeVer,
  });
  const avisosQuery = useQuery({
    queryKey: ["dre", "avisos", unidadeId, ano],
    queryFn: () => fetchDreAvisos(unidadeId, ano),
    enabled: podeVer,
  });
  const orcamentoQuery = useQuery({
    queryKey: ["dre", "orcamento", unidadeId, ano],
    queryFn: () => fetchDreOrcamento(unidadeId, ano),
    enabled: podeVer && comparar,
  });

  const unidades = unidadesQuery.data ?? [];
  const unidadeNome =
    unidadeId === null
      ? "Consolidado rede"
      : (unidades.find((u) => u.id === unidadeId)?.nome ?? "Unidade");

  if (!podeVer) {
    return (
      <EmptyState
        icon={Warning}
        title="DRE é restrita à gestão"
        description="Peça a um administrador para liberar seu papel se você precisa desta visão."
      />
    );
  }

  if (view === "configuracao") {
    return (
      <Suspense fallback={<Skeleton className="h-64 w-full" aria-busy="true" />}>
        <DreConfig
          abaInicial={configAba}
          unidades={unidades}
          onVoltar={() => setView("demonstrativo")}
        />
      </Suspense>
    );
  }

  const grade = gradeQuery.data;
  const avisos = avisosQuery.data;
  const orcamento = comparar ? orcamentoQuery.data : undefined;
  const temOrcamento = !!orcamento && Object.keys(orcamento).length > 0;
  const anoCorrente = ano === anoAtual;

  const abrirConfig = (aba: string) => {
    setConfigAba(aba);
    setView("configuracao");
  };

  const exportarXlsx = async () => {
    if (!grade) return;
    try {
      const rows = DRE_LINHAS.map((def) => {
        const serie = grade[def.key];
        const valor = (v: number) => (def.moeda === false ? Math.round(v) : Number(v.toFixed(2)));
        return {
          Linha: def.rotulo,
          ...Object.fromEntries(MESES_CURTOS.map((m, i) => [m, valor(serie[i + 1])])),
          Total: valor(serie[0]),
        };
      });
      await exportRowsXlsx(rows, {
        fileName: `dre-${unidadeNome.toLowerCase().replace(/\s+/g, "-")}-${ano}`,
        sheetName: `DRE ${ano}`,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar.");
    }
  };

  const exportarPdf = () => {
    if (!grade) return;
    imprimirDrePdf({
      titulo: `DRE ${ano} — ${unidadeNome}`,
      subtitulo: `Regime: ${regime === "caixa" ? "Caixa" : "Competência"} · Percentuais: ${
        modoPct === "venda" ? "da venda" : "do parâmetro"
      } · Gerado em ${new Date().toLocaleDateString("pt-BR")}`,
      grade,
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="DRE"
        description="Resultado por unidade e consolidado da rede, na cascata da planilha oficial."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportarXlsx} disabled={!grade}>
              <DownloadSimple className="mr-2 h-4 w-4" /> XLSX
            </Button>
            <Button variant="outline" size="sm" onClick={exportarPdf} disabled={!grade}>
              <Printer className="mr-2 h-4 w-4" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => abrirConfig("equipe")}>
              <Sliders className="mr-2 h-4 w-4" /> Configuração
            </Button>
          </div>
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Unidade</Label>
          <Select value={unidadeSel} onValueChange={setUnidadeSel}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={REDE}>Consolidado rede</SelectItem>
              {unidades
                .filter((u) => u.ativa)
                .map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Ano</Label>
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: anoAtual + 2 - 2025 }, (_, i) => 2025 + i).map((a) => (
                <SelectItem key={a} value={String(a)}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Regime</Label>
          <Select value={regime} onValueChange={(v) => setRegime(v as DreRegime)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="competencia">Competência</SelectItem>
              <SelectItem value="caixa">Caixa</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Percentuais</Label>
          <Select value={modoPct} onValueChange={(v) => setModoPct(v as DreModoPct)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="venda">Da venda (real)</SelectItem>
              <SelectItem value="parametro">Do parâmetro (modelo)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch id="dre-comparar" checked={comparar} onCheckedChange={setComparar} />
          <Label htmlFor="dre-comparar" className="text-sm">
            Comparar com orçado
          </Label>
        </div>
      </div>

      {/* Avisos */}
      {avisos && (
        <div className="space-y-2">
          {avisos.pendentes_qtd > 0 && (
            <Aviso>
              {dreMoeda2(avisos.pendentes_vgv)} em VGV aguardando aprovação ({avisos.pendentes_qtd}{" "}
              {avisos.pendentes_qtd === 1 ? "venda" : "vendas"}) — não incluído na DRE.
            </Aviso>
          )}
          {regime === "caixa" && avisos.sem_recebimento_qtd > 0 && (
            <Aviso>
              {dreMoeda2(avisos.sem_recebimento_vgv)} em VGV sem data de recebimento (
              {avisos.sem_recebimento_qtd} {avisos.sem_recebimento_qtd === 1 ? "venda" : "vendas"})
              — fora do regime caixa.
            </Aviso>
          )}
          {avisos.sem_unidade_qtd > 0 && (
            <Aviso
              acao={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => abrirConfig("vendas-sem-unidade")}
                >
                  Atribuir
                </Button>
              }
            >
              {avisos.sem_unidade_qtd}{" "}
              {avisos.sem_unidade_qtd === 1 ? "venda sem unidade" : "vendas sem unidade"} —{" "}
              {dreMoeda2(avisos.sem_unidade_vgv)} fora da DRE.
            </Aviso>
          )}
        </div>
      )}
      {comparar && orcamentoQuery.isSuccess && !temOrcamento && (
        <Aviso
          acao={
            <Button variant="outline" size="sm" onClick={() => abrirConfig("orcamento")}>
              Importar
            </Button>
          }
        >
          Nenhum orçamento importado para {ano} — importe o CSV na configuração.
        </Aviso>
      )}

      {/* Cards de resumo */}
      <StatGrid>
        <CardResumo
          titulo="VGV no ano"
          grade={grade}
          linha="vgv"
          anoCorrente={anoCorrente}
          mesAtual={mesAtual}
        />
        <CardResumo
          titulo="Receita Líquida"
          grade={grade}
          linha="receita_liquida"
          anoCorrente={anoCorrente}
          mesAtual={mesAtual}
        />
        <CardResumo
          titulo="EBITDA"
          grade={grade}
          linha="ebitda"
          anoCorrente={anoCorrente}
          mesAtual={mesAtual}
        />
        <CardResumo
          titulo="Lucro p/ Distribuição"
          grade={grade}
          linha="lucro_distribuicao"
          anoCorrente={anoCorrente}
          mesAtual={mesAtual}
        />
      </StatGrid>

      {/* Cascata */}
      {gradeQuery.isError ? (
        <QueryErrorState
          title="Não foi possível calcular a DRE."
          error={gradeQuery.error}
          onRetry={() => void gradeQuery.refetch()}
        />
      ) : gradeQuery.isPending || !grade ? (
        <div className="space-y-2" aria-busy="true" aria-label="Calculando DRE">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <GradeDre
          grade={grade}
          orcamento={temOrcamento ? orcamento : undefined}
          anoCorrente={anoCorrente}
          mesAtual={mesAtual}
          onDrill={(def, mes) => setDrill({ def, mes })}
        />
      )}

      {/* Consolidado: comparativo entre unidades + matriz societária + renda */}
      {unidadeId === null && grade && (
        <Suspense fallback={<Skeleton className="h-40 w-full" aria-busy="true" />}>
          <DreConsolidado
            ano={ano}
            regime={regime}
            modoPct={modoPct}
            unidades={unidades.filter((u) => u.ativa)}
          />
        </Suspense>
      )}

      <DreDrillDrawer
        drill={drill}
        onClose={() => setDrill(null)}
        unidadeId={unidadeId}
        unidadeNome={unidadeNome}
        ano={ano}
        regime={regime}
        modoPct={modoPct}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pedaços
// ---------------------------------------------------------------------------

function Aviso({ children, acao }: { children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <Warning className="h-4 w-4 shrink-0 text-warning" />
        <span>{children}</span>
      </div>
      {acao}
    </div>
  );
}

function CardResumo({
  titulo,
  grade,
  linha,
  anoCorrente,
  mesAtual,
}: {
  titulo: string;
  grade: DreGrade | undefined;
  linha: keyof DreGrade;
  anoCorrente: boolean;
  mesAtual: number;
}) {
  const total = grade?.[linha]?.[0] ?? 0;
  const doMes = grade?.[linha]?.[mesAtual] ?? 0;
  return (
    <StatTile
      title={titulo}
      loading={!grade}
      value={dreMoeda(total)}
      hint={anoCorrente ? `Mês atual: ${dreMoeda(doMes)}` : "Acumulado do ano"}
    />
  );
}

function GradeDre({
  grade,
  orcamento,
  anoCorrente,
  mesAtual,
  onDrill,
}: {
  grade: DreGrade;
  orcamento?: Partial<DreGrade>;
  anoCorrente: boolean;
  mesAtual: number;
  onDrill: (def: DreLinhaDef, mes: number) => void;
}) {
  const colunaCls = (mes: number) =>
    cn(
      "text-right tabular-nums whitespace-nowrap px-2",
      anoCorrente && mes === mesAtual && "bg-primary/5",
      anoCorrente && mes > mesAtual && "text-muted-foreground/60",
    );

  return (
    <div className="overflow-x-auto rounded-xl border border-border-subtle bg-card">
      <table className="w-full min-w-[1080px] text-xs md:text-[13px]">
        <thead>
          <tr className="border-b">
            <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium">Linha</th>
            {MESES_CURTOS.map((m, i) => (
              <th key={m} className={cn("py-2 font-medium", colunaCls(i + 1))}>
                {m}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {DRE_LINHAS.map((def) => {
            const serie = grade[def.key];
            const orc = orcamento?.[def.key];
            return (
              <FragmentoLinha
                key={def.key}
                def={def}
                serie={serie}
                orc={orc}
                colunaCls={colunaCls}
                onDrill={onDrill}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FragmentoLinha({
  def,
  serie,
  orc,
  colunaCls,
  onDrill,
}: {
  def: DreLinhaDef;
  serie: number[];
  orc?: number[];
  colunaCls: (mes: number) => string;
  onDrill: (def: DreLinhaDef, mes: number) => void;
}) {
  return (
    <>
      {def.secaoAntes && (
        <tr className="border-b bg-muted/40">
          <td
            colSpan={14}
            className="sticky left-0 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {def.secaoAntes}
          </td>
        </tr>
      )}
      <tr className={cn("border-b last:border-b-0", def.subtotal && "bg-muted font-semibold")}>
        <td
          className={cn(
            "sticky left-0 z-10 whitespace-nowrap px-3 py-1.5",
            def.subtotal ? "bg-muted" : "bg-card",
          )}
        >
          {def.rotulo}
        </td>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((mes) => (
          <CelulaDre
            key={mes}
            def={def}
            valor={serie[mes]}
            orcado={orc?.[mes]}
            className={colunaCls(mes)}
            onDrill={def.drill ? () => onDrill(def, mes) : undefined}
          />
        ))}
        <CelulaDre
          def={def}
          valor={serie[0]}
          orcado={orc?.[0]}
          className="px-3 text-right font-semibold tabular-nums whitespace-nowrap"
        />
      </tr>
    </>
  );
}

function CelulaDre({
  def,
  valor,
  orcado,
  className,
  onDrill,
}: {
  def: DreLinhaDef;
  valor: number;
  orcado?: number;
  className: string;
  onDrill?: () => void;
}) {
  const texto = dreValor(def, valor);
  const conteudo = (
    <>
      <span className={cn(valor < 0 && "text-destructive")}>{texto}</span>
      {orcado !== undefined && (
        <span className="block text-[10px] leading-tight text-muted-foreground">
          Orç {dreValor(def, orcado)}
          <DeltaOrcado def={def} real={valor} orcado={orcado} />
        </span>
      )}
    </>
  );
  return (
    <td className={cn(className, "py-1.5")}>
      {onDrill ? (
        <button
          type="button"
          onClick={onDrill}
          className="w-full cursor-pointer text-right underline-offset-2 hover:underline focus-visible:underline"
          title={`Ver o que compõe ${def.rotulo}`}
        >
          {conteudo}
        </button>
      ) : (
        conteudo
      )}
    </td>
  );
}

function DeltaOrcado({ def, real, orcado }: { def: DreLinhaDef; real: number; orcado: number }) {
  if (!orcado) return null;
  const delta = ((real - orcado) / Math.abs(orcado)) * 100;
  // Em linha de receita, ficar abaixo do orçado é ruim (vermelho); em linha de
  // despesa, gastar menos que o orçado é bom (verde).
  const bom = def.despesa ? delta <= 0 : delta >= 0;
  const texto = `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })}%`;
  return (
    <span className={cn("ml-1 font-medium", bom ? "text-success" : "text-destructive")}>
      Δ {texto}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Drill-down (drawer lateral)
// ---------------------------------------------------------------------------

function DreDrillDrawer({
  drill,
  onClose,
  unidadeId,
  unidadeNome,
  ano,
  regime,
  modoPct,
}: {
  drill: Drill | null;
  onClose: () => void;
  unidadeId: string | null;
  unidadeNome: string;
  ano: number;
  regime: DreRegime;
  modoPct: DreModoPct;
}) {
  const aberto = drill !== null;
  const tipo = drill?.def.drill;
  const mes = drill?.mes ?? 0;

  const vendasQuery = useQuery({
    queryKey: ["dre", "drill-vendas", unidadeId, ano, mes, regime, modoPct],
    queryFn: () => fetchDreDrillVendas(unidadeId, ano, mes, regime, modoPct),
    enabled: aberto && tipo === "vendas",
  });
  const despesasQuery = useQuery({
    queryKey: ["dre", "drill-despesas", unidadeId, ano, mes, regime],
    queryFn: () => fetchDreDrillDespesas(unidadeId, ano, mes, regime),
    enabled: aberto && tipo === "despesas",
  });

  const titulo = drill ? `${drill.def.rotulo} — ${MESES_CURTOS[mes - 1]}/${ano}` : "";

  const exportarCsv = () => {
    if (tipo === "vendas") {
      downloadCsv(
        `dre-vendas-${ano}-${mes}`,
        (vendasQuery.data ?? []).map((v) => ({
          Unidade: v.unidade_nome,
          Cliente: v.cliente ?? "",
          Empreendimento: v.empreendimento ?? "",
          Corretor: v.corretor_nome ?? "",
          "Data assinatura": dreData(v.data_assinatura),
          Recebimento: dreData(v.data_recebimento),
          VGV: v.vgv,
          "Comissão (faturamento)": v.faturamento,
          Impostos: v.impostos,
          Consultor: v.consultor,
          Gerente: v.gerente,
          "Sócio operador": v.socio_operador,
        })),
      );
    } else {
      downloadCsv(
        `dre-despesas-${ano}-${mes}`,
        (despesasQuery.data ?? []).map((d) => ({
          Unidade: d.unidade?.nome ?? "",
          Categoria: d.categoria?.nome ?? "",
          Descrição: d.descricao,
          Fornecedor: d.fornecedor ?? "",
          Competência: dreData(d.competencia),
          Pagamento: dreData(d.data_pagamento),
          Valor: d.valor,
        })),
      );
    }
  };

  return (
    <Sheet open={aberto} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-3 overflow-y-auto sm:max-w-2xl"
      >
        <SheetHeader>
          <SheetTitle>{titulo}</SheetTitle>
          <SheetDescription>
            {unidadeNome} · Regime {regime === "caixa" ? "caixa" : "competência"} · Percentuais{" "}
            {modoPct === "venda" ? "da venda" : "do parâmetro"}
          </SheetDescription>
        </SheetHeader>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={exportarCsv}>
            <FileText className="mr-2 h-4 w-4" /> Exportar CSV
          </Button>
        </div>

        {tipo === "vendas" &&
          (vendasQuery.isPending ? (
            <Skeleton className="h-40 w-full" aria-busy="true" />
          ) : vendasQuery.isError ? (
            <QueryErrorState error={vendasQuery.error} onRetry={() => void vendasQuery.refetch()} />
          ) : (vendasQuery.data ?? []).length === 0 ? (
            <EmptyState title="Nenhuma venda compõe esta célula." />
          ) : (
            <TabelaDrillVendas
              linhas={vendasQuery.data ?? []}
              cadeira={drill?.def.key}
              consolidado={unidadeId === null}
            />
          ))}

        {tipo === "despesas" &&
          (despesasQuery.isPending ? (
            <Skeleton className="h-40 w-full" aria-busy="true" />
          ) : despesasQuery.isError ? (
            <QueryErrorState
              error={despesasQuery.error}
              onRetry={() => void despesasQuery.refetch()}
            />
          ) : (despesasQuery.data ?? []).length === 0 ? (
            <EmptyState title="Nenhuma despesa lançada neste mês." />
          ) : (
            <TabelaDrillDespesas
              linhas={despesasQuery.data ?? []}
              consolidado={unidadeId === null}
            />
          ))}
      </SheetContent>
    </Sheet>
  );
}

function TabelaDrillVendas({
  linhas,
  cadeira,
  consolidado,
}: {
  linhas: Awaited<ReturnType<typeof fetchDreDrillVendas>>;
  cadeira?: string;
  consolidado: boolean;
}) {
  const colunaCadeira =
    cadeira === "consultor" || cadeira === "gerente" || cadeira === "socio_operador"
      ? (cadeira as "consultor" | "gerente" | "socio_operador")
      : null;
  const rotuloCadeira =
    colunaCadeira === "consultor"
      ? "Consultor"
      : colunaCadeira === "gerente"
        ? "Gerente"
        : "Sócio op.";
  const totalVgv = linhas.reduce((s, l) => s + l.vgv, 0);
  const totalFat = linhas.reduce((s, l) => s + l.faturamento, 0);
  const totalCadeira = colunaCadeira ? linhas.reduce((s, l) => s + l[colunaCadeira], 0) : 0;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cliente</TableHead>
          {consolidado && <TableHead>Unidade</TableHead>}
          <TableHead>Empreendimento</TableHead>
          <TableHead>Corretor</TableHead>
          <TableHead>Data</TableHead>
          <TableHead className="text-right">VGV</TableHead>
          <TableHead className="text-right">Comissão</TableHead>
          {colunaCadeira && <TableHead className="text-right">{rotuloCadeira}</TableHead>}
          <TableHead aria-label="Abrir lead" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {linhas.map((v) => (
          <TableRow key={v.venda_id}>
            <TableCell className="font-medium">{v.cliente ?? "—"}</TableCell>
            {consolidado && <TableCell>{v.unidade_nome}</TableCell>}
            <TableCell>{v.empreendimento ?? "—"}</TableCell>
            <TableCell>{v.corretor_nome ?? "—"}</TableCell>
            <TableCell className="whitespace-nowrap">{dreData(v.data_assinatura)}</TableCell>
            <TableCell className="text-right tabular-nums">{dreMoeda2(v.vgv)}</TableCell>
            <TableCell className="text-right tabular-nums">{dreMoeda2(v.faturamento)}</TableCell>
            {colunaCadeira && (
              <TableCell className="text-right tabular-nums">
                {dreMoeda2(v[colunaCadeira])}
              </TableCell>
            )}
            <TableCell>
              {v.lead_id && (
                <Link
                  to="/leads/$leadId"
                  params={{ leadId: v.lead_id }}
                  className="text-muted-foreground hover:text-foreground"
                  title="Abrir o lead desta venda"
                >
                  <ArrowSquareOut className="h-4 w-4" />
                </Link>
              )}
            </TableCell>
          </TableRow>
        ))}
        <TableRow className="font-semibold">
          <TableCell colSpan={consolidado ? 5 : 4}>Total ({linhas.length})</TableCell>
          <TableCell className="text-right tabular-nums">{dreMoeda2(totalVgv)}</TableCell>
          <TableCell className="text-right tabular-nums">{dreMoeda2(totalFat)}</TableCell>
          {colunaCadeira && (
            <TableCell className="text-right tabular-nums">{dreMoeda2(totalCadeira)}</TableCell>
          )}
          <TableCell />
        </TableRow>
      </TableBody>
    </Table>
  );
}

function TabelaDrillDespesas({
  linhas,
  consolidado,
}: {
  linhas: Awaited<ReturnType<typeof fetchDreDrillDespesas>>;
  consolidado: boolean;
}) {
  const total = linhas.reduce((s, l) => s + l.valor, 0);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {consolidado && <TableHead>Unidade</TableHead>}
          <TableHead>Categoria</TableHead>
          <TableHead>Descrição</TableHead>
          <TableHead>Fornecedor</TableHead>
          <TableHead>Pagamento</TableHead>
          <TableHead className="text-right">Valor</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {linhas.map((d) => (
          <TableRow key={d.id}>
            {consolidado && <TableCell>{d.unidade?.nome ?? "—"}</TableCell>}
            <TableCell>{d.categoria?.nome ?? "—"}</TableCell>
            <TableCell className="font-medium">{d.descricao}</TableCell>
            <TableCell>{d.fornecedor ?? "—"}</TableCell>
            <TableCell className="whitespace-nowrap">{dreData(d.data_pagamento)}</TableCell>
            <TableCell className="text-right tabular-nums">{dreMoeda2(d.valor)}</TableCell>
          </TableRow>
        ))}
        <TableRow className="font-semibold">
          <TableCell colSpan={consolidado ? 5 : 4}>Total ({linhas.length})</TableCell>
          <TableCell className="text-right tabular-nums">{dreMoeda2(total)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
