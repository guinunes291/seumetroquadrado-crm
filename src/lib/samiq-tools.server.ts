// Catálogo de ferramentas de LEITURA da Sami ligado ao banco (Onda S1).
// Cada ferramenta consulta com o `supabase` DO USUÁRIO (JWT do corretor), então
// o RLS limita o escopo sozinho: corretor vê a própria carteira, gestor a
// equipe. Nada aqui grava — a doutrina "IA sugere, humano decide" continua;
// a escrita por proposta confirmada é a Onda S2.
//
// Toda saída passa pela modelagem de samiq-tools.ts (campos seguros, PII
// redigida, arrays limitados). Erros de consulta viram um Error curto que o AI
// SDK devolve ao modelo como `tool-error` (contado na telemetria), sem vazar
// detalhe de SQL.

import { tool, type ToolSet } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { parseAtendimentoInbox } from "@/features/atendimento/inbox";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { filtroOrTelefone } from "@/lib/lead-busca-telefone";
import {
  displayNameForSamiQ,
  restaurarPiiDoCorretor,
  type MapaPiiCorretor,
} from "@/lib/samiq-governance";
import {
  INSTRUCAO_CLIENTE_AMBIGUO,
  candidatosParaPergunta,
  escolherEntreHomonimos,
  mensagemNomeia,
  type ClienteParaDesambiguar,
} from "@/lib/samiq-homonimos";
import { buscarHomonimos, resolverLead } from "@/lib/samiq-propostas-leitura.server";
import {
  BuscarClientesInput,
  CatalogoProjetosInput,
  CreditoDoClienteInput,
  ListarClientesInput,
  MaterialDoProjetoInput,
  MinhaSituacaoInput,
  DetalheClienteInput,
  DocumentosDoClienteInput,
  MeuFunilInput,
  MinhaAgendaInput,
  MinhaFilaInput,
  MinhasTarefasInput,
  SAMIQ_TOOL_DESCRIPTIONS,
  hojeSaoPaulo,
  intervaloAgendaSamiQ,
  modelarAgendamentos,
  modelarClientes,
  modelarDetalheCliente,
  modelarDocumentos,
  modelarFila,
  modelarFunil,
  modelarProjetos,
  modelarTarefas,
  modelarCredito,
  modelarMaterialProjeto,
  modelarSituacao,
  separarTermoBuscaSamiQ,
  termoSemAcentoSamiQ,
} from "@/lib/samiq-tools";

type Db = SupabaseClient<Database>;

const LEAD_DETALHE_COLS =
  "id, nome, origem, status, temperatura, projeto_nome, renda_informada, entrada_disponivel, usa_fgts, tem_fgts, fgts_valor, tipo_renda, faixa_mcmv, proximo_followup, ultima_interacao, visita_data, visita_hora, visita_empreendimento, proxima_acao, objecoes, observacoes, motivo_perdido, bairro, zona, created_at";

function falhaConsulta(ferramenta: string, error: unknown): never {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  console.error(JSON.stringify({ event: "samiq_tool_failed", ferramenta, code }));
  throw new Error("consulta_indisponivel");
}

/** Cliente que apareceu numa consulta: vira a "memória de trabalho" da conversa. */
export type CitarClienteSamiQ = (c: {
  id: string;
  nome: string | null;
  etapa?: string | null;
}) => void;

