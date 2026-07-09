import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { LpSection } from "@/components/lp-jd-bonfiglioli/lp-section";
import { FAQ_ITEMS } from "@/lib/lp-jd-bonfiglioli";

/** Perguntas frequentes comerciais, com respostas honestas sobre o que falta confirmar. */
export function LpFaq() {
  return (
    <LpSection
      id="faq"
      variant="muted"
      eyebrow="Perguntas frequentes"
      title="O que todo mundo pergunta antes de simular"
      align="center"
    >
      <Accordion type="single" collapsible className="mx-auto max-w-3xl">
        {FAQ_ITEMS.map((item) => (
          <AccordionItem key={item.pergunta} value={item.pergunta}>
            <AccordionTrigger className="text-left font-semibold text-navy">
              {item.pergunta}
            </AccordionTrigger>
            <AccordionContent className="text-pretty leading-relaxed text-muted-foreground">
              {item.resposta}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </LpSection>
  );
}
