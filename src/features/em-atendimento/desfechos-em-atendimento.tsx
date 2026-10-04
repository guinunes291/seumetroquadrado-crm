// Os cinco desfechos de Em atendimento (regra dos 65, decisão 7 + "Mandou
// doc"): Agendou, Pediu retorno, Esfriou, Mandou doc, Perdido. Cada um abre o
// formulário da casa; nenhum é direto. A lista mora em lib/leads
// (DESFECHOS_EM_ATENDIMENTO), a mesma do menu "⋯" do card.
import { Button } from "@/components/ui/button";
import {
  DESFECHOS_EM_ATENDIMENTO,
  transicaoLeadPermitida,
  type LeadStatus,
  type StageLead,
  type StageModal,
} from "@/lib/leads";

export function DesfechosEmAtendimento({
  lead,
  gestao,
  pendente = false,
  onPickModal,
  onPickPerdido,
}: {
  lead: StageLead;
  gestao: boolean;
  pendente?: boolean;
  onPickModal: (modal: StageModal, target: LeadStatus) => void;
  onPickPerdido: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="desfechos-em-atendimento">
      {DESFECHOS_EM_ATENDIMENTO.map((d) => {
        const permitida = transicaoLeadPermitida(lead.status, d.target, gestao);
        return (
          <Button
            key={d.id}
            size="sm"
            variant={d.id === "perdido" ? "ghost" : "outline"}
            className={d.id === "perdido" ? "text-destructive hover:text-destructive" : undefined}
            disabled={!permitida || pendente}
            onClick={() => {
              if (d.action.kind === "perdido") onPickPerdido();
              else if (d.action.kind === "modal") onPickModal(d.action.modal, d.target);
            }}
          >
            {d.label}
          </Button>
        );
      })}
    </div>
  );
}
