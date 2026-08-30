import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useLeadStatusMutation } from "@/hooks/use-lead-status";
import { LeadPeekDrawer, type PeekLead } from "@/features/leads/lead-peek-drawer";
import { RegistrarContatoDialog } from "@/components/registrar-contato-dialog";
import {
  LeadStageModals,
  type PerdidoState,
  type StageModalState,
} from "@/components/lead-stage/lead-stage-modals";
import type { StageLead } from "@/lib/leads";
import { parseAtendimentoInbox } from "@/features/atendimento/inbox";
import { rpcAtendimentoInbox } from "@/features/atendimento/atendimento-rpc";
// Fonte única com o hub Follow-Up: a fila "followups" lê a MESMA RPC do hub
// (importado de features/followup — nunca duplicado aqui).
import { fetchFilaFollowUp, type FilaFollowUp } from "@/features/followup/fila-client";
import { aplicarFilaRegua } from "@/features/atendimento/fila-regua";
import {
  QUEUE_LABEL,
  type AtendimentoLead,
  type QueueItem,
  type QueueKey,
} from "@/features/atendimento/derive";
import { QueueSection } from "@/features/atendimento/queue-section";
import { VolumeView } from "@/features/atendimento/volume-view";
import { ConsultaView } from "@/features/atendimento/consulta-view";
import {
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  FileWarning,
  MessageCircleReply,
  Sparkles,
  ThermometerSnowflake,
  Zap,
} from "lucide-react";

// Atendimento: a tela de guerra do corretor — quem responder, quem cobrar,
// quem reaquecer e que pasta destravar, tudo em filas priorizadas por score.
//
// Três modos, uma porta (item 2.7, PR a): Prioridade (as filas, padrão) ·
// Volume (o antigo Modo Blitz) · Consulta (a antiga lista /leads, mesma
// query). /blitz e /leads seguem vivas até o PR (c) transformá-las em
// redirect, quando a Consulta tiver paridade de filtros (PR b).
export type AtendimentoModo = "prioridade" | "volume" | "consulta";

export const Route = createFileRoute("/_authenticated/atendimento")({
  head: () => ({ meta: [{ title: "Atendimento — Seu Metro Quadrado" }] }),
  // Whitelist do modo: valor desconhecido cai no padrão (prioridade) em vez
  // de quebrar a rota — links antigos sem ?modo continuam funcionando.
  validateSearch: (search: Record<string, unknown>): { modo?: AtendimentoModo } => ({
    modo: search.modo === "volume" || search.modo === "consulta" ? search.modo : undefined,
  }),
  component: AtendimentoPage,
});

const MODOS: { key: AtendimentoModo; label: string; hint: string }[] = [
  { key: "prioridade", label: "Prioridade", hint: "as filas do dia, por urgência e score" },
  { key: "volume", label: "Volume", hint: "um lead por vez, a carteira inteira" },
  { key: "consulta", label: "Consulta", hint: "buscar e filtrar como em Meus Leads" },
];

const QUEUE_ORDER: {
  key: QueueKey;
  icon: typeof MessageCircleReply;
  iconClass: string;
}[] = [
  { key: "novos", icon: Sparkles, iconClass: "text-primary" },
  { key: "responder", icon: MessageCircleReply, iconClass: "text-destructive" },
  { key: "followups", icon: CalendarClock, iconClass: "text-warning" },
  { key: "esfriando", icon: ThermometerSnowflake, iconClass: "text-info" },
  // 6ª fila (item 2.5): a visita das próximas 48h que ninguém confirmou.
  { key: "confirmar_visita", icon: CalendarCheck, iconClass: "text-success" },
  { key: "docs", icon: FileWarning, iconClass: "text-muted-foreground" },
];

