// GET /api/public/vendas
// Auth: X-API-Key. Filtros: status, corretor_id, desde, ate (data), empreendimento, limit, offset.
import { createFileRoute } from "@tanstack/react-router";
import { checkReadApiKey, jsonResponse, corsPreflight } from "@/lib/public-api-auth";

export const Route = createFileRoute("/api/public/vendas/")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) => {
        const authErr = checkReadApiKey(request);
        if (authErr) return authErr;

        const url = new URL(request.url);
        const q = url.searchParams;
        const limit = Math.min(Number(q.get("limit")) || 100, 500);
        const offset = Math.max(Number(q.get("offset")) || 0, 0);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let query = supabaseAdmin
          .from("vendas")
          .select(
            "id, lead_id, corretor_id, projeto_id, projeto_nome, valor_venda, data_assinatura, status_recebimento, distrato, created_at",
            { count: "exact" },
          );

        const status = q.get("status");
        if (status) query = query.eq("status_recebimento", status);

        const corretorId = q.get("corretor_id");
        if (corretorId) query = query.eq("corretor_id", corretorId);

        const desde = q.get("desde") ?? q.get("data_inicio");
        if (desde) query = query.gte("data_assinatura", desde);
        const ate = q.get("ate") ?? q.get("data_fim");
        if (ate) query = query.lte("data_assinatura", ate);

        const empreendimento = q.get("empreendimento");
        if (empreendimento) query = query.ilike("projeto_nome", `%${empreendimento}%`);

        query = query.order("data_assinatura", { ascending: false }).range(offset, offset + limit - 1);

        const { data, error, count } = await query;
        if (error) return jsonResponse({ error: error.message }, 500);

        const mapped = (data ?? []).map((v) => ({
          venda_id: v.id,
          id: v.id,
          lead_id: v.lead_id,
          crm_lead_id: v.lead_id,
          corretor_id: v.corretor_id,
          empreendimento: v.projeto_nome,
          projeto_id: v.projeto_id,
          valor: v.valor_venda,
          data: v.data_assinatura,
          status: v.distrato ? "distrato" : v.status_recebimento,
          distrato: v.distrato,
        }));

        return jsonResponse({ data: mapped, count: count ?? mapped.length, limit, offset });
      },
    },
  },
});
