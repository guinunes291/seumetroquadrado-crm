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
        const stagingId = (data as any).id as string;

        // --- Distribuição v3: a landing deixa de ser só staging ---
        // Cria o lead real (origem 'site' → roleta Landing Page) e passa pela
        // triagem única. Sem corretor apto → fila de exceções com alerta.
        // Qualquer falha aqui NÃO derruba a resposta do formulário: o staging
        // já está salvo e pode ser reprocessado.
        let leadId: string | null = null;
        let corretorId: string | null = null;
        try {
          // Dedup global por telefone (dígitos): retorno do mesmo cliente não
          // duplica lead — vincula o staging ao lead existente.
          const { data: dupId } = await supabaseAdmin.rpc(
            "buscar_lead_por_telefone" as never,
            { _telefone: digits } as never,
          );
          const existingId = (dupId as string | null) ?? null;

          if (existingId) {
            leadId = existingId;
            await supabaseAdmin
              .from("leads_landing" as any)
              .update({ lead_id: existingId } as any)
              .eq("id", stagingId);
          } else {
            const simResumo = [
              row.sim_renda != null ? `Renda: R$ ${row.sim_renda}` : null,
              row.sim_faixa != null ? `Faixa MCMV: ${row.sim_faixa}` : null,
              row.sim_subsidio != null ? `Subsídio estimado: R$ ${row.sim_subsidio}` : null,
              row.sim_teto_imovel != null ? `Teto do imóvel: R$ ${row.sim_teto_imovel}` : null,
              row.sim_parcela != null ? `Parcela estimada: R$ ${row.sim_parcela}` : null,
              body?.regiao ? `Região de interesse: ${body.regiao}` : null,
            ]
              .filter(Boolean)
              .join("\n");

            const { data: leadIns, error: leadErr } = await supabaseAdmin
              .from("leads")
              .insert({
                nome,
                telefone: digits,
                origem: "site",
                canal_entrada: "webhook_landing",
                via_webhook: true,
                renda_informada: row.renda ?? null,
                observacoes: simResumo
                  ? `📥 Lead da Landing Page (simulador)\n${simResumo}`
                  : "📥 Lead da Landing Page",
                utm_source: (row.utm_source as string | null) ?? "landing",
                utm_medium: row.utm_medium ?? null,
                utm_campaign: row.utm_campaign ?? null,
                utm_content: row.utm_content ?? null,
                campanha: row.utm_campaign ?? null,
              } as never)
              .select("id")
              .single();

            if (leadErr) {
              console.error("[webhooks/landing] lead insert error:", leadErr);
            } else if (leadIns) {
              leadId = leadIns.id;
              await supabaseAdmin
                .from("leads_landing" as any)
                .update({ lead_id: leadIns.id } as any)
                .eq("id", stagingId);

              const { data: triagem, error: triagemErr } = await supabaseAdmin.rpc(
                "triar_e_distribuir_lead",
                { _lead_id: leadIns.id, _gatilho: "webhook_landing" },
              );
              if (triagemErr) {
                console.error("[webhooks/landing] triagem falhou:", triagemErr);
              } else {
                const res = triagem as { ok?: boolean; corretor_id?: string } | null;
                if (res?.ok && res.corretor_id) corretorId = res.corretor_id;
              }
            }
          }
        } catch (e) {
          console.error("[webhooks/landing] distribuição falhou (staging preservado):", e);
        }

        return jsonResp({ ok: true, id: stagingId, lead_id: leadId, corretor_id: corretorId });
      },
    },
  },
});
