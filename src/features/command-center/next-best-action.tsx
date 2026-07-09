import { Link } from "@tanstack/react-router";
import { CheckCircle2, MessageCircle, Phone, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreRing } from "@/components/ui/score-ring";
import { leadStatusLabel } from "@/lib/leads";
import type { Mission } from "@/features/command-center/derive";

/**
 * Hero da Central de Comando: a UMA ação mais importante agora, com execução
 * em 1 clique. Recebe o topo da fila de missões — nunca calcula nada sozinho.
 */
export function NextBestAction({
  mission,
  loading,
  onWhatsApp,
  extra,
}: {
  mission: Mission | null;
  loading?: boolean;
  onWhatsApp: (m: Mission) => void;
  /** Slot para ações extras do hero (ex.: Iniciar Sprint). */
  extra?: React.ReactNode;
}) {
  return (
    <GlassCard glow className="animate-slide-fade motion-reduce:animate-none overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Próxima melhor ação
          </div>

          {loading ? (
            <div className="mt-2 space-y-2">
              <Skeleton className="h-7 w-64" />
              <Skeleton className="h-4 w-80" />
            </div>
          ) : mission ? (
            <div className="mt-1.5 flex items-center gap-3">
              <ScoreRing
                value={mission.score}
                size={48}
                intent={
                  mission.tier === "alta"
                    ? "danger"
                    : mission.tier === "media"
                      ? "warning"
                      : "neutral"
                }
                title={`Score de prioridade ${mission.score}`}
              />
              <div className="min-w-0">
                <div className="font-display truncate text-xl font-semibold tracking-tight md:text-2xl">
                  Falar com {mission.nome}
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {mission.motivo} · {leadStatusLabel(mission.status)}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-1.5 flex items-center gap-3">
              <CheckCircle2 className="h-9 w-9 text-success" />
              <div>
                <div className="font-display text-xl font-semibold tracking-tight">
                  Tudo em dia por aqui
                </div>
                <div className="text-sm text-muted-foreground">
                  Nenhuma urgência na fila — bom momento para prospectar ou avançar o pipeline.
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {mission && (
            <>
              <Button
                onClick={() => onWhatsApp(mission)}
                className="bg-gradient-gold text-navy-900 shadow-glow-gold hover:opacity-90"
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </Button>
              {mission.telefone && (
                <Button asChild variant="outline">
                  <a href={`tel:${mission.telefone.replace(/\D/g, "")}`}>
                    <Phone className="h-4 w-4" /> Ligar
                  </a>
                </Button>
              )}
              <Button asChild variant="ghost">
                <Link to="/leads/$leadId" params={{ leadId: mission.leadId }}>
                  Abrir dossiê <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </>
          )}
          {extra}
        </div>
      </div>
    </GlassCard>
  );
}
