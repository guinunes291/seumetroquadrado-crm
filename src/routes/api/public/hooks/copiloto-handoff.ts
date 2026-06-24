// POST /api/public/hooks/copiloto-handoff
// Disparado pelo trigger Postgres (pg_net) quando um lead entra em estado COM_CORRETOR.
// Monta o payload completo, faz POST no n8n (com retry/backoff) e grava em copiloto_eventos.
// Idempotente: só dispara se copiloto_notificado_em estiver NULL.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

const BodySchema = z.object({ lead_id: z.string().uuid() });

const N8N_URL =
  process.env.N8N_COPILOTO_URL ??
  "https://guilhermenunessmq.app.n8n.cloud/webhook/copiloto/handoff";

function onlyDigitsE164(input?: string | null): string {
  if (!input) return "";
  const d = input.replace(/\D/g, "");
  if (!d) return "";
  // Garante DDI 55
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

function maskPhone(p: string): string {
  if (!p) return "";
  return p.length > 4 ? `${p.slice(0, 4)}****${p.slice(-2)}` : "****";
}

function parseRendaNumber(r?: string | null): string {
  if (!r) return "";
  const m = r.match(/\d+(?:[.,]\d+)?/g);
  if (!m) return "";
  return m[0].replace(/\./g, "").replace(",", ".");
}

function safeEq(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

async function postN8N(
  payload: Record<string, unknown>,
  secret: string,
): Promise<{ status: number; body: string; ok: boolean }> {
  const res = await fetch(N8N_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-SMQ-Secret": secret,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.text().catch(() => "");
  return { status: res.status, body: body.slice(0, 2000), ok: res.ok };
}

export const Route = createFileRoute("/api/public/hooks/copiloto-handoff")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SMQ_WEBHOOK_SECRET;
        if (!expected) return new Response("server missing secret", { status: 500 });

        const provided = request.headers.get("x-smq-secret") ?? "";
        if (!safeEq(provided, expected)) return new Response("unauthorized", { status: 401 });

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("invalid json", { status: 400 });
        }
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) return new Response("invalid body", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Carrega lead + corretor + projeto + alternativa
        const { data: lead, error: leadErr } = await supabaseAdmin
          .from("leads")
          .select(
            "id, nome, telefone, temperatura, status, etapa, estado, motivo_handoff, " +
              "renda_informada, usa_fgts, entrada_disponivel, observacoes, " +
              "corretor_id, projeto_id, projeto_nome, copiloto_notificado_em",
          )
          .eq("id", parsed.data.lead_id)
          .maybeSingle();
        if (leadErr || !lead) return new Response("lead not found", { status: 404 });

        // Idempotência
        if (lead.copiloto_notificado_em) {
          return Response.json({ ok: true, already_notified: true });
        }

        const [{ data: corretor }, { data: projeto }] = await Promise.all([
          lead.corretor_id
            ? supabaseAdmin
                .from("profiles")
                .select("id, nome, telefone, ativo")
                .eq("id", lead.corretor_id)
                .maybeSingle()
            : Promise.resolve({ data: null as { id: string; nome: string | null; telefone: string | null; ativo: boolean | null } | null }),
          lead.projeto_id
            ? supabaseAdmin
                .from("projetos")
                .select("id, nome, preco_a_partir, zona_smq, bairro, ano_entrega, mes_entrega")
                .eq("id", lead.projeto_id)
                .maybeSingle()
            : Promise.resolve({ data: null as { id: string; nome: string; preco_a_partir: number | null; zona_smq: string | null; bairro: string | null; ano_entrega: number | null; mes_entrega: number | null } | null }),
        ]);

        let alt: { alternativa_nome: string | null; alternativa_bairro: string | null; alternativa_preco: number | null } | null = null;
        if (projeto?.id) {
          const { data } = await supabaseAdmin
            .from("projetos_alternativa_regiao")
            .select("alternativa_nome, alternativa_bairro, alternativa_preco")
            .eq("projeto_id", projeto.id)
            .maybeSingle();
          alt = data;
        }

        const previsao =
          projeto?.ano_entrega
            ? `${projeto.mes_entrega ? String(projeto.mes_entrega).padStart(2, "0") + "/" : ""}${projeto.ano_entrega}`
            : "";

        const fields = {
          nome: lead.nome ?? "",
          telefone: onlyDigitsE164(lead.telefone),
          temperatura: (lead.temperatura ?? "").toString().toUpperCase(),
          objetivo: "",
          renda_familiar: parseRendaNumber(lead.renda_informada),
          faixa_renda: "",
          regiao: projeto?.zona_smq ?? "",
          empreendimento_id: projeto?.id ?? "",
          empreendimento_nome: projeto?.nome ?? lead.projeto_nome ?? "",
          preco_por: projeto?.preco_a_partir != null ? String(projeto.preco_a_partir) : "",
          faixa_mcmv: "",
          previsao_entrega: previsao,
          alternativa_emp: alt?.alternativa_nome
            ? `${alt.alternativa_nome}${alt.alternativa_bairro ? ` (${alt.alternativa_bairro})` : ""}`
            : "",
          alternativa_preco: alt?.alternativa_preco != null ? String(alt.alternativa_preco) : "",
          motivo: lead.motivo_handoff ?? "",
          estado_civil: "",
          tipo_renda: "",
          fgts: lead.entrada_disponivel ?? (lead.usa_fgts ? "sim" : ""),
          resumo: (lead.observacoes ?? "").slice(0, 4000),
          corretor_nome: corretor?.nome ?? "",
          corretor_telefone: onlyDigitsE164(corretor?.telefone),
        };

        const dadosIncompletos =
          !fields.telefone || !fields.corretor_telefone || !fields.empreendimento_nome;
        const payload = dadosIncompletos ? { ...fields, dados_incompletos: true } : fields;

        // Retry 3x com backoff
        let lastStatus = 0;
        let lastBody = "";
        let lastErr = "";
        let ok = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const r = await postN8N(payload, expected);
            lastStatus = r.status;
            lastBody = r.body;
            ok = r.ok;
            await supabaseAdmin.from("copiloto_eventos").insert({
              lead_id: lead.id,
              payload: { ...payload, telefone: maskPhone(payload.telefone), corretor_telefone: maskPhone(payload.corretor_telefone) },
              status_http: r.status,
              resposta: r.body,
              tentativa: attempt,
              sucesso: r.ok,
            });
            if (r.ok) break;
          } catch (e) {
            lastErr = e instanceof Error ? e.message : String(e);
            await supabaseAdmin.from("copiloto_eventos").insert({
              lead_id: lead.id,
              payload: { ...payload, telefone: maskPhone(payload.telefone), corretor_telefone: maskPhone(payload.corretor_telefone) },
              status_http: null,
              resposta: lastErr,
              tentativa: attempt,
              sucesso: false,
            });
          }
          if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * attempt));
        }

        if (ok) {
          await supabaseAdmin
            .from("leads")
            .update({ copiloto_notificado_em: new Date().toISOString() })
            .eq("id", lead.id);
          return Response.json({ ok: true });
        }
        return Response.json(
          { ok: false, last_status: lastStatus, last_body: lastBody, last_error: lastErr },
          { status: 502 },
        );
      },
    },
  },
});
