import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { LeadPeekDrawer, type PeekLead } from "@/features/leads/lead-peek-drawer";
import { parseAtendimentoInbox } from "@/features/atendimento/inbox";
import { QUEUE_LABEL, type QueueItem, type QueueKey } from "@/features/atendimento/derive";
import { QueueSection } from "@/features/atendimento/queue-section";
import {
  CalendarClock,
  CheckCircle2,
  FileWarning,
  MessageCircleReply,
  ThermometerSnowflake,
  Zap,
} from "lucide-react";

// Atendimento: a tela de guerra do corretor — quem responder, quem cobrar,
// quem reaquecer e que pasta destravar, tudo em filas priorizadas por score.
export const Route = createFileRoute("/_authenticated/atendimento")({
  head: () => ({ meta: [{ title: "Atendimento — Seu Metro Quadrado" }] }),
  component: AtendimentoPage,
});

const QUEUE_ORDER: {
  key: QueueKey;
  icon: typeof MessageCircleReply;
  iconClass: string;
}[] = [
  { key: "responder", icon: MessageCircleReply, iconClass: "text-destructive" },
  { key: "followups", icon: CalendarClock, iconClass: "text-warning" },
  { key: "esfriando", icon: ThermometerSnowflake, iconClass: "text-info" },
  { key: "docs", icon: FileWarning, iconClass: "text-muted-foreground" },
];

function AtendimentoPage() {
  const { user } = useAuth();
  const abrirWhatsApp = useWhatsAppLead();
  const [peek, setPeek] = useState<PeekLead | null>(null);

  // Classificação, deduplicação e contagens acontecem no banco. A resposta traz
  // no máximo 15 cards por fila, mas as contagens consideram a carteira inteira.
  const inboxQ = useQuery({
    queryKey: ["atendimento:inbox", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("atendimento_inbox_v2", {
        _corretor_id: user!.id,
        _limit_per_queue: 15,
      });
      if (error) throw error;
      return parseAtendimentoInbox(data ?? []);
    },
  });

  useRealtimeInvalidate("leads", [["atendimento:inbox"]]);
  useRealtimeInvalidate("interacoes", [["atendimento:inbox"]]);
  useRealtimeInvalidate("documentacoes", [["atendimento:inbox"]]);

  const filas = inboxQ.data?.filas ?? { responder: [], followups: [], esfriando: [], docs: [] };
  const counts = inboxQ.data?.counts ?? { responder: 0, followups: 0, esfriando: 0, docs: 0 };
  const total = QUEUE_ORDER.reduce((acc, q) => acc + counts[q.key], 0);

  const onWhatsApp = (item: QueueItem, mensagem: string) => {
    abrirWhatsApp(
      { id: item.lead.id, nome: item.lead.nome, telefone: item.lead.telefone },
      { mensagem, titulo: `WhatsApp — ${QUEUE_LABEL[filaDoItem(item, filas)]}` },
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Atendimento"
        description="Quem chamar primeiro, com o script certo — filas priorizadas por urgência e score."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/blitz">
                <Zap className="h-4 w-4" /> Modo Blitz
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/agendamentos" search={{ tab: "tarefas" }}>
                ver tarefas
              </Link>
            </Button>
          </div>
        }
      />

      <AsyncBoundary
        isLoading={inboxQ.isLoading}
        isError={inboxQ.isError}
        error={inboxQ.error}
        errorTitle="Não foi possível carregar as filas de atendimento."
        onRetry={() => void inboxQ.refetch()}
        loadingLabel="Carregando filas de atendimento"
        loadingFallback={
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        }
      >
        <div className="space-y-4">
          {/* O placar só aparece depois do sucesso de todas as consultas. */}
          <div className="flex flex-wrap items-center gap-2" aria-label="Resumo das filas">
            {QUEUE_ORDER.map(({ key }) => (
              <Badge key={key} variant="secondary" className={counts[key] > 0 ? "" : "opacity-50"}>
                {QUEUE_LABEL[key]}: {counts[key]}
              </Badge>
            ))}
          </div>

          {total === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <CheckCircle2 className="h-10 w-10 text-success" />
                <div className="font-display text-lg font-semibold">
                  Caixa de atendimento zerada
                </div>
                <p className="max-w-md text-sm text-muted-foreground">
                  Ninguém esperando resposta, nenhum follow-up vencido, ninguém esfriando. Bom
                  momento para prospectar na{" "}
                  <Link to="/blitz" className="text-primary hover:underline">
                    Blitz
                  </Link>{" "}
                  ou avançar o{" "}
                  <Link to="/pipeline" className="text-primary hover:underline">
                    Pipeline
                  </Link>
                  .
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {QUEUE_ORDER.map(({ key, icon, iconClass }) => (
                <QueueSection
                  key={key}
                  queue={key}
                  items={filas[key]}
                  totalCount={counts[key]}
                  icon={icon}
                  iconClass={iconClass}
                  onWhatsApp={onWhatsApp}
                  onPeek={(item) => setPeek(item.lead)}
                />
              ))}
            </div>
          )}
        </div>
      </AsyncBoundary>

      <LeadPeekDrawer
        lead={peek}
        onOpenChange={(o) => !o && setPeek(null)}
        onWhatsApp={(l) =>
          abrirWhatsApp({
            id: l.id,
            nome: l.nome,
            telefone: l.telefone,
            projeto_nome: l.projeto_nome,
          })
        }
      />
    </div>
  );
}

// Descobre a fila de um item (para titular a interação registrada).
function filaDoItem(item: QueueItem, filas: Record<QueueKey, QueueItem[]>): QueueKey {
  for (const k of Object.keys(filas) as QueueKey[]) {
    if (filas[k].some((i) => i.lead.id === item.lead.id)) return k;
  }
  return "responder";
}
