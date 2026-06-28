// GET  /api/public/leads/:id/eventos → linha do tempo (mais recente primeiro)
// POST /api/public/leads/:id/eventos → cria evento
// Auth: X-API-Key
import { createFileRoute } from "@tanstack/react-router";
import { checkReadApiKey, jsonResponse, corsPreflight } from "@/lib/public-api-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/leads/$id/eventos")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),

      GET: async ({ request, params }) => {
        const authErr = checkReadApiKey(request);
        if (authErr) return authErr;
        if (!UUID_RE.test(params.id)) return jsonResponse({ error: "id inválido" }, 400);

        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);
        const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error, count } = await supabaseAdmin
          .from("lead_eventos")
          .select("id, lead_id, tipo, descricao, agente, payload, created_at", { count: "exact" })
          .eq("lead_id", params.id)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ data: data ?? [], count: count ?? 0, limit, offset });
      },

      POST: async ({ request, params }) => {
        const authErr = checkReadApiKey(request);
        if (authErr) return authErr;
        if (!UUID_RE.test(params.id)) return jsonResponse({ error: "id inválido" }, 400);

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return jsonResponse({ error: "JSON inválido" }, 400);
        }
        const tipo = typeof body.tipo === "string" ? body.tipo.trim() : "";
        if (!tipo) return jsonResponse({ error: "tipo é obrigatório" }, 422);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: lead, error: chkErr } = await supabaseAdmin
          .from("leads")
          .select("id")
          .eq("id", params.id)
          .maybeSingle();
        if (chkErr) return jsonResponse({ error: chkErr.message }, 500);
        if (!lead) return jsonResponse({ error: "lead não encontrado" }, 404);

        const { data, error } = await supabaseAdmin
          .from("lead_eventos")
          .insert({
            lead_id: params.id,
            tipo,
            descricao: typeof body.descricao === "string" ? body.descricao : null,
            agente: typeof body.agente === "string" ? body.agente : null,
            payload: body.payload && typeof body.payload === "object" ? body.payload : null,
          })
          .select()
          .single();

        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ ok: true, evento: data }, 201);
      },
    },
  },
});
