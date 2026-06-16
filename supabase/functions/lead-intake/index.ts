// Lead intake — Facebook Lead Ads -> Zapier (Webhooks by Zapier) -> CRM.
//
// Fluxo: Zapier faz POST aqui com o lead do formulário do Facebook ADS.
//  1) valida o secret (header x-webhook-secret == LEAD_INTAKE_SECRET);
//  2) resolve o PROJETO (cada Zap manda 'projeto' = slug/nome, ou 'projeto_token'
//     = webhook_token do projeto) -> grava projeto_id + projeto_nome no lead;
//  3) cria o lead (origem=facebook) — sempre cria novo;
//  4) DISTRIBUI em RODÍZIO PURO (distribuir_lead: roleta por posição, sem exigir
//     presença/elegibilidade);
//  5) notifica o corretor via Z-API no WhatsApp, SEM o telefone do lead
//     (apenas nome, projeto, faixa de renda e link do lead no CRM).
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   LEAD_INTAKE_SECRET          (obrigatório) — segredo compartilhado com o Zapier
//   ZAPI_INSTANCE_ID, ZAPI_TOKEN (p/ notificação) — credenciais do Z-API
//   ZAPI_CLIENT_TOKEN           (se a conta Z-API exigir Client-Token)
//   APP_BASE_URL                — URL pública do app (p/ o link do lead)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — injetadas automaticamente
//
// config: verify_jwt = false (supabase/config.toml).

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

// Normaliza telefone BR para o formato do Z-API: DDI(55) + DDD + número, só dígitos.
function toZapiPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  if (d.length <= 11) d = "55" + d; // sem DDI -> assume Brasil
  return d;
}

// Envia o WhatsApp ao corretor (sem o telefone do lead). Falha não derruba o intake.
async function notificarCorretor(opts: {
  telefone: string | null | undefined;
  nomeLead: string;
  projeto: string | null;
  renda: string | null;
  link: string;
}): Promise<void> {
  const instance = Deno.env.get("ZAPI_INSTANCE_ID");
  const token = Deno.env.get("ZAPI_TOKEN");
  const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");
  if (!instance || !token) {
    console.log("Z-API não configurada (ZAPI_INSTANCE_ID/ZAPI_TOKEN) — pulando notificação.");
    return;
  }
  const phone = toZapiPhone(opts.telefone);
  if (!phone) {
    console.log("Corretor sem telefone válido — pulando notificação.");
    return;
  }
  const message =
    `🔔 *Novo lead recebido!*\n\n` +
    `👤 Nome: ${opts.nomeLead}\n` +
    `🏢 Projeto: ${opts.projeto ?? "—"}\n` +
    `💰 Faixa de renda: ${opts.renda ?? "—"}\n\n` +
    `🔗 Abrir no CRM: ${opts.link}`;
  try {
    const resp = await fetch(
      `https://api.z-api.io/instances/${instance}/token/${token}/send-text`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(clientToken ? { "Client-Token": clientToken } : {}),
        },
        body: JSON.stringify({ phone, message }),
      },
    );
    if (!resp.ok) console.error("Z-API falhou:", resp.status, await resp.text());
  } catch (e) {
    console.error("Z-API erro:", e);
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // 1) Autenticação por secret.
  const secret = Deno.env.get("LEAD_INTAKE_SECRET");
  const provided =
    req.headers.get("x-webhook-secret") ?? new URL(req.url).searchParams.get("secret");
  if (!secret || provided !== secret) return json({ error: "unauthorized" }, 401);

  // 2) Corpo.
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

  // Campos do lead (tolerante a nomes do Facebook/Zapier).
  const first = pick("first_name", "primeiro_nome");
  const last = pick("last_name", "sobrenome");
  const nome = pick("nome", "full_name", "name") ?? ([first, last].filter(Boolean).join(" ") || null);
  const telefone = pick("telefone", "phone_number", "phone", "whatsapp", "celular");
  const email = pick("email", "e-mail", "email_address");
  const renda = pick("renda_informada", "renda", "faixa_renda", "faixa_de_renda", "income");
  const projetoRef = pick("projeto", "projeto_slug", "project", "empreendimento");
  const projetoToken = pick("projeto_token", "webhook_token");

  if (!nome && !telefone) return json({ error: "missing_nome_or_telefone" }, 422);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // 3) Resolve o projeto (token > slug > nome). Guarda o texto recebido como
  //    fallback em projeto_nome para nada se perder.
  let projeto_id: string | null = null;
  let projeto_nome: string | null = projetoRef;
  if (projetoToken) {
    const { data } = await supabase
      .from("projetos")
      .select("id,nome")
      .eq("webhook_token", projetoToken)
      .maybeSingle();
    if (data) {
      projeto_id = data.id as string;
      projeto_nome = data.nome as string;
    }
  }
  if (!projeto_id && projetoRef) {
    let { data } = await supabase
      .from("projetos")
      .select("id,nome")
      .eq("slug", projetoRef)
      .maybeSingle();
    if (!data) {
      ({ data } = await supabase
        .from("projetos")
        .select("id,nome")
        .ilike("nome", projetoRef)
        .maybeSingle());
    }
    if (data) {
      projeto_id = data.id as string;
      projeto_nome = data.nome as string;
    }
  }

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

  // 4) Cria o lead.
  const { data: lead, error: insertError } = await supabase
    .from("leads")
    .insert({
      nome: nome ?? "(sem nome)",
      telefone: telefone ?? "-",
      email,
      origem: "facebook",
      projeto_id,
      projeto_nome,
      renda_informada: renda,
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

  // 5) Distribuição em RODÍZIO PURO (sem exigir presença/elegibilidade).
  let corretor_id: string | null = null;
  const { data: dist, error: distError } = await supabase.rpc("distribuir_lead", {
    _lead_id: lead.id,
  });
  if (distError) {
    console.error("lead-intake distribute_failed:", distError);
  } else {
    corretor_id = (dist as string | null) ?? null;
  }

  // 6) Notifica o corretor (Z-API), sem o telefone do lead.
  if (corretor_id) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("nome,telefone")
      .eq("id", corretor_id)
      .maybeSingle();
    const appUrl = (Deno.env.get("APP_BASE_URL") ?? "").replace(/\/+$/, "");
    await notificarCorretor({
      telefone: prof?.telefone as string | null | undefined,
      nomeLead: nome ?? "(sem nome)",
      projeto: projeto_nome,
      renda,
      link: appUrl ? `${appUrl}/leads/${lead.id}` : `/leads/${lead.id}`,
    });
  }

  return json({
    ok: true,
    lead_id: lead.id,
    projeto_id,
    corretor_id,
    distribuido: corretor_id !== null,
  });
});
