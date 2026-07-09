import { BadgePercent, Landmark, PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LpSection } from "@/components/lp-jd-bonfiglioli/lp-section";
import {
  DISCLAIMER_CREDITO,
  DISCLAIMER_VALORES,
  formatBRL,
  LP_CONFIG,
  scrollToLpId,
} from "@/lib/lp-jd-bonfiglioli";

/** Bloco de condições de compra — só o que está confirmado, com disclaimer visível. */
export function LpCondicoes() {
  const condicoes = [
    {
      icon: BadgePercent,
      titulo: `Cheque Bônus de ${formatBRL(LP_CONFIG.chequeBonus)}`,
      texto: "Benefício confirmado do lançamento para usar a seu favor na negociação da unidade.",
    },
    {
      icon: Landmark,
      titulo: "Financiamento com quem entende",
      texto:
        "Nossa equipe monta a simulação, verifica seu enquadramento nos programas habitacionais vigentes e acompanha a análise no banco.",
    },
    {
      icon: PiggyBank,
      titulo: "Seu FGTS pode ajudar",
      texto:
        "O saldo do FGTS pode entrar na composição da compra do primeiro imóvel, conforme as regras do programa.",
    },
  ];

  return (
    <LpSection
      id="condicoes"
      variant="navy"
      eyebrow="Condições de compra"
      title="Comprar seu primeiro imóvel é mais simples do que parece"
      subtitle="Você não precisa entender de banco, tabela ou programa habitacional — esse é o nosso trabalho. O seu é dar o primeiro passo."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {condicoes.map(({ icon: Icon, titulo, texto }) => (
          <article
            key={titulo}
            className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur"
          >
            <div className="flex size-11 items-center justify-center rounded-xl bg-gold text-navy">
              <Icon className="size-5" />
            </div>
            <h3 className="mt-4 font-semibold text-white">{titulo}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-white/70">{texto}</p>
          </article>
        ))}
      </div>

      <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl border border-gold/30 bg-gold/10 p-6 md:flex-row md:items-center">
        <p className="text-pretty text-white/90">
          <strong className="text-gold">Renda mínima e condições de entrada</strong> serão
          confirmadas na abertura oficial das vendas. Cadastre-se e receba a tabela completa em
          primeira mão.
        </p>
        <Button
          type="button"
          className="shrink-0 bg-gold font-semibold text-navy hover:bg-gold/90"
          onClick={() => scrollToLpId("form")}
        >
          Receber tabela atualizada
        </Button>
      </div>

      <p className="mt-8 max-w-3xl text-xs leading-relaxed text-white/50">
        {DISCLAIMER_CREDITO} {DISCLAIMER_VALORES}
      </p>
    </LpSection>
  );
}
