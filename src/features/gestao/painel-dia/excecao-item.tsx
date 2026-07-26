import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { leadStatusLabel } from "@/lib/leads";
import { cn } from "@/lib/utils";
import { detalheLegivel, TIPO_META, type Excecao } from "./derive";

const INTENT_BADGE: Record<string, string> = {
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
  warning: "border-warning/40 bg-warning/10 text-warning",
  info: "border-info/40 bg-info/10 text-info",
};

function moedaCompacta(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

/** Linha do feed de exceções — densa no desktop, empilhada no mobile. */
export function ExcecaoItem({
  excecao,
  selecionada,
  onToggle,
}: {
  excecao: Excecao;
  selecionada: boolean;
  onToggle: (leadId: string) => void;
}) {
  const meta = TIPO_META[excecao.tipo];
  const detalhe = detalheLegivel(excecao);
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border-subtle bg-card p-3 transition-colors",
        selecionada && "border-primary/50 bg-primary/5",
      )}
    >
      <Checkbox
        checked={selecionada}
        onCheckedChange={() => onToggle(excecao.lead_id)}
        aria-label={`Selecionar ${excecao.lead_nome}`}
        className="mt-1"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{excecao.lead_nome}</span>
          <TemperatureChip temperatura={excecao.temperatura} size="sm" pulse={false} />
          {excecao.valor_potencial != null && excecao.valor_potencial > 0 && (
            <span
              className="text-xs font-medium text-muted-foreground"
              title="Valor potencial estimado (preço 'a partir de' do projeto)"
            >
              ~{moedaCompacta(excecao.valor_potencial)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <Badge
            variant="outline"
            className={cn("px-1.5 py-0", INTENT_BADGE[meta.intent] ?? "")}
          >
            {meta.label}
          </Badge>
          {excecao.etapa && <span>{leadStatusLabel(excecao.etapa)}</span>}
          {detalhe && <span>· {detalhe}</span>}
          {excecao.corretor_nome && <span>· {excecao.corretor_nome}</span>}
          {!excecao.corretor_id && excecao.tipo !== "sem_corretor" && <span>· sem corretor</span>}
        </div>
      </div>
      <Button asChild size="sm" variant="ghost" className="shrink-0">
        <Link to="/leads/$leadId" params={{ leadId: excecao.lead_id }}>
          Abrir
        </Link>
      </Button>
    </li>
  );
}
