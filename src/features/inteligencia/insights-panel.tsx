import { useMemo } from "react";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { GlassCard } from "@/components/ui/glass-card";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { cn } from "@/lib/utils";
import {
  useDashboardFunil,
  useDashboardMotivosPerda,
  useDashboardSerie,
} from "@/features/dashboard/queries";
import { gerarInsights } from "@/features/inteligencia/insights";
import { INTENT_TEXT } from "@/lib/status-tones";
import { AlertTriangle, Crosshair, Lightbulb, TrendingUp, Target } from "lucide-react";
import type { Insight } from "@/features/inteligencia/insights";
import type { LucideIcon } from "lucide-react";

const TIPO_ICON: Record<Insight["tipo"], LucideIcon> = {
  gargalo: Crosshair,
  previsao: Target,
  perda: AlertTriangle,
  tendencia: TrendingUp,
  conversao: Lightbulb,
};

const toDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Painel de insights do mês corrente — frases de negócio derivadas dos mesmos
 * RPCs dos relatórios (React Query deduplica as chamadas). Corretor vê o
 * próprio recorte; gestor/admin veem o todo.
 */
export function InsightsPanel() {
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const corretor = isAdmin || isGestor ? null : (user?.id ?? null);

  const range = useMemo(() => {
    const now = new Date();
    return {
      di: toDate(new Date(now.getFullYear(), now.getMonth(), 1)),
      df: toDate(now),
    };
  }, []);

  const funilQ = useDashboardFunil(range, corretor, !!user);
  const serieQ = useDashboardSerie(range, corretor, !!user);
  const motivosQ = useDashboardMotivosPerda(range, corretor, !!user);

  const carregando = funilQ.isLoading || serieQ.isLoading || motivosQ.isLoading;
  const erro = funilQ.isError || serieQ.isError || motivosQ.isError;

  const insights = useMemo(() => {
    const now = new Date();
    const ultimoDia = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return gerarInsights({
      funil: funilQ.data ?? [],
      serie: serieQ.data ?? [],
      motivosPerda: (motivosQ.data ?? []).map((m) => ({
        motivo: m.motivo,
        quantidade: m.quantidade,
      })),
      diasRestantes: ultimoDia - now.getDate(),
    });
  }, [funilQ.data, serieQ.data, motivosQ.data]);

  return (
    <div>
      <SectionHeader
        eyebrow="Inteligência"
        title="O que os números estão dizendo"
        className="mb-3"
      />
      {erro ? (
        <QueryErrorState
          title="Não foi possível carregar os insights."
          error={funilQ.error ?? serieQ.error ?? motivosQ.error}
          onRetry={() => {
            void funilQ.refetch();
            void serieQ.refetch();
            void motivosQ.refetch();
          }}
        />
      ) : carregando ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : insights.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ainda não há volume suficiente neste mês para insights confiáveis — os relatórios
          completos estão logo abaixo.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {insights.map((ins, i) => {
            const Icon = TIPO_ICON[ins.tipo];
            return (
              <GlassCard
                key={`${ins.tipo}-${i}`}
                className="animate-slide-fade motion-reduce:animate-none p-4"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted",
                      INTENT_TEXT[ins.intent === "danger" ? "danger" : ins.intent],
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-display text-sm font-semibold tracking-tight">
                      {ins.titulo}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{ins.detalhe}</p>
                    {ins.acao && (
                      <p className="mt-1.5 text-xs font-medium text-primary">→ {ins.acao}</p>
                    )}
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
