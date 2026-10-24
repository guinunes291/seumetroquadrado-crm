// Quadro Kanban — o cartão do lead.
// Recortado de src/components/leads-kanban-board.tsx sem mudança de comportamento.

import type { Dispatch, SetStateAction } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Envelope, Phone, Prohibit, WarningCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { PROXIMA_ACAO, type LeadStatus } from "@/lib/leads";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { LeadStageMenu } from "@/components/lead-stage-menu";
import type { StageModalState, PerdidoState } from "@/components/lead-stage/lead-stage-modals";
import { SlaBadge } from "@/components/sla-badge";
import { TransferSlaBadge, useTransferTimeouts } from "@/components/transfer-sla-badge";
import type { useLeadStatusMutation } from "@/hooks/use-lead-status";
import type { usePointerDnd } from "./use-pointer-dnd";
import type { Lead, SlaRow } from "./queries";
import { diasParado, primeiraMinuscula, type KanbanColumn } from "./kanban-board-utils";

type KanbanLeadCardProps = {
  lead: Lead;
  col: KanbanColumn;
  gestao: boolean;
  corretoresMap: Map<string, string>;
  slaMap: Map<string, SlaRow>;
  transferTimeouts: ReturnType<typeof useTransferTimeouts>;
  dragging: ReturnType<typeof usePointerDnd>["dragging"];
  getCardProps: ReturnType<typeof usePointerDnd>["getCardProps"];
  updateStatus: Pick<ReturnType<typeof useLeadStatusMutation>, "mutate" | "isPending">;
  routeStage: (lead: Lead, target: LeadStatus) => void;
  setModalState: Dispatch<SetStateAction<StageModalState>>;
  setPerdidoLead: Dispatch<SetStateAction<PerdidoState>>;
  setContatoLead: Dispatch<SetStateAction<Lead | null>>;
  setPeekLead: Dispatch<SetStateAction<Lead | null>>;
};

export function KanbanLeadCard({
  lead,
  col,
  gestao,
  corretoresMap,
  slaMap,
  transferTimeouts,
  dragging,
  getCardProps,
  updateStatus,
  routeStage,
  setModalState,
  setPerdidoLead,
  setContatoLead,
  setPeekLead,
}: KanbanLeadCardProps) {
  return (
    <Card
      role="group"
      aria-label={`${lead.nome}, etapa ${col.label}`}
      {...getCardProps(lead.id)}
      className={cn(
        "group/card relative cursor-grab rounded-xl border-border-subtle bg-card p-3 shadow-none transition-shadow hover:shadow-elev-2 active:cursor-grabbing",
        dragging?.cardId === lead.id && "opacity-40",
      )}
    >
      {/* Cartão da identidade Lançamento (como no vídeo):
          nome e temperatura, o empreendimento, o contato do
          cliente e o próximo passo. Telefone e e-mail ficam
          à vista — o corretor confere com quem vai falar sem
          abrir nada. Os prazos (SLA, transferência, dias
          parado) só aparecem quando há o que cobrar; o
          corretor, só para a gestão — para o corretor a
          carteira inteira é dele. */}
      <div className="flex items-start justify-between gap-2">
        {/* O nome abre o dossiê-relâmpago. Botões são
            ignorados pelo onPointerDown do drag, então o
            clique nunca vira arrasto. */}
        <button
          type="button"
          className="min-w-0 truncate text-left text-sm font-semibold hover:underline focus-visible:underline"
          aria-label={`Abrir visão rápida de ${lead.nome}`}
          onClick={() => setPeekLead(lead)}
        >
          {lead.nome}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <TemperatureChip
            temperatura={lead.temperatura}
            size="sm"
            pulse={false}
            className="shrink-0"
          />
          {/* Menu de etapa e descarte. No desktop aparecem
            por cima da temperatura ao passar o mouse ou
            focar o card; no toque ficam sempre à mão. */}
          <div className="flex shrink-0 items-center md:absolute md:right-1.5 md:top-1.5 md:rounded-lg md:bg-card md:opacity-0 md:shadow-elev-2 md:transition-opacity md:group-hover/card:opacity-100 md:group-focus-within/card:opacity-100">
            <LeadStageMenu
              lead={lead}
              onPickDirect={(target) => updateStatus.mutate({ id: lead.id, status: target })}
              onPickModal={(modal) => setModalState({ modal, lead })}
              onPickPerdido={() => setPerdidoLead(lead)}
              onPickContato={() => setContatoLead(lead)}
            />
            {lead.status !== "perdido" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                aria-label="Descartar lead"
                title="Descartar lead"
                draggable={false}
                onClick={(e) => {
                  e.stopPropagation();
                  setPerdidoLead(lead);
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Prohibit className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
      {(lead.projeto_nome || gestao) && (
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {[
            lead.projeto_nome,
            gestao
              ? lead.corretor_id
                ? (corretoresMap.get(lead.corretor_id) ?? "—")
                : "sem corretor"
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      )}
      <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-1.5">
          <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate tabular-nums">{lead.telefone}</span>
        </div>
        {lead.email && (
          <div className="flex min-w-0 items-center gap-1.5">
            <Envelope className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{lead.email}</span>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1 empty:hidden">
        {(lead.status === "novo" || lead.status === "aguardando_atendimento") &&
          slaMap.get(lead.id) && (
            <SlaBadge
              compact
              slaMinutos={slaMap.get(lead.id)!.sla_minutos}
              referencia={lead.data_distribuicao ?? lead.created_at}
            />
          )}
        <TransferSlaBadge
          compact
          showBar
          leadId={lead.id}
          origem={lead.origem}
          status={lead.status}
          dataDistribuicao={lead.data_distribuicao}
          tentativas={lead.tentativas_redistribuicao}
          timeouts={transferTimeouts}
          viaWebhook={lead.via_webhook}
        />
        {(() => {
          const dias = diasParado(lead);
          return dias >= 2 ? (
            <Badge
              variant="secondary"
              className={cn(
                "gap-0.5 text-[10px]",
                dias >= 5 ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning",
              )}
              title={`Sem interação há ${dias} dias`}
            >
              <WarningCircle className="h-2.5 w-2.5" /> {dias}d parado
            </Badge>
          ) : null;
        })()}
      </div>
      <div className="-mx-3">
        {/* "próximo passo: …" é a ação principal do card:
            continua com alvo de 44 px (toque), só que com
            cara de linha de texto, como no vídeo. O -mx-3
            alinha o texto ao nome. */}
        <div className="min-w-0">
          {PROXIMA_ACAO[lead.status as LeadStatus] && (
            <Button
              size="sm"
              variant="ghost"
              className="mt-2 min-h-11 w-full text-xs"
              disabled={updateStatus.isPending}
              onClick={(e) => {
                e.stopPropagation();
                const acao = PROXIMA_ACAO[lead.status as LeadStatus]!;
                if ("target" in acao) routeStage(lead, acao.target);
                else setContatoLead(lead);
              }}
            >
              <span className="flex w-full min-w-0 items-center justify-between gap-2 font-normal text-muted-foreground group-hover/card:text-foreground">
                <span className="truncate">
                  próximo passo:{" "}
                  <b className="font-medium">
                    {primeiraMinuscula(PROXIMA_ACAO[lead.status as LeadStatus]!.label)}
                  </b>
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              </span>
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
