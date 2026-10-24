// Ferramentas de ESCRITA da Sami (Onda S2 → v8 "CRM no WhatsApp").
//
// Cada ferramenta valida o que o modelo montou ANTES de qualquer gravação:
// schema (zod), cliente na carteira do corretor (RLS), homônimo, datas no
// fuso de SP e no futuro, e a máquina de estados do funil (espelho de
// transicao_lead_permitida em lib/leads.ts). Nada aqui grava:
//  * ação "direto" (autonomia por risco, só no WhatsApp) vai para o executor
//    imediato do turno (samiq-acoes.server.ts), que registra a ação em
//    samiq_propostas e executa pelo MESMO caminho do CONFIRMAR;
//  * ação "confirmar" (e tudo no painel) fica no coletor e vira pendente.
// O retorno de cada ferramenta diz ao modelo o que aconteceu de verdade.

//
// Desde a quebra em módulos (2026-10): leituras do cliente e dos homônimos em
// samiq-propostas-leitura.server.ts, regras do funil em
// samiq-propostas-regras.server.ts, checagens de tarefa/visita/anexo/cadastro
// em samiq-propostas-alvos.server.ts e o catálogo (descrições e schemas) em
// samiq-propostas-catalogo.ts.

import {
  displayNameForSamiQ,
  restaurarPiiDoCorretor,
  type MapaPiiCorretor,
} from "@/lib/samiq-governance";
import {
  INSTRUCAO_CLIENTE_AMBIGUO,
  avaliarDesambiguacao,
  candidatosParaPergunta,
} from "@/lib/samiq-homonimos";
import { MOTIVO_EM_ATENDIMENTO_CONSEQUENCIA } from "@/lib/leads";
import { agoraParaModelo, isoComFusoSP } from "@/lib/samiq-datas";
import type { CitarClienteSamiQ } from "@/lib/samiq-tools.server";
import {
  PropostaPayloadSchema,
  datasQueDevemSerFuturas,
  descreverProposta,
  leadIdDaProposta,
  nivelDaAcao,
  normalizarDatasDoPayload,
  normalizarTelefoneCadastro,
  type ModoEscritaSamiQ,
  type PropostaPayload,
} from "@/lib/samiq-propostas";
import type { ToolSet } from "ai";
import {
  buscarHomonimos,
  resolverLead,
  type Db,
  type LeadResolvido,
} from "./samiq-propostas-leitura.server";
import { checarRegrasDaProposta, rotulo, type Bloqueio } from "./samiq-propostas-regras.server";
import { ferramentasDeProposta } from "./samiq-propostas-catalogo";

/** Ação montada no loop — ainda sem id (o banco dá ao persistir). */
export type PropostaColetada = {
  payload: PropostaPayload;
  leadId: string | null;
  leadNome: string | null;
};

/** Resposta do executor imediato (ações "direto" no WhatsApp). */
export type ResultadoImediato =
  | { ok: true; id: string; efeito: string | null; desfazivel: boolean }
  | { ok: false; erro: string };

export type ExecutorImediato = (c: PropostaColetada) => Promise<ResultadoImediato>;

export const SAMIQ_MAX_PROPOSTAS_POR_TURNO = 20;

