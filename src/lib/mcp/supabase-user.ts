// Helper para criar um cliente Supabase que actua como o usuário do token
// verificado pelo MCP (mcp-js valida o JWT; forwardamos o raw token para o
// PostgREST, então RLS roda como esse usuário). Nunca use service role aqui.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import type { Database } from "@/integrations/supabase/types";

export function supabaseForUser(ctx: ToolContext): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anon) {
    throw new Error("SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY ausentes");
  }
  return createClient<Database>(url, anon, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
