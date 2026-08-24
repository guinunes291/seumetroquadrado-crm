// Fronteira ÚNICA de acesso do cliente às colunas de telefonia Sonax em
// `profiles` (ramal_sonax, sonax_id_atendente, sonax_id_campanha), já com os
// types gerados do Supabase. Mantém o fallback de "coluna ausente" para
// ambientes onde as migrations de telefonia ainda não rodaram — as telas
// mostram "—" em vez de quebrar.

import { supabase } from "@/integrations/supabase/client";

export type TelefoniaSonax = {
  ramal_sonax: string | null;
  sonax_id_atendente: string | null;
  sonax_id_campanha: string | null;
};

/** Códigos de "coluna ainda não existe" (migration de telefonia pendente). */
const COLUNA_AUSENTE = new Set(["42703", "PGRST204", "PGRST202", "PGRST205"]);

/**
 * Configuração de telefonia por corretor. Sem as migrations aplicadas devolve
 * vazio — as telas mostram "—" em vez de quebrar.
 */
export async function listarTelefoniaSonax(ids: string[]): Promise<Record<string, TelefoniaSonax>> {
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from("profiles")
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

/** Grava a configuração de telefonia do corretor (campos vazios viram null). RLS: admin. */
export async function salvarTelefoniaSonax(
  id: string,
  campos: Partial<TelefoniaSonax>,
): Promise<void> {
  const { error } = await supabase.from("profiles").update(campos).eq("id", id);
  if (error) throw new Error(error.message || "Não foi possível salvar a telefonia.");
}
