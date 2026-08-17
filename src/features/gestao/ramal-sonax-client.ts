// Fronteira ÚNICA de acesso do cliente às colunas de telefonia Sonax em
// `profiles` (ramal_sonax, sonax_id_atendente, sonax_id_campanha) — os types
// gerados ainda não as conhecem. Tipos estruturais no molde de
// mensagens-client.ts, sem gastar o orçamento de type escapes. Ao regenerar
// os types do Supabase com as migrations de telefonia aplicadas, troque pelos
// tipos gerados.

import { supabase } from "@/integrations/supabase/client";

export type TelefoniaSonax = {
  ramal_sonax: string | null;
  sonax_id_atendente: string | null;
  sonax_id_campanha: string | null;
};

type TelefoniaRow = TelefoniaSonax & { id: string };

type ResultadoDb<T> = PromiseLike<{
  data: T | null;
  error: { code?: string; message?: string } | null;
}>;
type SelectTelefonia = { in: (col: "id", vals: string[]) => ResultadoDb<TelefoniaRow[]> };
type UpdateTelefonia = { eq: (col: "id", val: string) => ResultadoDb<unknown> };
type ProfilesTable = {
  select: (cols: string) => SelectTelefonia;
  update: (row: Partial<TelefoniaSonax>) => UpdateTelefonia;
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
 * Configuração de telefonia por corretor. Sem as migrations aplicadas devolve
 * vazio — as telas mostram "—" em vez de quebrar.
 */
export async function listarTelefoniaSonax(ids: string[]): Promise<Record<string, TelefoniaSonax>> {
  if (!ids.length) return {};
  const { data, error } = await tabelaProfiles()
    .select("id, ramal_sonax, sonax_id_atendente, sonax_id_campanha")
    .in("id", ids);
  if (error) {
    if (COLUNA_AUSENTE.has(error.code ?? "")) return {};
    throw new Error(error.message || "Não foi possível carregar a telefonia dos corretores.");
  }
  return Object.fromEntries(
    (data ?? []).map((r) => [
      r.id,
      {
        ramal_sonax: r.ramal_sonax,
        sonax_id_atendente: r.sonax_id_atendente,
        sonax_id_campanha: r.sonax_id_campanha,
      },
    ]),
  );
}

/** Ramal Sonax por corretor (atalho usado pelo card "Meu ramal" do Discador). */
export async function listarRamaisSonax(ids: string[]): Promise<Record<string, string | null>> {
  const tel = await listarTelefoniaSonax(ids);
  return Object.fromEntries(Object.entries(tel).map(([id, t]) => [id, t.ramal_sonax]));
}

/** Grava a configuração de telefonia do corretor (campos vazios viram null). RLS: admin. */
export async function salvarTelefoniaSonax(
  id: string,
  campos: Partial<TelefoniaSonax>,
): Promise<void> {
  const { error } = await tabelaProfiles().update(campos).eq("id", id);
  if (error) throw new Error(error.message || "Não foi possível salvar a telefonia.");
}

/** Grava (ou limpa, com null) só o ramal do corretor. RLS: admin. */
export async function salvarRamalSonax(id: string, ramal: string | null): Promise<void> {
  await salvarTelefoniaSonax(id, { ramal_sonax: ramal });
}
