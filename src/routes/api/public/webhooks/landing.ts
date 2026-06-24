// POST /api/public/webhooks/landing
// Webhook público (sem auth) para receber leads da landing page externa.
import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, accept",
  "Access-Control-Max-Age": "86400",
};

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function onlyDigits(v: unknown): string {
  return String(v ?? "").replace(/\D+/g, "");
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function boolOrNull(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

export const Route = createFileRoute("/api/public/webhooks/landing")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return jsonResp({ ok: false, error: "invalid_json" }, 400);
        }

        // Honeypot anti-spam
        if (body?.website || body?.simHp) {
          return jsonResp({ ok: true, id: null });
        }

        const nome = String(body?.nome ?? "").trim();
        const whatsapp = String(body?.whatsapp ?? "").trim();
        const digits = onlyDigits(whatsapp);

        if (nome.length < 3) {
          return jsonResp({ ok: false, error: "nome_invalido" }, 400);
        }
        if (digits.length < 10 || digits.length > 11) {
          return jsonResp({ ok: false, error: "whatsapp_invalido" }, 400);
        }

        const sim = body?.simulacao ?? null;
        const mk = body?.marketing ?? {};

        const row: Record<string, unknown> = {
          tipo: body?.tipo ?? null,
          nome,
          whatsapp,
          renda: body?.renda != null ? String(body.renda) : null,
          regiao: body?.regiao ?? null,
          origem: body?.origem ?? null,
          pagina: body?.pagina ?? null,
          referrer: body?.referrer ?? null,
          timestamp_cliente: body?.timestamp_cliente ?? null,
          utm_source: mk?.utm_source || null,
          utm_medium: mk?.utm_medium || null,
          utm_campaign: mk?.utm_campaign || null,
          utm_term: mk?.utm_term || null,
          utm_content: mk?.utm_content || null,
          gclid: mk?.gclid || null,
          fbclid: mk?.fbclid || null,
          raw: body,
        };

        if (sim && typeof sim === "object") {
          row.sim_renda = numOrNull(sim.renda);
          row.sim_tem_dependente = boolOrNull(sim.temDependente);
          row.sim_carteira36m = boolOrNull(sim.carteira36m);
          row.sim_fgts = numOrNull(sim.fgts);
          row.sim_entrada = numOrNull(sim.entrada);
          row.sim_aluguel = numOrNull(sim.aluguelAtual);
          row.sim_faixa = numOrNull(sim.faixa);
          row.sim_segmento = sim.segmento ?? null;
          row.sim_subsidio = numOrNull(sim.subsidio);
          row.sim_financiamento = numOrNull(sim.financiamento);
          row.sim_parcela = numOrNull(sim.parcela);
          row.sim_teto_imovel = numOrNull(sim.tetoImovel);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("leads_landing" as any)
          .insert(row as any)
          .select("id")
          .single();

        if (error) {
          console.error("[webhooks/landing] insert error:", error);
          return jsonResp({ ok: false, error: error.message }, 500);
        }

        return jsonResp({ ok: true, id: (data as any).id });
      },
    },
  },
});
