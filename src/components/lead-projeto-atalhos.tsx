// "Ver projeto" e "Vitrine" a partir de um lead.
//
// Decisão do dono: o hub de projetos fica SEMPRE disponível para consulta —
// no card do processo obrigatório e na ficha do lead, travado ou não. O
// corretor está com o cliente na linha e precisa do book, da tabela e da
// planta sem sair do atendimento. Os dois destinos abrem já no contexto do
// lead (?leadId), que é o que o projeto e a vitrine usam para personalizar.

import { Link } from "@tanstack/react-router";
import { Buildings, Storefront } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LeadProjetoAtalhos({
  leadId,
  projetoId,
  className,
}: {
  leadId: string;
  projetoId: string | null | undefined;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
        {projetoId ? (
          <Link to="/projetos/$projetoId" params={{ projetoId }} search={{ leadId }}>
            <Buildings className="h-4 w-4" /> Ver projeto
          </Link>
        ) : (
          <Link to="/projetos">
            <Buildings className="h-4 w-4" /> Projetos
          </Link>
        )}
      </Button>
      <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
        <Link to="/vitrine" search={{ leadId }}>
          <Storefront className="h-4 w-4" /> Vitrine
        </Link>
      </Button>
    </div>
  );
}
