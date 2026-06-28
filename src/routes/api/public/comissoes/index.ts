// GET /api/public/comissoes
// Auth: X-API-Key. Filtros: corretor_id, status, mes (YYYY-MM), limit, offset.
import { createFileRoute } from "@tanstack/react-router";
import { checkReadApiKey, jsonResponse, corsPreflight } from "@/lib/public-api-auth";

const MES_RE = /^(\d{4})-(\d{2})$/;

export const Route = createFileRoute("/api/public/comissoes/")({
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
          .from("comissoes")
          .select(
            "id, venda_id, beneficiario_id, percentual, valor_comissao, valor_liquido, percentual_desconto, status, data_pagamento, created_at",
            { count: "exact" },
          );

        const corretorId = q.get("corretor_id");
        if (corretorId) query = query.eq("beneficiario_id", corretorId);

        const status = q.get("status");
        if (status) query = query.eq("status", status);

        const mes = q.get("mes");
        if (mes) {
          const m = MES_RE.exec(mes);
          if (!m) return jsonResponse({ error: "mes inválido. Use YYYY-MM" }, 400);
          const ano = Number(m[1]);
          const mm = Number(m[2]);
          const ini = `${ano}-${String(mm).padStart(2, "0")}-01`;
          const proximo = new Date(ano, mm, 1).toISOString().slice(0, 10);
          query = query.gte("data_pagamento", ini).lt("data_pagamento", proximo);
        }

        query = query.order("data_pagamento", { ascending: false, nullsFirst: false }).range(offset, offset + limit - 1);

        const { data, error, count } = await query;
        if (error) return jsonResponse({ error: error.message }, 500);

        const mapped = (data ?? []).map((c) => ({
          id: c.id,
          venda_id: c.venda_id,
          corretor_id: c.beneficiario_id,
          percentual: c.percentual,
          valor: c.valor_comissao,
          valor_liquido: c.valor_liquido,
          status: c.status,
          deducoes: c.percentual_desconto,
          data_pagamento: c.data_pagamento,
        }));

        return jsonResponse({ data: mapped, count: count ?? mapped.length, limit, offset });
      },
    },
  },
});
