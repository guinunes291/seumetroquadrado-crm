// Fila Única — a página (Fatia 1: leitura + ações que já existem).
//
// Uma lista só, ordenada, no lugar de seis filas e sete widgets: o corretor
// não escolhe a fila, a fila escolhe por ele. Esta fatia NÃO cria escrita
// nova: WhatsApp, ligar, registrar contato, Sami, mudar etapa e confirmar
// visita são exatamente os caminhos de /atendimento (mesmos hooks, mesmos
// diálogos, mesmas invalidações). O "desfecho de um toque" e a carteira ativa
// limitada são as fatias 2 e 3 — ver docs/ops/fila-unica-fatia1.md.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import { useLigarLead } from "@/hooks/use-ligar-lead";
import { useLeadStatusMutation } from "@/hooks/use-lead-status";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { EmptyState } from "@/components/ui/empty-state";
import { LeadPeekDrawer, type PeekLead } from "@/features/leads/lead-peek-drawer";
import { RegistrarContatoDialog } from "@/components/registrar-contato-dialog";
import {
  LeadStageModals,
  type PerdidoState,
  type StageModalState,
} from "@/components/lead-stage/lead-stage-modals";
import type { StageLead } from "@/lib/leads";
import { cn } from "@/lib/utils";
import { scriptParaFila } from "@/features/atendimento/derive";
import {
  BUCKET_HINT,
  BUCKET_LABEL,
  BUCKET_ORDER,
  LIMITE_FILA,
  filaParaScript,
  type FilaBucket,
  type FilaLead,
  type FilaUnica,
  type FilaUnicaItem,
} from "@/features/fila-unica/derive";
import { FilaCard } from "@/features/fila-unica/fila-card";
import { FilaCockpit } from "@/features/fila-unica/fila-cockpit";
import { useFilaUnica, FILA_UNICA_SEM_ACAO_KEY } from "@/features/fila-unica/use-fila-unica";
import {
  CalendarCheck,
  CalendarX,
  CheckCircle,
  ClockCountdown,
  Fire,
  ListChecks,
  Timer,
  Warning,
} from "@phosphor-icons/react";

const BUCKET_DOT: Record<FilaBucket, string> = {
  sla: "bg-warning",
  fundo: "bg-destructive",
  responder: "bg-info",
  followup: "bg-warning",
  sem_acao: "bg-destructive",
  esfriando: "bg-info",
  docs: "bg-muted-foreground",
};

function toStageLead(l: FilaLead): StageLead {
  return {
    id: l.id,
    nome: l.nome,
    status: l.status,
    corretor_id: l.corretor_id,
    projeto_nome: l.projeto_nome,
  };
}

function toPeekLead(l: FilaLead): PeekLead {
  return {
    id: l.id,
    nome: l.nome,
    telefone: l.telefone,
    email: l.email,
    origem: l.origem,
    status: l.status,
    temperatura: l.temperatura,
    projeto_nome: l.projeto_nome,
    corretor_id: l.corretor_id,
    created_at: l.created_at,
    ultima_interacao: l.ultima_interacao,
    renda_informada: l.renda_informada,
    entrada_disponivel: l.entrada_disponivel,
    usa_fgts: l.usa_fgts,
    proximo_followup: l.proximo_followup,
  };
}

/** "Sexta, 12 de setembro" — a data por extenso no lugar de um eyebrow em
 *  caixa alta (identidade v3, decisão 12), como na Home. */
function dataPorExtenso(agora = new Date()): string {
  const s = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Os três números do dia + o SLA — o placar que a lista responde (desktop;
 *  no celular o placar é o FilaCockpit, um card só). */
export function FilaResumo({ fila, className }: { fila: FilaUnica; className?: string }) {
  const r = fila.resumo;
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>
      <StatTile
        title="Próximos passos vencidos"
        value={r.vencidos}
        icon={Warning}
        intent={r.vencidos > 0 ? "danger" : "success"}
        hint="follow-ups combinados com prazo passado"
      />
      <StatTile
        title="Vencem hoje"
        value={r.hoje}
        icon={ClockCountdown}
        intent={r.hoje > 0 ? "warning" : "neutral"}
        hint="o que você combinou para hoje"
      />
      <StatTile
        title="Sem próximo passo"
        value={r.semProximoPasso}
        icon={CalendarX}
        intent={r.semProximoPasso > 0 ? "danger" : "success"}
        hint="nenhuma tarefa, agenda ou follow-up aberto"
      />
      <StatTile
        title="Fundo do funil parado"
        value={r.fundoParado}
        icon={Fire}
        intent={r.fundoParado > 0 ? "danger" : "success"}
        hint="agendado, visita e análise sem movimento"
      />
    </div>
  );
}

