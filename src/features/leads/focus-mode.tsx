// MODO FOCO — trabalhar UM lead por vez, em tela cheia, com a fila do filtro
// atual. Tudo que o corretor precisa para decidir e agir: contexto, histórico,
// WhatsApp/ligar, registrar contato, mudar etapa — e "Próximo" (J/K) com
// prefetch para a troca ser instantânea. NENHUMA mutação nova: toda escrita
// reusa os fluxos existentes (RegistrarContatoDialog, useLeadStatusMutation,
// LeadStageModals).

import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Crosshair,
  ExternalLink,
  MessageCircle,
  Phone,
  PhoneCall,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { ScoreRing } from "@/components/ui/score-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { LeadStageMenuItems } from "@/components/lead-stage-menu";
import {
  LeadStageModals,
  type PerdidoState,
  type StageModalState,
} from "@/components/lead-stage/lead-stage-modals";
import { RegistrarContatoDialog } from "@/components/registrar-contato-dialog";
import { useLeadStatusMutation } from "@/hooks/use-lead-status";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import { FLAG_META, leadFlags } from "@/lib/lead-flags";
import { describeInteracao, formatRelativeTime } from "@/lib/interacoes";
import { PROXIMA_ACAO, type LeadStatus, type StageModal } from "@/lib/leads";
import { scoreLead } from "@/lib/priority";
import { registerShortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { useLeadDetail, usePrefetchLeadDetail, type LeadDetail } from "./use-lead-detail";

registerShortcut({ keys: "F", description: "Abrir modo foco na lista", group: "Leads" });
registerShortcut({ keys: "J / →", description: "Próximo lead da fila", group: "Modo Foco" });
registerShortcut({ keys: "K / ←", description: "Lead anterior", group: "Modo Foco" });
registerShortcut({ keys: "Esc", description: "Sair do modo foco", group: "Modo Foco" });

export type FocusModeProps = {
  /** Fila na ordem da lista filtrada atual. */
  leadIds: string[];
  startId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  origem?: "leads" | "blitz";
};

export function FocusMode({
  leadIds,
  startId,
  open,
  onOpenChange,
  origem = "leads",
}: FocusModeProps) {
  const [index, setIndex] = useState(0);

  // Reposiciona a fila quando abre (no lead clicado, ou no primeiro).
  useEffect(() => {
    if (!open) return;
    const start = startId ? leadIds.indexOf(startId) : 0;
    setIndex(start >= 0 ? start : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startId]);

  const leadId = leadIds[index] ?? null;
  const total = leadIds.length;
  const { lead, interacoes, tarefas } = useLeadDetail(open ? leadId : null);
  const prefetch = usePrefetchLeadDetail();

  // Aquecimento: o próximo da fila carrega enquanto este é trabalhado.
  useEffect(() => {
    if (!open) return;
    const next = leadIds[index + 1];
    if (next) prefetch(next);
  }, [open, index, leadIds, prefetch]);

  const goNext = () => setIndex((i) => Math.min(total - 1, i + 1));
  const goPrev = () => setIndex((i) => Math.max(0, i - 1));

  // J/K e setas — só com o foco aberto e fora de campos de texto.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable))
        return;
      if (e.key === "j" || e.key === "J" || e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "k" || e.key === "K" || e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, total]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none border-0 p-0 sm:rounded-none"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Modo foco — atendimento lead a lead</DialogTitle>

        {/* Barra superior */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle bg-card/80 px-4 backdrop-blur-sm">
          <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-primary">
            <Crosshair className="h-4 w-4" /> Modo foco
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {total > 0 ? `${index + 1} de ${total}` : "fila vazia"}
            {origem === "blitz" ? " · Blitz" : ""}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {leadId && (
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                <Link to="/leads/$leadId" params={{ leadId }}>
                  <ExternalLink className="h-4 w-4" />
                  <span className="hidden sm:inline">Dossiê completo</span>
                </Link>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sair do modo foco"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {/* Corpo */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!leadId ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhum lead na fila — ajuste os filtros da lista e tente de novo.
            </div>
          ) : lead.isError ? (
            <div className="p-6">
              <QueryErrorState
                error={lead.error}
                title="Não foi possível carregar o lead."
                onRetry={() => void lead.refetch()}
              />
            </div>
          ) : lead.isLoading || !lead.data ? (
            <FocusSkeleton />
          ) : (
            <FocusBody
              key={lead.data.id}
              lead={lead.data}
              interacoes={interacoes.data ?? []}
              interacoesLoading={interacoes.isLoading}
              tarefas={tarefas.data ?? []}
            />
          )}
        </div>

        {/* Rodapé de navegação da fila */}
        <footer className="flex h-16 shrink-0 items-center justify-between gap-2 border-t border-border-subtle bg-card/80 px-4 backdrop-blur-sm">
          <Button variant="outline" size="sm" disabled={index === 0} onClick={goPrev}>
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Anterior</span>
            <Kbd className="hidden md:inline-flex">K</Kbd>
          </Button>
          <div className="hidden items-center gap-1 sm:flex" aria-hidden="true">
            {leadIds.slice(0, 24).map((id, i) => (
              <span
                key={id}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-5 bg-gradient-gold" : "w-1.5 bg-muted",
                )}
              />
            ))}
            {total > 24 && <span className="text-xs text-muted-foreground">…</span>}
          </div>
          <Button
            size="sm"
            className="bg-gradient-gold text-navy-900 hover:opacity-90"
            disabled={index >= total - 1}
            onClick={goNext}
          >
            <span>Próximo lead</span>
            <Kbd className="hidden border-navy-900/30 bg-transparent text-navy-900 md:inline-flex">
              J
            </Kbd>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function FocusSkeleton() {
  return (
    <div className="grid gap-4 p-4 md:grid-cols-[280px_1fr_240px] md:p-6">
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <Skeleton className="h-56 w-full" />
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium">{value ?? "—"}</div>
    </div>
  );
}

function FocusBody({
  lead,
  interacoes,
  interacoesLoading,
  tarefas,
}: {
  lead: LeadDetail;
  interacoes: {
    id: string;
    tipo: string;
    direcao: string;
    titulo: string | null;
    conteudo: string;
    ocorreu_em: string;
  }[];
  interacoesLoading: boolean;
  tarefas: { id: string; titulo: string; data_vencimento: string | null }[];
}) {
  const abrirWhatsApp = useWhatsAppLead();
  const [contatoOpen, setContatoOpen] = useState(false);
  const [modalState, setModalState] = useState<StageModalState>(null);
  const [perdidoLead, setPerdidoLead] = useState<PerdidoState>(null);

  const mudarStatus = useLeadStatusMutation({
    optimisticKeys: [["leads"]],
    invalidateKeys: [["leads"], ["leads-status-counts"], ["lead-detail"], ["leads-kanban"]],
  });

  const flags = useMemo(
    () =>
      leadFlags({
        status: lead.status,
        temperatura: lead.temperatura,
        created_at: lead.created_at,
        ultima_interacao: lead.ultima_interacao,
      }),
    [lead],
  );

  const score = scoreLead({
    temperatura: lead.temperatura,
    status: lead.status,
    ultimaInteracao: lead.ultima_interacao,
  });
  const proxima = PROXIMA_ACAO[lead.status as LeadStatus];

  return (
    <div className="mx-auto grid max-w-6xl gap-6 p-4 md:grid-cols-[280px_1fr_240px] md:p-6">
      {/* Identidade + contexto */}
      <section className="space-y-4">
        <div className="animate-slide-fade flex items-start gap-3 motion-reduce:animate-none">
          <ScoreRing
            value={score.score}
            size={56}
            intent={
              score.tier === "alta" ? "danger" : score.tier === "media" ? "warning" : "neutral"
            }
            title={`Score ${score.score} — ${score.motivo}`}
          />
          <div className="min-w-0">
            <h2 className="font-display truncate text-xl font-semibold">{lead.nome}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <TemperatureChip temperatura={lead.temperatura} size="sm" />
              <StatusBadge>{lead.status.replace(/_/g, " ")}</StatusBadge>
            </div>
          </div>
        </div>

        {flags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {flags.map((f) => (
              <Badge key={f} variant="outline" className="text-xs">
                {FLAG_META[f].label}
              </Badge>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-border-subtle bg-card p-3 shadow-elev-1">
          <InfoCell label="Telefone" value={lead.telefone} />
          <InfoCell label="E-mail" value={lead.email} />
          <InfoCell
            label="Origem"
            value={<span className="capitalize">{lead.origem.replace(/_/g, " ")}</span>}
          />
          <InfoCell label="Projeto" value={lead.projeto_nome} />
          <InfoCell label="Renda" value={lead.renda_informada} />
          <InfoCell label="Entrada" value={lead.entrada_disponivel} />
          <InfoCell
            label="FGTS"
            value={lead.usa_fgts == null ? "—" : lead.usa_fgts ? "Sim" : "Não"}
          />
          <InfoCell
            label="Último contato"
            value={lead.ultima_interacao ? formatRelativeTime(lead.ultima_interacao) : "nunca"}
          />
        </div>

        {lead.observacoes && (
          <div className="rounded-xl border border-border-subtle bg-card p-3 text-sm text-muted-foreground shadow-elev-1">
            <div className="mb-1 text-xs uppercase tracking-wide">Observações</div>
            <p className="whitespace-pre-wrap">{lead.observacoes}</p>
          </div>
        )}

        {tarefas.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">
              Próximos passos
            </div>
            <div className="space-y-1.5">
              {tarefas.map((t) => (
                <div
                  key={t.id}
                  className="rounded-md border border-border-subtle bg-card p-2 text-sm"
                >
                  <div className="truncate font-medium">{t.titulo}</div>
                  {t.data_vencimento && (
                    <div className="text-xs text-muted-foreground">
                      {new Date(t.data_vencimento).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Histórico */}
      <section className="min-w-0">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Histórico
          </h3>
          {proxima && (
            <span className="text-xs text-muted-foreground">
              Próxima ação sugerida: <span className="text-foreground">{proxima.label}</span>
            </span>
          )}
        </div>
        {interacoesLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : interacoes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhuma interação ainda — este é o momento do primeiro contato.
          </div>
        ) : (
          <ol className="stagger-children space-y-2">
            {interacoes.map((i) => (
              <li
                key={i.id}
                className="rounded-xl border border-border-subtle bg-card p-3 shadow-elev-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {i.titulo ||
                      describeInteracao(
                        i.tipo as Parameters<typeof describeInteracao>[0],
                        i.direcao as Parameters<typeof describeInteracao>[1],
                      )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelativeTime(i.ocorreu_em)}
                  </span>
                </div>
                {i.conteudo && (
                  <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{i.conteudo}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Ações */}
      <section className="space-y-2 md:sticky md:top-4 md:self-start">
        <Button
          className="w-full bg-gradient-gold text-navy-900 hover:opacity-90"
          onClick={() =>
            abrirWhatsApp({
              id: lead.id,
              nome: lead.nome,
              telefone: lead.telefone,
              projeto_nome: lead.projeto_nome,
            })
          }
        >
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </Button>
        <Button asChild variant="outline" className="w-full">
          <a href={`tel:${lead.telefone.replace(/\D/g, "")}`}>
            <Phone className="h-4 w-4" /> Ligar
          </a>
        </Button>
        <Button variant="outline" className="w-full" onClick={() => setContatoOpen(true)}>
          <PhoneCall className="h-4 w-4" /> Registrar contato
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full">
              <ArrowRight className="h-4 w-4" /> Mudar etapa
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <LeadStageMenuItems
              lead={{ id: lead.id, nome: lead.nome, status: lead.status }}
              onPickDirect={(target) => mudarStatus.mutate({ id: lead.id, status: target })}
              onPickModal={(modal: StageModal, target) => {
                void target;
                setModalState({
                  modal,
                  lead: {
                    id: lead.id,
                    nome: lead.nome,
                    status: lead.status,
                    corretor_id: lead.corretor_id,
                    projeto_id: lead.projeto_id,
                  },
                });
              }}
              onPickPerdido={() =>
                setPerdidoLead({
                  id: lead.id,
                  nome: lead.nome,
                  status: lead.status,
                  corretor_id: lead.corretor_id,
                  projeto_id: lead.projeto_id,
                })
              }
            />
          </DropdownMenuContent>
        </DropdownMenu>

        <RegistrarContatoDialog
          open={contatoOpen}
          onOpenChange={setContatoOpen}
          lead={{ id: lead.id, nome: lead.nome, corretor_id: lead.corretor_id }}
        />
        <LeadStageModals
          modalState={modalState}
          onModalOpenChange={(open) => !open && setModalState(null)}
          perdidoLead={perdidoLead}
          onPerdidoOpenChange={(open) => !open && setPerdidoLead(null)}
        />
      </section>
    </div>
  );
}
