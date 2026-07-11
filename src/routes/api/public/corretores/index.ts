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
        const parseCsv = (v: string | null) =>
          (v ?? "")
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
        const rolesIncluir = parseCsv(url.searchParams.get("role"));
        const rolesExcluir = parseCsv(url.searchParams.get("excluir_role"));

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let q = supabaseAdmin
          .from("profiles")
          .select("id, nome, email, telefone, ativo")
          .order("nome", { ascending: true });

        if (ativoParam === "true") q = q.eq("ativo", true);
        else if (ativoParam === "false") q = q.eq("ativo", false);

        const { data, error } = await q;
        if (error) return jsonResponse({ error: error.message }, 500);

        const ids = (data ?? []).map((c) => c.id);
        const rolesByUser: Record<string, string> = {};
        if (ids.length) {
          const { data: rolesData } = await supabaseAdmin
            .from("user_roles")
            .select("user_id, role")
            .in("user_id", ids);
          // Prioridade quando um user tem múltiplos papéis: admin > gestor > corretor
          const prio: Record<string, number> = { admin: 3, gestor: 2, corretor: 1 };
          for (const r of rolesData ?? []) {
            const cur = rolesByUser[r.user_id];
            if (!cur || (prio[r.role] ?? 0) > (prio[cur] ?? 0)) {
              rolesByUser[r.user_id] = r.role;
            }
          }
        }

        let corretores = (data ?? []).map((c) => ({
          id: c.id,
          nome: c.nome,
          email: c.email,
          telefone: toE164(c.telefone),
          ativo: c.ativo ?? true,
          role: rolesByUser[c.id] ?? "corretor",
        }));

        if (rolesIncluir.length) {
          corretores = corretores.filter((c) => rolesIncluir.includes(c.role.toLowerCase()));
        }
        if (rolesExcluir.length) {
          corretores = corretores.filter((c) => !rolesExcluir.includes(c.role.toLowerCase()));
        }

        return jsonResponse({ corretores });
      },
    },
  },
});
