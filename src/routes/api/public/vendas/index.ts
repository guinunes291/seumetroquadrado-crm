// GET /api/public/vendas — leitura (escopo `sales:read`).
// PATCH /api/public/vendas — correção do empreendimento em lote (`sales:write`).
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, corsPreflight } from "@/lib/public-api-auth";
import { requireApiClientScope, restrictedCorretorIds } from "@/lib/api-client-auth.server";
import { validarPatchVenda, aplicarPatchVenda } from "@/lib/vendas-write.server";

const LOTE_MAX = 200;

export const Route = createFileRoute("/api/public/vendas/")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      // Lote — mesmas regras da rota unitária, item a item, sem abortar no
      // primeiro erro.
      PATCH: async ({ request }) => {
        const auth = await requireApiClientScope(request, "sales:write");
        if (auth instanceof Response) return auth;

        let corpo: unknown;
        try {
          corpo = await request.json();
        } catch {
          return jsonResponse({ error: "corpo_invalido" }, 400);
        }
        const itens = (corpo as { itens?: unknown } | null)?.itens;
        if (!Array.isArray(itens)) return jsonResponse({ error: "itens_obrigatorio" }, 400);
        if (itens.length === 0) return jsonResponse({ error: "itens_vazio" }, 400);
        if (itens.length > LOTE_MAX) {
          return jsonResponse({ error: "lote_muito_grande", maximo: LOTE_MAX }, 400);
        }

        const resultados: Array<Record<string, unknown>> = [];
        for (const item of itens) {
          const vendaId = (item as { venda_id?: unknown } | null)?.venda_id;
          if (typeof vendaId !== "string" || !vendaId) {
            resultados.push({ venda_id: null, ok: false, error: "venda_id_obrigatorio" });
            continue;
          }
          const payload = validarPatchVenda(item, ["venda_id"]);
          if ("body" in payload) {
            resultados.push({ venda_id: vendaId, ok: false, ...payload.body });
            continue;
          }
          const r = await aplicarPatchVenda(vendaId, payload, auth);
          if (r.ok) {
            resultados.push({
              venda_id: vendaId,
              ok: true,
              anterior: r.anterior,
              atual: r.venda,
              vinculado_ao_catalogo: r.vinculado_ao_catalogo,
              comissoes_afetadas: r.comissoes_afetadas,
            });
          } else {
            resultados.push({ venda_id: vendaId, ok: false, ...r.erro.body });
          }
        }

        const aplicados = resultados.filter((r) => r.ok).length;
        return jsonResponse(
          {
            total: resultados.length,
            aplicados,
            falhas: resultados.length - aplicados,
            resultados,
          },
          200,
        );
      },
      GET: async ({ request }) => {

        const auth = await requireApiClientScope(request, "sales:read");
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const q = url.searchParams;
        const limit = Math.min(Number(q.get("limit")) || 100, 500);
        const offset = Math.max(Number(q.get("offset")) || 0, 0);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let query = supabaseAdmin
          .from("vendas")
          .select(
            "id, lead_id, corretor_id, projeto_id, projeto_nome, valor_venda, data_assinatura, status_recebimento, status_venda, aprovado_em, distrato, created_at",
            { count: "exact" },
          )
          .eq("status_venda", "aprovada");

        if (auth.projetoId) query = query.eq("projeto_id", auth.projetoId);
        const equipeCorretorIds = await restrictedCorretorIds(auth);
        if (equipeCorretorIds) {
          query = query.in(
            "corretor_id",
            equipeCorretorIds.length ? equipeCorretorIds : ["00000000-0000-0000-0000-000000000000"],
          );
        }

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

        query = query
          .order("data_assinatura", { ascending: false })
          .range(offset, offset + limit - 1);

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
          status_aprovacao: v.status_venda,
          aprovado_em: v.aprovado_em,
          distrato: v.distrato,
        }));

        return jsonResponse({ data: mapped, count: count ?? mapped.length, limit, offset });
      },
    },
  },
});
