// Botão do topo "Venda por contrato (IA)", ao lado do "$" de Registrar venda.
// Também abre pelo evento `open-venda-contrato` — é como o atalho de dentro do
// "Registrar venda" chama este diálogo sem importar um módulo no outro.

import { useEffect, useState } from "react";
import { FileText } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { VendaContratoDialog } from "./venda-contrato-dialog";

export const EVENTO_ABRIR_VENDA_CONTRATO = "open-venda-contrato";

export function VendaContratoBotao() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const abrir = () => setOpen(true);
    window.addEventListener(EVENTO_ABRIR_VENDA_CONTRATO, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_VENDA_CONTRATO, abrir);
  }, []);
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="text-muted-foreground"
            onClick={() => setOpen(true)}
            aria-label="Venda por contrato (IA)"
          >
            <FileText className="h-[18px] w-[18px]" weight="regular" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Venda por contrato (IA): anexe o contrato e a venda já vem preenchida
        </TooltipContent>
      </Tooltip>
      <VendaContratoDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
