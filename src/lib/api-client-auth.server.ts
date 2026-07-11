import { createHash, timingSafeEqual } from "crypto";
import { checkRateLimit, jsonResponse } from "@/lib/public-api-auth";
import { legacyApiWindowIsOpen } from "@/lib/api-legacy-window";

export { legacyApiWindowIsOpen } from "@/lib/api-legacy-window";

export const API_CLIENT_SCOPES = [
  "leads:read",
  "leads:write",
  "events:write",
  "sales:read",
  "commissions:read",
  "metrics:read",
] as const;

export type ApiClientScope = (typeof API_CLIENT_SCOPES)[number];
export type ApiClientAuthMode = "client" | "legacy_read_key" | "legacy_write_key";

export type ApiClientContext = {
  clientId: string | null;
  clientName: string;
  scope: ApiClientScope;
  equipeId: string | null;
  projetoId: string | null;
  mode: ApiClientAuthMode;
};

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeHashEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function safeSecretEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function legacyContext(
  request: Request,
  scope: ApiClientScope,
  now: number,
): ApiClientContext | null {
  if (!legacyApiWindowIsOpen(now)) return null;
  const provided = request.headers.get("x-api-key") ?? "";
  const readKey = process.env.READ_API_KEY ?? "";
  const writeKey = process.env.MCP_WRITE_API_KEY ?? "";
  const isWrite = scope === "leads:write" || scope === "events:write";

  if (isWrite && writeKey && safeSecretEqual(provided, writeKey)) {
    return {
      clientId: null,
      clientName: "legado-mcp-write-key",
      scope,
      equipeId: null,
      projetoId: null,
      mode: "legacy_write_key",
    };
  }

  const allowReadKeyForWrite = process.env.PUBLIC_WRITE_ALLOW_READ_KEY === "true";
  if (readKey && safeSecretEqual(provided, readKey) && (!isWrite || allowReadKeyForWrite)) {
    return {
      clientId: null,
      clientName: "legado-read-api-key",
      scope,
      equipeId: null,
      projetoId: null,
      mode: "legacy_read_key",
    };
  }
  return null;
}

function requestIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

function auditIpHash(request: Request): string | null {
  const ip = requestIp(request);
  const salt = process.env.API_AUDIT_IP_SALT;
  return ip && salt ? sha256Hex(`${salt}:${ip}`) : null;
}

async function auditAuthentication(args: {
  request: Request;
  clientId: string | null;
  scope: ApiClientScope;
  resultado: "autorizado" | "negado" | "erro";
  status: number;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const url = new URL(args.request.url);
    const requestId = args.request.headers.get("x-request-id")?.slice(0, 128) ?? null;
    const { error } = await supabaseAdmin.from("api_cliente_auditoria").insert({
      cliente_id: args.clientId,
      escopo: args.scope,
      metodo: args.request.method.slice(0, 12),
      rota: url.pathname.slice(0, 500),
      resultado: args.resultado,
      http_status: args.status,
      ip_hash: auditIpHash(args.request),
      request_id: requestId,
    });
    if (error) console.error("[api-client-auth] falha na auditoria", error.message);
  } catch (error) {
    console.error("[api-client-auth] excecao na auditoria", error);
  }
}

