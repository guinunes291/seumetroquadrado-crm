// Aba Qualificação do dossiê do lead: perfil do cliente (vai no comparativo em
// PDF), objeções, simulador de financiamento, atalhos para a planilha de
// amortização e para o fluxo das construtoras (Simuladores),
// atalho para a Vitrine e recomendação de empreendimento. Os componentes
// internos cuidam das próprias queries/mutations — aqui é só composição.

import { Link } from "@tanstack/react-router";
import { Buildings, Calculator, MapTrifold } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { LeadObjecoes } from "@/components/lead-objecoes";
import { SimuladorFinanciamento } from "@/components/simulador-financiamento";
import { EmpreendimentoRecomendado } from "@/components/empreendimento-recomendado";
import type { DossieLead } from "@/features/leads/dossie/types";
import {
  prefillDaAprovacao,
  useAprovacaoParaPlanilha,
} from "@/features/simulador-amortizacao/prefill-lead";
import {
  prefillFluxoDaAprovacao,
  useAprovacaoParaFluxo,
} from "@/features/simuladores/prefill-lead";
import { PerfilClienteCard } from "@/features/leads/dossie/perfil-cliente-card";

export function QualificacaoTab({ lead }: { lead: DossieLead }) {
  return (
    <>
      <PerfilClienteCard leadId={lead.id} />
      <LeadObjecoes leadId={lead.id} objecoes={lead.objecoes ?? null} />
      <SimuladorFinanciamento
        entradaInicial={lead.entrada_disponivel}
        rendaInicial={lead.renda_informada}
      />
      <BotaoPlanilhaAmortizacao lead={lead} />
      <BotaoFluxoConstrutora lead={lead} />
      <Button asChild variant="outline" className="w-full justify-start">
        <Link to="/vitrine" search={{ leadId: lead.id }}>
          <MapTrifold className="mr-2 h-4 w-4" />
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

/** Abre a planilha de amortização com os dados do contrato (aprovação de crédito). */
function BotaoPlanilhaAmortizacao({ lead }: { lead: DossieLead }) {
  const aprovacao = useAprovacaoParaPlanilha(lead.id);
  const busca = { ...prefillDaAprovacao(aprovacao.data, lead.renda_informada), cliente: lead.nome };
  return (
    <Button asChild variant="outline" className="w-full justify-start">
      <Link to="/simulador-amortizacao" search={busca}>
        <Calculator className="mr-2 h-4 w-4" />
        {busca.financiamento
          ? "Planilha de amortização (com a aprovação de crédito)"
          : "Planilha de amortização (SAC x PRICE)"}
      </Link>
    </Button>
  );
}

/** Abre os Simuladores com o que vem do banco (aprovação de crédito vigente). */
function BotaoFluxoConstrutora({ lead }: { lead: DossieLead }) {
  const aprovacao = useAprovacaoParaFluxo(lead.id);
  const busca = prefillFluxoDaAprovacao(aprovacao.data, lead.renda_informada);
  return (
    <Button asChild variant="outline" className="w-full justify-start">
      <Link to="/simuladores" search={busca}>
        <Buildings className="mr-2 h-4 w-4" />
        {busca.financiamento
          ? "Fluxo da construtora (com a aprovação de crédito)"
          : "Fluxo da construtora (Simuladores)"}
      </Link>
    </Button>
  );
}
