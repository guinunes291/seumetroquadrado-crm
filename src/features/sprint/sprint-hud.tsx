import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  proximoLead,
  sprintExpirado,
  sprintRestanteMs,
  useSprint,
} from "@/features/sprint/use-sprint";
import { SprintResultDialog } from "@/features/sprint/sprint-dialog";
import { CheckCircle2, Square, Zap } from "lucide-react";

function fmtMMSS(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * HUD do Sprint — barra fixa que sobrevive à navegação (montada no shell).
 * Countdown, progresso da meta, próximo lead da fila e encerramento. Pulsa em
 * dourado nos 5 minutos finais.
 */
export function SprintHud() {
  const { sprint, done, stop } = useSprint();
  const [now, setNow] = useState(() => Date.now());
  const [mostrarResultado, setMostrarResultado] = useState(false);

  useEffect(() => {
    if (!sprint) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sprint]);

  // Tempo esgotado → abre o resultado automaticamente (uma vez).
  useEffect(() => {
    if (sprint && sprintExpirado(sprint, now)) setMostrarResultado(true);
  }, [sprint, now]);

  if (!sprint) return null;

  if (mostrarResultado) {
    return (
      <SprintResultDialog
        sprint={sprint}
        onClose={() => {
          setMostrarResultado(false);
          stop();
        }}
      />
    );
  }

  const restante = sprintRestanteMs(sprint, now);
  const retaFinal = restante <= 5 * 60_000;
  const proximo = proximoLead(sprint);
  const pct = Math.min(100, Math.round((sprint.done.length / sprint.goal) * 100));

  return (
    <div
      className={cn(
        "glass-panel fixed inset-x-2 bottom-20 z-40 mx-auto flex max-w-xl items-center gap-3 rounded-xl px-3 py-2 shadow-elev-3 md:inset-x-auto md:bottom-6 md:left-1/2 md:w-[36rem] md:-translate-x-1/2",
        retaFinal && "animate-pulse-glow motion-reduce:animate-none",
      )}
    >
      <Zap className="h-4 w-4 shrink-0 text-primary" />
      <div className="font-display shrink-0 text-lg font-bold tabular-nums" title="Tempo restante">
        {fmtMMSS(restante)}
      </div>

      {/* progresso da meta */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="truncate">
            {proximo ? (
              <>
                Próximo:{" "}
                <Link
                  to="/leads/$leadId"
                  params={{ leadId: proximo.id }}
                  className="font-medium text-foreground hover:underline"
                >
                  {proximo.nome}
                </Link>
              </>
            ) : (
              "Fila concluída — encerre e veja o resultado"
            )}
          </span>
          <span className="font-display shrink-0 tabular-nums">
            {sprint.done.length}/{sprint.goal}
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              pct >= 100 ? "bg-success" : "bg-gradient-gold",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {proximo && (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 shrink-0 gap-1 text-success hover:bg-success/10"
          title="Marcar este lead como atacado e avançar"
          onClick={() => done(proximo.id)}
        >
          <CheckCircle2 className="h-4 w-4" /> Feito
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="h-8 shrink-0 gap-1 text-muted-foreground"
        title="Encerrar sprint e ver o resultado"
        onClick={() => setMostrarResultado(true)}
      >
        <Square className="h-3.5 w-3.5" /> Encerrar
      </Button>
    </div>
  );
}
