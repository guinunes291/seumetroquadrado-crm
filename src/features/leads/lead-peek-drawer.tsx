// Dossiê-relâmpago do lead: contexto e ação sem sair da lista. Abrir a página
// completa vira exceção — o corretor decide e age daqui (WhatsApp, ligar,
// registrar contato, mudar etapa). Sheet à direita no desktop; bottom-drawer
// (vaul) no mobile. NENHUMA mutação nova: toda escrita reusa os fluxos
// existentes (RegistrarContatoDialog, useLeadStatusMutation, LeadStageModals).

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Phone, PhoneCall, WhatsappLogo } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { ScoreRing } from "@/components/ui/score-ring";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { LeadStageMenuItems } from "@/components/lead-stage-menu";
import { AnaliseCreditoCard } from "@/components/lead-stage/analise-resultado";
import {
  LeadStageModals,
  type PerdidoState,
  type StageModalState,
} from "@/components/lead-stage/lead-stage-modals";
import { RegistrarContatoDialog } from "@/components/registrar-contato-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLeadStatusMutation } from "@/hooks/use-lead-status";
import { FlagChips } from "@/features/leads/leads-table";
import { describeInteracao, formatRelativeTime } from "@/lib/interacoes";
import {
  LEAD_STATUS_BADGE_TONE,
  PROXIMA_ACAO,
  leadStatusLabel,
  type LeadStatus,
  type StageModal,
} from "@/lib/leads";
import { scoreLead } from "@/lib/priority";
import type { Lead } from "./types";
import { fetchInteracoes, fetchTarefas } from "./use-lead-detail";
import { origemLabel } from "@/lib/origem";

/** Campos mínimos que o peek precisa — o Lead da listagem satisfaz por estrutura. */
export type PeekLead = {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  origem: string;
  status: string;
  temperatura: string | null;
  projeto_nome: string | null;
  corretor_id: string | null;
  created_at: string;
  ultima_interacao: string | null;
  renda_informada: string | null;
  entrada_disponivel: string | null;
  usa_fgts: boolean | null;
  // --- Opcionais: presentes quando o chamador passa o Lead completo da lista;
  // chamadores que mandam objetos mais magros (ex.: Atendimento) seguem válidos.
  /** Alimenta os modais de etapa (agendamento pré-seleciona o projeto). */
  projeto_id?: string | null;
  /** Flags operacionais (FlagChips/leadFlags) — follow-up combinado/pendente. */
  proximo_followup?: string | null;
  tem_followup?: boolean;
  /** Score vindo do servidor (RPC v3); ausente, cai no cálculo client-side. */
  score?: number | null;
};

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium">{value ?? "—"}</div>
    </div>
  );
}

