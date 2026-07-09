import { Link } from "@tanstack/react-router";
import { CalendarPlus, MessageCircle, Phone, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { leadStatusLabel } from "@/lib/leads";
import { TIER_DOT } from "@/lib/priority";
import type { Mission, MissionSource } from "@/features/command-center/derive";

const FONTE_LABEL: Record<MissionSource, string> = {
  sla: "SLA",
  quente: "Quente",
  sem_acao: "Sem ação",
};

const FONTE_CLASS: Record<MissionSource, string> = {
  sla: "bg-destructive/15 text-destructive",
  quente: "bg-warning/15 text-warning",
  sem_acao: "bg-info/15 text-info",
};

/**
 * Fila de missões: a lista única priorizada do dia (SLA + quentes + sem ação,
 * deduplicada e ordenada por score). Toda linha executa em 1 clique.
 */
export function MissionQueue({
  missions,
  loading,
  onWhatsApp,
  onFollowUp,
  followUpPending,
}: {
  missions: Mission[];
  loading?: boolean;
  onWhatsApp: (m: Mission) => void;
  onFollowUp: (m: Mission) => void;
  followUpPending?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Target className="h-4 w-4 text-primary" /> Fila de missões
          {missions.length > 0 && <Badge variant="secondary">{missions.length}</Badge>}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            quem chamar primeiro, na ordem
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </>
        ) : missions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Fila limpa — nenhum lead esperando por você agora. 👏
          </p>
        ) : (
          missions.map((m, i) => (
            <div
              key={m.leadId}
              className="animate-slide-fade motion-reduce:animate-none flex items-center justify-between gap-2 rounded-md border p-2"
              style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
            >
              <Link to="/leads/$leadId" params={{ leadId: m.leadId }} className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn("h-2 w-2 shrink-0 rounded-full", TIER_DOT[m.tier])}
                    title={`Prioridade ${m.tier} · score ${m.score}`}
                  />
                  <span className="truncate text-sm font-medium">{m.nome}</span>
                  {m.fontes.map((f) => (
                    <span
                      key={f}
                      className={cn(
                        "rounded-full px-1.5 py-0 text-[10px] font-medium",
                        FONTE_CLASS[f],
                      )}
                    >
                      {FONTE_LABEL[f]}
                    </span>
                  ))}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {leadStatusLabel(m.status)} · {m.motivo}
                </div>
              </Link>
              <div className="flex shrink-0 items-center gap-1">
                {m.semProximaAcao && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-primary hover:bg-primary/10"
                    title="Criar follow-up para amanhã"
                    disabled={followUpPending}
                    onClick={() => onFollowUp(m)}
                  >
                    <CalendarPlus className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-success hover:bg-success/10"
                  title="WhatsApp"
                  onClick={() => onWhatsApp(m)}
                >
                  <MessageCircle className="h-4 w-4" />
                </Button>
                {m.telefone && (
                  <Button
                    asChild
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-info hover:bg-info/10"
                    title="Ligar"
                  >
                    <a href={`tel:${m.telefone.replace(/\D/g, "")}`}>
                      <Phone className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
