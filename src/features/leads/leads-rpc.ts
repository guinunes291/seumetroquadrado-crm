// Fronteira ÚNICA de tipos das RPCs leads_filtered_v5/v4/v3/v2 e
// leads_status_counts_v5/v4/v3/v2: os types gerados do Supabase ainda não
// conhecem as funções novas, então o escape (`as never`) vive aqui, uma vez —
// em vez de um par por call site na página (orçamento de type escapes do repo).
// Ao regenerar os types com as migrations aplicadas, remova os casts.
//
// ATENÇÃO: o PostgREST casa RPC por nome E argumentos nomeados — parâmetro
// que a versão não conhece vira "função não encontrada" e derruba o fallback
// um degrau à toa. `_analise` só existe na v5; `_parado_dias` a partir da v4.
// soParamsDaVersao remove o que cada degrau não entende.

import { supabase } from "@/integrations/supabase/client";
import type { Lead } from "./types";

export type LeadsVersao = "v5" | "v4" | "v3" | "v2";

export type LeadsFilteredParams = {
  _na_lixeira: boolean;
  _status?: string | null;
  _origem?: string | null;
  _corretor?: string | null;
  _temperatura?: string | null;
  _periodo_start?: string;
  _periodo_end?: string;
  _search?: string;
  _search_digits?: string;
  _contato?: string | null;
  /** A partir da v4: recorte "parado há X+ dias" (1..365). */
  _parado_dias?: number | null;
  /** Só na v5: recorte pela última análise de crédito. */
  _analise?: string | null;
  _sort?: string | null;
  _sort_dir?: string | null;
  _limit?: number;
  _offset?: number;
};

export type LeadsCountsParams = Omit<
  LeadsFilteredParams,
  "_status" | "_sort" | "_sort_dir" | "_limit" | "_offset"
>;

const FILTERED_FN: Record<LeadsVersao, string> = {
  v5: "leads_filtered_v5",
  v4: "leads_filtered_v4",
  v3: "leads_filtered_v3",
  v2: "leads_filtered_v2",
};

const COUNTS_FN: Record<LeadsVersao, string> = {
  v5: "leads_status_counts_v5",
  v4: "leads_status_counts_v4",
  v3: "leads_status_counts_v3",
  v2: "leads_status_counts_v2",
};

function soParamsDaVersao<T extends { _parado_dias?: number | null; _analise?: string | null }>(
  versao: LeadsVersao,
  params: T,
): T {
  if (versao === "v5") return params;
  const { _analise: _semAnalise, ...atehV4 } = params;
  void _semAnalise;
  if (versao === "v4") return atehV4 as T;
  const { _parado_dias: _semParado, ...atehV3 } = atehV4;
  void _semParado;
  return atehV3 as T;
}

export async function rpcLeadsFiltered(
  versao: LeadsVersao,
  params: LeadsFilteredParams,
): Promise<Lead[]> {
  const { data, error } = await supabase.rpc(
    FILTERED_FN[versao] as never,
    soParamsDaVersao(versao, params) as never,
  );
  if (error) throw error;
  return (data ?? []) as Lead[];
}

export async function rpcLeadsStatusCounts(
  versao: LeadsVersao,
  params: LeadsCountsParams,
): Promise<unknown[]> {
  const { data, error } = await supabase.rpc(
    COUNTS_FN[versao] as never,
    soParamsDaVersao(versao, params) as never,
  );
  if (error) throw error;
  return (data as unknown[]) ?? [];
}