function PeekBody({
  lead,
  corretorNome,
  onWhatsApp,
  onProximaAcao,
}: {
  lead: PeekLead;
  corretorNome?: string;
  onWhatsApp: (lead: PeekLead) => void;
  onProximaAcao?: (lead: PeekLead) => void;
}) {
  const [contatoOpen, setContatoOpen] = useState(false);
  const [modalState, setModalState] = useState<StageModalState>(null);
  const [perdidoLead, setPerdidoLead] = useState<PerdidoState>(null);

  // Mesma configuração da coluna de ações do modo foco: patch otimista na
  // lista e invalidação de lista + contadores + detalhe ao concluir.
  const mudarStatus = useLeadStatusMutation({
    optimisticKeys: [["leads"]],
    invalidateKeys: [["leads"], ["leads-status-counts"], ["lead-detail"]],
  });

  // Score: o servidor (RPC v3) manda quando presente; o cálculo client-side é
  // o fallback e continua dono do "motivo" exibido no title e na legenda.
  const calculado = scoreLead({
    temperatura: lead.temperatura,
    status: lead.status,
    ultimaInteracao: lead.ultima_interacao,
  });
  const score = typeof lead.score === "number" ? lead.score : calculado.score;
  const proxima = PROXIMA_ACAO[lead.status as LeadStatus];

  // FlagChips espera o Lead completo da listagem; o peek monta um com defaults
  // neutros para o que não recebe — leadFlags só olha status/temperatura/
  // created_at/ultima_interacao (+ tem_followup quando o chamador manda).
  const flagsLead: Lead = {
    id: lead.id,
    nome: lead.nome,
    email: lead.email,
    telefone: lead.telefone,
    origem: lead.origem,
    status: lead.status,
    temperatura: lead.temperatura,
    corretor_id: lead.corretor_id,
    projeto_id: lead.projeto_id ?? null,
    projeto_nome: lead.projeto_nome,
    observacoes: null,
    created_at: lead.created_at,
    ultima_interacao: lead.ultima_interacao,
    na_lixeira: false,
    renda_informada: lead.renda_informada,
    entrada_disponivel: lead.entrada_disponivel,
    usa_fgts: lead.usa_fgts,
    data_venda: null,
    tem_followup: lead.tem_followup,
  };

  // Forma mínima que o menu/modais de etapa precisam (StageLead) — o peek
  // satisfaz por estrutura, como o modo foco.
  const stageLead = {
    id: lead.id,
    nome: lead.nome,
    status: lead.status,
    corretor_id: lead.corretor_id,
    projeto_id: lead.projeto_id ?? null,
  };

  // Mesmas chaves/limites/staleTime do detalhe (use-lead-detail): um cache só
  // entre peek, modo foco e prefetch — abrir o foco depois do peek é grátis.
  const interacoesQ = useQuery({
    queryKey: ["lead-detail:interacoes", lead.id],
    staleTime: 15_000,
    queryFn: () => fetchInteracoes(lead.id),
  });
  const tarefasQ = useQuery({
    queryKey: ["lead-detail:tarefas", lead.id],
    staleTime: 15_000,
    queryFn: () => fetchTarefas(lead.id),
  });

  // Recorte-relâmpago: o peek mostra só os 3 primeiros de cada lista — a
  // íntegra vive no modo foco e no dossiê completo (mesmo cache).
  const tarefas = (tarefasQ.data ?? []).slice(0, 3);
  const interacoes = (interacoesQ.data ?? []).slice(0, 3);

  return (
    <div className="space-y-4 overflow-y-auto px-4 pb-6">
      {/* Identidade + prioridade */}
      <div className="flex items-center gap-3">
        <ScoreRing
          value={score}
          size={52}
          intent={
            calculado.tier === "alta"
              ? "danger"
              : calculado.tier === "media"
                ? "warning"
                : "neutral"
          }
          title={`Score de prioridade ${score} — ${calculado.motivo}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <TemperatureChip temperatura={lead.temperatura} size="sm" pulse={false} />
            <Badge
              variant="secondary"
              className={LEAD_STATUS_BADGE_TONE[lead.status as LeadStatus]}
            >
              {leadStatusLabel(lead.status)}
            </Badge>
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{calculado.motivo}</div>
        </div>
      </div>

      {/* Flags operacionais — os mesmos chips da listagem */}
      <FlagChips lead={flagsLead} max={4} />

      {/* Decisão da análise de crédito (item 3.1) — aprovar/reprovar sem
          sair do peek; cada desfecho oferece o próximo passo do fluxo. */}
      {lead.status === "analise_credito" && (
        <AnaliseCreditoCard
          lead={{ id: lead.id, nome: lead.nome, status: lead.status }}
          onRegistrarVenda={() => setModalState({ modal: "contrato_fechado", lead: stageLead })}
          onNovaAnalise={() => setModalState({ modal: "analise_credito", lead: stageLead })}
          onPerdido={() => setPerdidoLead(stageLead)}
        />
      )}

      {/* Ações principais — o motivo de o peek existir */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="min-h-11 bg-gradient-gold text-navy-900 hover:opacity-90"
          onClick={() => onWhatsApp(lead)}
        >
          <WhatsappLogo className="h-4 w-4" /> WhatsApp
        </Button>
        <Button asChild size="sm" variant="outline" className="min-h-11">
          <a href={`tel:${lead.telefone.replace(/\D/g, "")}`}>
            <Phone className="h-4 w-4" /> Ligar
          </a>
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11"
          onClick={() => setContatoOpen(true)}
        >
          <PhoneCall className="h-4 w-4" /> Registrar contato
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="min-h-11">
              <ArrowRight className="h-4 w-4" /> Mudar etapa
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <LeadStageMenuItems
              lead={{ id: lead.id, nome: lead.nome, status: lead.status }}
              onPickDirect={(target) => mudarStatus.mutate({ id: lead.id, status: target })}
              onPickModal={(modal: StageModal, target) => {
                void target;
                setModalState({ modal, lead: stageLead });
              }}
              onPickPerdido={() => setPerdidoLead(stageLead)}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        {proxima && onProximaAcao && (
          <Button
            size="sm"
            variant="outline"
            className="min-h-11"
            onClick={() => onProximaAcao(lead)}
          >
            {proxima.label}
          </Button>
        )}
      </div>

      <Separator />

      {/* Contexto em uma olhada */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <InfoCell label="Telefone" value={lead.telefone} />
        <InfoCell label="E-mail" value={lead.email} />
        <InfoCell label="Origem" value={<span>{origemLabel(lead.origem)}</span>} />
        <InfoCell label="Empreendimento" value={lead.projeto_nome} />
        <InfoCell label="Renda" value={lead.renda_informada} />
        <InfoCell label="Entrada" value={lead.entrada_disponivel} />
        <InfoCell
          label="FGTS"
          value={lead.usa_fgts == null ? "—" : lead.usa_fgts ? "Sim" : "Não"}
        />
        <InfoCell
          label="Corretor"
          value={corretorNome ?? (lead.corretor_id ? "…" : "sem corretor")}
        />
        <InfoCell label="Criado em" value={new Date(lead.created_at).toLocaleDateString("pt-BR")} />
        <InfoCell
          label="Último contato"
          value={lead.ultima_interacao ? formatRelativeTime(lead.ultima_interacao) : "nunca"}
        />
      </div>

      {/* Próximo passo agendado — erro não pode se disfarçar de "sem tarefas" */}
      {(tarefasQ.isLoading || tarefasQ.isError || tarefas.length > 0) && (
        <>
          <Separator />
          <div>
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              Próximos passos
            </div>
            {tarefasQ.isLoading ? (
              <div className="space-y-1.5">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : tarefasQ.isError ? (
              <QueryErrorState
                className="py-6"
                error={tarefasQ.error}
                title="Não foi possível carregar os próximos passos."
                onRetry={() => void tarefasQ.refetch()}
              />
            ) : (
              <div className="space-y-1.5">
                {tarefas.map((t) => (
                  <div key={t.id} className="rounded-md border p-2 text-sm">
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
            )}
          </div>
        </>
      )}

      {/* Histórico resumido */}
      <Separator />
      <div>
        <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          Últimas interações
        </div>
        {interacoesQ.isLoading ? (
          <div className="space-y-1.5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : interacoesQ.isError ? (
          <QueryErrorState
            className="py-6"
            error={interacoesQ.error}
            title="Não foi possível carregar as interações."
            onRetry={() => void interacoesQ.refetch()}
          />
        ) : interacoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma interação registrada ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {interacoes.map((i) => (
              <div key={i.id} className="rounded-md border p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {i.titulo || describeInteracao(i.tipo, i.direcao)}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelativeTime(i.ocorreu_em)}
                  </span>
                </div>
                {i.conteudo && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{i.conteudo}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Button asChild variant="outline" className="w-full">
        <Link to="/leads/$leadId" params={{ leadId: lead.id }}>
          Abrir dossiê completo <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>

      {/* Escritas reusam os fluxos existentes — nenhuma mutação nova no peek. */}
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
    </div>
  );
}

export function LeadPeekDrawer({
  lead,
  onOpenChange,
  corretorNome,
  onWhatsApp,
  onProximaAcao,
}: {
  lead: PeekLead | null;
  onOpenChange: (open: boolean) => void;
  corretorNome?: string;
  onWhatsApp: (lead: PeekLead) => void;
  onProximaAcao?: (lead: PeekLead) => void;
}) {
  const isMobile = useIsMobile();
  const open = !!lead;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]">
          {lead && (
            <>
              <DrawerHeader className="pb-2 text-left">
                <DrawerTitle className="font-display truncate">{lead.nome}</DrawerTitle>
              </DrawerHeader>
              <PeekBody
                lead={lead}
                corretorNome={corretorNome}
                onWhatsApp={onWhatsApp}
                onProximaAcao={onProximaAcao}
              />
            </>
          )}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-md">
        {lead && (
          <>
            <SheetHeader className="px-4 pb-2 pt-4">
              <SheetTitle className="font-display truncate pr-8">{lead.nome}</SheetTitle>
            </SheetHeader>
            <PeekBody
              lead={lead}
              corretorNome={corretorNome}
              onWhatsApp={onWhatsApp}
              onProximaAcao={onProximaAcao}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
