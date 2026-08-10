// Fronteira ÚNICA de acesso do cliente à tabela `mensagens` (os types
// gerados ainda não a conhecem) — tipos estruturais explícitos no molde de
// landing.ts, sem gastar o orçamento de type escapes. Ao regenerar os types
// do Supabase com a migration aplicada, troque pelos tipos gerados.

import { supabase } from "@/integrations/supabase/client";
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
};
type MensagensTable = {
  select: (cols: string) => SelectMensagens;
  insert: (row: Record<string, unknown>) => ResultadoDb<unknown>;
};
type ClientHolder = { from: unknown };
type FromMensagens = (tabela: "mensagens") => MensagensTable;

function tabelaMensagens(): MensagensTable {
  const holder: ClientHolder = supabase;
  return (holder.from as FromMensagens).call(supabase, "mensagens");
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
