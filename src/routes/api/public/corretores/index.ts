// GET /api/public/corretores?ativo=true
// Auth: cliente X-API-Key com escopo leads:read.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "@/lib/public-api-auth";
import { requireApiClientScope } from "@/lib/api-client-auth.server";

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
        const auth = await requireApiClientScope(request, "leads:read");
        if (auth instanceof Response) return auth;

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
          .select("id, nome, telefone, ativo")
          .order("nome", { ascending: true });

        if (auth.equipeId) q = q.eq("equipe_id", auth.equipeId);

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
          // E-mail de colaborador nao e necessario para operacao externa.
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