export function criarFerramentasSamiQ(args: {
  supabase: Db;
  userId: string;
  agora?: Date;
  /** v8: marcadores [TELEFONE_n]/[EMAIL_n] da mensagem do corretor (só o servidor restaura). */
  mapaPii?: MapaPiiCorretor;
  /** v8: registra os clientes vistos para o próximo turno achar "ela", "o 2". */
  citar?: CitarClienteSamiQ;
  /**
   * v8.2: trava de homônimos na LEITURA detalhe_cliente. Só age quando a
   * mensagem deste turno nomeia o cliente; pronome ("dele") segue a memória.
   */
  homonimos?: {
    /** Texto cru do corretor (este turno e os anteriores), só no servidor. */
    textoDoCorretor: string;
    /** Texto cru só deste turno: decide se o nome foi dito agora. */
    perguntaDoTurno: string;
    liberados?: ReadonlySet<string>;
    aoAmbiguo?: (candidatos: ReturnType<typeof candidatosParaPergunta>) => void;
  };
}): ToolSet {
  const { supabase, userId } = args;
  const agora = args.agora ?? new Date();
  const mapaPii = args.mapaPii ?? {};
  const citar: CitarClienteSamiQ = args.citar ?? (() => {});
  const homonimos = args.homonimos;

  /**
   * Devolve o id que o corretor de fato apontou (pode ser outro homônimo), um
   * bloqueio "cliente_ambiguo" ou null quando não há o que desambiguar.
   */
  const checarHomonimosNaLeitura = async (
    lead: ClienteParaDesambiguar,
  ): Promise<
    { usarId: string } | { erro: string; detalhe: string; candidatos: unknown[] } | null
  > => {
    if (!homonimos) return null;
    if (homonimos.liberados?.has(lead.id)) return null;
    if (!mensagemNomeia(homonimos.perguntaDoTurno, lead)) return null;
    const outros = await buscarHomonimos(supabase, lead);
    if (!outros || outros.length === 0) return null;
    const r = escolherEntreHomonimos({
      alvo: lead,
      homonimos: outros,
      texto: homonimos.textoDoCorretor,
    });
    if (r.ok) return r.trocou ? { usarId: r.id } : null;
    const candidatos = candidatosParaPergunta([lead, ...outros], displayNameForSamiQ);
    homonimos.aoAmbiguo?.(candidatos);
    return {
      erro: "cliente_ambiguo",
      detalhe: `${INSTRUCAO_CLIENTE_AMBIGUO} Numere a lista (1, 2, 3...) nessa ordem: o corretor pode responder só com o número.`,
      candidatos,
    };
  };

  return {
    buscar_clientes: tool({
      description: SAMIQ_TOOL_DESCRIPTIONS.buscar_clientes,
      inputSchema: BuscarClientesInput,
      execute: async (input) => {
        // [TELEFONE_1] vira o número que o corretor digitou (o modelo nunca o viu).
        const bruto = restaurarPiiDoCorretor(input.termo, mapaPii);
        const { texto, finalTelefone } = separarTermoBuscaSamiQ(bruto);
        const termo = termoSemAcentoSamiQ(texto);
        const limite = input.limite ?? 8;
        if (termo.length < 2 && !finalTelefone) {
          return { clientes: [], aviso: "termo curto demais" };
        }
        let query = supabase
          .from("leads")
          .select(
            "id, nome, status, temperatura, projeto_nome, proximo_followup, ultima_interacao, origem, created_at",
          )
          .is("deleted_at", null)
          .eq("na_lixeira", false);
        if (termo.length >= 2) {
          query = query.or(`search_text.ilike.%${termo}%,projeto_nome.ilike.%${termo}%`);
        }
        // Dígitos FILTRAM pelo fim do telefone (e164 e texto cru). O telefone não
        // é selecionado: o modelo nunca vê o número (D12).
        if (finalTelefone) query = query.or(filtroOrTelefone(finalTelefone));
        query = query.order("ultima_atividade_em", { ascending: false }).limit(limite);
        if (input.status) query = query.eq("status", input.status);
        if (input.temperatura) query = query.eq("temperatura", input.temperatura);
        const { data, error } = await query;
        if (error) falhaConsulta("buscar_clientes", error);
        const rows = data ?? [];
        if (rows.length <= 3)
          for (const r of rows) citar({ id: r.id, nome: r.nome, etapa: r.status });
        return { clientes: modelarClientes(rows, limite) };
      },
    }),

    detalhe_cliente: tool({
      description: SAMIQ_TOOL_DESCRIPTIONS.detalhe_cliente,
      inputSchema: DetalheClienteInput,
      execute: async (input) => {
        // v8.2: com homônimo na carteira e o nome dito nesta mensagem, o id que
        // o modelo mandou pode ser o errado ("e o Teste QA Sami Um?" com dois).
        let leadId = input.leadId;
        // O contato do cliente fica em resolverLead (servidor) e nunca sai daqui.
        const alvo = homonimos ? await resolverLead(supabase, leadId) : null;
        if (homonimos && !alvo) return { erro: "cliente_nao_encontrado" };
        const trava = alvo ? await checarHomonimosNaLeitura(alvo.bruto) : null;
        if (trava && "erro" in trava) return trava;
        if (trava) leadId = trava.usarId;
        const seteDiasAtras = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const [lead, interacoes, tarefas, agendamentos, documentos] = await Promise.all([
          supabase
            .from("leads")
            .select(LEAD_DETALHE_COLS)
            .eq("id", leadId)
            .is("deleted_at", null)
            .maybeSingle(),
          supabase
            .from("interacoes")
            .select("tipo, direcao, titulo, conteudo, ocorreu_em")
            .eq("lead_id", leadId)
            .is("deleted_at", null)
            .order("ocorreu_em", { ascending: false })
            .limit(12),
          supabase
            .from("tarefas")
            .select("id, titulo, tipo, prioridade, status, data_vencimento, lead_id")
            .eq("lead_id", leadId)
            .is("deleted_at", null)
            .in("status", ["pendente", "em_andamento"])
            .order("data_vencimento", { ascending: true, nullsFirst: false })
            .limit(10),
          supabase
            .from("agendamentos")
            .select("id, tipo, status, titulo, local, data_inicio, data_fim, lead_id")
            .eq("lead_id", leadId)
            .is("deleted_at", null)
            .gte("data_inicio", seteDiasAtras)
            .order("data_inicio", { ascending: true })
            .limit(5),
          supabase
            .from("documentacoes")
            .select("tipo, status, recebido_em, observacoes")
            .eq("lead_id", leadId)
            .limit(40),
        ]);
        if (lead.error) falhaConsulta("detalhe_cliente", lead.error);
        if (!lead.data) return { erro: "cliente_nao_encontrado" };
        citar({ id: lead.data.id, nome: lead.data.nome, etapa: lead.data.status });
        if (interacoes.error) falhaConsulta("detalhe_cliente", interacoes.error);
        if (tarefas.error) falhaConsulta("detalhe_cliente", tarefas.error);
        if (agendamentos.error) falhaConsulta("detalhe_cliente", agendamentos.error);
        if (documentos.error) falhaConsulta("detalhe_cliente", documentos.error);
        return modelarDetalheCliente({
          lead: lead.data,
          interacoes: interacoes.data ?? [],
          tarefas: tarefas.data ?? [],
          agendamentos: agendamentos.data ?? [],
          documentos: documentos.data ?? [],
        });
      },
    }),

    minha_agenda: tool({
      description: SAMIQ_TOOL_DESCRIPTIONS.minha_agenda,
      inputSchema: MinhaAgendaInput,
      execute: async (input) => {
        const janela = intervaloAgendaSamiQ(hojeSaoPaulo(agora), input.de, input.ate);
        let query = supabase
          .from("agendamentos")
          .select(
            "id, tipo, status, titulo, local, data_inicio, data_fim, lead_id, lead:leads(id, nome, projeto_nome)",
          )
          .eq("corretor_id", userId)
          .is("deleted_at", null)
          .gte("data_inicio", janela.inicioIso)
          .lte("data_inicio", janela.fimIso)
          .order("data_inicio", { ascending: true })
          .limit(40);
        if (input.apenas_abertos !== false) query = query.in("status", ["agendado", "confirmado"]);
        const { data, error } = await query;
        if (error) falhaConsulta("minha_agenda", error);
        return {
          periodo: { de: janela.de, ate: janela.ate },
          compromissos: modelarAgendamentos(data ?? []),
        };
      },
    }),

    minhas_tarefas: tool({
      description: SAMIQ_TOOL_DESCRIPTIONS.minhas_tarefas,
      inputSchema: MinhasTarefasInput,
      execute: async (input) => {
        const limite = input.limite ?? 15;
        let query = supabase
          .from("tarefas")
          .select(
            "id, titulo, tipo, prioridade, status, data_vencimento, lead_id, lead:leads(id, nome)",
          )
          .eq("corretor_id", userId)
          .is("deleted_at", null)
          .in("status", ["pendente", "em_andamento"])
          .order("data_vencimento", { ascending: true, nullsFirst: false })
          .limit(limite);
        if (input.apenas_vencidas) query = query.lt("data_vencimento", agora.toISOString());
        const { data, error } = await query;
        if (error) falhaConsulta("minhas_tarefas", error);
        return { agora: agora.toISOString(), tarefas: modelarTarefas(data ?? [], limite) };
      },
    }),

    meu_funil: tool({
      description: SAMIQ_TOOL_DESCRIPTIONS.meu_funil,
      inputSchema: MeuFunilInput,
      execute: async () => {
        const { data, error } = await supabase.rpc("pipeline_snapshot_v2", {
          _corretor_id: userId,
        });
        if (error) falhaConsulta("meu_funil", error);
        return { etapas: modelarFunil(data ?? []) };
      },
    }),

    minha_fila: tool({
      description: SAMIQ_TOOL_DESCRIPTIONS.minha_fila,
      inputSchema: MinhaFilaInput,
      execute: async (input) => {
        const limite = input.limite ?? 5;
        const chamar = async (fn: "atendimento_inbox_v4" | "atendimento_inbox_v2") => {
          const { data, error } = await supabase.rpc(fn, {
            _corretor_id: userId,
            _limit_per_queue: limite,
          });
          if (error) throw error;
          return data ?? [];
        };
        try {
          const rows = await rpcWithFallback(
            () => chamar("atendimento_inbox_v4"),
            () => chamar("atendimento_inbox_v2"),
          );
          return modelarFila(parseAtendimentoInbox(rows), input.fila, limite);
        } catch (error) {
          falhaConsulta("minha_fila", error);
        }
      },
    }),

    documentos_do_cliente: tool({
      description: SAMIQ_TOOL_DESCRIPTIONS.documentos_do_cliente,
      inputSchema: DocumentosDoClienteInput,
      execute: async (input) => {
        const { data, error } = await supabase
          .from("documentacoes")
          .select("tipo, status, recebido_em, observacoes")
          .eq("lead_id", input.leadId)
          .order("tipo", { ascending: true })
          .limit(40);
        if (error) falhaConsulta("documentos_do_cliente", error);
        return { documentos: modelarDocumentos(data ?? []) };
      },
    }),

    catalogo_projetos: tool({
      description: SAMIQ_TOOL_DESCRIPTIONS.catalogo_projetos,
      inputSchema: CatalogoProjetosInput,
      execute: async (input) => {
        const limite = input.limite ?? 10;
        const nome = input.nome ? termoSemAcentoSamiQ(input.nome) : "";
        let query = supabase
          .from("projetos")
          .select(
            "id, nome, bairro, cidade, regiao, zona_smq, tipologia, dorms_min, dorms_max, preco_a_partir, renda_minima, status_entrega, ano_entrega, mes_entrega, diferenciais",
          )
          .eq("ativo", true)
          .is("deleted_at", null)
          .order(nome ? "nome" : "preco_a_partir", { ascending: true, nullsFirst: false })
          .limit(Math.max(limite, 15));
        if (nome) query = query.ilike("nome_busca", `%${nome}%`);
        const regiao = input.regiao ? termoSemAcentoSamiQ(input.regiao) : "";
        if (regiao.length >= 2) {
          query = query.ilike("regiao_busca", `%${regiao}%`);
        }
        if (input.preco_max) query = query.lte("preco_a_partir", input.preco_max);
        const { data, error } = await query;
        if (error) falhaConsulta("catalogo_projetos", error);
        const rows = (data ?? []).filter((p) => {
          if (!input.dorms) return true;
          const min = p.dorms_min ?? p.dorms_max;
          const max = p.dorms_max ?? p.dorms_min;
          if (min == null && max == null) return true;
          return (min ?? 0) <= input.dorms && input.dorms <= (max ?? 99);
        });
        return { projetos: modelarProjetos(rows, limite) };
      },
    }),

    listar_clientes: tool({
      description: SAMIQ_TOOL_DESCRIPTIONS.listar_clientes,
      inputSchema: ListarClientesInput,
      execute: async (input) => {
        const limite = input.limite ?? 10;
        let query = supabase
          .from("leads")
          .select(
            "id, nome, status, temperatura, projeto_nome, proximo_followup, ultima_interacao, origem, created_at",
          )
          .eq("corretor_id", userId)
          .is("deleted_at", null)
          .eq("na_lixeira", false);
        if (input.etapa?.length) query = query.in("status", input.etapa);
        if (input.temperatura) query = query.eq("temperatura", input.temperatura);
        if (input.parados_dias) {
          const corte = new Date(agora.getTime() - input.parados_dias * 86_400_000).toISOString();
          query = query.or(`ultima_interacao.is.null,ultima_interacao.lt.${corte}`);
        }
        query = query
          .order("ultima_interacao", {
            ascending: input.ordem === "mais_parados",
            nullsFirst: input.ordem === "mais_parados",
          })
          .limit(limite);
        const { data, error } = await query;
        if (error) falhaConsulta("listar_clientes", error);
        return { clientes: modelarClientes(data ?? [], limite) };
      },
    }),

    minha_situacao: tool({
      description: SAMIQ_TOOL_DESCRIPTIONS.minha_situacao,
      inputSchema: MinhaSituacaoInput,
      execute: async () => {
        const [presenca, emAtendimento, lote] = await Promise.all([
          supabase.rpc("presenca_minha_v1"),
          supabase.rpc("em_atendimento_contador_v1", { _corretor: userId }),
          supabase.rpc("prospeccao_lote_status_v1"),
        ]);
        if (presenca.error && emAtendimento.error) falhaConsulta("minha_situacao", presenca.error);
        return modelarSituacao({
          presenca: presenca.error ? null : presenca.data,
          emAtendimento: emAtendimento.error ? null : emAtendimento.data,
          lote: lote.error ? null : lote.data,
        });
      },
    }),

    material_do_projeto: tool({
      description: SAMIQ_TOOL_DESCRIPTIONS.material_do_projeto,
      inputSchema: MaterialDoProjetoInput,
      execute: async (input) => {
        const cols =
          "id, nome, construtora, endereco, logradouro, numero, bairro, cidade, regiao, zona_smq, tipologia, dorms_min, dorms_max, metragem_min, metragem_max, vagas, preco_a_partir, renda_minima, status_entrega, mes_entrega, ano_entrega, status_preco, disponibilidade_resumo, perfil_ideal, argumentos_venda, book_url, tabela_precos_url, tabela_atualizada_em, preco_atualizado_em";
        let query = supabase.from("projetos").select(cols).eq("ativo", true).is("deleted_at", null);
        if (input.projetoId) query = query.eq("id", input.projetoId);
        else if (input.nome && termoSemAcentoSamiQ(input.nome).length >= 2) {
          query = query.ilike("nome_busca", `%${termoSemAcentoSamiQ(input.nome)}%`);
        } else return { erro: "informe projetoId ou nome" };
        const { data, error } = await query.order("nome").limit(3);
        if (error) falhaConsulta("material_do_projeto", error);
        const rows = data ?? [];
        if (rows.length === 0) return { erro: "empreendimento_nao_encontrado" };
        if (rows.length > 1 && !input.projetoId) {
          return {
            varios: rows.map((p) => ({ id: p.id, nome: p.nome, construtora: p.construtora })),
            aviso: "mais de um empreendimento com esse nome; pergunte qual ou use o id",
          };
        }
        return modelarMaterialProjeto(rows[0], agora);
      },
    }),

    credito_do_cliente: tool({
      description: SAMIQ_TOOL_DESCRIPTIONS.credito_do_cliente,
      inputSchema: CreditoDoClienteInput,
      execute: async (input) => {
        const { data, error } = await supabase
          .from("analises_credito")
          .select(
            "status, banco, modalidade, sistema_amortizacao, valor_financiamento, valor_parcela, prazo_meses, taxa_juros_anual, valor_fgts, valor_subsidio, valor_entrada, valor_imovel_simulacao, renda_familiar, faixa_mcmv, data_aprovacao, validade_ate, observacoes, created_at, updated_at",
          )
          .eq("lead_id", input.leadId)
          .order("created_at", { ascending: false })
          .limit(5);
        if (error) falhaConsulta("credito_do_cliente", error);
        return modelarCredito(data ?? []);
      },
    }),
  };
}
