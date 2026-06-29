import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Bot,
  Sparkles,
  Loader2,
  Search,
  ChevronRight,
  Building2,
  Check,
  X,
  Calculator,
} from "lucide-react";
import { toast } from "sonner";

import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buscarProjetosIA, type BuscaIAResultado } from "@/lib/match-ia.functions";
import { calcularOrcamento, avaliarAderencia, brl } from "@/lib/orcamento";

const EXEMPLOS = [
  "Zona Oeste próximo à estação, 2 dormitórios, até R$350 mil sem vaga",
  "MCMV HIS2 Zona Norte, 1 ou 2 dorms, entrada disponível pelo FGTS",
  "Lançamento Zona Sul, 2 ou 3 dorms com 1 vaga, até R$600 mil, entrega 2026",
];

function corPontuacao(p: number) {
  if (p >= 9) return "bg-emerald-600 text-white";
  if (p >= 7) return "bg-blue-600 text-white";
  if (p >= 5) return "bg-amber-500 text-white";
  return "bg-muted text-muted-foreground";
}

const BORDA = ["border-l-primary", "border-l-primary/70", "border-l-primary/40"];

export function BuscadorIA({ leadId }: { leadId?: string }) {
  const [descricao, setDescricao] = useState("");
  const [renda, setRenda] = useState<number>(0);
  const [entrada, setEntrada] = useState<number>(0);
  const [fgts, setFgts] = useState<number>(0);
  const [tem36, setTem36] = useState<boolean>(false);
  const [temDependente, setTemDependente] = useState<boolean>(false);
  const buscar = useServerFn(buscarProjetosIA);

  const orc = useMemo(
    () =>
      renda > 0
        ? calcularOrcamento({
            renda,
            tem36MesesRegistro: tem36,
            temDependente,
            fgts,
            entrada,
          })
        : null,
    [renda, tem36, temDependente, fgts, entrada],
  );

  const mutation = useMutation({
    mutationFn: (descricao: string) =>
      buscar({ data: { descricao, leadId } }) as Promise<BuscaIAResultado>,
    onError: (err: Error) => toast.error(`Erro na busca: ${err.message}`),
  });

  const handleBuscar = () => {
    const d = descricao.trim();
    if (d.length < 10) {
      toast.error("Descreva melhor o que busca (mínimo 10 caracteres)");
      return;
    }
    // Injeta a pré-qualificação APROVE no texto enviado à IA (sem poluir o campo).
    const preQ =
      orc && orc.enquadra
        ? ` Pré-qualificação APROVE 2026: Faixa ${orc.faixa} (${orc.segmento}), ` +
          `teto de imóvel ~${brl(orc.tetoImovel)}, parcela estimada ${brl(orc.parcelaEstimada)}. ` +
          `Priorize empreendimentos com preço até o teto.`
        : "";
    mutation.mutate(d + preQ);
  };

  const resultado = mutation.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Buscador de Projetos por IA</h2>
          <p className="text-sm text-muted-foreground">
            Descreva em linguagem natural o que o cliente procura — a IA pesquisa no catálogo e
            rankeia os empreendimentos.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <Textarea
            placeholder="Ex: Projeto na Zona Oeste próximo à estação com 1 ou 2 dorms, até R$300 mil sem vaga e entrega até final de 2027..."
            className="min-h-[120px] resize-none text-base"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleBuscar();
            }}
          />

          {!descricao && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Exemplos
              </p>
              <div className="flex flex-wrap gap-2">
                {EXEMPLOS.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setDescricao(ex)}
                    className="text-xs px-3 py-1.5 bg-muted hover:bg-accent border border-border rounded-full transition-colors text-left"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pré-qualificação APROVE 2026 — opcional, mas filtra o match pelo poder de compra real. */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Calculator className="h-4 w-4 text-primary" />
              Pré-qualificação do cliente (APROVE 2026)
              <span className="text-xs font-normal text-muted-foreground">— opcional</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs">Renda familiar</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={renda || ""}
                  onChange={(e) => setRenda(Number(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-xs">Entrada</Label>
                <Input
                  type="number"
                  value={entrada || ""}
                  onChange={(e) => setEntrada(Number(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-xs">FGTS</Label>
                <Input
                  type="number"
                  value={fgts || ""}
                  onChange={(e) => setFgts(Number(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={tem36} onCheckedChange={setTem36} />
                36 meses de registro
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={temDependente} onCheckedChange={setTemDependente} />
                Tem dependente
              </label>
            </div>
            {orc &&
              (orc.enquadra ? (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge variant="secondary">Faixa {orc.faixa}</Badge>
                  <Badge variant="outline">{orc.segmento}</Badge>
                  <span className="font-medium">teto {brl(orc.tetoImovel)}</span>
                  <span className="text-muted-foreground">
                    · parcela {brl(orc.parcelaEstimada)} · taxa {orc.taxaEfetiva}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-amber-700">{orc.motivoNaoEnquadra}</p>
              ))}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {leadId ? (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  Buscando para o lead #{leadId}
                </span>
              ) : (
                "Ctrl+Enter para buscar"
              )}
            </p>
            <Button onClick={handleBuscar} disabled={mutation.isPending || descricao.trim().length < 10}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analisando catálogo...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Buscar projetos
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {resultado && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 p-4 bg-primary/5 rounded-lg border border-primary/20">
            <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-sm">{resultado.resumo}</p>
          </div>

          {Object.values(resultado.filtrosUsados).some(Boolean) && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground">Filtros detectados:</span>
              {Object.entries(resultado.filtrosUsados).map(([k, v]) =>
                v ? (
                  <Badge key={k} variant="secondary" className="text-xs">
                    {k}: {v}
                  </Badge>
                ) : null,
              )}
            </div>
          )}

          {resultado.projetos.length === 0 ? (
            <Card>
              <CardContent className="py-14 text-center space-y-2">
                <Search className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="font-medium text-muted-foreground">Nenhum projeto encontrado</p>
                <p className="text-sm text-muted-foreground">
                  Tente ampliar os critérios ou alterar a região buscada.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {resultado.projetos.map((proj, idx) => {
                const aderencia =
                  orc && orc.enquadra && proj.preco_a_partir != null
                    ? avaliarAderencia(proj.preco_a_partir, orc)
                    : null;
                return (
                  <Card key={proj.id} className={`border-l-4 ${BORDA[idx] ?? "border-l-primary/30"}`}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-base">{proj.nome}</h3>
                              {proj.construtora && (
                                <Badge variant="outline" className="text-xs">
                                  {proj.construtora}
                                </Badge>
                              )}
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${corPontuacao(proj.pontuacao)}`}
                              >
                                {proj.pontuacao}/10
                              </span>
                            </div>
                            {(proj.bairro || proj.cidade) && (
                              <p className="text-xs text-muted-foreground">
                                {[proj.bairro, proj.cidade].filter(Boolean).join(" · ")}
                              </p>
                            )}
                            {proj.tipologiaRecomendada && (
                              <p className="text-sm font-medium text-primary">
                                {proj.tipologiaRecomendada}
                              </p>
                            )}
                            {proj.preco_a_partir != null && (
                              <p className="text-sm text-muted-foreground">
                                a partir de {brl(proj.preco_a_partir)}
                              </p>
                            )}
                            {aderencia && (
                              <p
                                className={`inline-flex items-center gap-1 text-xs font-medium ${
                                  aderencia.cabe ? "text-emerald-600" : "text-rose-600"
                                }`}
                              >
                                {aderencia.cabe ? (
                                  <>
                                    <Check className="h-3 w-3" /> Cabe no orçamento · folga{" "}
                                    {brl(aderencia.folga)}
                                  </>
                                ) : (
                                  <>
                                    <X className="h-3 w-3" />{" "}
                                    {aderencia.folga < 0
                                      ? `${brl(-aderencia.folga)} acima do teto`
                                      : `parcelamento ${aderencia.percentualConstrutora}% > 20%`}
                                  </>
                                )}
                              </p>
                            )}
                            <p className="text-sm">{proj.motivo}</p>
                          </div>
                        </div>
                        <Button asChild variant="ghost" size="sm" className="shrink-0">
                          <Link to="/projetos/$projetoId" params={{ projetoId: proj.id }}>
                            Ver <ChevronRight className="h-3 w-3 ml-1" />
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
