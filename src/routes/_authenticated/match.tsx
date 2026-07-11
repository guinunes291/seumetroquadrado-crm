import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ArrowRight, CheckCircle2, XCircle, Building2 } from "lucide-react";
import {
  calcularOrcamento,
  avaliarAderencia,
  brl,
  type DadosCliente,
  type ResultadoOrcamento,
} from "@/lib/orcamento";
import type { ProjetoRow } from "@/components/projeto-card";
import { Link } from "@tanstack/react-router";
import { z } from "zod";
import {
  ProjetosFilters,
  applyFilters,
  emptyFilters,
  type Filters,
} from "@/components/projetos-filters";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BuscadorIA } from "@/components/match/buscador-ia";
import { Calculator, Bot } from "lucide-react";

const searchSchema = z.object({
  leadId: z.string().optional(),
  mode: z.enum(["financeiro", "ia"]).optional(),
});

export const Route = createFileRoute("/_authenticated/match")({
  head: () => ({ meta: [{ title: "Match — Seu Metro Quadrado" }] }),
  validateSearch: searchSchema,
  component: MatchPage,
});


type Step = 1 | 2 | 3;

function MatchPage() {
  const [step, setStep] = useState<Step>(1);
  const [cliente, setCliente] = useState<DadosCliente>({
    renda: 0,
    tem36MesesRegistro: false,
    temDependente: false,
    fgts: 0,
    entrada: 0,
  });
  const [ajuste, setAjuste] = useState<number>(100); // 80..120
  const [mostrarForaSegmento, setMostrarForaSegmento] = useState(false);
  const [filters, setFilters] = useState<Filters>(emptyFilters);


  const orc = useMemo<ResultadoOrcamento | null>(() => {
    if (!cliente.renda || cliente.renda <= 0) return null;
    return calcularOrcamento(cliente);
  }, [cliente]);

  const projetosQ = useQuery({
    queryKey: ["match-projetos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos")
        .select("*")
        .eq("ativo", true)
        .is("deleted_at", null)
        .order("preco_a_partir", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProjetoRow[];
    },
    enabled: step === 3,
  });

  const tetoAjustado = orc ? Math.round(orc.tetoImovel * (ajuste / 100)) : 0;

  const { leadId, mode } = Route.useSearch();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Match Cliente ↔ Empreendimento"
        description="Calcule o poder de compra ou descreva o que o cliente busca em linguagem natural."
      />

      <Tabs defaultValue={mode ?? "financeiro"} className="space-y-6">
        <TabsList>
          <TabsTrigger value="financeiro" className="gap-2">
            <Calculator className="h-4 w-4" /> Match financeiro
          </TabsTrigger>
          <TabsTrigger value="ia" className="gap-2">
            <Bot className="h-4 w-4" /> Buscador IA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="financeiro" className="space-y-6">


      {/* Stepper */}
      <div className="flex items-center gap-2 text-sm">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full border ${
                step === n
                  ? "bg-primary text-primary-foreground border-primary"
                  : step > n
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {n}
            </div>
            <span className={step === n ? "font-medium" : "text-muted-foreground"}>
              {n === 1 ? "Cliente" : n === 2 ? "Orçamento" : "Match"}
            </span>
            {n < 3 && <div className="w-8 h-px bg-border" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Dados do cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 max-w-2xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Renda familiar bruta (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  value={cliente.renda || ""}
                  onChange={(e) =>
                    setCliente((c) => ({ ...c, renda: Number(e.target.value) || 0 }))
                  }
                  placeholder="ex: 5500"
                />
              </div>
              <div className="space-y-2">
                <Label>FGTS disponível (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  value={cliente.fgts || ""}
                  onChange={(e) =>
                    setCliente((c) => ({ ...c, fgts: Number(e.target.value) || 0 }))
                  }
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Entrada / recursos próprios (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  value={cliente.entrada || ""}
                  onChange={(e) =>
                    setCliente((c) => ({ ...c, entrada: Number(e.target.value) || 0 }))
                  }
                  placeholder="0"
                />
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">36 meses de registro em carteira</Label>
                <p className="text-xs text-muted-foreground">
                  Habilita o redutor de taxa (financia mais).
                </p>
              </div>
              <Switch
                checked={cliente.tem36MesesRegistro}
                onCheckedChange={(v) =>
                  setCliente((c) => ({ ...c, tem36MesesRegistro: v }))
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Tem dependente</Label>
                <p className="text-xs text-muted-foreground">
                  Afeta o subsídio (apenas Faixa 1).
                </p>
              </div>
              <Switch
                checked={cliente.temDependente}
                onCheckedChange={(v) => setCliente((c) => ({ ...c, temDependente: v }))}
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => setStep(2)}
                disabled={!cliente.renda || cliente.renda <= 0}
              >
                Próximo: Orçamento <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && orc && (
        <Card>
          <CardHeader>
            <CardTitle>Orçamento do cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!orc.enquadra ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {orc.motivoNaoEnquadra}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Info label="Faixa" value={`F${orc.faixa} · ${orc.segmento}`} />
                  <Info label="Parcela estimada" value={brl(orc.parcelaEstimada)} />
                  <Info
                    label="Taxa efetiva"
                    value={`${orc.taxaEfetiva}${orc.usouRedutor ? " (c/ redutor)" : ""}`}
                  />
                  <Info label="Renda consultada" value={brl(orc.rendaConsultada)} />
                </div>

                <Separator />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Info label="Financiamento" value={brl(orc.financiamento)} />
                  <Info label="Subsídio" value={brl(orc.subsidio)} />
                  <Info label="FGTS" value={brl(orc.fgts)} />
                  <Info label="Entrada" value={brl(orc.entrada)} />
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Info
                    label="Recursos não-construtora"
                    value={brl(orc.recursosNaoConstrutora)}
                  />
                  <Info
                    label="Teto de avaliação (segmento)"
                    value={brl(orc.tetoAvaliacaoSegmento)}
                  />
                  <div className="rounded-md bg-primary/5 border border-primary/30 p-3">
                    <div className="text-xs text-muted-foreground">Teto de imóvel (80/20)</div>
                    <div className="text-2xl font-bold text-primary">
                      {brl(orc.tetoImovel)}
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
              </Button>
              <Button onClick={() => setStep(3)} disabled={!orc.enquadra}>
                Próximo: Match <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && orc && orc.enquadra && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Teto base</div>
                  <div className="text-lg font-semibold">{brl(orc.tetoImovel)}</div>
                </div>
                <div className="flex-1 max-w-md">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>Ajuste manual: {ajuste}%</span>
                    <span>Teto ajustado: {brl(tetoAjustado)}</span>
                  </div>
                  <Slider
                    value={[ajuste]}
                    min={80}
                    max={120}
                    step={1}
                    onValueChange={(v) => setAjuste(v[0])}
                  />
                </div>
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                </Button>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <Label className="text-sm">Mostrar imóveis fora do segmento</Label>
                  <p className="text-xs text-muted-foreground">
                    Inclui empreendimentos acima do teto de avaliação ({brl(orc.tetoAvaliacaoSegmento)}).
                  </p>
                </div>
                <Switch
                  checked={mostrarForaSegmento}
                  onCheckedChange={setMostrarForaSegmento}
                />
              </div>
            </CardContent>
          </Card>

          {projetosQ.isLoading && (
            <div className="text-sm text-muted-foreground">Carregando estoque…</div>
          )}

          {projetosQ.data && (
            <>
              <ProjetosFilters
                projetos={projetosQ.data}
                filters={filters}
                onChange={setFilters}
              />
              <MatchList
                projetos={applyFilters(projetosQ.data, filters)}
                orc={orc}
                ajuste={ajuste / 100}
                mostrarForaSegmento={mostrarForaSegmento}
              />
            </>
          )}
        </div>
      )}
        </TabsContent>

        <TabsContent value="ia">
          <BuscadorIA leadId={leadId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}


function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function MatchList({
  projetos,
  orc,
  ajuste,
  mostrarForaSegmento,
}: {
  projetos: ProjetoRow[];
  orc: ResultadoOrcamento;
  ajuste: number;
  mostrarForaSegmento: boolean;
}) {
  // ajuste em fração (0.8 .. 1.2): usamos orçamento "virtual" com teto ajustado
  // mantendo os recursos (regra 80/20 escala proporcionalmente).
  const orcAjustado: ResultadoOrcamento = {
    ...orc,
    tetoImovel: Math.round(orc.tetoImovel * ajuste),
    tetoAvaliacaoSegmento: Math.round(orc.tetoAvaliacaoSegmento * ajuste),
    recursosNaoConstrutora: orc.recursosNaoConstrutora * ajuste,
  };

  const semPreco = projetos.filter(
    (p) => p.preco_a_partir == null || p.preco_a_partir <= 0,
  ).length;

  const todos = projetos
    .filter((p) => p.preco_a_partir != null && p.preco_a_partir > 0)
    .map((p) => ({
      projeto: p,
      aderencia: avaliarAderencia(p.preco_a_partir!, orcAjustado),
    }))
    .sort((a, b) => {
      if (a.aderencia.cabe !== b.aderencia.cabe) return a.aderencia.cabe ? -1 : 1;
      // dentro do mesmo grupo, prioriza menor preço
      return (a.projeto.preco_a_partir ?? 0) - (b.projeto.preco_a_partir ?? 0);
    });

  const items = mostrarForaSegmento
    ? todos
    : todos.filter((i) => i.aderencia.dentroDaAvaliacao);

  const cabem = items.filter((i) => i.aderencia.cabe).length;
  const ocultos = todos.length - items.length;

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        {cabem} de {items.length} empreendimentos cabem no orçamento.
        {ocultos > 0 && !mostrarForaSegmento && (
          <span className="ml-1">
            ({ocultos} ocultos por estarem acima do teto de avaliação do segmento)
          </span>
        )}
        {semPreco > 0 && (
          <span className="ml-1 text-amber-600">
            ({semPreco} empreendimento{semPreco > 1 ? "s" : ""} sem preço cadastrado — não entram no match)
          </span>
        )}
      </div>

      {items.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground space-y-2">
            <div>
              {semPreco > 0
                ? `Os ${semPreco} empreendimento${semPreco > 1 ? "s" : ""} desse filtro não têm preço cadastrado, por isso não entram no match. Cadastre o "preço a partir" no detalhe do empreendimento para que apareçam aqui.`
                : `Nenhum empreendimento dentro do segmento. Ative "Mostrar imóveis fora do segmento" para ver o estoque completo.`}
            </div>
          </CardContent>
        </Card>
      )}


      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map(({ projeto: p, aderencia: a }) => (
          <Card
            key={p.id}
            className={a.cabe ? "border-primary/40" : "opacity-70"}
          >
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link
                    to="/projetos/$projetoId"
                    params={{ projetoId: p.id }}
                    className="font-semibold hover:underline flex items-center gap-2"
                  >
                    <Building2 className="h-4 w-4" />
                    {p.nome}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {[p.bairro, p.cidade].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                {a.cabe ? (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Cabe
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="h-3 w-3" /> Não cabe
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Preço a partir</div>
                  <div className="font-medium">{brl(p.preco_a_partir!)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Folga vs teto</div>
                  <div
                    className={`font-medium ${
                      a.folga >= 0 ? "text-emerald-600" : "text-destructive"
                    }`}
                  >
                    {a.folga >= 0 ? "+" : ""}
                    {brl(a.folga)}
                  </div>
                </div>
                {a.dentroDaAvaliacao && (
                  <>
                    <div>
                      <div className="text-xs text-muted-foreground">Saldo construtora (total)</div>
                      <div className="font-medium">{brl(a.valorParcelarConstrutora)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">% construtora</div>
                      <div
                        className={`font-medium ${
                          a.estouraParcelamento ? "text-destructive" : ""
                        }`}
                      >
                        {a.percentualConstrutora.toFixed(1)}%
                      </div>
                    </div>
                  </>
                )}
              </div>

              {!a.dentroDaAvaliacao && (
                <div className="text-xs text-destructive">
                  Acima do teto de avaliação do segmento ({brl(orcAjustado.tetoAvaliacaoSegmento)}). Imóvel não é elegível ao programa.
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

