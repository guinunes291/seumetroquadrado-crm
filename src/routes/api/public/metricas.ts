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

        if (auth.projetoId) leadsQuery = leadsQuery.eq("projeto_id", auth.projetoId);
        const equipeCorretorIds = await restrictedCorretorIds(auth);
        if (equipeCorretorIds) {
          const ids = equipeCorretorIds.length
            ? equipeCorretorIds
            : ["00000000-0000-0000-0000-000000000000"];
          leadsQuery = leadsQuery.in("corretor_id", ids);
        }

        const ateInclusivo = new Date(ateExclusivo);
        ateInclusivo.setDate(ateInclusivo.getDate() - 1);
        const ateData = ateInclusivo.toISOString().slice(0, 10);

        const notas: string[] = [];
        const [leadsRes, agregadoRes] = await Promise.all([
          leadsQuery,
          lerVendasAgregado({ auth, desde, ate: ateData, limit: 1, offset: 0 }).catch(
            (e: unknown) => {
              notas.push(
                `Fonte de vendas indisponível: ${e instanceof Error ? e.message : "erro desconhecido"}`,
              );
              return null;
            },
          ),
        ]);

        if (leadsRes.error) return jsonResponse({ error: leadsRes.error.message }, 500);

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

        // Vendas: mesma fonte do endpoint /api/public/vendas, sempre por
        // data_assinatura. Sem fonte ou sem linhas => null + nota, nunca zero
        // silencioso.
        let vendas: Record<string, unknown> | null = null;
        if (agregadoRes) {
          if (agregadoRes.totais.vendas === 0 && agregadoRes.totais.distratos === 0) {
            notas.push(
              agregadoRes.aviso ?? "Nenhuma venda aprovada com data de assinatura no período.",
            );
          } else {
            const porCorretor: Record<string, { qtd: number; vgv: number }> = {};
            for (const c of agregadoRes.por_corretor) {
              porCorretor[c.corretor_id ?? "(sem_corretor)"] = { qtd: c.vendas, vgv: c.vgv };
            }
            vendas = {
              total: agregadoRes.totais.vendas,
              distratos: agregadoRes.totais.distratos,
              vgv: agregadoRes.totais.vgv,
              ticket_medio: agregadoRes.totais.ticket_medio,
              por_corretor: porCorretor,
              por_projeto: agregadoRes.por_projeto,
            };
          }
        }

        return jsonResponse({
          periodo: { desde, ate: ateData },
          leads: {
            total: leadsRes.data?.length ?? 0,
            por_status: porStatus,
            por_temperatura: porTemperatura,
            por_origem: porOrigem,
            por_corretor: leadsPorCorretor,
          },
          vendas,
          notas,
        });

      },
    },
  },
});
