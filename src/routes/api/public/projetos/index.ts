// GET /api/public/projetos
// Auth: X-API-Key. Filtros: construtora, status (ativo true/false), status_preco, limit, offset.
import { createFileRoute } from "@tanstack/react-router";
import { checkReadApiKey, jsonResponse, corsPreflight } from "@/lib/public-api-auth";

export const Route = createFileRoute("/api/public/projetos/")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) => {
        const authErr = checkReadApiKey(request);
        if (authErr) return authErr;

        const url = new URL(request.url);
        const q = url.searchParams;
        const limit = Math.min(Number(q.get("limit")) || 50, 200);
        const offset = Math.max(Number(q.get("offset")) || 0, 0);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let query = supabaseAdmin
          .from("projetos")
          .select(
            "id, nome, construtora, bairro, zona_smq, dorms_min, dorms_max, metragem_min, metragem_max, preco_a_partir, ativo, status_preco, updated_at",
            { count: "exact" },
          )
          .is("deleted_at", null);

        const construtora = q.get("construtora");
        if (construtora) query = query.ilike("construtora", `%${construtora}%`);

        const status = q.get("status");
        if (status === "ativo" || status === "true") query = query.eq("ativo", true);
        else if (status === "inativo" || status === "false") query = query.eq("ativo", false);

        const statusPreco = q.get("status_preco");
        if (statusPreco) query = query.eq("status_preco", statusPreco);

        query = query.order("nome", { ascending: true }).range(offset, offset + limit - 1);

        const { data, error, count } = await query;
        if (error) return jsonResponse({ error: error.message }, 500);

        const mapped = (data ?? []).map((p) => {
          const dorms =
            p.dorms_min != null && p.dorms_max != null
              ? p.dorms_min === p.dorms_max
                ? String(p.dorms_min)
                : `${p.dorms_min}-${p.dorms_max}`
              : p.dorms_min != null
              ? String(p.dorms_min)
              : null;
          const metragem =
            p.metragem_min != null && p.metragem_max != null
              ? p.metragem_min === p.metragem_max
                ? Number(p.metragem_min)
                : `${p.metragem_min}-${p.metragem_max}`
              : p.metragem_min ?? null;
          return {
            id: p.id,
            nome: p.nome,
            construtora: p.construtora,
            bairro: p.bairro,
            zona: p.zona_smq,
            dorms,
            metragem,
            preco: p.preco_a_partir,
            status: p.ativo ? "ativo" : "inativo",
            status_preco: p.status_preco,
            atualizado_em: p.updated_at,
          };
        });

        return jsonResponse({ data: mapped, count: count ?? mapped.length, limit, offset });
      },
    },
  },
});
