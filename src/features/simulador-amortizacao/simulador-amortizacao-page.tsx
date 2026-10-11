// Planilha de amortização — o corretor monta o contrato do cliente (SAC, PRICE
// ou os dois lado a lado) e vê mês a mês o que acontece com a parcela e com o
// saldo: correção pela TR, seguros que mudam com a idade, fase de obra na
// planta e amortizações extras com FGTS. Toda a conta mora em lib/amortizacao;
// esta tela só coleta os dados e formata o resultado.

import { lazy, Suspense, useId, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowsLeftRight,
  CaretDown,
  Copy,
  FilePdf,
  Info,
  Plus,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  efetivaParaNominal,
  nominalParaEfetiva,
  simularFinanciamento,
  TR_MENSAL_REFERENCIA_2026,
  type LinhaPlanilha,
  type ResultadoSimulacao,
  type SistemaAmortizacao,
} from "@/lib/amortizacao";
import { parseValorBR } from "@/lib/simulador";
import { cn } from "@/lib/utils";
import {
  agruparPorAno,
  avaliacaoEstimada,
  lerDecimal,
  resumoAjustes,
  formInicial,
  paramsDoForm,
  leituraComercial,
  textoResumo,
  valorFinanciadoDe,
  type ExtraForm,
  type FormSimulador,
  type PrefillSimulador,
  type VisaoSistema,
} from "./estado";

const GraficosAmortizacao = lazy(() =>
  import("./graficos").then(({ GraficosAmortizacao }) => ({ default: GraficosAmortizacao })),
);

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number, casas = 2) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

type Resultados = Partial<Record<SistemaAmortizacao, ResultadoSimulacao>>;

