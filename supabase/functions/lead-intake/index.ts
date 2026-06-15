// Lead intake — Facebook Lead Ads -> Zapier (Webhooks by Zapier) -> CRM.
//
// Fluxo: Zapier faz POST aqui com o lead do formulário do Facebook ADS.
// A função valida um secret, mapeia os campos (tolerante a nomes diferentes),
// cria o lead (origem=facebook) e DISTRIBUI automaticamente pela roleta de
// elegibilidade (distribuir_lead_elegivel). Sempre cria um lead novo.
//
// Variáveis de ambiente (Supabase -> Edge Functions -> Secrets):
//   LEAD_INTAKE_SECRET          -> segredo compartilhado com o Zapier (obrigatório)
//   SUPABASE_URL                -> injetada automaticamente
//   SUPABASE_SERVICE_ROLE_KEY   -> injetada automaticamente
//
// Config: verify_jwt = false (ver supabase/config.toml) — a autenticação é o secret.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // 1) Autenticação por secret (header x-webhook-secret ou ?secret=).
  const secret = Deno.env.get("LEAD_INTAKE_SECRET");
  const provided =
    req.headers.get("x-webhook-secret") ?? new URL(req.url).searchParams.get("secret");
  if (!secret || provided !== secret) return json({ error: "unauthorized" }, 401);

  // 2) Corpo (JSON enviado pelo Zapier).
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = body?.[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
    return null;
  };

  // 3) Mapeamento de campos (tolerante a nomes do Facebook/Zapier).
  const first = pick("first_name", "primeiro_nome");
  const last = pick("last_name", "sobrenome");
  const nome = pick("nome", "full_name", "name") ?? ([first, last].filter(Boolean).join(" ") || null);
  const telefone = pick(
    "telefone",
    "phone_number",
    "phone",
    "whatsapp",
    "celular",
    "telefone_celular",
  );
  const email = pick("email", "e-mail", "email_address");

  if (!nome && !telefone) return json({ error: "missing_nome_or_telefone" }, 422);

  const observacoes = [
    pick("form_name") ? `Formulário: ${pick("form_name")}` : null,
    pick("ad_name") ? `Anúncio: ${pick("ad_name")}` : null,
    pick("adset_name") ? `Conjunto: ${pick("adset_name")}` : null,
    pick("mensagem", "message", "observacoes")
      ? `Mensagem: ${pick("mensagem", "message", "observacoes")}`
      : null,
  ]
    .filter(Boolean)
    .join(" | ");

  // 4) Insere o lead com service role (status='novo' e defaults do schema).
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: lead, error: insertError } = await supabase
    .from("leads")
    .insert({
      nome: nome ?? "(sem nome)",
      telefone: telefone ?? "-",
      email,
      origem: "facebook",
      campanha: pick("campanha", "campaign_name", "campaign"),
      utm_source: pick("utm_source") ?? "facebook",
      utm_medium: pick("utm_medium") ?? "paid_social",
      utm_campaign: pick("utm_campaign", "campaign_name", "campaign"),
      utm_content: pick("utm_content", "ad_name"),
      observacoes: observacoes || null,
      timestamp_recebimento: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !lead) {
    console.error("lead-intake insert_failed:", insertError);
    return json({ error: "insert_failed", detail: insertError?.message }, 500);
  }

  // 5) Distribuição automática (roleta por elegibilidade). Se ninguém elegível,
  //    o lead fica 'novo' na fila — a redistribuição/distribuição cuida depois.
  let corretor_id: string | null = null;
  const { data: dist, error: distError } = await supabase.rpc("distribuir_lead_elegivel", {
    _lead_id: lead.id,
  });
  if (distError) {
    console.error("lead-intake distribute_failed:", distError);
  } else {
    corretor_id = (dist as string | null) ?? null;
  }

  return json({ ok: true, lead_id: lead.id, corretor_id, distribuido: corretor_id !== null });
});
