// GET /api/public/leads/:id
// Auth: header X-API-Key = READ_API_KEY
// Retorna o lead + intera\u00e7\u00f5es (ordenadas desc).
import { createFileRoute } from "@tanstack/react-router";
import { checkReadApiKey, jsonResponse } from "@/lib/public-api-auth";

export const Route = createFileRoute("/api/public/leads/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const authErr = checkReadApiKey(request);
        if (authErr) return authErr;

        const id = params.id;
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
          return jsonResponse({ error: "id inválido (esperado UUID)" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const [leadRes, interRes] = await Promise.all([
          supabaseAdmin.from("leads").select("*").eq("id", id).maybeSingle(),
          supabaseAdmin
            .from("interacoes")
            .select("id,tipo,direcao,titulo,conteudo,metadata,ocorreu_em,created_at,autor_id")
            .eq("lead_id", id)
            .is("deleted_at", null)
            .order("ocorreu_em", { ascending: false })
            .limit(200),
        ]);

        if (leadRes.error) {
          console.error("[/api/public/leads/:id] lead err:", leadRes.error);
          return jsonResponse({ error: leadRes.error.message }, 500);
        }
        if (!leadRes.data) return jsonResponse({ error: "lead não encontrado" }, 404);

        return jsonResponse({
          lead: leadRes.data,
          interacoes: interRes.data ?? [],
        });
      },
    },
  },
});