export function SimuladorAmortizacaoPage({ prefill }: { prefill?: PrefillSimulador }) {
  const [form, setForm] = useState<FormSimulador>(() => formInicial(prefill));
  const set = <K extends keyof FormSimulador>(k: K, v: FormSimulador[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const resultados = useMemo<Resultados>(() => {
    const base = paramsDoForm(form);
    if (base.valorFinanciado <= 0 || base.prazoMeses <= 0) return {};
    const sistemas: SistemaAmortizacao[] =
      form.visao === "comparar" ? ["SAC", "PRICE"] : [form.visao];
    const out: Resultados = {};
    for (const s of sistemas) out[s] = simularFinanciamento({ ...base, sistema: s });
    return out;
  }, [form]);

  const sistemasAtivos = (["SAC", "PRICE"] as const).filter((s) => resultados[s]);
  const avisos = [...new Set(sistemasAtivos.flatMap((s) => resultados[s]!.avisos))];

  // PDF é o ÚNICO formato de exportação (decisão 2026-10-11). O gerador só
  // desce no clique (lazy), como os outros PDFs do CRM.
  async function exportarPdf(completo: boolean) {
    try {
      const { imprimirPlanilha } = await import("./planilha-pdf");
      await imprimirPlanilha({ form, resultados, completo });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF.");
    }
  }

  async function copiarResumo() {
    const texto = textoResumo(form, resultados);
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Resumo copiado. É só colar no WhatsApp.");
    } catch {
      toast.error("Não consegui copiar. Selecione o texto manualmente.");
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Planilha de amortização"
        description="SAC e PRICE mês a mês, com TR, seguros, taxa de administração, fase de obra e amortização com FGTS."
        actions={
          <>
            <Button variant="outline" onClick={copiarResumo} disabled={!sistemasAtivos.length}>
              <Copy className="mr-1.5 h-4 w-4" /> Copiar resumo
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={!sistemasAtivos.length}>
                  <FilePdf className="mr-1.5 h-4 w-4" /> Exportar PDF
                  <CaretDown className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onSelect={() => void exportarPdf(false)}>
                  <span>
                    <span className="block font-medium">PDF resumido</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Comparativo, leitura e evolução ano a ano
                    </span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void exportarPdf(true)}>
                  <span>
                    <span className="block font-medium">PDF completo</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Tudo acima + planilha mês a mês
                    </span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Formulario form={form} set={set} setForm={setForm} />

        <div className="min-w-0 space-y-4">
          {avisos.length > 0 && (
            <div className="space-y-1 rounded-lg border border-aviso-300 bg-aviso-500/5 p-3 text-sm text-aviso-700">
              {avisos.map((a) => (
                <div key={a} className="flex items-start gap-2">
                  <Warning className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{a}</span>
                </div>
              ))}
            </div>
          )}

          {!sistemasAtivos.length ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Informe o valor do financiamento, a taxa de juros e o prazo do contrato para gerar a
                planilha.
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue="resumo">
              <TabsList indicator>
                <TabsTrigger value="resumo">Resumo</TabsTrigger>
                <TabsTrigger value="planilha">Planilha mês a mês</TabsTrigger>
                <TabsTrigger value="graficos">Gráficos</TabsTrigger>
              </TabsList>
              <TabsContent value="resumo" className="mt-4">
                <Resumo form={form} resultados={resultados} />
              </TabsContent>
              <TabsContent value="planilha" className="mt-4">
                <Planilha resultados={resultados} />
              </TabsContent>
              <TabsContent value="graficos" className="mt-4">
                <Card>
                  <CardContent className="p-4">
                    <Suspense fallback={<Skeleton className="h-[260px] w-full" />}>
                      <GraficosAmortizacao resultados={resultados} />
                    </Suspense>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}

          <p className="text-[11px] text-muted-foreground">
            Simulação comercial. A TR futura é uma projeção (média de 2026:{" "}
            {pct(TR_MENSAL_REFERENCIA_2026)} ao mês) e os seguros por idade são estimativa: para
            bater com a proposta do banco, use "Taxas da proposta". Não substitui a simulação
            oficial nem garante aprovação.
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Formulário
// ============================================================================

function Formulario({
  form,
  set,
  setForm,
}: {
  form: FormSimulador;
  set: <K extends keyof FormSimulador>(k: K, v: FormSimulador[K]) => void;
  setForm: React.Dispatch<React.SetStateAction<FormSimulador>>;
}) {
  const [ajustesAbertos, setAjustesAbertos] = useState(false);
  const taxaConvertida =
    form.tipoTaxa === "nominal"
      ? `efetiva ${pct(nominalParaEfetiva(form.taxaAnual || 0))} a.a.`
      : `nominal ${pct(efetivaParaNominal(form.taxaAnual || 0))} a.a.`;

  const setExtra = (idx: number, patch: Partial<ExtraForm>) =>
    setForm((f) => ({
      ...f,
      extras: f.extras.map((e, i) => (i === idx ? { ...e, ...patch } : e)),
    }));

  return (
    <div className="space-y-4">
      <Card className="border-primary/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Dados do financiamento (do contrato)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Numero
            label="Valor do financiamento (R$)"
            value={form.valorFinanciamento}
            onChange={(v) => set("valorFinanciamento", v)}
            placeholder="ex.: 208000"
            autoFocus={!form.valorFinanciamento}
          />
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <Numero
              label="Taxa de juros a.a. (%)"
              value={form.taxaAnual}
              decimal
              onChange={(v) => set("taxaAnual", v)}
              placeholder="ex.: 8,16"
              hint={form.taxaAnual ? taxaConvertida : 'Caixa: use os "Juros Nominais" do contrato'}
            />
            <Campo label="Tipo">
              <Select
                value={form.tipoTaxa}
                onValueChange={(v) => set("tipoTaxa", v as FormSimulador["tipoTaxa"])}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nominal">Nominal</SelectItem>
                  <SelectItem value="efetiva">Efetiva</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
          </div>
          <Numero
            label="Prazo (meses)"
            value={form.prazoMeses}
            onChange={(v) => set("prazoMeses", Math.round(v))}
            placeholder="ex.: 420"
            hint={
              form.prazoMeses
                ? `${(form.prazoMeses / 12).toFixed(1).replace(".", ",")} anos`
                : undefined
            }
          />
          <Campo label="Sistema de amortização">
            <ToggleGroup
              type="single"
              value={form.visao}
              onValueChange={(v) => v && set("visao", v as VisaoSistema)}
              className="justify-start"
            >
              <ToggleGroupItem value="comparar" aria-label="Comparar SAC e PRICE">
                <ArrowsLeftRight className="mr-1 h-4 w-4" /> Comparar
              </ToggleGroupItem>
              <ToggleGroupItem value="SAC">SAC</ToggleGroupItem>
              <ToggleGroupItem value="PRICE">PRICE</ToggleGroupItem>
            </ToggleGroup>
          </Campo>
        </CardContent>
      </Card>

      {/* Tudo abaixo tem padrão e é calculado sozinho; fica recolhido. */}
      <Collapsible open={ajustesAbertos} onOpenChange={setAjustesAbertos}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-start justify-between gap-3 rounded-lg border bg-card p-3 text-left text-sm hover:bg-accent/40"
          >
            <span className="min-w-0">
              <span className="block font-medium">Calculado automaticamente</span>
              <span className="block text-[11px] text-muted-foreground">{resumoAjustes(form)}</span>
            </span>
            <CaretDown
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0 transition-transform",
                ajustesAbertos && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Correção e renda</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Campo label="Correção do saldo">
                <Select
                  value={form.modoCorrecao}
                  onValueChange={(v) => set("modoCorrecao", v as FormSimulador["modoCorrecao"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tr">
                      TR projetada ({pct(TR_MENSAL_REFERENCIA_2026)} a.m.)
                    </SelectItem>
                    <SelectItem value="fixa">Sem correção (taxa fixa)</SelectItem>
                    <SelectItem value="personalizada">Personalizada (TR, IPCA...)</SelectItem>
                  </SelectContent>
                </Select>
              </Campo>
              {form.modoCorrecao === "personalizada" && (
                <Numero
                  label="Correção (% ao mês)"
                  value={form.correcaoPersonalizada}
                  decimal
                  onChange={(v) => set("correcaoPersonalizada", v)}
                />
              )}
              <div className="grid grid-cols-2 gap-3">
                <Numero
                  label="Renda familiar bruta"
                  value={form.renda}
                  onChange={(v) => set("renda", v)}
                  hint="Mede o comprometimento (30%)"
                />
                <Campo label="1ª cobrança">
                  <Input
                    type="month"
                    value={form.inicio}
                    onChange={(e) => set("inicio", e.target.value)}
                  />
                </Campo>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Seguros e taxas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Campo label="MIP (morte e invalidez)">
                <ToggleGroup
                  type="single"
                  value={form.modoSeguro}
                  onValueChange={(v) => v && set("modoSeguro", v as FormSimulador["modoSeguro"])}
                  className="justify-start"
                >
                  <ToggleGroupItem value="idade">Por idade (estimativa)</ToggleGroupItem>
                  <ToggleGroupItem value="proposta">Taxas da proposta</ToggleGroupItem>
                </ToggleGroup>
              </Campo>
              {form.modoSeguro === "idade" ? (
                <div className="space-y-2">
                  {form.proponentes.map((p, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                      <Numero
                        label={`Idade proponente ${idx + 1}`}
                        value={p.idade}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            proponentes: f.proponentes.map((x, i) =>
                              i === idx ? { ...x, idade: v } : x,
                            ),
                          }))
                        }
                      />
                      <Numero
                        label="% da cobertura"
                        value={p.participacao}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            proponentes: f.proponentes.map((x, i) =>
                              i === idx ? { ...x, participacao: v } : x,
                            ),
                          }))
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remover proponente"
                        disabled={form.proponentes.length === 1}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            proponentes: f.proponentes.filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {form.proponentes.length < 4 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setForm((f) => {
                          const n = f.proponentes.length + 1;
                          const parte = Math.round(100 / n);
                          return {
                            ...f,
                            proponentes: [...f.proponentes, { idade: 30, participacao: parte }].map(
                              (x, i, arr) => ({
                                ...x,
                                participacao:
                                  i === arr.length - 1 ? 100 - parte * (arr.length - 1) : parte,
                              }),
                            ),
                          };
                        })
                      }
                    >
                      <Plus className="mr-1 h-4 w-4" /> Proponente (composição de renda)
                    </Button>
                  )}
                </div>
              ) : (
                <Numero
                  label="MIP (% ao mês sobre o saldo)"
                  value={form.mipPropostaPct}
                  decimal
                  onChange={(v) => set("mipPropostaPct", v)}
                />
              )}
              <div className="grid grid-cols-2 gap-3">
                <Numero
                  label="DFI (% a.m. sobre o imóvel)"
                  value={form.dfiPct}
                  decimal
                  onChange={(v) => set("dfiPct", v)}
                />
                <Numero
                  label="Taxa adm (R$/mês)"
                  value={form.taxaAdm}
                  onChange={(v) => set("taxaAdm", v)}
                />
              </div>
              <Numero
                label="Valor de avaliação do imóvel (R$)"
                value={form.valorAvaliacao}
                onChange={(v) => set("valorAvaliacao", v)}
                placeholder={`estimado: ${brl(avaliacaoEstimada(form))}`}
                hint="Base do DFI. Vazio = financiamento ÷ 0,8 (cota de 80%)"
              />
              <Numero
                label="Tarifas na contratação (R$)"
                value={form.despesasIniciais}
                onChange={(v) => set("despesasIniciais", v)}
                hint="Avaliação, cadastro... entram só no CET"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                Fase de obra (compra na planta)
                <Switch checked={form.obraAtiva} onCheckedChange={(v) => set("obraAtiva", v)} />
              </CardTitle>
            </CardHeader>
            {form.obraAtiva && (
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Numero
                    label="Meses de obra"
                    value={form.obraMeses}
                    onChange={(v) => set("obraMeses", Math.round(v))}
                  />
                  <Numero
                    label="% liberado na assinatura"
                    value={form.obraLiberacaoInicial}
                    onChange={(v) => set("obraLiberacaoInicial", Math.min(100, Math.max(0, v)))}
                  />
                </div>
                <label className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                  <span>
                    <span className="block font-medium">Cliente paga a correção na obra</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Desligado: a correção é somada ao saldo
                    </span>
                  </span>
                  <Switch
                    checked={form.obraPagaCorrecao}
                    onCheckedChange={(v) => set("obraPagaCorrecao", v)}
                  />
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Na obra o cliente paga só juros sobre o que o banco já liberou para a construtora
                  (liberação linear até 100% no último mês), mais seguros e taxa. A amortização
                  começa depois.
                </p>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Amortização extra (FGTS, 13º, bônus)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {form.extras.map((e, idx) => (
                <div key={idx} className="space-y-2 rounded-lg border p-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <Numero
                      label="Na parcela nº"
                      value={e.parcela}
                      onChange={(v) => setExtra(idx, { parcela: Math.round(v) })}
                    />
                    <Numero
                      label="Valor (R$)"
                      value={e.valor}
                      onChange={(v) => setExtra(idx, { valor: v })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Numero
                      label="Repetir a cada (parcelas)"
                      value={e.repetirACada}
                      onChange={(v) => setExtra(idx, { repetirACada: Math.round(v) })}
                      hint="0 = uma vez · 24 = FGTS"
                    />
                    <Numero
                      label="Quantas vezes"
                      value={e.vezes}
                      onChange={(v) => setExtra(idx, { vezes: Math.round(v) })}
                      hint="0 = até quitar"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <ToggleGroup
                      type="single"
                      value={e.modo}
                      onValueChange={(v) => v && setExtra(idx, { modo: v as ExtraForm["modo"] })}
                      className="flex-1 justify-start"
                    >
                      <ToggleGroupItem value="reduzir_prazo">Reduzir prazo</ToggleGroupItem>
                      <ToggleGroupItem value="reduzir_parcela">Reduzir parcela</ToggleGroupItem>
                    </ToggleGroup>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remover amortização"
                      onClick={() =>
                        setForm((f) => ({ ...f, extras: f.extras.filter((_, i) => i !== idx) }))
                      }
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    extras: [
                      ...f.extras,
                      {
                        parcela: 24,
                        valor: 10_000,
                        modo: "reduzir_prazo",
                        repetirACada: 24,
                        vezes: 0,
                      },
                    ],
                  }))
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Adicionar amortização
              </Button>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ============================================================================
// Resumo
// ============================================================================

function Resumo({ form, resultados }: { form: FormSimulador; resultados: Resultados }) {
  const sistemas = (["SAC", "PRICE"] as const).filter((s) => resultados[s]);
  const r0 = resultados[sistemas[0]!]!.resumo;
  const temObra = r0.mesesObra > 0;
  const temExtra = r0.totalAmortizacaoExtra > 0;

  const linhas: {
    rotulo: string;
    valor: (r: ResultadoSimulacao) => ReactNode;
    dica?: string;
    melhor?: "min" | "max";
  }[] = [
    ...(temObra
      ? [
          {
            rotulo: `Maior encargo na obra (${r0.mesesObra} meses)`,
            valor: (r: ResultadoSimulacao) => brl(r.resumo.maiorEncargoObra),
          },
        ]
      : []),
    {
      rotulo: "1ª parcela",
      valor: (r) => brl(r.resumo.primeiraParcela),
      dica: "Encargo total: amortização + juros + MIP + DFI + taxa adm. É o que o banco compara com a renda.",
      melhor: "min",
    },
    { rotulo: "Última parcela", valor: (r) => brl(r.resumo.ultimaParcela) },
    { rotulo: "Maior parcela", valor: (r) => brl(r.resumo.maiorParcela), melhor: "min" },
    {
      rotulo: "Parcelas pagas",
      valor: (r) =>
        r.resumo.parcelasPagas === r.resumo.prazoContratado
          ? `${r.resumo.parcelasPagas}`
          : `${r.resumo.parcelasPagas} de ${r.resumo.prazoContratado}`,
    },
    {
      rotulo: "Renda mínima (30%)",
      valor: (r) => brl(r.resumo.rendaMinima),
      melhor: "min",
    },
    ...(form.renda > 0
      ? [
          {
            rotulo: "Comprometimento da renda",
            valor: (r: ResultadoSimulacao) => {
              const c = (r.resumo.comprometimento ?? 0) * 100;
              return (
                <span className={cn(c > 30 && "font-semibold text-destructive")}>{pct(c, 1)}</span>
              );
            },
          },
        ]
      : []),
    { rotulo: "Total de juros", valor: (r) => brl(r.resumo.totalJuros), melhor: "min" },
    {
      rotulo: "Total de correção (TR)",
      valor: (r) => brl(r.resumo.totalCorrecao),
      dica: "Quanto o saldo cresceu pela correção monetária ao longo do contrato.",
    },
    {
      rotulo: "Total de seguros (MIP + DFI)",
      valor: (r) => brl(r.resumo.totalMip + r.resumo.totalDfi),
    },
    { rotulo: "Total de taxa adm", valor: (r) => brl(r.resumo.totalTaxaAdm) },
    ...(temExtra
      ? [
          {
            rotulo: "Amortização extra",
            valor: (r: ResultadoSimulacao) => brl(r.resumo.totalAmortizacaoExtra),
          },
        ]
      : []),
    { rotulo: "Total pago", valor: (r) => brl(r.resumo.totalPago), melhor: "min" },
    {
      rotulo: "CET estimado",
      valor: (r) => (r.resumo.cetAnual == null ? "n/d" : `${pct(r.resumo.cetAnual)} a.a.`),
      dica: "Custo efetivo total: juros + correção projetada + seguros + taxas + tarifas.",
      melhor: "min",
    },
  ];

  const valorNum: Record<string, (r: ResultadoSimulacao) => number> = {
    "1ª parcela": (r) => r.resumo.primeiraParcela,
    "Maior parcela": (r) => r.resumo.maiorParcela,
    "Renda mínima (30%)": (r) => r.resumo.rendaMinima,
    "Total de juros": (r) => r.resumo.totalJuros,
    "Total pago": (r) => r.resumo.totalPago,
    "CET estimado": (r) => r.resumo.cetAnual ?? Infinity,
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          titulo="Valor do financiamento"
          valor={brl(valorFinanciadoDe(form))}
          sub={`${form.prazoMeses} meses`}
        />
        <Kpi
          titulo="Juros ao mês"
          valor={pct(r0.taxaMensal * 100, 4)}
          sub={`nominal ${pct(r0.taxaNominalAnual)} · efetiva ${pct(r0.taxaEfetivaAnual)} a.a.`}
        />
        <Kpi
          titulo="Correção do saldo"
          valor={
            form.modoCorrecao === "fixa" ? "Sem correção" : `${pct(paramsCorrecao(form))} a.m.`
          }
          sub={
            form.modoCorrecao === "tr"
              ? "TR projetada (média 2026)"
              : form.modoCorrecao === "fixa"
                ? "taxa fixa"
                : "índice informado"
          }
        />
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-4 py-2.5 font-medium">Item</th>
                {sistemas.map((s) => (
                  <th key={s} className="px-4 py-2.5 text-right font-medium">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const num = valorNum[l.rotulo];
                const melhorSistema =
                  sistemas.length === 2 && num
                    ? num(resultados.SAC!) < num(resultados.PRICE!)
                      ? "SAC"
                      : num(resultados.PRICE!) < num(resultados.SAC!)
                        ? "PRICE"
                        : null
                    : null;
                return (
                  <tr key={l.rotulo} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-1">
                        {l.rotulo}
                        {l.dica && (
                          <span title={l.dica} className="text-muted-foreground">
                            <Info className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </span>
                    </td>
                    {sistemas.map((s) => (
                      <td
                        key={s}
                        className={cn(
                          "px-4 py-2 text-right tabular-nums",
                          melhorSistema === s && "font-semibold text-exito-700",
                        )}
                      >
                        {l.valor(resultados[s]!)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {sistemas.length === 2 && (
        <LeituraComercial sac={resultados.SAC!} price={resultados.PRICE!} />
      )}
    </div>
  );
}

function paramsCorrecao(form: FormSimulador): number {
  return form.modoCorrecao === "tr" ? TR_MENSAL_REFERENCIA_2026 : form.correcaoPersonalizada || 0;
}

/** A leitura que o corretor usa na conversa com o cliente (mesma do PDF). */
function LeituraComercial({ sac, price }: { sac: ResultadoSimulacao; price: ResultadoSimulacao }) {
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="space-y-1.5 p-4 text-sm">
        <div className="font-medium">Leitura para o cliente</div>
        {leituraComercial(sac, price).map((frase, k) => (
          <p key={k}>
            {frase.map((t, n) => (t.forte ? <strong key={n}>{t.texto}</strong> : t.texto))}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Planilha
// ============================================================================

function Planilha({ resultados }: { resultados: Resultados }) {
  const sistemas = (["SAC", "PRICE"] as const).filter((s) => resultados[s]);
  const [sistema, setSistema] = useState<SistemaAmortizacao>(sistemas[0]!);
  const [visao, setVisao] = useState<"mensal" | "anual">("mensal");
  const atual = resultados[sistema] ?? resultados[sistemas[0]!]!;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          {sistemas.length > 1 ? (
            <ToggleGroup
              type="single"
              value={sistema}
              onValueChange={(v) => v && setSistema(v as SistemaAmortizacao)}
            >
              {sistemas.map((s) => (
                <ToggleGroupItem key={s} value={s}>
                  {s}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : (
            <Badge variant="secondary">{sistemas[0]}</Badge>
          )}
        </div>
        <ToggleGroup
          type="single"
          value={visao}
          onValueChange={(v) => v && setVisao(v as "mensal" | "anual")}
        >
          <ToggleGroupItem value="mensal">Mensal</ToggleGroupItem>
          <ToggleGroupItem value="anual">Anual</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[640px] overflow-auto">
          {visao === "mensal" ? (
            <TabelaMensal linhas={atual.linhas} />
          ) : (
            <TabelaAnual linhas={atual.linhas} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const TH = "sticky top-0 z-10 bg-card px-3 py-2 text-right font-medium whitespace-nowrap border-b";
const TD = "px-3 py-1.5 text-right tabular-nums whitespace-nowrap";

function TabelaMensal({ linhas }: { linhas: LinhaPlanilha[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr>
          <th className={cn(TH, "text-left")}>Mês</th>
          <th className={cn(TH, "text-left")}>Parcela</th>
          <th className={TH}>Saldo inicial</th>
          <th className={TH}>Correção</th>
          <th className={TH}>Juros</th>
          <th className={TH}>Amortização</th>
          <th className={TH}>MIP</th>
          <th className={TH}>DFI</th>
          <th className={TH}>Taxa adm</th>
          <th className={TH}>Encargo total</th>
          <th className={TH}>Amort. extra</th>
          <th className={TH}>Saldo final</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr
            key={l.mes}
            className={cn(
              "border-b last:border-0",
              l.fase === "obra" && "bg-gold/5",
              l.amortizacaoExtra > 0 && "bg-exito-500/10",
            )}
          >
            <td className={cn(TD, "text-left")}>{l.competencia ?? l.mes}</td>
            <td className={cn(TD, "text-left")}>
              {l.fase === "obra" ? (
                <span className="text-gold-700 dark:text-gold-400">
                  Obra {l.liberado != null ? `· ${pct(l.liberado * 100, 0)} liberado` : ""}
                </span>
              ) : (
                l.parcela
              )}
            </td>
            <td className={TD}>{brl(l.saldoInicial)}</td>
            <td className={TD}>{brl(l.correcao)}</td>
            <td className={TD}>{brl(l.juros)}</td>
            <td className={TD}>{brl(l.amortizacao)}</td>
            <td className={TD}>{brl(l.mip)}</td>
            <td className={TD}>{brl(l.dfi)}</td>
            <td className={TD}>{brl(l.taxaAdm)}</td>
            <td className={cn(TD, "font-semibold")}>{brl(l.encargoTotal)}</td>
            <td className={TD}>{l.amortizacaoExtra ? brl(l.amortizacaoExtra) : ""}</td>
            <td className={TD}>{brl(l.saldoFinal)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TabelaAnual({ linhas }: { linhas: LinhaPlanilha[] }) {
  const anos = useMemo(() => agruparPorAno(linhas), [linhas]);
  return (
    <table className="w-full text-xs">
      <thead>
        <tr>
          <th className={cn(TH, "text-left")}>Período</th>
          <th className={TH}>Parcela média</th>
          <th className={TH}>Juros</th>
          <th className={TH}>Amortização</th>
          <th className={TH}>Correção</th>
          <th className={TH}>Seguros</th>
          <th className={TH}>Taxa adm</th>
          <th className={TH}>Amort. extra</th>
          <th className={TH}>Total pago</th>
          <th className={TH}>Saldo no fim</th>
        </tr>
      </thead>
      <tbody>
        {anos.map((a) => (
          <tr key={a.ano} className="border-b last:border-0">
            <td className={cn(TD, "text-left")}>{a.rotulo}</td>
            <td className={TD}>{brl(a.encargoMedio)}</td>
            <td className={TD}>{brl(a.juros)}</td>
            <td className={TD}>{brl(a.amortizacao)}</td>
            <td className={TD}>{brl(a.correcao)}</td>
            <td className={TD}>{brl(a.seguros)}</td>
            <td className={TD}>{brl(a.taxaAdm)}</td>
            <td className={TD}>{a.amortizacaoExtra ? brl(a.amortizacaoExtra) : ""}</td>
            <td className={cn(TD, "font-semibold")}>{brl(a.totalPago)}</td>
            <td className={TD}>{brl(a.saldoFinal)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ============================================================================
// Peças pequenas
// ============================================================================

function Campo({
  label,
  children,
  hint,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs" htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/**
 * Campo numérico em texto livre, do jeito que o corretor digita: dinheiro
 * aceita "208.000", "208000" e "208.000,50" (parseValorBR); `decimal` (taxas)
 * trata ponto e vírgula sempre como decimal, porque "0.015" é 0,015% e não 15.
 * Mantém o texto digitado e só reformata quando o valor muda por fora.
 */
function Numero({
  label,
  value,
  onChange,
  decimal = false,
  hint,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  decimal?: boolean;
  hint?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const ler = (t: string) => (decimal ? lerDecimal(t) : parseValorBR(t));
  const formatar = (v: number) =>
    v ? v.toLocaleString("pt-BR", { maximumFractionDigits: 6, useGrouping: !decimal }) : "";
  const [texto, setTexto] = useState(() => formatar(value));
  const lido = ler(texto) ?? 0;
  if (Math.abs(lido - (value || 0)) > 1e-9 && formatar(value) !== texto) {
    // Valor trocado por fora (prefill, botão): reflete no campo. Padrão do
    // React para estado derivado de prop, sem efeito.
    setTexto(formatar(value));
  }
  return (
    <Campo label={label} hint={hint} htmlFor={id}>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        value={texto}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => {
          setTexto(e.target.value);
          onChange(ler(e.target.value) ?? 0);
        }}
      />
    </Campo>
  );
}

function Kpi({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div className="mt-0.5 font-display text-lg font-bold">{valor}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