// Forma mínima que o menu/modais de etapa precisam, a partir do lead da fila.
// `projeto_id`/`observacoes` não vêm na inbox v3 — os diálogos degradam de leve
// (venda sem projeto pré-selecionado), aceitável para o caso raro na fila.
function toStageLead(l: AtendimentoLead): StageLead {
  return {
    id: l.id,
    nome: l.nome,
    status: l.status,
    corretor_id: l.corretor_id,
    projeto_nome: l.projeto_nome,
  };
}

function AtendimentoPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const abrirWhatsApp = useWhatsAppLead();
  const { modo: modoParam } = Route.useSearch();
  const navigate = Route.useNavigate();
  const modo: AtendimentoModo = modoParam ?? "prioridade";
  const setModo = (m: AtendimentoModo) =>
    navigate({ search: { modo: m === "prioridade" ? undefined : m } });
  const [peek, setPeek] = useState<PeekLead | null>(null);
  const [contatoLead, setContatoLead] = useState<AtendimentoLead | null>(null);
  const [modalState, setModalState] = useState<StageModalState>(null);
  const [perdidoLead, setPerdidoLead] = useState<PerdidoState>(null);

  // Etapa in-line no card (item 1.8): transição direta via RPC; os destinos com
  // formulário passam pelos modais obrigatórios abaixo. Sem patch otimista — o
  // cache da inbox é {filas, counts}, não um array de leads.
  const mudarStatus = useLeadStatusMutation({
    optimisticKeys: [],
    // ["followup:fila"] junto: mudar a etapa pode tirar o lead da régua e a
    // fila "followups" daqui lê a mesma fonte do hub Follow-Up.
    invalidateKeys: [["atendimento:inbox"], ["followup:fila"], ["leads"], ["nav-badges"]],
  });

  // Classificação, deduplicação e contagens acontecem no banco. A resposta traz
  // no máximo 15 cards por fila, mas as contagens consideram a carteira inteira.
  // v4 traz a fila "confirmar_visita" (item 2.5); v3 traz "novos"; cada degrau
  // do fallback preenche as filas que a versão anterior não conhece — a tela
  // nunca quebra (rpcWithFallback) e o parse fail-closed continua valendo.
  const inboxQ = useQuery({
    queryKey: ["atendimento:inbox", user?.id],
    // Só o modo Prioridade consome a inbox — Volume e Consulta têm queries
    // próprias e não precisam pagar esta RPC ao entrar direto por link.
    enabled: !!user && modo === "prioridade",
    queryFn: async () => {
      const params = { _corretor_id: user!.id, _limit_per_queue: 15 };
      return rpcWithFallback(
        async () => parseAtendimentoInbox(await rpcAtendimentoInbox("v4", params)),
        () =>
          rpcWithFallback(
            async () =>
              parseAtendimentoInbox([
                ...(await rpcAtendimentoInbox("v3", params)),
                { fila: "confirmar_visita", total_count: 0, items: [] },
              ]),
            async () => {
              const rows = await rpcAtendimentoInbox("v2", params);
              return parseAtendimentoInbox([
                { fila: "novos", total_count: 0, items: [] },
                ...rows,
                { fila: "confirmar_visita", total_count: 0, items: [] },
              ]);
            },
          ),
      );
    },
  });

  // FONTE ÚNICA com o hub Follow-Up (auditoria 2026-08-27): a fila
  // "followups" passa a vir da MESMA RPC do hub (followup_fila_v1 — tarefas
  // de CONTATO abertas), não mais de leads.proximo_followup. Sem isso o
  // corretor zerava a fila no hub e esta tela continuava mostrando itens.
  // A chave usa o prefixo "followup:fila" DE PROPÓSITO: toda invalidação do
  // hub (invalidateQueries(["followup:fila"])) alcança esta query por prefixo
  // — as duas telas andam juntas sem acoplamento de código.
  // Banco antigo sem a RPC → null, e a fila "followups" da inbox volta a
  // valer como era (fallback explícito em `aplicarFilaRegua` abaixo).
  const filaReguaQ = useQuery({
    queryKey: ["followup:fila", "atendimento", user?.id],
    enabled: !!user && modo === "prioridade",
    queryFn: () =>
      rpcWithFallback<FilaFollowUp | null>(
        () => fetchFilaFollowUp(),
        () => null,
      ),
  });

  // Confirmar visita in-line (a ação que fecha o ciclo da fila nova): muda o
  // agendamento para "confirmado" — o mesmo efeito do Select do formulário de
  // agenda, sem sair da fila. RLS do agendamento aplica (dono/gestão).
  const confirmarVisita = useMutation({
    mutationFn: async (agendamentoId: string) => {
      const { error } = await supabase
        .from("agendamentos")
        .update({ status: "confirmado" })
        .eq("id", agendamentoId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Visita confirmada.");
      void qc.invalidateQueries({ queryKey: ["atendimento:inbox"] });
      void qc.invalidateQueries({ queryKey: ["agendamentos"] });
      void qc.invalidateQueries({ queryKey: ["nav-badges"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível confirmar a visita."),
  });

  // Um único canal para as 4 tabelas (o hook aceita array) — P3-10.
  // "tarefas" entrou com a fonte única: a fila da régua nasce de tarefas de
  // contato, e o prefixo ["followup:fila"] refaz o hub e esta tela juntos.
  useRealtimeInvalidate(
    ["leads", "interacoes", "documentacoes", "tarefas"],
    [["atendimento:inbox"], ["followup:fila"]],
  );

  const inboxData = inboxQ.data ?? {
    filas: {
      novos: [],
      responder: [],
      followups: [],
      esfriando: [],
      confirmar_visita: [],
      docs: [],
    },
    counts: {
      novos: 0,
      responder: 0,
      followups: 0,
      esfriando: 0,
      confirmar_visita: 0,
      docs: 0,
    },
  };
  // Com a fila da régua disponível, a resposta da inbox para "followups" é
  // IGNORADA (itens e total) — fonte única com o hub Follow-Up. null = banco
  // antigo sem followup_fila_v1: a fila da inbox segue valendo como era.
  const { filas, counts } = filaReguaQ.data
    ? aplicarFilaRegua({
        filas: inboxData.filas,
        counts: inboxData.counts,
        filaRegua: filaReguaQ.data,
      })
    : inboxData;
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
        title="Atender"
        description="Uma porta para o lead: Prioridade (filas), Volume (um por vez) e Consulta (busca)."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/agendamentos" search={{ tab: "tarefas" }}>
              ver tarefas
            </Link>
          </Button>
        }
      />

      {/* Seletor dos 3 modos — 1 porta (wireframe 7.2). O modo viaja na URL
          (?modo=) para ser compartilhável e sobreviver ao voltar. */}
      <div
        className="flex w-fit items-center gap-1 rounded-lg border bg-muted/40 p-1"
        role="tablist"
        aria-label="Modo de atendimento"
      >
        {MODOS.map((m) => (
          <Button
            key={m.key}
            role="tab"
            aria-selected={modo === m.key}
            variant={modo === m.key ? "default" : "ghost"}
            size="sm"
            className="h-7"
            title={m.hint}
            onClick={() => setModo(m.key)}
          >
            {m.key === "volume" && <Zap className="h-3.5 w-3.5" />}
            {m.label}
          </Button>
        ))}
      </div>

      {modo === "volume" && <VolumeView />}
      {modo === "consulta" && <ConsultaView />}

      {modo === "prioridade" && (
        <AsyncBoundary
          isLoading={inboxQ.isLoading || filaReguaQ.isLoading}
          isError={inboxQ.isError || filaReguaQ.isError}
          error={inboxQ.error ?? filaReguaQ.error}
          errorTitle="Não foi possível carregar as filas de atendimento."
          onRetry={() => {
            void inboxQ.refetch();
            void filaReguaQ.refetch();
          }}
          loadingLabel="Carregando filas de atendimento"
          loadingFallback={
            <div className="space-y-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          }
        >
          <div className="space-y-4">
            {/* O placar só aparece depois do sucesso de todas as consultas.
                "novos" não exibe contagem própria: o número dos aguardando
                atendimento tem UM dono (o chamado do hub Prospecção) — o
                placar aponta a porta em vez de duplicar o contador. O item
                dos followups usa o total da fila_v1 (mesmo número do hub). */}
            <div className="flex flex-wrap items-center gap-2" aria-label="Resumo das filas">
              {QUEUE_ORDER.map(({ key }) =>
                key === "novos" ? (
                  <Badge key={key} variant="secondary" className="gap-1">
                    {QUEUE_LABEL[key]}:
                    <Link to="/prospeccao" className="text-primary hover:underline">
                      ver na Prospecção
                    </Link>
                  </Badge>
                ) : (
                  <Badge
                    key={key}
                    variant="secondary"
                    className={counts[key] > 0 ? "" : "opacity-50"}
                  >
                    {QUEUE_LABEL[key]}: {counts[key]}
                  </Badge>
                ),
              )}
            </div>

            {total === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                  <CheckCircle2 className="h-10 w-10 text-success" />
                  <div className="font-display text-lg font-semibold">
                    Caixa de atendimento zerada
                  </div>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Nenhum lead novo na mesa, ninguém esperando resposta, nenhum follow-up vencido,
                    ninguém esfriando. Bom momento para prospectar no modo{" "}
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => setModo("volume")}
                    >
                      Volume
                    </button>{" "}
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
                    action={
                      // A porta do hub dono: a fila completa e o DESFECHO do
                      // toque (agendar o próximo, esgotar) vivem no Follow-Up.
                      key === "followups" ? (
                        <Button asChild variant="ghost" size="sm" className="h-6 px-2 text-xs">
                          <Link to="/follow-up">Abrir fila da régua</Link>
                        </Button>
                      ) : undefined
                    }
                    onWhatsApp={onWhatsApp}
                    onPeek={(item) => setPeek(item.lead)}
                    onRegistrarContato={(item) => setContatoLead(item.lead)}
                    onEtapaDirect={(item, target) =>
                      mudarStatus.mutate({ id: item.lead.id, status: target })
                    }
                    onEtapaModal={(item, modal) =>
                      setModalState({ modal, lead: toStageLead(item.lead) })
                    }
                    onEtapaPerdido={(item) => setPerdidoLead(toStageLead(item.lead))}
                    onConfirmarVisita={(item) =>
                      item.agendamentoId && confirmarVisita.mutate(item.agendamentoId)
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </AsyncBoundary>
      )}

      {/* Uma instância só para todas as filas — reusa o fluxo existente
          (interação + próximo follow-up num gesto). Nenhuma mutação nova. */}
      {contatoLead && (
        <RegistrarContatoDialog
          open
          onOpenChange={(o) => !o && setContatoLead(null)}
          lead={{
            id: contatoLead.id,
            nome: contatoLead.nome,
            corretor_id: contatoLead.corretor_id,
          }}
          onDone={() => setContatoLead(null)}
        />
      )}

      {/* Modais obrigatórios de etapa (agendamento, visita, crédito, venda,
          perdido) — uma instância para todas as filas, roteada pelo menu
          in-line do card. onDone invalida a inbox, que os diálogos não
          conhecem (eles invalidam leads/kanban/lead, nunca atendimento). */}
      <LeadStageModals
        modalState={modalState}
        onModalOpenChange={(open) => !open && setModalState(null)}
        perdidoLead={perdidoLead}
        onPerdidoOpenChange={(open) => !open && setPerdidoLead(null)}
        onDone={() => {
          void qc.invalidateQueries({ queryKey: ["atendimento:inbox"] });
          // Prefixo alcança o hub e a fila da régua desta tela (fonte única).
          void qc.invalidateQueries({ queryKey: ["followup:fila"] });
          void qc.invalidateQueries({ queryKey: ["nav-badges"] });
        }}
      />

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
