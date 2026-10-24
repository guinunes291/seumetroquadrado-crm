// Quadro Kanban — os diálogos abertos a partir do quadro: Registrar contato,
// modais de etapa e de perda, e o dossiê-relâmpago (peek).
// Recortado de src/components/leads-kanban-board.tsx sem mudança de comportamento.

import type { Dispatch, SetStateAction } from "react";
import {
  LeadStageModals,
  type StageModalState,
  type PerdidoState,
} from "@/components/lead-stage/lead-stage-modals";
import { RegistrarContatoDialog } from "@/components/registrar-contato-dialog";
import { LeadPeekDrawer } from "@/features/leads/lead-peek-drawer";
import type { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import type { Lead, StagePage } from "./queries";
import { toPeekLead } from "./kanban-board-utils";
import type { LeadStatus } from "@/lib/leads";

type KanbanDialogosProps = {
  contatoLead: Lead | null;
  setContatoLead: Dispatch<SetStateAction<Lead | null>>;
  modalState: StageModalState;
  setModalState: Dispatch<SetStateAction<StageModalState>>;
  perdidoLead: PerdidoState;
  setPerdidoLead: Dispatch<SetStateAction<PerdidoState>>;
  setExtraPages: Dispatch<SetStateAction<Partial<Record<LeadStatus, StagePage>>>>;
  refetchLeads: () => Promise<void>;
  peekLead: Lead | null;
  setPeekLead: Dispatch<SetStateAction<Lead | null>>;
  corretoresMap: Map<string, string>;
  abrirWhatsApp: ReturnType<typeof useWhatsAppLead>;
  proximaAcaoDoPeek: () => void;
};

export function KanbanDialogos({
  contatoLead,
  setContatoLead,
  modalState,
  setModalState,
  perdidoLead,
  setPerdidoLead,
  setExtraPages,
  refetchLeads,
  peekLead,
  setPeekLead,
  corretoresMap,
  abrirWhatsApp,
  proximaAcaoDoPeek,
}: KanbanDialogosProps) {
  return (
    <>
      {contatoLead && (
        <RegistrarContatoDialog
          open
          onOpenChange={(o) => !o && setContatoLead(null)}
          lead={{
            id: contatoLead.id,
            nome: contatoLead.nome,
            corretor_id: contatoLead.corretor_id ?? null,
            status: contatoLead.status,
          }}
          defaultResultado="atendeu"
        />
      )}
      <LeadStageModals
        modalState={modalState}
        onModalOpenChange={(o) => !o && setModalState(null)}
        perdidoLead={perdidoLead}
        onPerdidoOpenChange={(o) => !o && setPerdidoLead(null)}
        onDone={() => {
          setExtraPages({});
          void refetchLeads();
        }}
      />
      {/* Dossiê-relâmpago (peek) — contexto e ação sem abrir a página do lead */}
      <LeadPeekDrawer
        lead={peekLead ? toPeekLead(peekLead) : null}
        onOpenChange={(o) => !o && setPeekLead(null)}
        corretorNome={peekLead?.corretor_id ? corretoresMap.get(peekLead.corretor_id) : undefined}
        onWhatsApp={abrirWhatsApp}
        onProximaAcao={proximaAcaoDoPeek}
      />
    </>
  );
}
