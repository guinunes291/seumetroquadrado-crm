import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { LeadPeekDrawer, type PeekLead } from "@/features/leads/lead-peek-drawer";
import {
  buildAtendimentoQueues,
  QUEUE_LABEL,
  type AtendimentoLead,
  type QueueItem,
  type QueueKey,
} from "@/features/atendimento/derive";
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

  // Leads ativos do corretor — a matéria-prima de todas as filas.
  const leadsQ = useQuery({
    queryKey: ["atendimento:leads", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, nome, telefone, email, status, temperatura, ultima_interacao, proximo_followup, projeto_nome, created_at, corretor_id, origem, renda_informada, entrada_disponivel, usa_fgts",
        )
        .eq("corretor_id", user!.id)
        .eq("na_lixeira", false)
        .not("status", "in", "(perdido,contrato_fechado,pos_venda)")
        .limit(400);
      if (error) throw error;
      return (data ?? []) as AtendimentoLead[];
    },
  });

  const leadIds = useMemo(() => (leadsQ.data ?? []).map((l) => l.id), [leadsQ.data]);

  // Últimas interações dos leads ativos (desc) — detecta "cliente falou por último".
  const interacoesQ = useQuery({
    queryKey: ["atendimento:interacoes", user?.id, leadIds.length],
    enabled: leadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interacoes")
        .select("lead_id, direcao, ocorreu_em")
        .in("lead_id", leadIds)
        .order("ocorreu_em", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Documentação pendente/reprovada — pasta travada.
  const docsQ = useQuery({
    queryKey: ["atendimento:docs", user?.id, leadIds.length],
    enabled: leadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documentacoes")
        .select("lead_id, status")
        .in("lead_id", leadIds)
        .in("status", ["pendente", "reprovado"]);
      if (error) throw error;
      const m = new Map<string, number>();
      (data ?? []).forEach((d: { lead_id: string }) =>
        m.set(d.lead_id, (m.get(d.lead_id) ?? 0) + 1),
      );
      return m;
    },
  });

  useRealtimeInvalidate("leads", [["atendimento:leads"]]);
  useRealtimeInvalidate("interacoes", [["atendimento:interacoes"]]);

  const carregando = leadsQ.isLoading || interacoesQ.isLoading || docsQ.isLoading;

  const filas = useMemo(
    () =>
      buildAtendimentoQueues({
        leads: leadsQ.data ?? [],
        interacoes: interacoesQ.data ?? [],
        docsPendentes: docsQ.data ?? new Map(),
      }),
    [leadsQ.data, interacoesQ.data, docsQ.data],
  );

  const total = QUEUE_ORDER.reduce((acc, q) => acc + filas[q.key].length, 0);

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

      {/* Placar das filas */}
      <div className="flex flex-wrap items-center gap-2">
        {QUEUE_ORDER.map(({ key }) => (
          <Badge
            key={key}
            variant="secondary"
            className={filas[key].length > 0 ? "" : "opacity-50"}
          >
            {QUEUE_LABEL[key]}: {filas[key].length}
          </Badge>
        ))}
      </div>

      {carregando ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-success" />
            <div className="font-display text-lg font-semibold">Caixa de atendimento zerada</div>
            <p className="max-w-md text-sm text-muted-foreground">
              Ninguém esperando resposta, nenhum follow-up vencido, ninguém esfriando. Bom momento
              para prospectar na{" "}
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
              icon={icon}
              iconClass={iconClass}
              onWhatsApp={onWhatsApp}
              onPeek={(item) => setPeek(item.lead)}
            />
          ))}
        </div>
      )}

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
