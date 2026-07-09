import { useState } from "react";
import { ArrowRight, BadgeCheck, ChevronDown, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { LpSection } from "@/components/lp-jd-bonfiglioli/lp-section";
import {
  avaliarPlantas,
  formatBRL,
  SIM_DEFAULTS,
  tetoImovelParaRenda,
  type SimulacaoLead,
} from "@/lib/lp-jd-bonfiglioli";
import { parseValorBR } from "@/lib/simulador";

type LpSimuladorProps = {
  onGarantir: (sim: SimulacaoLead) => void;
};

/** Simulação rápida por renda: estimativa transparente + captura qualificada. */
export function LpSimulador({ onGarantir }: LpSimuladorProps) {
  const [rendaStr, setRendaStr] = useState("");
  const [entradaStr, setEntradaStr] = useState("");
  const [jurosStr, setJurosStr] = useState(String(SIM_DEFAULTS.jurosAnual));
  const [mesesStr, setMesesStr] = useState(String(SIM_DEFAULTS.meses));
  const [premissasAbertas, setPremissasAbertas] = useState(false);

  const renda = parseValorBR(rendaStr);
  const entrada = parseValorBR(entradaStr);
  const jurosAnual = parseValorBR(jurosStr) ?? SIM_DEFAULTS.jurosAnual;
  const meses = Math.max(1, Math.round(parseValorBR(mesesStr) ?? SIM_DEFAULTS.meses));

  const temRenda = renda != null && renda > 0;
  const resultados = avaliarPlantas(temRenda ? renda : null, { jurosAnual, meses, entrada });
  const porPreco = [...resultados].sort((a, b) => a.planta.preco - b.planta.preco);
  const queCabem = porPreco.filter((r) => r.cabe);
  const melhor = queCabem[0] ?? null;

  const garantir = () => {
    if (!temRenda) return;
    const base = melhor ?? porPreco[0];
    onGarantir({
      renda,
      entrada: entrada ?? null,
      parcela: Math.round(base.parcela),
      financiamento: Math.round(base.planta.preco - base.entrada),
      tetoImovel: Math.round(
        tetoImovelParaRenda(renda, { jurosAnual, meses, entrada: entrada ?? 0 }),
      ),
      segmento: base.planta.segmento,
    });
  };

  return (
    <LpSection
      id="simular"
      eyebrow="Simulação rápida"
      title="Veja se a sua renda aprova — em menos de 1 minuto"
      subtitle="Digite sua renda familiar e descubra a parcela estimada de cada planta. Sem cadastro, sem compromisso."
    >
      <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        {/* Entradas */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <Label htmlFor="lp-renda" className="text-base font-medium text-navy">
            Renda familiar mensal
          </Label>
          <Input
            id="lp-renda"
            inputMode="numeric"
            placeholder="Ex.: 3.500"
            value={rendaStr}
            onChange={(e) => setRendaStr(e.target.value)}
            className="mt-2 h-12 text-base"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Pode somar a renda de quem vai compor a compra com você.
          </p>

          <Label htmlFor="lp-entrada" className="mt-5 block text-base font-medium text-navy">
            Entrada disponível <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            id="lp-entrada"
            inputMode="numeric"
            placeholder="Ex.: 20.000 — FGTS conta"
            value={entradaStr}
            onChange={(e) => setEntradaStr(e.target.value)}
            className="mt-2 h-12 text-base"
          />

          <Collapsible open={premissasAbertas} onOpenChange={setPremissasAbertas} className="mt-5">
            <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium text-navy/80 hover:text-navy">
              <ChevronDown
                className={cn("size-4 transition-transform", premissasAbertas && "rotate-180")}
              />
              Ajustar premissas da estimativa
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="lp-juros" className="text-xs text-muted-foreground">
                  Juros (% ao ano)
                </Label>
                <Input
                  id="lp-juros"
                  inputMode="decimal"
                  value={jurosStr}
                  onChange={(e) => setJurosStr(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="lp-meses" className="text-xs text-muted-foreground">
                  Prazo (meses)
                </Label>
                <Input
                  id="lp-meses"
                  inputMode="numeric"
                  value={mesesStr}
                  onChange={(e) => setMesesStr(e.target.value)}
                  className="mt-1"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          <p className="mt-5 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Estimativa pela tabela Price com parcela limitada a 30% da renda e entrada padrão de
            10%. Não é proposta de crédito nem garantia de aprovação.
          </p>
        </div>

        {/* Resultado */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          {!temRenda ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
              <p className="font-medium text-navy">Digite sua renda ao lado</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                para ver a parcela estimada de cada uma das 7 plantas do lançamento.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-xl bg-navy p-5 text-white">
                {melhor ? (
                  <>
                    <p className="flex items-center gap-2 text-sm text-white/70">
                      <BadgeCheck className="size-4 text-gold" />
                      Com renda de {formatBRL(renda)}, sua parcela estimada começa em
                    </p>
                    <p className="mt-1 text-3xl font-bold text-gold">
                      ~{formatBRL(Math.round(melhor.parcela))}
                      <span className="text-base font-medium text-white/70">/mês</span>
                    </p>
                    <p className="mt-1 text-sm text-white/70">
                      na planta de {melhor.planta.metragem} m² — e {queCabem.length} das 7 plantas
                      cabem no seu perfil.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-white/70">
                      Com essas premissas, a parcela estimada passa de 30% da sua renda.
                    </p>
                    <p className="mt-2 text-pretty font-medium">
                      Mas calma: subsídios, composição de renda e condições do programa mudam esse
                      resultado. Vale uma análise personalizada — gratuita.
                    </p>
                  </>
                )}
              </div>

              <ul className="mt-4 space-y-2">
                {porPreco.map((r) => (
                  <li
                    key={r.planta.id}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-navy">
                      {r.planta.metragem} m²{" "}
                      <span className="font-normal text-muted-foreground">
                        · {r.planta.segmento}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      ~{formatBRL(Math.round(r.parcela))}/mês
                    </span>
                    {r.cabe ? (
                      <Badge className="border-none bg-success/15 text-success">cabe</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        renda ~{formatBRL(Math.ceil(r.rendaMinima / 100) * 100)}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>

              <Button
                type="button"
                className="mt-5 h-12 w-full bg-gold text-base font-semibold text-navy hover:bg-gold/90"
                onClick={garantir}
              >
                {melhor
                  ? "Confirmar essa simulação com um especialista"
                  : "Pedir análise personalizada grátis"}
                <ArrowRight />
              </Button>
            </>
          )}
        </div>
      </div>
    </LpSection>
  );
}
