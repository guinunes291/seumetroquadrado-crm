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
import { telefoneEhDeCorretor } from "@/lib/telefone-corretor.server";
import { z } from "zod";
import {
  AgendarVisitaPayload,
  AnotarPayload,
  AtualizarQualificacaoBase,
  CriarTarefaPayload,
  ORIGENS_NOVO_CLIENTE,
  type DadosDeCadastro,
  MSG_ETAPA_PERDIDO,
  MSG_ETAPA_RETORNO,
  MSG_QUALIFICACAO_VAZIA,
  MudarEtapaBase,
  RegistrarContatoPayload,
  descreverProposta,
  etapaBloqueadaSemDono,
  etapaPerdidoTemMotivo,
  etapaRetornoTemFollowup,
  qualificacaoTemCampo,
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
  propor_novo_cliente:
    "Prepara o cadastro de um cliente NOVO na carteira do corretor (indicação, captação própria, plantão, ação de rua). Exige nome e telefone com DDD. O telefone e o nome completo chegam ocultos para você: aponte a posição deles com telefone_ref e nome_ref (veja o cabeçalho da mensagem). Se não houver telefone na mensagem, peça ao corretor. Se o telefone já existir no CRM, a ferramenta avisa e você usa o cliente existente. Não grava: o corretor confirma.",
} as const;

const NovoClienteInput = z.object({
  nome: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .optional()
    .describe("Nome do cliente como o corretor escreveu. Se vier como [NOME], use nome_ref."),
  nome_ref: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe("Posição do nome completo oculto na mensagem (1 = primeiro)"),
  telefone_ref: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe("Posição do telefone oculto na mensagem (1 = primeiro). Padrão 1 quando há um só."),
  origem: z
    .enum(ORIGENS_NOVO_CLIENTE)
    .optional()
    .describe("captacao_corretor (padrão) | indicacao | acao_rua | plantao | telefone | whatsapp | outro"),
  projetoNome: z.string().trim().max(120).optional().describe("Empreendimento de interesse"),
  bairro: z.string().trim().max(80).optional().describe("Bairro ou região de interesse"),
  observacoes: z.string().trim().max(500).optional().describe("O que o corretor já sabe do cliente"),
});

async function resolverLead(
  supabase: Db,
  leadId: string,
): Promise<{ id: string; nome: string | null; status: string; corretorId: string | null } | null> {
  const { data, error } = await supabase
    .from("leads")
    .select("id, nome, status, corretor_id")
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    nome: displayNameForSamiQ(data.nome),
    status: data.status,
    corretorId: data.corretor_id ?? null,
  };
}

export function criarFerramentasDePropostaSamiQ(args: {
  supabase: Db;
  userId: string;
  coletor: PropostaColetada[];
  /** Telefones e nomes extraídos do texto original (o modelo só vê marcadores). */
  cadastro?: DadosDeCadastro;
}): ToolSet {
  const { supabase, coletor } = args;
  const cadastro: DadosDeCadastro = args.cadastro ?? { telefones: [], nomes: [] };

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
      if (payload.tipo === "mudar_etapa") {
        const bloqueio = etapaBloqueadaSemDono(payload.novoStatus, lead.corretorId);
        if (bloqueio) return { erro: "lead_sem_corretor", detalhe: bloqueio };
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
      inputSchema: AtualizarQualificacaoBase.omit({ tipo: true }).refine(
        qualificacaoTemCampo,
        MSG_QUALIFICACAO_VAZIA,
      ),
      execute: (input) => empilhar({ tipo: "atualizar_qualificacao", ...input }),
    }),
    propor_visita: tool({
      description: DESCRICOES.propor_visita,
      inputSchema: AgendarVisitaPayload.omit({ tipo: true }),
      execute: (input) => empilhar({ tipo: "agendar_visita", ...input }),
    }),
    propor_novo_cliente: tool({
      description: DESCRICOES.propor_novo_cliente,
      inputSchema: NovoClienteInput,
      execute: async (input) => {
        const telRef = input.telefone_ref ?? (cadastro.telefones.length === 1 ? 1 : undefined);
        const telefone = telRef ? cadastro.telefones[telRef - 1] : undefined;
        if (!telefone) {
          return {
            erro: "telefone_nao_encontrado",
            detalhe:
              cadastro.telefones.length === 0
                ? "a mensagem não tem telefone com DDD; peça o telefone ao corretor antes de cadastrar"
                : `telefone_ref inválido; há ${cadastro.telefones.length} telefone(s) na mensagem`,
          };
        }
        const nome = (input.nome?.trim() || (input.nome_ref ? cadastro.nomes[input.nome_ref - 1] : "") || "")
          .replace(/\s+/g, " ")
          .trim();
        if (nome.length < 2) {
          return { erro: "nome_faltando", detalhe: "informe o nome do cliente (nome ou nome_ref)" };
        }
        if (await telefoneEhDeCorretor(telefone)) {
          return {
            erro: "telefone_de_corretor",
            detalhe: "este telefone é de um corretor da SMQ e não pode ser cadastrado como cliente",
          };
        }
        // Já está na carteira do próprio corretor? (RLS: só a carteira dele aparece.)
        const { data: existentes } = await supabase
          .from("leads")
          .select("id, nome, status")
          .is("deleted_at", null)
          .eq("na_lixeira", false)
          .like("telefone_e164", `%${telefone.slice(-9)}`)
          .limit(1);
        if (existentes && existentes.length > 0) {
          const e = existentes[0];
          return {
            erro: "cliente_ja_na_carteira",
            leadId: e.id,
            nome: displayNameForSamiQ(e.nome),
            etapa: e.status,
            detalhe: "este telefone já é de um cliente seu; registre o contato nele em vez de cadastrar",
          };
        }
        return empilhar({
          tipo: "criar_lead",
          nome,
          telefone,
          origem: input.origem ?? "captacao_corretor",
          ...(input.projetoNome?.trim() ? { projetoNome: input.projetoNome.trim() } : {}),
          ...(input.bairro?.trim() ? { bairro: input.bairro.trim() } : {}),
          ...(input.observacoes?.trim() ? { observacoes: input.observacoes.trim() } : {}),
        });
      },
    }),
    propor_etapa: tool({
      description: DESCRICOES.propor_etapa,
      inputSchema: MudarEtapaBase.omit({ tipo: true })
        .refine(etapaPerdidoTemMotivo, MSG_ETAPA_PERDIDO)
        .refine(etapaRetornoTemFollowup, MSG_ETAPA_RETORNO),
      execute: (input) => empilhar({ tipo: "mudar_etapa", ...input }),
    }),
  };
}
