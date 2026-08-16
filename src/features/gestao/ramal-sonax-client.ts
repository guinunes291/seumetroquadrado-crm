// Fronteira ÚNICA de acesso do cliente à coluna `profiles.ramal_sonax` (os
// types gerados ainda não a conhecem) — tipos estruturais no molde de
// mensagens-client.ts, sem gastar o orçamento de type escapes. Ao regenerar
// os types do Supabase com a migration de telefonia aplicada, troque pelos
// tipos gerados.

import { supabase } from "@/integrations/supabase/client";

type ResultadoDb<T> = PromiseLike<{
  data: T | null;
  error: { code?: string; message?: string } | null;
}>;
type RamalRow = { id: string; ramal_sonax: string | null };
type SelectRamais = { in: (col: "id", vals: string[]) => ResultadoDb<RamalRow[]> };
type UpdateRamal = { eq: (col: "id", val: string) => ResultadoDb<unknown> };
type ProfilesTable = {
  select: (cols: "id, ramal_sonax") => SelectRamais;
  update: (row: { ramal_sonax: string | null }) => UpdateRamal;
};
type ClientHolder = { from: unknown };
type FromProfiles = (tabela: "profiles") => ProfilesTable;

function tabelaProfiles(): ProfilesTable {
  const holder: ClientHolder = supabase;
  return (holder.from as FromProfiles).call(supabase, "profiles");
}

/** Códigos de "coluna ainda não existe" (migration de telefonia pendente). */
const COLUNA_AUSENTE = new Set(["42703", "PGRST204", "PGRST202", "PGRST205"]);

/**
 * Ramal Sonax por corretor. Sem a migration aplicada devolve vazio — a página
 * de corretores mostra "—" em vez de quebrar.
 */
export async function listarRamaisSonax(ids: string[]): Promise<Record<string, string | null>> {
  if (!ids.length) return {};
  const { data, error } = await tabelaProfiles().select("id, ramal_sonax").in("id", ids);
  if (error) {
    if (COLUNA_AUSENTE.has(error.code ?? "")) return {};
    throw new Error(error.message || "Não foi possível carregar os ramais.");
  }
  return Object.fromEntries((data ?? []).map((r) => [r.id, r.ramal_sonax]));
}

/** Grava (ou limpa, com null) o ramal do corretor. RLS: admin. */
export async function salvarRamalSonax(id: string, ramal: string | null): Promise<void> {
  const { error } = await tabelaProfiles().update({ ramal_sonax: ramal }).eq("id", id);
  if (error) throw new Error(error.message || "Não foi possível salvar o ramal.");
}
