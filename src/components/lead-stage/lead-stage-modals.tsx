import type { StageLead, StageModal } from "@/lib/leads";
import { AppointmentStageDialog } from "./appointment-stage-dialog";
import { VisitFeedbackDialog } from "./visit-feedback-dialog";
import { CreditAnalysisDialog } from "./credit-analysis-dialog";
import { ContractSaleDialog } from "./contract-sale-dialog";
import { PerdidoDialog } from "./perdido-dialog";

export type StageModalState = { modal: StageModal; lead: StageLead } | null;
export type PerdidoState = StageLead | null;

type Props = {
  modalState: StageModalState;
  onModalOpenChange: (open: boolean) => void;
  perdidoLead: PerdidoState;
  onPerdidoOpenChange: (open: boolean) => void;
  /** Disparado quando qualquer um dos diálogos conclui com sucesso — para a
   *  página invalidar queries próprias (ex.: detalhe da Oferta Ativa). */
  onDone?: () => void;
};

/** Renderiza, no nível da página, o modal correspondente à etapa escolhida —
 *  acionado tanto pelo menu do card quanto pelo arrastar do Kanban. */
export function LeadStageModals({
  modalState,
  onModalOpenChange,
  perdidoLead,
  onPerdidoOpenChange,
  onDone,
}: Props) {
  return (
    <>
      {modalState?.modal === "agendado" && (
        <AppointmentStageDialog
          lead={modalState.lead}
          onOpenChange={onModalOpenChange}
          onDone={onDone}
        />
      )}
      {modalState?.modal === "visita_realizada" && (
        <VisitFeedbackDialog
          lead={modalState.lead}
          onOpenChange={onModalOpenChange}
          onDone={onDone}
        />
      )}
      {modalState?.modal === "analise_credito" && (
        <CreditAnalysisDialog
          lead={modalState.lead}
          onOpenChange={onModalOpenChange}
          onDone={onDone}
        />
      )}
      {modalState?.modal === "contrato_fechado" && (
        <ContractSaleDialog
          lead={modalState.lead}
          onOpenChange={onModalOpenChange}
          onDone={onDone}
        />
      )}
      {perdidoLead && (
        <PerdidoDialog lead={perdidoLead} onOpenChange={onPerdidoOpenChange} onDone={onDone} />
      )}
    </>
  );
}
