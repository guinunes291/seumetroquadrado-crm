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
};

/** Renderiza, no nível da página, o modal correspondente à etapa escolhida —
 *  acionado tanto pelo menu do card quanto pelo arrastar do Kanban. */
export function LeadStageModals({
  modalState,
  onModalOpenChange,
  perdidoLead,
  onPerdidoOpenChange,
}: Props) {
  return (
    <>
      {modalState?.modal === "agendado" && (
        <AppointmentStageDialog lead={modalState.lead} onOpenChange={onModalOpenChange} />
      )}
      {modalState?.modal === "visita_realizada" && (
        <VisitFeedbackDialog lead={modalState.lead} onOpenChange={onModalOpenChange} />
      )}
      {modalState?.modal === "analise_credito" && (
        <CreditAnalysisDialog lead={modalState.lead} onOpenChange={onModalOpenChange} />
      )}
      {modalState?.modal === "contrato_fechado" && (
        <ContractSaleDialog lead={modalState.lead} onOpenChange={onModalOpenChange} />
      )}
      {perdidoLead && <PerdidoDialog lead={perdidoLead} onOpenChange={onPerdidoOpenChange} />}
    </>
  );
}
