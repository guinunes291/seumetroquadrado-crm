import { VendaEtapasDialog } from "@/components/registrar-venda-dialog";
import type { StageLead } from "@/lib/leads";

type Props = {
  lead: StageLead;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

/** "Registrar venda" a partir do card do lead: mesmo cadastro em etapas do botão
 *  do topo, já com o cliente escolhido (começa na construtora). */
export function ContractSaleDialog({ lead, onOpenChange, onDone }: Props) {
  return (
    <VendaEtapasDialog
      open
      setOpen={onOpenChange}
      onDone={onDone}
      leadFixo={{
        id: lead.id,
        nome: lead.nome,
        telefone: null,
        email: null,
        corretor_id: lead.corretor_id,
        projeto_id: lead.projeto_id ?? null,
        projeto_nome: lead.projeto_nome ?? null,
        status: lead.status,
      }}
    />
  );
}
