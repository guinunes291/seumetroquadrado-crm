// Fronteira ÚNICA de acesso do cliente à tabela `mensagens`, à tabela
// `conversas_tratadas` e às RPCs de estado da conversa (os types gerados
// ainda não as conhecem) — tipos estruturais explícitos no molde de
// landing.ts, sem gastar o orçamento de type escapes. Ao regenerar os types
// do Supabase com as migrations aplicadas, troque pelos tipos gerados.

import { supabase } from "@/integrations/supabase/client";
import { rpcWithFallback } from "@/lib/supabase-errors";
import type { Mensagem } from "./derive";

type ResultadoDb<T> = PromiseLike<{
  data: T | null;
  error: { code?: string; message?: string } | null;
}>;
type SelectMensagens = {
  order: (
    col: "criado_em",
    opts: { ascending: boolean },
  ) => { limit: (n: number) => ResultadoDb<Mensagem[]> };
  eq: (col: "lead_id", valor: string) => SelectMensagens;
};
type MensagensTable = {
  select: (cols: string) => SelectMensagens;
  insert: (row: Record<string, unknown>) => ResultadoDb<unknown>;
};
type TratadaRow = { lead_id: string; tratada_em: string };
type ConversasTratadasTable = {
  select: (cols: "lead_id, tratada_em") => {
    in: (col: "lead_id", valores: string[]) => ResultadoDb<TratadaRow[]>;
  };
};
type ClientHolder = { from: unknown; rpc: unknown };
type FromMensagens = (tabela: "mensagens") => MensagensTable;
type FromConversasTratadas = (tabela: "conversas_tratadas") => ConversasTratadasTable;
type RpcConversa = (
  fn: "conversa_estado" | "marcar_conversa_tratada",
  args: { _lead_id: string },
) => ResultadoDb<unknown>;

function tabelaMensagens(): MensagensTable {
  const holder: ClientHolder = supabase;
  return (holder.from as FromMensagens).call(supabase, "mensagens");
}

function tabelaConversasTratadas(): ConversasTratadasTable {
  const holder: ClientHolder = supabase;
  return (holder.from as FromConversasTratadas).call(supabase, "conversas_tratadas");
}

function rpcConversa(fn: "conversa_estado" | "marcar_conversa_tratada", leadId: string) {
  const holder: ClientHolder = supabase;
  return (holder.rpc as RpcConversa).call(supabase, fn, { _lead_id: leadId });
}

const COLUNAS =
  "id, lead_id, corretor_id, direcao, canal, provider, provider_message_id, status, conteudo, midia_url, criado_em";

/** Códigos de "tabela ainda não existe" (migration da 7a pendente no ambiente). */
const TABELA_AUSENTE = new Set(["PGRST205", "PGRST202", "42P01"]);

export type MensagensLista = { rows: Mensagem[]; tabelaAusente: boolean };

/**
 * As N mensagens mais recentes visíveis ao usuário (RLS recorta por lead).
 * Sem a migration aplicada devolve tabelaAusente:true — a Central mostra o
 * estado explicativo em vez de quebrar (mesmo espírito do rpcWithFallback).
 */
export async function listarMensagensRecentes(limit = 500): Promise<MensagensLista> {
  const { data, error } = await tabelaMensagens()
    .select(COLUNAS)
    .order("criado_em", { ascending: false })
    .limit(limit);
  if (error) {
    if (TABELA_AUSENTE.has(error.code ?? "")) return { rows: [], tabelaAusente: true };
    throw new Error(error.message || "Não foi possível carregar as mensagens.");
  }
  return { rows: data ?? [], tabelaAusente: false };
}

/**
 * A thread de UM lead (asc por criado_em) — a mesma fonte da Central, agora
 * embutida na ficha (Lote 3). O índice mensagens_lead_recentes_idx cobre.
 */
export async function listarMensagensDoLead(leadId: string, limit = 200): Promise<MensagensLista> {
  const { data, error } = await tabelaMensagens()
    .select(COLUNAS)
    .eq("lead_id", leadId)
    .order("criado_em", { ascending: false })
    .limit(limit);
  if (error) {
    if (TABELA_AUSENTE.has(error.code ?? "")) return { rows: [], tabelaAusente: true };
    throw new Error(error.message || "Não foi possível carregar a conversa.");
  }
  return { rows: data ?? [], tabelaAusente: false };
}

/**
 * Marcas "conversa tratada" dos leads visíveis (lead_id → tratada_em). Banco
 * sem a migration do Lote 3 → mapa vazio (a lista degrada para o derive puro).
 */
export async function listarConversasTratadas(leadIds: string[]): Promise<Map<string, string>> {
  if (leadIds.length === 0) return new Map();
  const { data, error } = await tabelaConversasTratadas()
    .select("lead_id, tratada_em")
    .in("lead_id", leadIds);
  if (error) {
    if (TABELA_AUSENTE.has(error.code ?? "")) return new Map();
    throw new Error(error.message || "Não foi possível carregar as marcas de tratamento.");
  }
  return new Map((data ?? []).map((r) => [r.lead_id, r.tratada_em]));
}

/** Estado da conversa devolvido pelas RPCs da fonte única. */
export type ConversaEstado = {
  aguardando: boolean;
  ultima_entrada: string | null;
  tratada_em: string | null;
};

function parseConversaEstado(raw: unknown): ConversaEstado {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    aguardando: o.aguardando === true,
    ultima_entrada: typeof o.ultima_entrada === "string" ? o.ultima_entrada : null,
    tratada_em: typeof o.tratada_em === "string" ? o.tratada_em : null,
  };
}

/**
 * Estado "aguardando resposta" do lead pela FONTE ÚNICA do banco (a mesma do
 * badge da sidebar e da fila Responder). RPC ausente → null (a UI esconde o
 * estado em vez de quebrar).
 */
export async function conversaEstado(leadId: string): Promise<ConversaEstado | null> {
  return rpcWithFallback(
    async () => {
      const { data, error } = await rpcConversa("conversa_estado", leadId);
      if (error) throw error;
      return parseConversaEstado(data);
    },
    () => null,
  );
}

/**
 * Marca a conversa como tratada ("li, não precisa de resposta") — apaga o
 * badge e tira o lead da fila Responder de uma vez. Devolve o estado novo.
 */
export async function marcarConversaTratada(leadId: string): Promise<ConversaEstado> {
  const { data, error } = await rpcConversa("marcar_conversa_tratada", leadId);
  if (error) {
    throw new Error(error.message || "Não foi possível marcar a conversa como tratada.");
  }
  return parseConversaEstado(data);
}

/**
 * Envio em MODO SIMULADO (7b): registra a mensagem de saída na conversa
 * (provider "simulado"); o disparo real pelo wa.me fica com o chamador.
 * A RLS só aceita direcao=saida em lead acessível — exatamente este caso.
 */
export async function registrarEnvioSimulado(args: {
  leadId: string;
  corretorId: string;
  conteudo: string;
}): Promise<void> {
  const { error } = await tabelaMensagens().insert({
    lead_id: args.leadId,
    corretor_id: args.corretorId,
    direcao: "saida",
    canal: "whatsapp",
    provider: "simulado",
    status: "enviada",
    conteudo: args.conteudo,
  });
  if (error) throw new Error(error.message || "Não foi possível registrar a mensagem.");
}
