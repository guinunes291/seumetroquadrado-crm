import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { INTENT_BADGE_BORDERED } from "@/lib/status-tones";
import { Timer, AlertTriangle, Flame, ShieldOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Contador visual do SLA de repasse por webhook/chatbot.
 *
 * Regra (ver migration 20260705100000_intake_sla_webhook.sql):
 * - Lead com status=aguardando_atendimento cuja `origem` tem
 *   `distribuicao_config.timeout_minutos` definido (default 5 min p/
 *   chatbot/whatsapp/site/agendamento_self_service/outro) é repassado
 *   ao próximo corretor presente quando `data_distribuicao +
 *   timeout_minutos` estoura.
 * - Máximo de 3 repasses (`tentativas_redistribuicao < 3`); depois disso
 *   o lead fica com o último corretor e cai na triagem manual.
 */

type Row = { origem: string; timeout_minutos: number };

/** Cache global (react-query) do mapa origem → timeout_minutos. */
export function useTransferTimeouts() {
  const q = useQuery({
    queryKey: ["transfer-timeouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribuicao_config")
        .select("origem, timeout_minutos")
        .not("timeout_minutos", "is", null);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    staleTime: 5 * 60_000,
  });
  return useMemo(() => {
    const m = new Map<string, number>();
    (q.data ?? []).forEach((r) => m.set(r.origem, r.timeout_minutos));
    return m;
  }, [q.data]);
}

interface TransferSlaBadgeProps {
  origem: string | null | undefined;
  status: string;
  dataDistribuicao: string | null | undefined;
  tentativas?: number | null;
  /** Map origem→timeout, para evitar 1 query por card. */
  timeouts: Map<string, number>;
  compact?: boolean;
  className?: string;
}

function fmt(min: number) {
  const abs = Math.abs(min);
  if (abs < 60) return `${abs}m`;
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

export function TransferSlaBadge({
  origem,
  status,
  dataDistribuicao,
  tentativas,
  timeouts,
  compact,
  className,
}: TransferSlaBadgeProps) {
  const [, force] = useState(0);

  useEffect(() => {
    const id = setInterval(() => force((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  if (status !== "aguardando_atendimento") return null;
  if (!origem || !dataDistribuicao) return null;
  const timeoutMin = timeouts.get(origem);
  if (!timeoutMin) return null;

  const tentativasNum = tentativas ?? 0;
  const esgotado = tentativasNum >= 3;

  if (esgotado) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                "gap-1 px-1.5 py-0 h-5 text-[10px] font-mono border",
                INTENT_BADGE_BORDERED.neutral,
                className,
              )}
            >
              <ShieldOff className="h-3 w-3" />
              {compact ? "sem repasse" : "Sem mais repasses"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Já teve {tentativasNum} repasse{tentativasNum === 1 ? "" : "s"} — fica
            com o corretor atual e vai para a triagem manual.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const ref = new Date(dataDistribuicao);
  const decorridos = Math.max(0, Math.floor((Date.now() - ref.getTime()) / 60000));
  const restante = timeoutMin - decorridos;
  const ratio = decorridos / Math.max(timeoutMin, 1);

  const status_ =
    ratio > 1 ? "estourado" : ratio > 0.6 ? "atencao" : "ok";
  const tone =
    status_ === "estourado"
      ? INTENT_BADGE_BORDERED.danger
      : status_ === "atencao"
        ? INTENT_BADGE_BORDERED.warning
        : INTENT_BADGE_BORDERED.success;
  const Icon = status_ === "estourado" ? Flame : status_ === "atencao" ? AlertTriangle : Timer;

  const restanteLabel = status_ === "estourado" ? `−${fmt(restante)}` : fmt(restante);

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
            {compact ? restanteLabel : <span>Repasse {restanteLabel}</span>}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs space-y-0.5">
          <div className="font-medium">Repasse automático em {timeoutMin} min</div>
          <div>Origem: {origem}</div>
          <div>Decorrido: {fmt(decorridos)}</div>
          <div>
            {status_ === "estourado"
              ? `Estourado há ${fmt(restante)} — repasse no próximo ciclo (~1 min)`
              : `Falta ${fmt(restante)} para repassar`}
          </div>
          <div className="text-muted-foreground">
            Repasses feitos: {tentativasNum}/3
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
