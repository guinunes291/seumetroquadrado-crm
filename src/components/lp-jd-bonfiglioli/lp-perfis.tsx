import type { LucideIcon } from "lucide-react";
import { GraduationCap, Heart, KeyRound, TrendingUp } from "lucide-react";
import { LpSection } from "@/components/lp-jd-bonfiglioli/lp-section";

type Perfil = { icon: LucideIcon; titulo: string; texto: string };

const PERFIS: Perfil[] = [
  {
    icon: KeyRound,
    titulo: "Para quem quer sair do aluguel",
    texto:
      "Trocar o boleto que não volta por uma parcela que constrói patrimônio — com apoio na análise de crédito do primeiro imóvel.",
  },
  {
    icon: Heart,
    titulo: "Para o casal começando a vida",
    texto:
      "Apartamento novo, de 2 dormitórios, com a cara de vocês — e um tíquete de entrada que cabe no planejamento.",
  },
  {
    icon: GraduationCap,
    titulo: "Para quem vive a Zona Oeste",
    texto:
      "Trabalha ou estuda na região do Butantã e arredores? More perto da sua rotina, com o metrô como aliado.",
  },
  {
    icon: TrendingUp,
    titulo: "Para quem investe",
    texto:
      "Unidades compactas, tabela de lançamento e bairro com metrô: os ingredientes clássicos de um bom primeiro investimento.",
  },
];

/** Cards de identificação de público — "esse lançamento é para mim". */
export function LpPerfis() {
  return (
    <LpSection
      id="perfis"
      variant="muted"
      eyebrow="Para quem é"
      title="Esse lançamento foi pensado para o seu momento?"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {PERFIS.map(({ icon: Icon, titulo, texto }) => (
          <article
            key={titulo}
            className="flex items-start gap-4 rounded-2xl border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-navy text-gold">
              <Icon className="size-5" />
            </div>
            <div>
              <h3 className="font-semibold text-navy">{titulo}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{texto}</p>
            </div>
          </article>
        ))}
      </div>
    </LpSection>
  );
}
