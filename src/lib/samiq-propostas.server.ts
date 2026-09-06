// Ferramentas de PROPOSTA da Sami (Onda S2). Cada `propor_*` valida o que o
// modelo montou, confirma que o cliente existe na carteira do corretor (RLS)
// e empilha uma proposta no coletor da chamada. NADA é gravado aqui: a
// proposta vira um card no painel e só executa quando o corretor confirma
// (samiq-executar.server.ts). O retorno da ferramenta diz isso ao modelo
// para ele nunca afirmar que registrou.

import { tool, type ToolSet } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { displayNameForSamiQ } from "@/lib/samiq-governance";
import {
  AgendarVisitaPayload,
  AnotarPayload,
  AtualizarQualificacaoPayload,
  CriarTarefaPayload,
  MudarEtapaPayload,
  RegistrarContatoPayload,
  descreverProposta,
  type PropostaPayload,
} from "@/lib/samiq-propostas";

type Db = SupabaseClient<Database>;

/** Proposta empilhada durante o loop — ainda sem id (o banco dá ao persistir). */
export type PropostaColetada = {
  payload: PropostaPayload;
  leadId: string | null;
  leadNome: string | null;
};

export const SAMIQ_MAX_PROPOSTAS_POR_TURNO = 10;

const DESCRICOES = {
  propor_registro_contato:
    "Prepara o registro de um contato feito com o cliente (ligação, WhatsApp, visita...) com o resultado, um resumo, as objeções ditas e o próximo follow-up. Não grava: o corretor confirma no card.",
  propor_anotacao:
    "Prepara uma anotação interna sobre o cliente (algo que o corretor quer lembrar). Não grava: o corretor confirma no card.",
  propor_tarefa:
    "Prepara uma tarefa ou follow-up com vencimento para o corretor (ligar, mandar WhatsApp, cobrar documento). Não grava: o corretor confirma no card.",
  propor_qualificacao:
    "Prepara a atualização dos dados de qualificação do cliente: renda, entrada, FGTS, tipo de renda, temperatura, empreendimento de interesse, objeções, parecer. Só os campos informados. Não grava: o corretor confirma no card.",
  propor_visita:
    "Prepara o agendamento de uma visita (data/hora com fuso de São Paulo, local) e, por padrão, a mudança do cliente para a etapa Agendado. Não grava: o corretor confirma no card.",
  propor_etapa:
    "Prepara a mudança de etapa do funil do cliente (em atendimento, aguardando retorno, qualificação, qualificado, proposta enviada, perdido). Ao perder, exige motivo e categoria. Não grava: o corretor confirma no card.",
} as const;

async function resolverLead(
  supabase: Db,
  leadId: string,
): Promise<{ id: string; nome: string | null; status: string } | null> {
  const { data, error } = await supabase
    .from("leads")
    .select("id, nome, status")
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id, nome: displayNameForSamiQ(data.nome), status: data.status };
}

export function criarFerramentasDePropostaSamiQ(args: {
  supabase: Db;
  userId: string;
  coletor: PropostaColetada[];
}): ToolSet {
  const { supabase, coletor } = args;

  const empilhar = async (payload: PropostaPayload) => {
    if (coletor.length >= SAMIQ_MAX_PROPOSTAS_POR_TURNO) {
      return { erro: "limite_de_propostas", detalhe: "máximo de 10 propostas por resposta" };
    }
    let leadNome: string | null = null;
    let leadId: string | null = null;
    if ("leadId" in payload && payload.leadId) {
      const lead = await resolverLead(supabase, payload.leadId);
      if (!lead) {
        return {
          erro: "cliente_nao_encontrado",
          detalhe: "esse id não está na carteira do corretor; use buscar_clientes",
        };
      }
      leadNome = lead.nome;
      leadId = lead.id;
      if (payload.tipo === "mudar_etapa" && lead.status === payload.novoStatus) {
        return { erro: "etapa_igual", detalhe: `o cliente já está em ${lead.status}` };
      }
    }
    coletor.push({ payload, leadId, leadNome });
    const descricao = descreverProposta(payload, leadNome);
    return {
      status: "aguardando_confirmacao",
      posicao: coletor.length,
      proposta: descricao,
      aviso:
        "Nada foi gravado. O corretor vê um card com esta proposta e confirma com um toque — diga isso a ele, sem afirmar que registrou.",
    };
  };

  return {
    propor_registro_contato: tool({
      description: DESCRICOES.propor_registro_contato,
      inputSchema: RegistrarContatoPayload.omit({ tipo: true }),
      execute: (input) => empilhar({ tipo: "registrar_contato", ...input }),
    }),
    propor_anotacao: tool({
      description: DESCRICOES.propor_anotacao,
      inputSchema: AnotarPayload.omit({ tipo: true }),
      execute: (input) => empilhar({ tipo: "anotar", ...input }),
    }),
    propor_tarefa: tool({
      description: DESCRICOES.propor_tarefa,
      inputSchema: CriarTarefaPayload.omit({ tipo: true }),
      execute: (input) => empilhar({ tipo: "criar_tarefa", ...input }),
    }),
    propor_qualificacao: tool({
      description: DESCRICOES.propor_qualificacao,
      inputSchema: AtualizarQualificacaoPayload.omit({ tipo: true }),
      execute: (input) => empilhar({ tipo: "atualizar_qualificacao", ...input }),
    }),
    propor_visita: tool({
      description: DESCRICOES.propor_visita,
      inputSchema: AgendarVisitaPayload.omit({ tipo: true }),
      execute: (input) => empilhar({ tipo: "agendar_visita", ...input }),
    }),
    propor_etapa: tool({
      description: DESCRICOES.propor_etapa,
      inputSchema: MudarEtapaPayload.omit({ tipo: true }),
      execute: (input) => empilhar({ tipo: "mudar_etapa", ...input }),
    }),
  };
}
