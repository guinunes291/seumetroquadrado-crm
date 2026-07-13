// Ações por linha/card da listagem de leads (resumo financeiro, menu ⋯ e o
// split "Iniciar atendimento") — extraídas de leads.index.tsx sem mudança de
// comportamento.

import {
  Shuffle,
  Trash2,
  Play,
  MessageCircle,
  MoreHorizontal,
  Phone,
  DollarSign,
  ArrowRightLeft,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { LeadStageMenuItems } from "@/components/lead-stage-menu";
import type { LeadStatus, StageModal } from "@/lib/leads";
import type { Lead } from "./types";

export function FinRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value || "—"}</dd>
    </div>
  );
}

/** Resumo financeiro do lead em um Popover, sem abrir o perfil. */
export function FinanceiroPopover({ lead }: { lead: Lead }) {
  const temDados =
    !!(lead.projeto_nome || lead.renda_informada || lead.entrada_disponivel) ||
    lead.usa_fgts != null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          title="Resumo financeiro"
          onClick={(e) => e.stopPropagation()}
        >
          <DollarSign className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 text-sm">
        <div className="font-medium mb-2">Resumo do lead</div>
        <dl className="space-y-1">
          <FinRow label="Empreendimento" value={lead.projeto_nome} />
          <FinRow label="Renda" value={lead.renda_informada} />
          <FinRow label="Entrada" value={lead.entrada_disponivel} />
          <FinRow
            label="FGTS"
            value={lead.usa_fgts == null ? null : lead.usa_fgts ? "Sim" : "Não"}
          />
        </dl>
        {!temDados && (
          <div className="mt-2 text-xs text-muted-foreground">Sem dados financeiros ainda.</div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Menu ⋯ único da linha/card: etapas do funil + ações de gestão (Roleta,
 * Transferir, Lixeira). Substitui os 4 botões soltos que existiam por linha.
 */
export function LeadRowMenu({
  lead,
  canManage,
  canAct,
  onPickDirect,
  onPickModal,
  onPickPerdido,
  onRoleta,
  onTransferir,
  onLixeira,
}: {
  lead: Lead;
  canManage: boolean;
  canAct: boolean;
  onPickDirect: (target: LeadStatus) => void;
  onPickModal: (modal: StageModal) => void;
  onPickPerdido: () => void;
  onRoleta: () => void;
  onTransferir: () => void;
  onLixeira: () => void;
}) {
  const showStages = canAct && !lead.na_lixeira && lead.status !== "aguardando_atendimento";
  if (!showStages && !canManage) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label="Mais ações"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {showStages && (
          <LeadStageMenuItems
            lead={lead}
            onPickDirect={onPickDirect}
            onPickModal={(modal) => onPickModal(modal)}
            onPickPerdido={onPickPerdido}
          />
        )}
        {canManage && (
          <>
            {showStages && <DropdownMenuSeparator />}
            <DropdownMenuLabel>Gestão</DropdownMenuLabel>
            {!lead.corretor_id && !lead.na_lixeira && (
              <DropdownMenuItem onSelect={onRoleta}>
                <Shuffle className="h-4 w-4 mr-2" /> Distribuir (roleta)
              </DropdownMenuItem>
            )}
            {!lead.na_lixeira && (
              <DropdownMenuItem onSelect={onTransferir}>
                <ArrowRightLeft className="h-4 w-4 mr-2" /> Transferir
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={onLixeira}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {lead.na_lixeira ? "Restaurar" : "Mover p/ lixeira"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Split "Iniciar {WhatsApp|ligação}": um clique repete o último tipo de contato;
 * a seta abre as alternativas. Usado na tabela e nos cards (mesma UX).
 */
export function IniciarSplitButton({
  lead,
  lastContactType,
  pending,
  onIniciar,
  onEscolher,
}: {
  lead: Lead;
  lastContactType: "ligacao" | "whatsapp";
  pending: boolean;
  onIniciar: (lead: Lead, tipo: "ligacao" | "whatsapp") => void;
  onEscolher: (lead: Lead) => void;
}) {
  return (
    <div className="flex items-center">
      <Button
        size="sm"
        className="rounded-r-none"
        onClick={() => onIniciar(lead, lastContactType)}
        disabled={pending}
      >
        {lastContactType === "whatsapp" ? (
          <MessageCircle className="h-3.5 w-3.5 mr-1" />
        ) : (
          <Phone className="h-3.5 w-3.5 mr-1" />
        )}
        Iniciar {lastContactType === "whatsapp" ? "WhatsApp" : "ligação"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            className="rounded-l-none border-l border-primary-foreground/20 px-1.5"
            disabled={pending}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onIniciar(lead, "whatsapp")}>
            <MessageCircle className="h-4 w-4 mr-2" /> Iniciar por WhatsApp
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onIniciar(lead, "ligacao")}>
            <Phone className="h-4 w-4 mr-2" /> Iniciar por ligação
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onEscolher(lead)}>
            <Play className="h-4 w-4 mr-2" /> Escolher…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
