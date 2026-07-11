// Notifica via WhatsApp (Z-API) o corretor quando um lead com origem=facebook
// é transferido manualmente. Requer JWT (verify_jwt default = true).
//
// Body: { lead_id: string, corretor_id: string }
//
// Secrets reutilizadas: ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN, APP_BASE_URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function toZapiPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  if (d.length <= 11) d = "55" + d;
  return d;
}

async function sendZapi(opts: {
  telefone: string | null | undefined;
  nomeLead: string;
  projeto: string | null;
  renda: string | null;
  link: string;
}): Promise<string> {
  const instance = Deno.env.get("ZAPI_INSTANCE_ID");
  const token = Deno.env.get("ZAPI_TOKEN");
  const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");
  if (!instance || !token) return "zapi_nao_configurada";
  const phone = toZapiPhone(opts.telefone);
  if (!phone) return "sem_telefone";
  const message =
    `🔔 *Lead transferido para você!*\n\n` +
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
    const respBody = await resp.text();
    if (!resp.ok) return `falhou_${resp.status}: ${respBody.slice(0, 200)}`;
    return "enviada";
  } catch (e) {
    return `erro: ${e instanceof Error ? e.message : String(e)}`;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Exige a identidade do chamador. A leitura do lead passa pela RLS deste
  // usuário — sem service_role, sem bypass —, então só é possível notificar
  // sobre leads da própria carteira. Isso fecha o IDOR/vazamento de PII sem
  // exigir papel fixo, preservando o fluxo de roleta (o corretor vira dono do
  // lead antes de a notificação disparar).
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  let body: { lead_id?: string; corretor_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const leadId = body.lead_id;
  const corretorId = body.corretor_id;
  if (!leadId || !corretorId) return json({ error: "missing_params" }, 400);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) return json({ error: "server_config" }, 503);

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: "unauthorized" }, 401);

  const { data: contaAtiva, error: contaError } = await supabase.rpc("conta_atual_ativa");
  if (contaError || !contaAtiva) return json({ error: "account_inactive" }, 403);

  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, nome, origem, projeto_nome, renda_informada")
    .eq("id", leadId)
    .maybeSingle();

  // Lead fora da carteira volta vazio pela RLS — indistinguível de inexistente,
  // então não vaza a existência de leads de outras carteiras.
  if (leadErr || !lead) return json({ error: "lead_not_found" }, 404);
  if (lead.origem !== "facebook") {
    return json({ ok: true, skipped: "origem_nao_facebook" });
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("nome,telefone")
    .eq("id", corretorId)
    .maybeSingle();

  const appUrl = (Deno.env.get("APP_BASE_URL") ?? "").replace(/\/+$/, "");
  const notificacao = await sendZapi({
    telefone: prof?.telefone as string | null | undefined,
    nomeLead: (lead.nome as string | null) ?? "(sem nome)",
    projeto: (lead.projeto_nome as string | null) ?? null,
    renda: (lead.renda_informada as string | null) ?? null,
    link: appUrl ? `${appUrl}/leads/${lead.id}` : `/leads/${lead.id}`,
  });

  return json({ ok: true, notificacao });
});
