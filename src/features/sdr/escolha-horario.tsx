// Dia e horário da visita em dois toques (atalhos de dia + grade de meia em
// meia hora), com o campo exato ao lado. Usado na passagem do discador e no
// "pediu para remarcar" da confirmação.

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Amanhã às 10h, a sugestão de sempre. */
export function amanhaAsDez(agora = new Date()) {
  const d = new Date(agora);
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return toLocalInput(d);
}

const HORARIOS = Array.from({ length: 23 }, (_, i) => {
  const m = 8 * 60 + i * 30; // 08:00 → 19:00 a cada 30min
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});

const DIAS = [
  { l: "Hoje", n: 0 },
  { l: "Amanhã", n: 1 },
  { l: "+2 dias", n: 2 },
  { l: "+3 dias", n: 3 },
];

export function EscolhaHorario({
  value,
  onChange,
  idPrefixo,
}: {
  value: string;
  onChange: (v: string) => void;
  idPrefixo: string;
}) {
  const dia = value.slice(0, 10);
  const hora = value.slice(11, 16);
  const diaDe = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return toLocalInput(d).slice(0, 10);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Dia</Label>
        <div className="flex flex-wrap gap-1.5">
          {DIAS.map((o) => (
            <Button
              key={o.n}
              type="button"
              size="sm"
              variant={dia === diaDe(o.n) ? "default" : "outline"}
              onClick={() => onChange(`${diaDe(o.n)}T${hora || "10:00"}`)}
            >
              {o.l}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Horário</Label>
        <div className="flex flex-wrap gap-1">
          {HORARIOS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => onChange(`${dia}T${h}`)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs tabular-nums transition-colors",
                hora === h
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              {h}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefixo}-quando`}>Data e hora</Label>
        <Input
          id={`${idPrefixo}-quando`}
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}
