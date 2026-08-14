// GET /api/public/roletas — resumo das roletas com contagem de aptos AGORA.
// Auth: cliente X-API-Key com escopo leads:read (mesmo padrão de /corretores).
//
// Consumidor primário: vigia de roletas no n8n (Sergio) — roleta ativa com
// corretores_aptos=0 vira alerta operacional. Kill switch sem deploy:
// distribuicao_settings.endpoint_roletas_ativo=false → 503 explícito
// (degradação explícita; o vigia trata 503 como "sinal indisponível", nunca
// como "tudo certo").
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "@/lib/public-api-auth";
import { requireApiClientScope } from "@/lib/api-client-auth.server";

export const Route = createFileRoute("/api/public/roletas/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireApiClientScope(request, "leads:read");
        if (auth instanceof Response) return auth;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Flag: só bloqueia quando explicitamente 'false' (a linha nasce
        // 'true' na migration que acompanha este endpoint).
        const { data: flag } = await supabaseAdmin
          .from("distribuicao_settings")
          .select("valor")
          .eq("chave", "endpoint_roletas_ativo")
          .maybeSingle();
        if (flag && flag.valor === false) {
          return jsonResponse({ error: "endpoint_desativado" }, 503);
        }

        const { data, error } = await supabaseAdmin.rpc("roletas_resumo_publico");
        if (error) return jsonResponse({ error: error.message }, 500);

        return jsonResponse({
          gerado_em: new Date().toISOString(),
          roletas: data ?? [],
        });
      },
    },
  },
});
