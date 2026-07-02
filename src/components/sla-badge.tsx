import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Clock, AlertTriangle, Flame } from "lucide-react";

export type SlaStatus = "ok" | "atencao" | "estourado";

interface SlaBadgeProps {
  /** SLA configurado em minutos (vindo de distribuicao_config.sla_minutos) */
  slaMinutos: number;
  /** Instante de referência: data_distribuicao ou created_at do lead */
  referencia: string | Date;
  /** Se true, oculta quando lead já saiu do funil inicial */
  compact?: boolean;
  className?: string;
}

function calcular(referencia: Date, slaMin: number) {
  const decorridos = Math.max(
    0,
    Math.floor((Date.now() - referencia.getTime()) / 60000),
  );
  const ratio = decorridos / Math.max(slaMin, 1);
  let status: SlaStatus = "ok";
  if (ratio > 1) status = "estourado";
  else if (ratio > 0.6) status = "atencao";
  const restante = slaMin - decorridos;
  return { decorridos, restante, status };
}

function formatarTempo(min: number) {
  const abs = Math.abs(min);
  if (abs < 60) return `${abs}m`;
  if (abs < 1440) {
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return m > 0 ? `${h}h${m}m` : `${h}h`;
  }
  // Acima de 1 dia, mostra dd/hh para SLAs que acumulam muito (leads antigos).
  const d = Math.floor(abs / 1440);
  const h = Math.floor((abs % 1440) / 60);
  return h > 0 ? `${d}d${h}h` : `${d}d`;
}

/**
 * Badge com countdown ao vivo do SLA do lead.
 * Verde: dentro do prazo. Amarelo: passando de 60% do SLA. Vermelho: estourado.
 */
export function SlaBadge({ slaMinutos, referencia, compact, className }: SlaBadgeProps) {
  const ref = typeof referencia === "string" ? new Date(referencia) : referencia;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const { decorridos, restante, status } = calcular(ref, slaMinutos);
  // tick is intentionally read to force re-render
  void tick;

  const tone =
    status === "estourado"
      ? "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40"
      : status === "atencao"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40"
        : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40";

  const Icon = status === "estourado" ? Flame : status === "atencao" ? AlertTriangle : Clock;
  const label =
    status === "estourado"
      ? `−${formatarTempo(restante)}`
      : `${formatarTempo(restante)}`;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "gap-1 px-1.5 py-0 h-5 text-[10px] font-mono border",
              tone,
              className,
            )}
          >
            <Icon className="h-3 w-3" />
            {compact ? label : <span>SLA {label}</span>}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div>SLA: {slaMinutos} min</div>
          <div>Decorrido: {formatarTempo(decorridos)}</div>
          <div>
            {status === "estourado"
              ? `Estourado há ${formatarTempo(restante)}`
              : `Restam ${formatarTempo(restante)}`}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
