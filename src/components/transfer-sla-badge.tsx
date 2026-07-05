import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
 *
 * O contador tica de segundo em segundo (MM:SS) e opcionalmente exibe uma
 * barra linear com o tempo restante — para o corretor sentir o tempo passar.
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
  /** Exibe uma barra linear com o tempo restante embaixo do badge. */
  showBar?: boolean;
  className?: string;
}

function mmss(totalSeconds: number) {
  const sign = totalSeconds < 0 ? "-" : "";
  const s = Math.abs(Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${sign}${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function TransferSlaBadge({
  origem,
  status,
  dataDistribuicao,
  tentativas,
  timeouts,
  compact,
  showBar,
  className,
}: TransferSlaBadgeProps) {
  const [, force] = useState(0);

  useEffect(() => {
    // Tica de 1s — mostrar 4:59, 4:58, 4:57… realmente contando.
    const id = setInterval(() => force((t) => (t + 1) % 1_000_000), 1000);
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

  const ref = new Date(dataDistribuicao).getTime();
  const totalMs = timeoutMin * 60_000;
  const decorridosMs = Math.max(0, Date.now() - ref);
  const restanteMs = totalMs - decorridosMs;
  const restanteSec = Math.ceil(restanteMs / 1000);
  const ratio = decorridosMs / Math.max(totalMs, 1);

  const status_ = ratio >= 1 ? "estourado" : ratio > 0.6 ? "atencao" : "ok";
  const tone =
    status_ === "estourado"
      ? INTENT_BADGE_BORDERED.danger
      : status_ === "atencao"
        ? INTENT_BADGE_BORDERED.warning
        : INTENT_BADGE_BORDERED.success;
  const barTone =
    status_ === "estourado"
      ? "bg-destructive"
      : status_ === "atencao"
        ? "bg-warning"
        : "bg-success";
  const Icon = status_ === "estourado" ? Flame : status_ === "atencao" ? AlertTriangle : Timer;

  const label = mmss(restanteSec);
  // Barra: enche de 100% → 0% conforme o tempo escoa.
  const pct = Math.max(0, Math.min(100, (1 - ratio) * 100));

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 px-1.5 py-0 h-5 text-[10px] font-mono border tabular-nums",
        tone,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {compact ? label : <span>Repasse {label}</span>}
    </Badge>
  );

  const content = (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs space-y-0.5">
          <div className="font-medium">Repasse automático em {timeoutMin} min</div>
          <div>Origem: {origem}</div>
          <div>Restante: {label}</div>
          <div>
            {status_ === "estourado"
              ? `Estourado há ${label.replace("-", "")} — repasse no próximo ciclo (~1 min)`
              : `Falta ${label} para repassar`}
          </div>
          <div className="text-muted-foreground">
            Repasses feitos: {tentativasNum}/3
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  if (!showBar) return content;

  return (
    <div className={cn("inline-flex flex-col gap-1 min-w-[92px]", className)}>
      {content}
      <div
        className="h-1 w-full rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={`Tempo restante ${label}`}
      >
        <div
          className={cn("h-full transition-[width] duration-700 ease-linear", barTone)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
