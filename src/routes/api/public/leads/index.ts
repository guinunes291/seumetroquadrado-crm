// GET /api/public/leads
// Auth: header X-API-Key = READ_API_KEY
// Query params (todos opcionais):
//   parados=30d          → leads sem ultima_interacao há N dias (aceita 7d, 15d, 30d, 60d, 90d)
//   status=...           → filtra por status (csv: ?status=novo,em_atendimento)
//   corretor_id=<uuid>   → filtra por corretor
//   temperatura=quente   → quente|morno|frio
//   origem=facebook      → enum origem
//   projeto_id=<uuid>
//   desde=YYYY-MM-DD     → created_at >= desde
//   ate=YYYY-MM-DD       → created_at <= ate (inclusivo, +1 dia)
//   limit=50 (max 200)
//   offset=0
import { createFileRoute } from "@tanstack/react-router";
import { checkReadApiKey, jsonResponse } from "@/lib/public-api-auth";

const PARADOS_RE = /^(\d+)d$/i;

export const Route = createFileRoute("/api/public/leads/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authErr = checkReadApiKey(request);
        if (authErr) return authErr;

        const url = new URL(request.url);
        const q = url.searchParams;

        const limit = Math.min(Number(q.get("limit")) || 50, 200);
        const offset = Math.max(Number(q.get("offset")) || 0, 0);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let query = supabaseAdmin
          .from("leads")
          .select(
            "id,nome,email,telefone,cpf,origem,status,temperatura,corretor_id,projeto_id,projeto_nome,campanha,utm_source,utm_medium,utm_campaign,renda_informada,usa_fgts,entrada_disponivel,observacoes,proximo_followup,ultimo_contato,ultima_interacao,data_distribuicao,created_at,updated_at",
            { count: "exact" },
          )
          .eq("na_lixeira", false)
          .is("deleted_at", null);

        const parados = q.get("parados");
        if (parados) {
          const m = PARADOS_RE.exec(parados);
          if (!m) {
            return jsonResponse({ error: "parados inválido. Use formato 30d" }, 400);
          }
          const dias = Number(m[1]);
          const cutoff = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
          // Sem interação OU última interação anterior ao cutoff
          query = query.or(`ultima_interacao.is.null,ultima_interacao.lte.${cutoff}`);
          // Exclui status finais
          query = query.not("status", "in", "(perdido,contrato_fechado)");
        }

        const status = q.get("status");
        if (status) {
          const arr = status.split(",").map((s) => s.trim()).filter(Boolean);
          if (arr.length === 1) query = query.eq("status", arr[0]);
          else if (arr.length > 1) query = query.in("status", arr);
        }

        const corretorId = q.get("corretor_id");
        if (corretorId) query = query.eq("corretor_id", corretorId);

        const temperatura = q.get("temperatura");
        if (temperatura) query = query.eq("temperatura", temperatura);

        const origem = q.get("origem");
        if (origem) query = query.eq("origem", origem);

        const projetoId = q.get("projeto_id");
        if (projetoId) query = query.eq("projeto_id", projetoId);

        const desde = q.get("desde");
        if (desde) query = query.gte("created_at", desde);
        const ate = q.get("ate");
        if (ate) {
          const d = new Date(ate);
          d.setDate(d.getDate() + 1);
          query = query.lt("created_at", d.toISOString().slice(0, 10));
        }

        query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

        const { data, error, count } = await query;
        if (error) {
          console.error("[/api/public/leads] erro:", error);
          return jsonResponse({ error: error.message }, 500);
        }

        return jsonResponse({
          total: count ?? data?.length ?? 0,
          limit,
          offset,
          data: data ?? [],
        });
      },
    },
  },
});
