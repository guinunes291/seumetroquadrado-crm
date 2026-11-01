import { lazy, Suspense, useState } from "react";
import { VendaEtapasDialog, type LeadOption } from "@/components/registrar-venda-dialog";
import type { StageLead } from "@/lib/leads";

// Lazy: o fluxo do contrato (e o pdf.js que ele carrega) só baixa se o
// corretor escolher "Preencher com IA".
const VendaContratoDialog = lazy(() =>
  import("@/features/vendas/venda-contrato-dialog").then(({ VendaContratoDialog }) => ({
    default: VendaContratoDialog,
  })),
);

type Props = {
  lead: StageLead;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

/** "Registrar venda" a partir do card do lead: mesmo cadastro em etapas do botão
 *  do topo, já com o cliente escolhido (começa na construtora). Com o contrato
 *  em mãos, o atalho "Preencher com IA" abre a venda por contrato deste lead. */
export function ContractSaleDialog({ lead, onOpenChange, onDone }: Props) {
  const [usarContrato, setUsarContrato] = useState(false);
  const leadFixo: LeadOption = {
    id: lead.id,
    nome: lead.nome,
    telefone: null,
    email: null,
    corretor_id: lead.corretor_id,
    projeto_id: lead.projeto_id ?? null,
    projeto_nome: lead.projeto_nome ?? null,
    status: lead.status,
  };
  if (usarContrato) {
    return (
      <Suspense fallback={null}>
        <VendaContratoDialog open onOpenChange={onOpenChange} leadFixo={leadFixo} onDone={onDone} />
      </Suspense>
    );
  }
  return (
    <VendaEtapasDialog
      open
      setOpen={onOpenChange}
      onDone={onDone}
      leadFixo={leadFixo}
      onUsarContrato={() => setUsarContrato(true)}
    />
  );
}
