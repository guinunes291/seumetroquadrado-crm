import { useState } from "react";
import { ArrowRight, Home, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LpSection } from "@/components/lp-jd-bonfiglioli/lp-section";
import { avaliarPlantas, formatBRL, scrollToLpId } from "@/lib/lp-jd-bonfiglioli";
import { parseValorBR } from "@/lib/simulador";

type LpAluguelProps = {
  onAluguelChange: (valor: number | null) => void;
};

/** Comparação emocional: aluguel que não volta × parcela que vira patrimônio. */
export function LpAluguel({ onAluguelChange }: LpAluguelProps) {
  const [aluguelStr, setAluguelStr] = useState("");
  const aluguel = parseValorBR(aluguelStr);

  // Parcela estimada da planta de entrada (32 m²) com as premissas padrão.
  const parcela32 = avaliarPlantas(null)[0].parcela;

  return (
    <LpSection
      id="aluguel"
      eyebrow="Aluguel × patrimônio"
      title="Você pode seguir pagando o imóvel de outra pessoa — ou começar a pagar o seu"
      subtitle="O aluguel resolve o mês, mas não constrói nada. A parcela do financiamento, sim: todo mês uma parte do imóvel passa a ser sua."
    >
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border bg-card p-6 shadow-sm md:p-8">
          <Label htmlFor="lp-aluguel" className="text-base font-medium text-navy">
            Quanto você paga de aluguel hoje?
          </Label>
          <Input
            id="lp-aluguel"
            inputMode="numeric"
            placeholder="Ex.: 1.800"
            value={aluguelStr}
            onChange={(e) => {
              setAluguelStr(e.target.value);
              onAluguelChange(parseValorBR(e.target.value));
            }}
            className="mt-2 h-12 text-base"
          />

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <Receipt className="size-4" />5 anos de aluguel
              </div>
              <p className="mt-2 text-3xl font-bold tracking-tight text-destructive">
                {aluguel && aluguel > 0 ? formatBRL(aluguel * 60) : "R$ —"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Vira recibo. Esse valor não volta e não constrói nada seu.
              </p>
            </div>

            <div className="rounded-xl border border-success/20 bg-success/5 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-success">
                <Home className="size-4" />
                Parcela estimada no 32 m²
              </div>
              <p className="mt-2 text-3xl font-bold tracking-tight text-success">
                ~{formatBRL(parcela32)}
                <span className="text-base font-medium text-muted-foreground">/mês</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Constrói patrimônio no seu nome — e o FGTS pode ajudar na compra.
              </p>
            </div>
          </div>

          <Button
            type="button"
            className="mt-6 h-12 w-full bg-navy text-base font-semibold text-white hover:bg-navy/90 sm:w-auto sm:px-8"
            onClick={() => scrollToLpId("simular")}
          >
            Comparar com a minha renda
            <ArrowRight />
          </Button>

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Parcela estimada pela tabela Price com entrada de 10%, juros de 10% a.a. e 360 meses —
            premissas ajustáveis na simulação. Não é proposta de crédito: condições reais dependem
            de análise e das regras do programa.
          </p>
        </div>
      </div>
    </LpSection>
  );
}
