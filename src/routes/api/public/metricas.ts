// GET /api/public/metricas
// Auth: header X-API-Key = READ_API_KEY
// Query params (opcionais):
//   desde=YYYY-MM-DD  ate=YYYY-MM-DD  (default: m\u00eas corrente)
// Retorna agregados sem PII: contagens por status / temperatura / origem / corretor,
// total de leads no per\u00edodo, vendas e VGV do per\u00edodo.
import { createFileRoute } from "@tanstack/react-router";
import { checkReadApiKey, jsonResponse } from "@/lib/public-api-auth";

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
        const authErr = checkReadApiKey(request);
        if (authErr) return authErr;

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

        const [leadsRes, vendasRes] = await Promise.all([
          supabaseAdmin
            .from("leads")
            .select("status,temperatura,origem,corretor_id,created_at")
            .eq("na_lixeira", false)
            .is("deleted_at", null)
            .gte("created_at", desde)
            .lt("created_at", ateExclusivo),
          supabaseAdmin
            .from("vendas")
            .select("valor_venda,corretor_id,projeto_id,data_assinatura,distrato")
            .gte("data_assinatura", desde)
            .lt("data_assinatura", ateExclusivo),
        ]);

        if (leadsRes.error) return jsonResponse({ error: leadsRes.error.message }, 500);
        if (vendasRes.error) return jsonResponse({ error: vendasRes.error.message }, 500);

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
        let distratos = 0;
        for (const v of vendasRes.data ?? []) {
          if (v.distrato) {
            distratos++;
            continue;
          }
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
            distratos,
            vgv,
            por_corretor: vendasPorCorretor,
          },
        });
      },
    },
  },
});