export function criarFerramentasDePropostaSamiQ(args: {
  supabase: Db;
  userId: string;
  coletor: PropostaColetada[];
  /** v8: "por_risco" (WhatsApp) executa as ações "direto" na hora; padrão confirmar tudo. */
  modo?: ModoEscritaSamiQ;
  executarAgora?: ExecutorImediato;
  /**
   * Texto CRU do corretor neste turno (e nos anteriores dele), usado só aqui
   * no servidor para a trava de homônimos. Nunca vai ao modelo.
   */
  textoDoCorretor?: string;
  /** Cliente já escolhido na tela (ex.: Sami aberta no dossiê): sem trava. */
  leadIdEmContexto?: string;
  /**
   * Candidatos da pergunta "qual Maria?" do turno anterior quando o corretor
   * respondeu escolhendo ("a 2", "a primeira"): a escolha veio dele.
   */
  liberados?: ReadonlySet<string>;
  /** Avisa quem chama dos candidatos da pergunta (vão para a memória da conversa). */
  aoAmbiguo?: (ids: string[]) => void;
  mapaPii?: MapaPiiCorretor;
  citar?: CitarClienteSamiQ;
  agora?: Date;
}): ToolSet {
  const { supabase, coletor } = args;
  const modo: ModoEscritaSamiQ = args.executarAgora
    ? (args.modo ?? "confirmar_tudo")
    : "confirmar_tudo";
  const textoDoCorretor = args.textoDoCorretor ?? "";
  const mapaPii = args.mapaPii ?? {};
  const citar: CitarClienteSamiQ = args.citar ?? (() => {});
  const agora = () => args.agora ?? new Date();
  let total = 0;
  const desambiguados = new Map<string, Bloqueio | null>();

  const travaDeHomonimos = async (lead: LeadResolvido): Promise<Bloqueio | null> => {
    if (args.leadIdEmContexto && args.leadIdEmContexto === lead.id) return null;
    if (args.liberados?.has(lead.id)) return null;
    if (desambiguados.has(lead.id)) return desambiguados.get(lead.id) ?? null;
    const homonimos = await buscarHomonimos(supabase, lead.bruto);
    let bloqueio: Bloqueio | null = null;
    if (homonimos === null) {
      bloqueio = {
        erro: "cliente_ambiguo",
        detalhe:
          "Não consegui confirmar se há outro cliente com esse nome. Confirme com o corretor o nome completo ou o empreendimento antes de gravar.",
      };
    } else {
      const r = avaliarDesambiguacao({ alvo: lead.bruto, homonimos, texto: textoDoCorretor });
      if (!r.ok) {
        const candidatos = candidatosParaPergunta([lead.bruto, ...homonimos], displayNameForSamiQ);
        args.aoAmbiguo?.(candidatos.map((c) => c.id));
        bloqueio = {
          erro: "cliente_ambiguo",
          detalhe: `${INSTRUCAO_CLIENTE_AMBIGUO} Numere a lista (1, 2, 3...) nessa ordem: o corretor pode responder só com o número.`,
          candidatos,
        };
      }
    }
    desambiguados.set(lead.id, bloqueio);
    return bloqueio;
  };

  /** Regras do funil e do dado que dá para checar sem gravar (sem RPC). */
  const checarRegras = (payload: PropostaPayload, lead: LeadResolvido | null) =>
    checarRegrasDaProposta(supabase, citar, payload, lead);

  const executar = async (entrada: PropostaPayload) => {
    let bruto = entrada;
    if (total >= SAMIQ_MAX_PROPOSTAS_POR_TURNO) {
      return {
        erro: "limite_de_acoes",
        detalhe: `máximo de ${SAMIQ_MAX_PROPOSTAS_POR_TURNO} ações por resposta`,
      };
    }
    // Cadastro: o modelo manda [TELEFONE_n]/[EMAIL_n]; o servidor troca pelo
    // que o corretor digitou e guarda o telefone só com dígitos.
    if (bruto.tipo === "criar_lead") {
      const telefone = normalizarTelefoneCadastro(restaurarPiiDoCorretor(bruto.telefone, mapaPii));
      if (!telefone) {
        return {
          erro: "telefone_invalido",
          detalhe:
            "Não achei um telefone com DDD válido nesta mensagem. Peça ao corretor o telefone do cliente (com DDD) e cadastre na mesma mensagem em que ele mandar.",
        };
      }
      const email = bruto.email ? restaurarPiiDoCorretor(bruto.email, mapaPii) : undefined;
      if (email && /\[(EMAIL|TELEFONE|CPF)/.test(email)) {
        return {
          erro: "email_invalido",
          detalhe: "o e-mail não veio nesta mensagem; cadastre sem e-mail",
        };
      }
      bruto = { ...bruto, telefone, ...(email ? { email } : {}) };
    }
    // Datas sem fuso viram horário de SP antes de validar e gravar.
    const normalizado = normalizarDatasDoPayload(bruto as Record<string, unknown>, (v) =>
      isoComFusoSP(v),
    ) as PropostaPayload;
    const parsed = PropostaPayloadSchema.safeParse(normalizado);
    if (!parsed.success) {
      return {
        erro: "dados_invalidos",
        detalhe: parsed.error.issues
          .map((i) => i.message)
          .join("; ")
          .slice(0, 300),
      };
    }
    let payload = parsed.data;
    for (const d of datasQueDevemSerFuturas(payload)) {
      if (Date.parse(d.iso) < agora().getTime() - 5 * 60_000) {
        return {
          erro: "data_no_passado",
          detalhe: `${d.campo} ficou no passado. Agora é ${agoraParaModelo(agora())} (São Paulo). Refaça a data.`,
        };
      }
    }

    let lead: LeadResolvido | null = null;
    const leadId = leadIdDaProposta(payload);
    if (leadId) {
      lead = await resolverLead(supabase, leadId);
      if (!lead) {
        return {
          erro: "cliente_nao_encontrado",
          detalhe: "esse id não está na carteira do corretor; use buscar_clientes",
        };
      }
      const bloqueio = await travaDeHomonimos(lead);
      if (bloqueio) return bloqueio;
      citar({ id: lead.id, nome: lead.nome, etapa: lead.status });
      if (payload.tipo === "mudar_etapa" && lead.status === payload.novoStatus) {
        return { erro: "etapa_igual", detalhe: `o cliente já está em ${rotulo(lead.status)}` };
      }
    }

    const regras = await checarRegras(payload, lead);
    if (regras.bloqueio) return regras.bloqueio;
    payload = regras.payload;
    const leadNome = lead?.nome ?? regras.nomeAlvo ?? null;
    const coletada: PropostaColetada = { payload, leadId: lead?.id ?? null, leadNome };
    const descricao = descreverProposta(payload, leadNome);
    total += 1;

    if (nivelDaAcao(payload.tipo, modo) === "direto" && args.executarAgora) {
      const r = await args.executarAgora(coletada);
      if (!r.ok) {
        return {
          status: "falhou",
          proposta: descricao,
          erro: r.erro,
          aviso: "Nada foi gravado. Explique o motivo ao corretor em uma frase e diga o que fazer.",
        };
      }
      return {
        status: "gravado",
        proposta: descricao,
        efeito: r.efeito ?? undefined,
        desfazer: r.desfazivel
          ? "o corretor pode responder DESFAZER em até 24 h"
          : "não se desfaz pelo WhatsApp",
        aviso:
          "Já está no CRM. Não repita a lista: o sistema manda o recibo. Fale só o próximo passo.",
      };
    }

    coletor.push(coletada);
    return {
      status: "aguardando_confirmacao",
      posicao: coletor.length,
      proposta: descricao,
      aviso:
        "Nada foi gravado ainda: o corretor confirma (no WhatsApp respondendo CONFIRMAR; no painel pelo card). Não diga que registrou.",
    };
  };

  return ferramentasDeProposta(executar);
}

/** Exportado para testes e para o texto do prompt: em atendimento é consequência. */
export const SAMIQ_REGRA_EM_ATENDIMENTO = MOTIVO_EM_ATENDIMENTO_CONSEQUENCIA;
