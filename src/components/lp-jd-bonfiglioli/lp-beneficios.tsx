import type { LucideIcon } from "lucide-react";
import { BadgePercent, KeyRound, Ruler, TrainFront, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { LpSection } from "@/components/lp-jd-bonfiglioli/lp-section";

type Beneficio = { icon: LucideIcon; titulo: string; texto: string };

const BENEFICIOS: Beneficio[] = [
  {
    icon: Wallet,
    titulo: "Menor preço da Zona Oeste*",
    texto: "2 dormitórios a partir de R$ 237.900 — um valor difícil de encontrar na região.",
  },
  {
    icon: TrainFront,
    titulo: "Metrô por perto",
    texto: "Próximo à Estação Vila Sônia, na Linha 4-Amarela: a cidade inteira ao seu alcance.",
  },
  {
    icon: BadgePercent,
    titulo: "Cheque Bônus de R$ 2.000",
    texto: "Benefício do lançamento para aliviar o começo da sua compra.",
  },
  {
    icon: Ruler,
    titulo: "7 plantas de 32 a 42 m²",
    texto: "Todas de 2 dormitórios, incluindo a planta inédita e exclusiva de 41 m².",
  },
  {
    icon: KeyRound,
    titulo: "Feito para sair do aluguel",
    texto: "Simulação gratuita e equipe cuidando da sua aprovação do início ao fim.",
  },
];

/** Bloco de argumentos rápidos logo após o hero. */
export function LpBeneficios() {
  return (
    <LpSection
      eyebrow="Por que este lançamento"
      title="Os motivos que fazem o Vibra Jardim Bonfiglioli valer a sua atenção"
    >
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-5">
        {BENEFICIOS.map(({ icon: Icon, titulo, texto }, i) => (
          <article
            key={titulo}
            className={cn(
              "rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
              i === BENEFICIOS.length - 1 && "col-span-2 lg:col-span-1",
            )}
          >
            <div className="flex size-11 items-center justify-center rounded-xl bg-navy text-gold">
              <Icon className="size-5" />
            </div>
            <h3 className="mt-4 font-semibold leading-snug text-navy">{titulo}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{texto}</p>
          </article>
        ))}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        *Condição comercial do lançamento — valores sujeitos à alteração e disponibilidade.
      </p>
    </LpSection>
  );
}
