// Fronteira ÚNICA de tipos das RPCs leads_filtered_v3/v2 e
// leads_status_counts_v3/v2: os types gerados do Supabase ainda não conhecem
// as funções novas, então o escape (`as never`) vive aqui, uma vez — em vez de
// um par por call site na página (orçamento de type escapes do repo).
// Ao regenerar os types com as migrations aplicadas, remova os casts.

import { supabase } from "@/integrations/supabase/client";
import type { Lead } from "./types";

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
  _sort?: string | null;
  _sort_dir?: string | null;
  _limit?: number;
  _offset?: number;
};

export type LeadsCountsParams = Omit<
  LeadsFilteredParams,
  "_status" | "_sort" | "_sort_dir" | "_limit" | "_offset"
>;

export async function rpcLeadsFiltered(
  versao: "v3" | "v2",
  params: LeadsFilteredParams,
): Promise<Lead[]> {
  const { data, error } = await supabase.rpc(
    (versao === "v3" ? "leads_filtered_v3" : "leads_filtered_v2") as never,
    params as never,
  );
  if (error) throw error;
  return (data ?? []) as Lead[];
}

export async function rpcLeadsStatusCounts(
  versao: "v3" | "v2",
  params: LeadsCountsParams,
): Promise<unknown[]> {
  const { data, error } = await supabase.rpc(
    (versao === "v3" ? "leads_status_counts_v3" : "leads_status_counts_v2") as never,
    params as never,
  );
  if (error) throw error;
  return (data as unknown[]) ?? [];
}
