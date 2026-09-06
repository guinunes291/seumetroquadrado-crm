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
import {
  BuscarClientesInput,
  CatalogoProjetosInput,
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
  termoBuscaSamiQ,
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

export function criarFerramentasSamiQ(args: {
  supabase: Db;
  userId: string;
  agora?: Date;
}): ToolSet {
  const { supabase, userId } = args;
  const agora = args.agora ?? new Date();

  return {
    buscar_clientes: tool({
      description: SAMIQ_TOOL_DESCRIPTIONS.buscar_clientes,
      inputSchema: BuscarClientesInput,
      execute: async (input) => {
        const termo = termoBuscaSamiQ(input.termo);
        const limite = input.limite ?? 8;
        if (termo.length < 2) return { clientes: [], aviso: "termo curto demais" };
        let query = supabase
          .from("leads")
          .select(
            "id, nome, status, temperatura, projeto_nome, proximo_followup, ultima_interacao, origem, created_at",
          )
          .is("deleted_at", null)
          .eq("na_lixeira", false)
          .or(`nome.ilike.%${termo}%,projeto_nome.ilike.%${termo}%`)
          .order("ultima_atividade_em", { ascending: false })
          .limit(limite);
        if (input.status) query = query.eq("status", input.status);
        if (input.temperatura) query = query.eq("temperatura", input.temperatura);
        const { data, error } = await query;
        if (error) falhaConsulta("buscar_clientes", error);
        return { clientes: modelarClientes(data ?? [], limite) };
      },
    }),

    detalhe_cliente: tool({
      description: SAMIQ_TOOL_DESCRIPTIONS.detalhe_cliente,
      inputSchema: DetalheClienteInput,
      execute: async (input) => {
        const seteDiasAtras = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const [lead, interacoes, tarefas, agendamentos, documentos] = await Promise.all([
          supabase
            .from("leads")
            .select(LEAD_DETALHE_COLS)
            .eq("id", input.leadId)
            .is("deleted_at", null)
            .maybeSingle(),
          supabase
            .from("interacoes")
            .select("tipo, direcao, titulo, conteudo, ocorreu_em")
            .eq("lead_id", input.leadId)
            .is("deleted_at", null)
            .order("ocorreu_em", { ascending: false })
            .limit(12),
          supabase
            .from("tarefas")
            .select("id, titulo, tipo, prioridade, status, data_vencimento, lead_id")
            .eq("lead_id", input.leadId)
            .is("deleted_at", null)
            .in("status", ["pendente", "em_andamento"])
            .order("data_vencimento", { ascending: true, nullsFirst: false })
            .limit(10),
          supabase
            .from("agendamentos")
            .select("id, tipo, status, titulo, local, data_inicio, data_fim, lead_id")
            .eq("lead_id", input.leadId)
            .is("deleted_at", null)
            .gte("data_inicio", seteDiasAtras)
            .order("data_inicio", { ascending: true })
            .limit(5),
          supabase
            .from("documentacoes")
            .select("tipo, status, recebido_em, observacoes")
            .eq("lead_id", input.leadId)
            .limit(40),
        ]);
        if (lead.error) falhaConsulta("detalhe_cliente", lead.error);
        if (!lead.data) return { erro: "cliente_nao_encontrado" };
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
        let query = supabase
          .from("projetos")
          .select(
            "id, nome, bairro, cidade, regiao, zona_smq, tipologia, dorms_min, dorms_max, preco_a_partir, renda_minima, status_entrega, ano_entrega, mes_entrega, diferenciais",
          )
          .eq("ativo", true)
          .is("deleted_at", null)
          .order("preco_a_partir", { ascending: true, nullsFirst: false })
          .limit(Math.max(limite, 15));
        const regiao = input.regiao ? termoBuscaSamiQ(input.regiao) : "";
        if (regiao.length >= 2) {
          query = query.or(
            `regiao.ilike.%${regiao}%,zona_smq.ilike.%${regiao}%,bairro.ilike.%${regiao}%,cidade.ilike.%${regiao}%`,
          );
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
  };
}
