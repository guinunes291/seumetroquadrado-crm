import { MoreHorizontal, ArrowRightCircle, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  FUNNEL_STAGES,
  LEAD_STATUS_LABEL,
  resolveStageAction,
  stageRequiresModal,
  type LeadStatus,
  type StageModal,
} from "@/lib/leads";

type LeadStageMenuProps = {
  lead: { id: string; nome: string; status: string };
  /** Etapa direta (sem modal) escolhida. */
  onPickDirect: (target: LeadStatus) => void;
  /** Etapa que exige modal escolhida. */
  onPickModal: (modal: StageModal, target: LeadStatus) => void;
  /** "Marcar como perdido" escolhido. */
  onPickPerdido: () => void;
  align?: "start" | "end";
  triggerClassName?: string;
  disabled?: boolean;
};

/**
 * Menu "⋯" com todas as etapas do funil ("Mover para") + "Marcar como perdido".
 * Apresentacional: o estado dos modais/diálogos vive na rota pai, que também os
 * abre pelo arrastar do Kanban — garantindo um único caminho de roteamento.
 */
export function LeadStageMenu({
  lead,
  onPickDirect,
  onPickModal,
  onPickPerdido,
  align = "end",
  triggerClassName,
  disabled,
}: LeadStageMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7 shrink-0", triggerClassName)}
          disabled={disabled}
          aria-label="Mudar etapa do lead"
          // Não deixar o clique iniciar drag no card nem navegar pelo link da linha.
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          draggable={false}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">
        <DropdownMenuLabel className="flex items-center gap-1.5">
          <ArrowRightCircle className="h-3.5 w-3.5 text-muted-foreground" />
          Mover para
        </DropdownMenuLabel>
        {FUNNEL_STAGES.map((s) => (
          <DropdownMenuItem
            key={s}
            disabled={s === lead.status}
            onSelect={() => {
              const action = resolveStageAction(s);
              if (action.kind === "modal") onPickModal(action.modal, s);
              else onPickDirect(s);
            }}
          >
            {LEAD_STATUS_LABEL[s]}
            {stageRequiresModal(s) && (
              <span className="ml-auto text-[10px] text-muted-foreground">…</span>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          disabled={lead.status === "perdido"}
          onSelect={() => onPickPerdido()}
        >
          <Ban className="h-4 w-4" />
          Marcar como perdido
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
