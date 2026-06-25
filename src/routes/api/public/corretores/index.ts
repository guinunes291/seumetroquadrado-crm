// GET /api/public/corretores?ativo=true
// Auth: X-API-Key (READ_API_KEY). Lista corretores (profiles) com telefone em E.164.
import { createFileRoute } from "@tanstack/react-router";
import { checkReadApiKey, jsonResponse } from "@/lib/public-api-auth";

function toE164(input?: string | null): string | null {
  if (!input) return null;
  const d = input.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

export const Route = createFileRoute("/api/public/corretores/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authErr = checkReadApiKey(request);
        if (authErr) return authErr;

        const url = new URL(request.url);
        const ativoParam = url.searchParams.get("ativo");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let q = supabaseAdmin
          .from("profiles")
          .select("id, nome, email, telefone, ativo")
          .order("nome", { ascending: true });

        if (ativoParam === "true") q = q.eq("ativo", true);
        else if (ativoParam === "false") q = q.eq("ativo", false);

        const { data, error } = await q;
        if (error) return jsonResponse({ error: error.message }, 500);

        const corretores = (data ?? []).map((c) => ({
          id: c.id,
          nome: c.nome,
          email: c.email,
          telefone: toE164(c.telefone),
          ativo: c.ativo ?? true,
        }));

        return jsonResponse({ corretores });
      },
    },
  },
});
