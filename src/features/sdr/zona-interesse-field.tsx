// Zona de interesse do cliente, escolhida pelo SDR ao agendar ou entregar
// (decisão do dono, 05/10/2026). Obrigatória: a roleta entrega só a quem
// atende a zona. O banco sugere a zona que já resolve pela ficha (zona,
// bairro ou projeto); o SDR confirma ou troca.

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ZONAS_SDR } from "@/lib/sdr";

type Props = {
  value: string | null;
  onChange: (zona: string) => void;
  /** A sugestão do banco ainda está sendo lida. */
  carregando?: boolean;
  /** Mostra a dica de erro quando o SDR tentou enviar sem escolher. */
  faltou?: boolean;
};

export function ZonaInteresseField({ value, onChange, carregando, faltou }: Props) {
  return (
    <div className="space-y-1.5" data-testid="zona-interesse">
      <Label>Zona de interesse do cliente *</Label>
      <div
        className="flex flex-wrap gap-1.5"
        role="radiogroup"
        aria-label="Zona de interesse do cliente"
      >
        {ZONAS_SDR.map((z) => (
          <Button
            key={z}
            type="button"
            size="sm"
            role="radio"
            aria-checked={value === z}
            variant={value === z ? "default" : "outline"}
            className="h-8"
            onClick={() => onChange(z)}
          >
            {z}
          </Button>
        ))}
      </div>
      <p
        className={faltou && !value ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
        data-testid="zona-interesse-dica"
      >
        {carregando
          ? "Lendo a zona que a ficha já indica…"
          : value
            ? "O lead vai para um corretor que atende esta zona."
            : "Obrigatória: o lead é entregue a quem atende a zona que o cliente quer."}
      </p>
    </div>
  );
}
