// Fronteira tipada das RPCs do webhook de leads que ainda NÃO estão em
// types.ts (gerado a partir do banco real). Mesmo padrão de pendentes.ts: um
// escape só, aqui, com o tipo explícito de cada RPC — em vez de casts soltos
// espalhados pelo handler (cada um conta no type-escape budget).
//
// Ao regenerar os types do Supabase:
//   1. apagar este arquivo;
//   2. usar `supabaseAdmin` direto em src/routes/api/public/webhooks/lead/$token.ts;
//   3. baixar o teto do type-escape budget.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./types";

type Pub = Database["public"];

export type DatabaseWebhookLead = Omit<Database, "public"> & {
  public: Omit<Pub, "Functions"> & {
    Functions: Pub["Functions"] & {
      /** Lead ativo OU perdido com o telefone (dedup global, decisão 01/10/2026). */
      buscar_lead_por_telefone_global_incl_perdido: {
        Args: { _telefone: string };
        Returns: string | null;
      };
      /** Devolve o lead repetido à roleta da campanha, com o motor de lead novo. */
      redistribuir_duplicado_campanha: {
        Args: { _lead_id: string; _roleta_slug: string | null };
        Returns: Json;
      };
    };
  };
};

/** O MESMO cliente admin, só com o schema estendido pelas RPCs pendentes. */
export function comRpcsPendentes(admin: SupabaseClient<Database>) {
  return admin as unknown as SupabaseClient<DatabaseWebhookLead>;
}
