// GET /api/public/metricas
// Auth: cliente X-API-Key com escopo metrics:read.
// Query params (opcionais):
//   desde=YYYY-MM-DD  ate=YYYY-MM-DD  (default: m\u00eas corrente)
// Retorna agregados sem PII: contagens por status / temperatura / origem / corretor,
// total de leads no per\u00edodo, vendas e VGV do per\u00edodo.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "@/lib/public-api-auth";
import { requireApiClientScope, restrictedCorretorIds } from "@/lib/api-client-auth.server";

function monthRange() {
  const now = new Date();
  const ini = new Date(now.getFullYear(), now.getMonth(), 1);
  const fim = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { ini: ini.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

export const Route = createFileRoute("/api/public/metricas")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireApiClientScope(request, "metrics:read");
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const def = monthRange();
        const desde = url.searchParams.get("desde") ?? def.ini;
        const ateInput = url.searchParams.get("ate");
        let ateExclusivo = def.fim;
        if (ateInput) {
          const d = new Date(ateInput);
          d.setDate(d.getDate() + 1);
          ateExclusivo = d.toISOString().slice(0, 10);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let leadsQuery = supabaseAdmin
          .from("leads")
          .select("status,temperatura,origem,corretor_id,created_at")
          .eq("na_lixeira", false)
          .is("deleted_at", null)
          .gte("created_at", desde)
          .lt("created_at", ateExclusivo);
        let vendasQuery = supabaseAdmin
          .from("vendas")
          .select("valor_venda,corretor_id,projeto_id,aprovado_em")
          .eq("status_venda", "aprovada")
          .gte("aprovado_em", desde)
          .lt("aprovado_em", ateExclusivo);
        let distratosQuery = supabaseAdmin
          .from("vendas")
          .select("id,corretor_id,projeto_id,status_venda_updated_at")
          .eq("status_venda", "cancelada")
          .gte("status_venda_updated_at", desde)
          .lt("status_venda_updated_at", ateExclusivo);

        if (auth.projetoId) {
          leadsQuery = leadsQuery.eq("projeto_id", auth.projetoId);
          vendasQuery = vendasQuery.eq("projeto_id", auth.projetoId);
          distratosQuery = distratosQuery.eq("projeto_id", auth.projetoId);
        }
        const equipeCorretorIds = await restrictedCorretorIds(auth);
        if (equipeCorretorIds) {
          const ids = equipeCorretorIds.length
            ? equipeCorretorIds
            : ["00000000-0000-0000-0000-000000000000"];
          leadsQuery = leadsQuery.in("corretor_id", ids);
          vendasQuery = vendasQuery.in("corretor_id", ids);
          distratosQuery = distratosQuery.in("corretor_id", ids);
        }

        const [leadsRes, vendasRes, distratosRes] = await Promise.all([
          leadsQuery,
          vendasQuery,
          distratosQuery,
        ]);

        if (leadsRes.error) return jsonResponse({ error: leadsRes.error.message }, 500);
        if (vendasRes.error) return jsonResponse({ error: vendasRes.error.message }, 500);
        if (distratosRes.error) return jsonResponse({ error: distratosRes.error.message }, 500);

        const bump = (m: Record<string, number>, k: string | null | undefined) => {
          const key = k ?? "(vazio)";
          m[key] = (m[key] ?? 0) + 1;
        };
        const porStatus: Record<string, number> = {};
        const porTemperatura: Record<string, number> = {};
        const porOrigem: Record<string, number> = {};
        const leadsPorCorretor: Record<string, number> = {};
        for (const l of leadsRes.data ?? []) {
          bump(porStatus, l.status);
          bump(porTemperatura, l.temperatura);
          bump(porOrigem, l.origem);
          bump(leadsPorCorretor, l.corretor_id);
        }

        const vendasPorCorretor: Record<string, { qtd: number; vgv: number }> = {};
        let vendasQtd = 0;
        let vgv = 0;
        for (const v of vendasRes.data ?? []) {
          vendasQtd++;
          const valor = Number(v.valor_venda) || 0;
          vgv += valor;
          const key = v.corretor_id ?? "(sem_corretor)";
          if (!vendasPorCorretor[key]) vendasPorCorretor[key] = { qtd: 0, vgv: 0 };
          vendasPorCorretor[key].qtd++;
          vendasPorCorretor[key].vgv += valor;
        }

        return jsonResponse({
          periodo: { desde, ate: ateInput ?? def.fim },
          leads: {
            total: leadsRes.data?.length ?? 0,
            por_status: porStatus,
            por_temperatura: porTemperatura,
            por_origem: porOrigem,
            por_corretor: leadsPorCorretor,
          },
          vendas: {
            total: vendasQtd,
            distratos: distratosRes.data?.length ?? 0,
            vgv,
            por_corretor: vendasPorCorretor,
          },
        });
      },
    },
  },
});
