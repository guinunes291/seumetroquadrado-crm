import { Building2, Clock, MapPin, TrainFront } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LpSection } from "@/components/lp-jd-bonfiglioli/lp-section";
import { LP_CONFIG } from "@/lib/lp-jd-bonfiglioli";

/** Narrativa de localização e estilo de vida do Jardim Bonfiglioli. */
export function LpLocalizacao() {
  return (
    <LpSection
      id="localizacao"
      variant="muted"
      eyebrow="Localização"
      title="Por que o Jardim Bonfiglioli?"
      subtitle="Zona Oeste de verdade: bairro residencial na região do Butantã, com metrô por perto para resolver a rotina sem depender de carro."
    >
      <div className="grid gap-10 lg:grid-cols-[1fr_0.9fr]">
        <div className="space-y-5 text-pretty leading-relaxed text-foreground/80">
          <p>
            Morar no Jardim Bonfiglioli é escolher rotina leve. O empreendimento nasce na Rua Dr.
            Astor Guimarães Dias, em um bairro de perfil residencial da Zona Oeste — e com a{" "}
            <strong className="text-navy">Estação Vila Sônia da Linha 4-Amarela</strong> por perto,
            você cruza a cidade em trilhos: Faria Lima, Paulista e o centro ficam no caminho do
            metrô, sem rodízio e sem estacionamento.
          </p>
          <p>
            Para quem trabalha ou estuda na Zona Oeste — incluindo o vetor universitário da região
            do Butantã — é a chance de morar perto de tudo o que já faz parte do seu dia, gastando
            menos tempo no trânsito e mais tempo vivendo.
          </p>
          <p>
            E antes de decidir, você pode ver tudo de perto: o apartamento decorado está montado na
            Mega Loja, para você visitar, medir e se imaginar morando.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-4 rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-navy text-gold">
              <TrainFront className="size-5" />
            </div>
            <div>
              <h3 className="font-semibold text-navy">Metrô Vila Sônia · Linha 4-Amarela</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Conexão direta com os principais eixos de emprego e estudo da cidade.
              </p>
              <Badge variant="outline" className="mt-2 gap-1 text-warning">
                <Clock className="size-3" />
                Distância exata a confirmar
              </Badge>
            </div>
          </div>

          <div className="flex items-start gap-4 rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-navy text-gold">
              <MapPin className="size-5" />
            </div>
            <div>
              <h3 className="font-semibold text-navy">Endereço do empreendimento</h3>
              <p className="mt-1 text-sm text-muted-foreground">{LP_CONFIG.enderecoTerreno}</p>
            </div>
          </div>

          <div className="flex items-start gap-4 rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-navy text-gold">
              <Building2 className="size-5" />
            </div>
            <div>
              <h3 className="font-semibold text-navy">Visite o decorado</h3>
              <p className="mt-1 text-sm text-muted-foreground">{LP_CONFIG.enderecoDecorado}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Agende sua visita com a nossa equipe.
              </p>
            </div>
          </div>
        </div>
      </div>
    </LpSection>
  );
}
