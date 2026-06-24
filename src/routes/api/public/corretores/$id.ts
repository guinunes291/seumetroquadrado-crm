// GET /api/public/corretores/:id
// Auth: X-API-Key (mesmo READ_API_KEY do CRM)
// Retorna { id, nome, telefone, ativo } — telefone em E.164 (dígitos com DDI 55).
import { createFileRoute } from "@tanstack/react-router";
import { checkReadApiKey, jsonResponse } from "@/lib/public-api-auth";

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
        const authErr = checkReadApiKey(request);
        if (authErr) return authErr;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("profiles")
          .select("id, nome, telefone, ativo")
          .eq("id", params.id)
          .maybeSingle();

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
