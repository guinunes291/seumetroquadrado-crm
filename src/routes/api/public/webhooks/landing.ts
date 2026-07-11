// POST /api/public/webhooks/landing
// Webhook da landing page externa. Postado direto do browser (CORS *), então
// o form não carrega segredo: a proteção é rate limit por IP + honeypot +
// validação. Quando a landing ganhar um proxy server-side, defina
// LANDING_WEBHOOK_SECRET para exigir o header x-landing-secret.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { rateLimit } from "@/lib/rate-limit";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, accept, x-landing-secret",
  "Access-Control-Max-Age": "86400",
};

// Máx. de posts por IP por minuto e teto de tamanho do corpo.
const LANDING_RATE_MAX = Number(process.env.LANDING_RATE_LIMIT ?? 12);
const LANDING_RATE_WINDOW_MS = 60_000;
const MAX_LANDING_BYTES = 32_768;

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
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

export type LandingParse =
  | { ok: true; nome: string; digits: string; row: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Valida e normaliza o corpo do webhook da landing. Função pura (sem I/O),
 * exportada para teste. NÃO trata honeypot nem rate limit — isso fica no
 * handler.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseLandingPayload(body: any): LandingParse {
  const nome = String(body?.nome ?? "").trim();
  const whatsapp = String(body?.whatsapp ?? "").trim();
  const digits = onlyDigits(whatsapp);

  if (nome.length < 3) return { ok: false, error: "nome_invalido" };
  if (digits.length < 10 || digits.length > 11) return { ok: false, error: "whatsapp_invalido" };

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

  return { ok: true, nome, digits, row };
}

export const Route = createFileRoute("/api/public/webhooks/landing")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        // Rate limit por IP (anti-spam/enumeração).
        const ip = clientIp(request);
        const rl = rateLimit(`landing:${ip}`, LANDING_RATE_MAX, LANDING_RATE_WINDOW_MS);
        if (!rl.allowed) {
          return jsonResp(
            { ok: false, error: "rate_limit_exceeded", retry_after_s: rl.retryAfterS },
            429,
          );
        }

        // Secret opcional: só exigido quando LANDING_WEBHOOK_SECRET está setado.
        const secret = process.env.LANDING_WEBHOOK_SECRET;
        if (secret) {
          const provided = request.headers.get("x-landing-secret") ?? "";
          if (!secretMatches(provided, secret)) {
            return jsonResp({ ok: false, error: "unauthorized" }, 401);
          }
        }

        // Teto de tamanho do corpo antes de parsear.
        const raw = await request.text();
        if (raw.length > MAX_LANDING_BYTES) {
          return jsonResp({ ok: false, error: "payload_too_large" }, 413);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let body: any;
        try {
          body = JSON.parse(raw);
        } catch {
          return jsonResp({ ok: false, error: "invalid_json" }, 400);
        }

        // Honeypot anti-spam
        if (body?.website || body?.simHp) {
          return jsonResp({ ok: true, id: null });
        }

        const parsed = parseLandingPayload(body);
        if (!parsed.ok) {
          return jsonResp({ ok: false, error: parsed.error }, 400);
        }
        const { nome, digits, row } = parsed;

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
          // duplica lead — vincula o staging ao lead existente. Falha no RPC
          // NUNCA descarta o lead: loga e segue criando um novo.
          const { data: dupId, error: dupErr } = await supabaseAdmin.rpc(
            "buscar_lead_por_telefone" as never,
            { _telefone: digits } as never,
          );
          if (dupErr) {
            console.error("[webhooks/landing] dedup falhou (criando lead novo):", dupErr);
          }
          const existingId = dupErr ? null : ((dupId as string | null) ?? null);

          if (existingId) {
            leadId = existingId;
            await supabaseAdmin
              .from("leads_landing" as any)
              .update({ lead_id: existingId } as any)
              .eq("id", stagingId);

            // Resgate: lead existente SEM corretor volta para a triagem —
            // um retorno quente não pode ficar órfão só por já existir.
            const { data: existente } = await supabaseAdmin
              .from("leads")
              .select("corretor_id")
              .eq("id", existingId)
              .maybeSingle();
            if (existente && !existente.corretor_id) {
              const { data: triagem } = await supabaseAdmin.rpc("triar_e_distribuir_lead", {
                _lead_id: existingId,
                _gatilho: "webhook_landing",
              });
              const res = triagem as { ok?: boolean; corretor_id?: string } | null;
              if (res?.ok && res.corretor_id) corretorId = res.corretor_id;
            }
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

        // Não expõe corretor_id na resposta pública (endpoint sem auth).
        void corretorId;
        return jsonResp({ ok: true, id: stagingId, lead_id: leadId });
      },
    },
  },
});
