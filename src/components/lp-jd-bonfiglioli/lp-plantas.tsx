import { BedDouble, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LpSection } from "@/components/lp-jd-bonfiglioli/lp-section";
import { formatBRL, PLANTAS, type Planta } from "@/lib/lp-jd-bonfiglioli";

const SEGMENTO_STYLE: Record<Planta["segmento"], string> = {
  HIS1: "bg-secondary text-secondary-foreground",
  HIS2: "bg-navy text-white",
  R2V: "border-gold/50 bg-gold/15 text-navy",
};

type LpPlantasProps = {
  onEscolher: (plantaId: string) => void;
};

/** Vitrine das 7 tipologias confirmadas, com CTA por planta. */
export function LpPlantas({ onEscolher }: LpPlantasProps) {
  return (
    <LpSection
      id="plantas"
      eyebrow="Plantas e valores"
      title="7 plantas de 2 dormitórios para caber no seu momento"
      subtitle="De 32 a 42 m², com a tabela de lançamento aberta. Escolha a planta e receba a simulação exata dela."
    >
      {/* Mobile: carrossel com scroll-snap · Desktop: grade */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-3">
        {PLANTAS.map((p) => (
          <article
            key={p.id}
            className={cn(
              "relative flex w-[78%] shrink-0 snap-center flex-col rounded-2xl border bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg md:w-auto",
              p.destaque && "ring-1 ring-gold/60",
            )}
          >
            {p.destaque && (
              <Badge className="absolute -top-3 left-5 gap-1 border-none bg-gold text-navy shadow">
                <Star className="size-3" />
                {p.destaque}
              </Badge>
            )}

            <div className="flex items-center justify-between gap-2">
              <Badge className={cn("border-none", SEGMENTO_STYLE[p.segmento])}>{p.segmento}</Badge>
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <BedDouble className="size-4" />
                {p.dorms} dorms
              </span>
            </div>

            <p className="mt-5 text-5xl font-bold tracking-tight text-navy">
              {p.metragem}
              <span className="text-xl font-semibold text-muted-foreground"> m²</span>
            </p>

            {p.img && (
              <img
                src={p.img}
                alt={`Planta ilustrativa de ${p.metragem} m²`}
                loading="lazy"
                className="mt-4 aspect-[4/3] w-full rounded-xl border object-cover"
              />
            )}

            <div className="mt-5 border-t pt-4">
              <p className="text-sm text-muted-foreground">A partir de</p>
              <p className="text-2xl font-bold text-navy">{formatBRL(p.preco)}</p>
            </div>

            <Button
              type="button"
              variant="outline"
              className="mt-5 w-full border-navy/20 font-semibold text-navy hover:bg-navy hover:text-white"
              onClick={() => onEscolher(p.id)}
            >
              Simular esta planta
            </Button>
          </article>
        ))}
      </div>

      <div className="mt-8 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
        <p>
          HIS1 e HIS2 são segmentos habitacionais com critérios de renda definidos por programa — o
          seu enquadramento é confirmado na análise, sem custo. R2V é a tipologia de segmento livre.
        </p>
        <p>
          Valores de tabela do lançamento, sujeitos à alteração sem aviso prévio e à disponibilidade
          de unidades.
        </p>
      </div>
    </LpSection>
  );
}
