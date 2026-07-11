// GET /api/public/projetos
// Auth: X-API-Key. Filtros: construtora, zona, bairro, dorms, status_preco, ativo, limit, offset.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, corsPreflight } from "@/lib/public-api-auth";
import { requireApiClientScope } from "@/lib/api-client-auth.server";

export const Route = createFileRoute("/api/public/projetos/")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) => {
        const auth = await requireApiClientScope(request, "leads:read");
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const q = url.searchParams;
        const limit = Math.min(Number(q.get("limit")) || 100, 500);
        const offset = Math.max(Number(q.get("offset")) || 0, 0);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let query = supabaseAdmin
          .from("projetos")
          .select(
            "id, nome, construtora, bairro, zona_smq, dorms_min, dorms_max, metragem_min, metragem_max, preco_a_partir, ativo, status_preco, fonte, updated_at",
            { count: "exact" },
          )
          .is("deleted_at", null);

        if (auth.projetoId) query = query.eq("id", auth.projetoId);

        const construtora = q.get("construtora");
        if (construtora) query = query.ilike("construtora", `%${construtora}%`);

        const zona = q.get("zona");
        if (zona) query = query.ilike("zona_smq", `%${zona}%`);

        const bairro = q.get("bairro");
        if (bairro) query = query.ilike("bairro", `%${bairro}%`);

        const dorms = q.get("dorms");
        if (dorms) {
          const n = Number(dorms);
          if (Number.isFinite(n)) query = query.lte("dorms_min", n).gte("dorms_max", n);
        }

        const ativo = q.get("ativo");
        if (ativo === "true") query = query.eq("ativo", true);
        else if (ativo === "false") query = query.eq("ativo", false);

        // status (legacy alias) ainda aceito
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
              : (p.metragem_min ?? null);
          return {
            projeto_id: p.id,
            id: p.id,
            empreendimento: p.nome,
            nome: p.nome,
            construtora: p.construtora,
            bairro: p.bairro,
            zona: p.zona_smq,
            dorms,
            metragem,
            preco: p.preco_a_partir,
            status_preco: p.status_preco ?? "a_confirmar",
            fonte: p.fonte,
            ativo: p.ativo,
            atualizado_em: p.updated_at,
          };
        });

        return jsonResponse({ data: mapped, count: count ?? mapped.length, limit, offset });
      },
    },
  },
});
