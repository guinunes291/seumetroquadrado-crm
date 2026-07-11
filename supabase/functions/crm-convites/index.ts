import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json", "cache-control": "no-store" },
  });
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const papeis = new Set(["admin", "superintendente", "gestor", "corretor"]);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("authorization") ?? "";
  if (!url || !publishableKey || !serviceKey) return response({ error: "server_config" }, 503);
  if (!authorization.startsWith("Bearer ")) return response({ error: "unauthorized" }, 401);

  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return response({ error: "unauthorized" }, 401);
  const [{ data: active }, { data: roleRows, error: rolesError }] = await Promise.all([
    userClient.rpc("conta_atual_ativa"),
    userClient.from("user_roles").select("role").eq("user_id", userData.user.id),
  ]);
  if (!active || rolesError) return response({ error: "account_inactive" }, 403);
  const roles = new Set((roleRows ?? []).map((row) => row.role as string));

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return response({ error: "invalid_json" }, 400);
  }

  if (body.acao === "definir_status") {
    if (!roles.has("admin") && !roles.has("superintendente")) {
      return response({ error: "forbidden" }, 403);
    }
    const usuarioId = String(body.usuario_id ?? "");
    const status = String(body.status ?? "");
    if (!uuid.test(usuarioId) || !["ativa", "bloqueada", "pendente"].includes(status)) {
      return response({ error: "invalid_input" }, 422);
    }
    const { error } = await admin.rpc("definir_status_conta", {
      _autor_id: userData.user.id,
      _status: status,
      _usuario_id: usuarioId,
    });
    if (error) {
      console.error("[crm-convites] status", error.message);
      return response({ error: "status_update_failed" }, error.code === "23514" ? 409 : 500);
    }
    return response({ ok: true });
  }

  if (body.acao !== "convidar") return response({ error: "invalid_action" }, 422);
  if (!roles.has("admin") && !roles.has("superintendente") && !roles.has("gestor")) {
    return response({ error: "forbidden" }, 403);
  }

  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const papel = String(body.papel ?? "corretor");
  const equipeId = body.equipe_id == null ? null : String(body.equipe_id);
  const validadeDias = Math.min(Math.max(Number(body.validade_dias) || 7, 1), 30);
  if (!emailPattern.test(email) || email.length > 254 || !papeis.has(papel)) {
    return response({ error: "invalid_input" }, 422);
  }
  if (equipeId !== null && !uuid.test(equipeId)) return response({ error: "invalid_team" }, 422);

  // O INSERT usa o cliente do autor e, portanto, as próprias policies limitam
  // gestor a corretor da sua equipe. O service_role nunca escolhe esse escopo.
  const expiraEm = new Date(Date.now() + validadeDias * 86_400_000).toISOString();
  const { data: convite, error: conviteError } = await userClient
    .from("convites_crm")
    .insert({ email, papel, equipe_id: equipeId, expira_em: expiraEm })
    .select("id")
    .single();
  if (conviteError || !convite) {
    console.error("[crm-convites] insert", conviteError?.message);
    return response(
      { error: conviteError?.code === "23505" ? "invite_already_pending" : "invite_failed" },
      conviteError?.code === "23505" ? 409 : 403,
    );
  }

  const appUrl = (Deno.env.get("CRM_APP_URL") ?? Deno.env.get("APP_BASE_URL") ?? "").replace(
    /\/$/,
    "",
  );
  const inviteResult = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: appUrl ? `${appUrl}/auth` : undefined,
  });

  // Também consome o convite quando o e-mail já corresponde a uma conta
  // pendente criada antes do modo invite-only.
  const { data: activatedUserId, error: activationError } = await admin.rpc(
    "ativar_convite_por_email",
    { _convite_id: convite.id },
  );
  if (activationError) {
    console.error("[crm-convites] activation", activationError.message);
  }

  if (inviteResult.error && !activatedUserId) {
    await admin.from("convites_crm").delete().eq("id", convite.id);
    console.error("[crm-convites] invite email", inviteResult.error.message);
    return response({ error: "invite_delivery_failed" }, 502);
  }

  return response({
    ok: true,
    convite_id: convite.id,
    conta_existente: Boolean(activatedUserId && inviteResult.error),
  });
});