/** Autentica X-API-Key, exige um escopo e retorna restricoes do cliente. */
export async function requireApiClientScope(
  request: Request,
  scope: ApiClientScope,
  now = Date.now(),
): Promise<ApiClientContext | Response> {
  const limited = checkRateLimit(request, now);
  if (limited) return limited;

  const provided = request.headers.get("x-api-key") ?? "";
  if (!provided) return jsonResponse({ error: "Unauthorized" }, 401);

  // Compatibilidade de rollout: a credencial global so e tentada dentro da
  // janela explicita. Assim a aplicacao pode entrar no ar antes do corte sem
  // transformar indisponibilidade do banco em bypass de autenticacao.
  const legacy = legacyContext(request, scope, now);
  if (legacy) {
    console.warn(
      `[api-client-auth] credencial global legada usada; escopo=${scope}; expira=${process.env.PUBLIC_API_LEGACY_UNTIL}`,
    );
    return legacy;
  }

  const providedHash = sha256Hex(provided);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: client, error } = await supabaseAdmin
      .from("api_clientes")
      .select("id,nome,segredo_hash,ativo,valido_de,valido_ate,revogado_em,equipe_id,projeto_id")
      .eq("segredo_hash", providedHash)
      .maybeSingle();

    if (error) {
      console.error("[api-client-auth] consulta de cliente falhou", error.message);
      return jsonResponse({ error: "authentication_unavailable" }, 503);
    }

    const nowIso = new Date(now).toISOString();
    const hashMatches = safeHashEqual(providedHash, client?.segredo_hash ?? "0".repeat(64));
    const credentialValid =
      client &&
      client.ativo &&
      !client.revogado_em &&
      client.valido_de <= nowIso &&
      (!client.valido_ate || client.valido_ate > nowIso) &&
      hashMatches;

    if (credentialValid) {
      const { data: granted, error: scopeError } = await supabaseAdmin
        .from("api_cliente_escopos")
        .select("escopo")
        .eq("cliente_id", client.id)
        .eq("escopo", scope)
        .maybeSingle();

      if (scopeError) {
        console.error("[api-client-auth] consulta de escopo falhou", scopeError.message);
        return jsonResponse({ error: "authentication_unavailable" }, 503);
      }
      if (!granted) {
        await auditAuthentication({
          request,
          clientId: client.id,
          scope,
          resultado: "negado",
          status: 403,
        });
        return jsonResponse({ error: "insufficient_scope", required_scope: scope }, 403);
      }

      const context: ApiClientContext = {
        clientId: client.id,
        clientName: client.nome,
        scope,
        equipeId: client.equipe_id,
        projetoId: client.projeto_id,
        mode: "client",
      };
      await Promise.all([
        supabaseAdmin.from("api_clientes").update({ last_used_at: nowIso }).eq("id", client.id),
        auditAuthentication({
          request,
          clientId: client.id,
          scope,
          resultado: "autorizado",
          status: 200,
        }),
      ]);
      return context;
    }
  } catch (error) {
    console.error("[api-client-auth] autenticacao falhou", error);
    return jsonResponse({ error: "authentication_unavailable" }, 503);
  }

  await auditAuthentication({
    request,
    clientId: null,
    scope,
    resultado: "negado",
    status: 401,
  });
  return jsonResponse({ error: "Unauthorized" }, 401);
}

export function apiClientAgent(context: ApiClientContext): string {
  return context.clientId ? `api-client:${context.clientId}` : context.clientName;
}

/** IDs de corretores permitidos quando o cliente esta limitado a uma equipe. */
export async function restrictedCorretorIds(context: ApiClientContext): Promise<string[] | null> {
  if (!context.equipeId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("equipe_id", context.equipeId);
  if (error) throw new Error(`Falha ao resolver equipe da API: ${error.message}`);
  return (data ?? []).map((profile) => profile.id);
}

/** Oculta existencia do lead quando ele fica fora das restricoes do cliente. */
export async function requireApiLeadAccess(
  context: ApiClientContext,
  leadId: string,
): Promise<Response | null> {
  if (!context.equipeId && !context.projetoId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: lead, error } = await supabaseAdmin
    .from("leads")
    .select("id,corretor_id,projeto_id")
    .eq("id", leadId)
    .maybeSingle();
  if (error) return jsonResponse({ error: "access_check_failed" }, 500);
  if (!lead) return jsonResponse({ error: "lead não encontrado" }, 404);
  if (context.projetoId && lead.projeto_id !== context.projetoId) {
    return jsonResponse({ error: "lead não encontrado" }, 404);
  }
  if (context.equipeId) {
    const allowed = await restrictedCorretorIds(context);
    if (!lead.corretor_id || !allowed?.includes(lead.corretor_id)) {
      return jsonResponse({ error: "lead não encontrado" }, 404);
    }
  }
  return null;
}
