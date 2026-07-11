// GET /api/public/corretores/:id
// Auth: cliente X-API-Key com escopo leads:read.
// Retorna { id, nome, telefone, ativo } — telefone em E.164 (dígitos com DDI 55).
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "@/lib/public-api-auth";
import { requireApiClientScope } from "@/lib/api-client-auth.server";

function toE164(input?: string | null): string {
  if (!input) return "";
  const d = input.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

export const Route = createFileRoute("/api/public/corretores/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireApiClientScope(request, "leads:read");
        if (auth instanceof Response) return auth;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let query = supabaseAdmin
          .from("profiles")
          .select("id, nome, telefone, ativo")
          .eq("id", params.id);
        if (auth.equipeId) query = query.eq("equipe_id", auth.equipeId);
        const { data, error } = await query.maybeSingle();
        if (error) return jsonResponse({ error: error.message }, 500);
        if (!data) return jsonResponse({ error: "not_found" }, 404);

        return jsonResponse({
          id: data.id,
          nome: data.nome,
          telefone: toE164(data.telefone),
          ativo: data.ativo ?? true,
        });
      },
    },
  },
});
