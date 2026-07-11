// GET /api/public/comissoes
// Auth: X-API-Key. Filtros: corretor_id, status, venda_id, desde, ate, mes (YYYY-MM), limit, offset.
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
        const limit = Math.min(Number(q.get("limit")) || 100, 500);
        const offset = Math.max(Number(q.get("offset")) || 0, 0);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let query = supabaseAdmin
          .from("comissoes")
          .select(
            "id, venda_id, beneficiario_id, beneficiario_nome, tipo, percentual, valor_comissao, valor_liquido, percentual_desconto, status, data_pagamento, created_at",
            { count: "exact" },
          );

        const corretorId = q.get("corretor_id");
        if (corretorId) query = query.eq("beneficiario_id", corretorId);

        const status = q.get("status");
        if (status) query = query.eq("status", status);

        const vendaId = q.get("venda_id");
        if (vendaId) query = query.eq("venda_id", vendaId);

        const desde = q.get("desde");
        if (desde) query = query.gte("data_pagamento", desde);
        const ate = q.get("ate");
        if (ate) query = query.lte("data_pagamento", ate);

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

        query = query
          .order("data_pagamento", { ascending: false, nullsFirst: false })
          .range(offset, offset + limit - 1);

        const { data, error, count } = await query;
        if (error) return jsonResponse({ error: error.message }, 500);

        const mapped = (data ?? []).map((c) => ({
          comissao_id: c.id,
          id: c.id,
          venda_id: c.venda_id,
          corretor_id: c.beneficiario_id,
          beneficiario_id: c.beneficiario_id,
          beneficiario_nome: c.beneficiario_nome,
          tipo: c.tipo,
          percentual: c.percentual,
          valor_bruto: c.valor_comissao,
          valor: c.valor_comissao,
          // `deducoes` é legado (na verdade é um percentual) — mantido por compat.
          deducoes: c.percentual_desconto,
          percentual_desconto: c.percentual_desconto,
          valor_liquido: c.valor_liquido,
          status: c.status,
          data: c.data_pagamento,
          data_pagamento: c.data_pagamento,
        }));

        return jsonResponse({ data: mapped, count: count ?? mapped.length, limit, offset });
      },
    },
  },
});
