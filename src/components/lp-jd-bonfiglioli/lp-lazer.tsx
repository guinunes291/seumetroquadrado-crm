import type { LucideIcon } from "lucide-react";
import { Baby, Dumbbell, PartyPopper, Trees } from "lucide-react";
import { LpSection } from "@/components/lp-jd-bonfiglioli/lp-section";

type ItemLazer = { icon: LucideIcon; titulo: string; texto: string };

// O material confirma "lazer completo", mas não a lista de itens — por isso os
// cards vendem a experiência por categoria, e o rodapé deixa claro que a lista
// oficial sai no lançamento.
const EXPERIENCIAS: ItemLazer[] = [
  {
    icon: PartyPopper,
    titulo: "Receber bem",
    texto: "Comemorações e encontros com amigos sem precisar sair do condomínio.",
  },
  {
    icon: Baby,
    titulo: "Crianças por perto",
    texto: "Espaço para brincar com mais segurança e praticidade na rotina da família.",
  },
  {
    icon: Dumbbell,
    titulo: "Rotina saudável",
    texto: "Cuidar do corpo perto de casa, sem mensalidade extra nem deslocamento.",
  },
  {
    icon: Trees,
    titulo: "Respiro no dia a dia",
    texto: "Áreas de convivência para desacelerar depois do trabalho.",
  },
];

/** Lazer como benefício de estilo de vida (itens oficiais a confirmar). */
export function LpLazer() {
  return (
    <LpSection
      id="lazer"
      variant="muted"
      eyebrow="Lazer completo"
      title="Um condomínio que funciona como extensão da sua casa"
      subtitle="O empreendimento chega com proposta de lazer completo. Veja o que isso significa na prática:"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {EXPERIENCIAS.map(({ icon: Icon, titulo, texto }) => (
          <article
            key={titulo}
            className="rounded-2xl border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex size-11 items-center justify-center rounded-xl bg-gold/15 text-navy">
              <Icon className="size-5" />
            </div>
            <h3 className="mt-4 font-semibold text-navy">{titulo}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{texto}</p>
          </article>
        ))}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        A lista oficial dos itens de lazer será divulgada no lançamento. Cadastre-se para receber o
        book completo do empreendimento.
      </p>
    </LpSection>
  );
}
