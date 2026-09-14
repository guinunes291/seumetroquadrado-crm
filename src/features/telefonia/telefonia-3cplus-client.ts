// Fronteira ÚNICA de acesso do cliente à tabela `telefonia_agentes` (vínculo
// de cada corretor com o discador 3C Plus: ID do agente, campanha dedicada e
// token de API do agente).
//
// Regras que este arquivo encarna:
// * O TOKEN é write-only para o app: a coluna `api_token` não tem GRANT de
//   SELECT para authenticated (privilégio por coluna na migration
//   20260915120000). Aqui ele só é ENVIADO (insert/update) — nunca lido; a
//   tela mostra `token_atualizado_em`, que o trigger mantém.
// * A tabela ainda não está nos types gerados (types.ts não aceita edição
//   manual): o cast vive aqui, uma vez, com um contrato mínimo tipado — o
//   chamador nunca faz cast. Ao regenerar os types, troque `tabela()` por
//   `supabase.from("telefonia_agentes")` e apague o contrato.
// * Ambiente sem a migration aplicada devolve vazio/null — as telas mostram
//   "—" em vez de quebrar (mesmo espírito de corretor-v2-client).

import { supabase } from "@/integrations/supabase/client";

export type AgenteTcplus = {
  user_id: string;
  agent_id: string | null;
  campaign_id: string | null;
  /** Quando o token foi gravado pela última vez (null = sem token). */
  token_atualizado_em: string | null;
};

/** `undefined` = não mexe no campo; `""`/`null` = limpa. */
export type CamposAgenteTcplus = {
  agent_id?: string | null;
  campaign_id?: string | null;
  api_token?: string | null;
};

type ErroPg = { code?: string; message: string } | null;
type Resultado = { data: unknown; error: ErroPg };
type ResultadoEscrita = { error: ErroPg };

/** Contrato mínimo do query builder que este arquivo usa. */
type TabelaAgentes = {
  select(colunas: string): {
    in(coluna: string, valores: string[]): PromiseLike<Resultado>;
    eq(coluna: string, valor: string): { maybeSingle(): PromiseLike<Resultado> };
  };
  insert(valores: Record<string, string | null>): PromiseLike<ResultadoEscrita>;
  update(valores: Record<string, string | null>): {
    eq(coluna: string, valor: string): PromiseLike<ResultadoEscrita>;
  };
};

function tabela(): TabelaAgentes {
  // Tabela fora dos types gerados — o cast é a fronteira, não o chamador.
  return (supabase.from as unknown as (t: string) => TabelaAgentes)("telefonia_agentes");
}

/** Códigos de "tabela ainda não existe" (migration de telefonia pendente). */
const FONTE_AUSENTE = new Set(["42P01", "PGRST204", "PGRST202", "PGRST205"]);

// Só as colunas com GRANT de SELECT — pedir api_token aqui daria 42501.
const COLUNAS = "user_id, agent_id, campaign_id, token_atualizado_em";

function comoLinhas(data: unknown): AgenteTcplus[] {
  return Array.isArray(data) ? (data as AgenteTcplus[]) : [];
}

/** Vínculos 3C Plus de vários corretores (RLS: o próprio e a gestão). */
export async function listarAgentesTcplus(ids: string[]): Promise<Record<string, AgenteTcplus>> {
  if (!ids.length) return {};
  const { data, error } = await tabela().select(COLUNAS).in("user_id", ids);
  if (error) {
    if (FONTE_AUSENTE.has(error.code ?? "")) return {};
    throw new Error(error.message || "Não foi possível carregar a telefonia dos corretores.");
  }
  return Object.fromEntries(comoLinhas(data).map((r) => [r.user_id, r]));
}

/** O vínculo do próprio corretor (null = ainda não conectou o 3C Plus). */
export async function buscarMeuAgenteTcplus(userId: string): Promise<AgenteTcplus | null> {
  const { data, error } = await tabela().select(COLUNAS).eq("user_id", userId).maybeSingle();
  if (error) {
    if (FONTE_AUSENTE.has(error.code ?? "")) return null;
    throw new Error(error.message || "Não foi possível carregar sua telefonia.");
  }
  return data ? (data as AgenteTcplus) : null;
}

/**
 * Grava agente/campanha/token do corretor. Insert na primeira vez, update
 * depois — nunca upsert: o ON CONFLICT do PostgREST tentaria SET em colunas
 * sem privilégio de UPDATE (user_id). RLS: o próprio corretor ou o admin.
 */
export async function salvarAgenteTcplus(
  userId: string,
  campos: CamposAgenteTcplus,
): Promise<void> {
  const limpar = (v: string | null | undefined) => (v ?? "").trim() || null;
  const patch: Record<string, string | null> = {};
  if (campos.agent_id !== undefined) patch.agent_id = limpar(campos.agent_id);
  if (campos.campaign_id !== undefined) patch.campaign_id = limpar(campos.campaign_id);
  if (campos.api_token !== undefined) patch.api_token = limpar(campos.api_token);
  if (Object.keys(patch).length === 0) return;

  const { data: existente, error: erroLeitura } = await tabela()
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (erroLeitura) {
    throw new Error(erroLeitura.message || "Não foi possível verificar a telefonia do corretor.");
  }
  const { error } = existente
    ? await tabela().update(patch).eq("user_id", userId)
    : await tabela().insert({ user_id: userId, ...patch });
  if (error) throw new Error(error.message || "Não foi possível salvar a telefonia.");
}