export function FilaUnicaPage() {
  const qc = useQueryClient();
  const abrirWhatsApp = useWhatsAppLead();
  const { ligar, discando } = useLigarLead();
  const { fila, isLoading, isError, error, refetch } = useFilaUnica();

  const [peek, setPeek] = useState<PeekLead | null>(null);
  const [contatoLead, setContatoLead] = useState<FilaLead | null>(null);
  const [modalState, setModalState] = useState<StageModalState>(null);
  const [perdidoLead, setPerdidoLead] = useState<PerdidoState>(null);

  const invalidarFila = () => {
    void qc.invalidateQueries({ queryKey: ["atendimento:inbox"] });
    void qc.invalidateQueries({ queryKey: ["followup:fila"] });
    void qc.invalidateQueries({ queryKey: [FILA_UNICA_SEM_ACAO_KEY] });
    void qc.invalidateQueries({ queryKey: ["nav-badges"] });
  };

  // Mesma régua de /atendimento: transição direta pela RPC transicionar_lead;
  // destinos com formulário passam pelos modais obrigatórios.
  const mudarStatus = useLeadStatusMutation({
    optimisticKeys: [],
    invalidateKeys: [
      ["atendimento:inbox"],
      ["followup:fila"],
      [FILA_UNICA_SEM_ACAO_KEY],
      ["leads"],
      ["nav-badges"],
    ],
  });

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
      invalidarFila();
      void qc.invalidateQueries({ queryKey: ["agendamentos"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível confirmar a visita."),
  });

  const onWhatsApp = (item: FilaUnicaItem) => {
    const filaScript = filaParaScript(item);
    abrirWhatsApp(
      { id: item.lead.id, nome: item.lead.nome, telefone: item.lead.telefone },
      {
        mensagem: scriptParaFila(filaScript, item.lead.nome, item.lead.projeto_nome),
        titulo: `WhatsApp — Fila Única · ${BUCKET_LABEL[item.bucket]}`,
      },
    );
  };

  // Agrupa preservando a ordem global (os itens já vêm ordenados por balde).
  const grupos = fila
    ? BUCKET_ORDER.map((b) => ({
        bucket: b,
        itens: fila.itens.filter((i) => i.bucket === b),
      })).filter((g) => g.itens.length > 0)
    : [];

  return (
    <div className="space-y-3 md:space-y-4">
      {/* No celular o cabeçalho é só data + título, colado no placar. */}
      <div className="-mb-3 md:mb-0">
        <p className="mb-1 text-xs text-muted-foreground md:text-sm">{dataPorExtenso()}</p>
        <PageHeader
          title="Fila Única"
          description={
            <span className="hidden md:inline">
              Uma lista só, na ordem em que o dinheiro está em risco. Cada lead sai daqui com um
              resultado registrado e um próximo passo com data.
            </span>
          }
          actions={
            <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
              <Link to="/atendimento">ver as filas de Atender</Link>
            </Button>
          }
        />
      </div>

      <AsyncBoundary
        isLoading={isLoading}
        isError={isError}
        error={error}
        errorTitle="Não foi possível montar a sua fila."
        onRetry={refetch}
        loadingLabel="Montando a sua fila"
        loadingFallback={
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        }
      >
        {fila && (
          <div className="space-y-3 md:space-y-4">
            {/* Celular: um card só (anel + três números). Desktop: os quatro
                StatTiles. O mesmo dado, dois tamanhos de tela. */}
            <FilaCockpit fila={fila} className="md:hidden" />
            <FilaResumo fila={fila} className="hidden md:grid" />

            {fila.resumo.slaCorrendo > 0 && (
              <p className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
                <Timer className="h-4 w-4 text-warning" />
                {fila.resumo.slaCorrendo} lead(s) aguardando o primeiro contato — o SLA está
                correndo. Estourou, o lead vai para o próximo da roleta.
              </p>
            )}

            {fila.total === 0 ? (
              <EmptyState
                icon={CheckCircle}
                title="Fila zerada"
                description="Ninguém esperando resposta, nenhum follow-up vencido, nenhum lead sem próximo passo. Bom momento para prospectar."
                action={
                  <Button asChild size="sm">
                    <Link to="/prospeccao">Abrir a Prospecção</Link>
                  </Button>
                }
              />
            ) : (
              <>
                <div className="hidden flex-wrap items-baseline justify-between gap-2 md:flex">
                  <h2 className="font-display text-base font-semibold">
                    {fila.total} lead(s) na sua fila agora
                    {fila.resumo.ocultosInbox > 0 && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        + {fila.resumo.ocultosInbox} nas filas de Atender além dos cards carregados
                      </span>
                    )}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    ordem: SLA · fundo do funil por dias parado · quem respondeu · vencidos · sem
                    próximo passo · esfriando
                  </span>
                </div>

                {grupos.map((g) => (
                  <section key={g.bucket} className="space-y-2" aria-label={BUCKET_LABEL[g.bucket]}>
                    <h3 className="flex flex-wrap items-center gap-2 px-1 text-[13px] font-semibold md:px-0 md:text-sm">
                      <span className={`h-2 w-2 rounded-full ${BUCKET_DOT[g.bucket]}`} />
                      {BUCKET_LABEL[g.bucket]}
                      <span className="font-display text-xs font-semibold text-muted-foreground">
                        · {fila.porBucket[g.bucket]}
                      </span>
                      <span className="hidden text-xs font-normal text-muted-foreground md:inline">
                        · {BUCKET_HINT[g.bucket]}
                      </span>
                    </h3>
                    <div className="space-y-2">
                      {g.itens.map((item, i) => (
                        <FilaCard
                          key={item.lead.id}
                          item={item}
                          index={i}
                          ligando={discando}
                          confirmando={
                            confirmarVisita.isPending &&
                            confirmarVisita.variables === item.agendamentoId
                          }
                          onWhatsApp={onWhatsApp}
                          onLigar={(it) =>
                            ligar({
                              id: it.lead.id,
                              nome: it.lead.nome,
                              telefone: it.lead.telefone,
                            })
                          }
                          onRegistrarContato={(it) => setContatoLead(it.lead)}
                          onHistorico={(it) => setPeek(toPeekLead(it.lead))}
                          onEtapaDirect={(it, target) =>
                            mudarStatus.mutate({ id: it.lead.id, status: target })
                          }
                          onEtapaModal={(it, modal) =>
                            setModalState({ modal, lead: toStageLead(it.lead) })
                          }
                          onEtapaPerdido={(it) => setPerdidoLead(toStageLead(it.lead))}
                          onConfirmarVisita={(it) =>
                            it.agendamentoId && confirmarVisita.mutate(it.agendamentoId)
                          }
                        />
                      ))}
                    </div>
                  </section>
                ))}

                {fila.total > fila.itens.length && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ListChecks className="h-4 w-4" />
                    Mostrando os {LIMITE_FILA} primeiros de {fila.total} recebidos. Os demais entram
                    conforme estes saem — o dia cabe em {LIMITE_FILA}.
                  </p>
                )}
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarCheck className="h-4 w-4" />
                  Visitas do dia e tarefas continuam na{" "}
                  <Link to="/agendamentos" className="text-primary hover:underline">
                    Agenda
                  </Link>
                  .
                </p>
              </>
            )}
          </div>
        )}
      </AsyncBoundary>

      {contatoLead && (
        <RegistrarContatoDialog
          open
          onOpenChange={(o) => !o && setContatoLead(null)}
          lead={{
            id: contatoLead.id,
            nome: contatoLead.nome,
            corretor_id: contatoLead.corretor_id,
          }}
          onDone={() => {
            setContatoLead(null);
            invalidarFila();
          }}
        />
      )}

      <LeadStageModals
        modalState={modalState}
        onModalOpenChange={(open) => !open && setModalState(null)}
        perdidoLead={perdidoLead}
        onPerdidoOpenChange={(open) => !open && setPerdidoLead(null)}
        onDone={invalidarFila}
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
