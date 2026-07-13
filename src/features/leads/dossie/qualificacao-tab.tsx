// Aba Qualificação do dossiê do lead: objeções, simulador de financiamento,
// atalho para a Vitrine e recomendação de empreendimento. Os componentes
// internos cuidam das próprias queries/mutations — aqui é só composição.

import { Link } from "@tanstack/react-router";
import { Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeadObjecoes } from "@/components/lead-objecoes";
import { SimuladorFinanciamento } from "@/components/simulador-financiamento";
import { EmpreendimentoRecomendado } from "@/components/empreendimento-recomendado";
import type { DossieLead } from "@/features/leads/dossie/types";

export function QualificacaoTab({ lead }: { lead: DossieLead }) {
  return (
    <>
      <LeadObjecoes leadId={lead.id} objecoes={lead.objecoes ?? null} />
      <SimuladorFinanciamento
        entradaInicial={lead.entrada_disponivel}
        rendaInicial={lead.renda_informada}
      />
      <Button asChild variant="outline" className="w-full justify-start">
        <Link to="/vitrine" search={{ leadId: lead.id }}>
          <Map className="mr-2 h-4 w-4" />
          Abrir Vitrine para este lead
        </Link>
      </Button>
      <EmpreendimentoRecomendado
        lead={{
          id: lead.id,
          renda_informada: lead.renda_informada,
          entrada_disponivel: lead.entrada_disponivel,
          usa_fgts: lead.usa_fgts,
          faixa_mcmv: lead.faixa_mcmv,
          projeto_nome: lead.projeto_nome,
          observacoes: lead.observacoes,
        }}
      />
    </>
  );
}
