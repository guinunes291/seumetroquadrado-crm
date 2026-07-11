import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  VITRINE_TOKEN_RE,
  parsePublicVitrineProjects,
  type VitrineLinkSummary,
  type VitrinePublicEvent,
  type VitrinePublicPayload,
} from "@/lib/vitrine-publica";

export type VitrineRequestAuth = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export class VitrineRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "VitrineRequestError";
  }
}

export function hashVitrineToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createVitrineTokenPair(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashVitrineToken(token) };
}

export async function authenticateVitrineRequest(request: Request): Promise<VitrineRequestAuth> {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new VitrineRequestError(503, "auth_unavailable");

  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new VitrineRequestError(401, "unauthorized");
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) throw new VitrineRequestError(401, "unauthorized");

  const supabase = createClient<Database>(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userResult, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userResult.user) throw new VitrineRequestError(401, "unauthorized");

  const { data: active, error: activeError } = await supabase.rpc("conta_atual_ativa");
  if (activeError || !active) throw new VitrineRequestError(403, "account_inactive");

  return { supabase, userId: userResult.user.id };
}

export async function createSecureVitrineLink(args: {
  auth: VitrineRequestAuth;
  leadId: string;
  projectIds: string[];
  expiresInDays: number;
}): Promise<{ id: string; path: string; expiresAt: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { token, tokenHash } = createVitrineTokenPair();
  const expiresAt = new Date(Date.now() + args.expiresInDays * 86_400_000).toISOString();
  const { data, error } = await supabaseAdmin.rpc("criar_vitrine_link", {
    _ator_id: args.auth.userId,
    _lead_id: args.leadId,
    _token_hash: tokenHash,
    _projeto_ids: args.projectIds,
    _expira_em: expiresAt,
  });
  if (error || !data) {
    if (error?.code === "42501") throw new VitrineRequestError(403, "forbidden");
    if (error?.code === "22023") throw new VitrineRequestError(422, "invalid_input");
    throw new VitrineRequestError(500, "create_failed");
  }

  // O fragmento não é enviado ao servidor em requests HTTP e, portanto, não
  // aparece em access logs. A página o remove da barra após guardá-lo na sessão.
  return { id: data, path: `/vitrine-publica#${token}`, expiresAt };
}

const linkProject = (value: unknown): { id: string; name: string; order: number } | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.nome !== "string") return null;
  const order = Number(row.ordem);
  if (!Number.isInteger(order) || order < 1 || order > 3) return null;
  return { id: row.id, name: row.nome, order };
};

export async function listSecureVitrineLinks(
  auth: VitrineRequestAuth,
  leadId: string,
): Promise<VitrineLinkSummary[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("listar_vitrine_links", {
    _ator_id: auth.userId,
    _lead_id: leadId,
  });
  if (error) {
    if (error.code === "42501") throw new VitrineRequestError(403, "forbidden");
    throw new VitrineRequestError(500, "list_failed");
  }

  return (data ?? []).map((row) => {
    const rawProjects = Array.isArray(row.projetos) ? row.projetos : [];
    return {
      id: row.id,
      expires_at: row.expira_em,
      revoked_at: row.revogado_em,
      created_at: row.created_at,
      projects: rawProjects.map(linkProject).filter((item) => item !== null),
    };
  });
}

export async function revokeSecureVitrineLink(
  auth: VitrineRequestAuth,
  linkId: string,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("revogar_vitrine_link", {
    _ator_id: auth.userId,
    _link_id: linkId,
  });
  if (error) throw new VitrineRequestError(500, "revoke_failed");
  if (!data) throw new VitrineRequestError(404, "not_found");
}

function requireValidRawToken(token: string): string {
  if (!VITRINE_TOKEN_RE.test(token)) throw new VitrineRequestError(404, "not_found");
  return hashVitrineToken(token);
}

export async function loadPublicVitrine(token: string): Promise<VitrinePublicPayload> {
  const tokenHash = requireValidRawToken(token);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("obter_vitrine_publica", {
    _token_hash: tokenHash,
  });
  const row = data?.[0];
  if (error) throw new VitrineRequestError(503, "load_unavailable");
  if (!row) throw new VitrineRequestError(404, "not_found");

  try {
    const allowedHosts = (process.env.VITRINE_PUBLIC_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    return {
      expires_at: row.expira_em,
      projects: parsePublicVitrineProjects(row.projetos, allowedHosts),
    };
  } catch {
    throw new VitrineRequestError(503, "payload_unavailable");
  }
}

/** Reserva distribuída antes de qualquer leitura ou evento público. */
export async function consumePublicVitrineRequest(token: string): Promise<void> {
  const tokenHash = requireValidRawToken(token);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("consumir_vitrine_requisicao", {
    _token_hash: tokenHash,
  });
  if (error) throw new VitrineRequestError(503, "limit_unavailable");
  if (data === "not_found") throw new VitrineRequestError(404, "not_found");
  if (data === "exhausted") {
    throw new VitrineRequestError(410, "exhausted");
  }
  if (data === "rate_limited") {
    throw new VitrineRequestError(429, "rate_limited");
  }
  if (data !== "allowed") throw new VitrineRequestError(500, "limit_failed");
}

export async function recordPublicVitrineEvent(
  token: string,
  event: VitrinePublicEvent | { type: "opened" },
  idempotencyKey: string,
): Promise<void> {
  const tokenHash = requireValidRawToken(token);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const type =
    event.type === "opened"
      ? "abertura"
      : event.type === "project_viewed"
        ? "projeto_visto"
        : "cta_clicado";
  const cta =
    event.type !== "cta_clicked"
      ? null
      : event.cta === "price_table"
        ? "tabela_precos"
        : event.cta === "contact"
          ? "contato"
          : "book";
  const { data, error } = await supabaseAdmin.rpc("registrar_vitrine_evento", {
    _token_hash: tokenHash,
    _idempotency_key: idempotencyKey,
    _tipo: type,
    _projeto_id: event.type === "opened" ? null : event.project_id,
    _cta_tipo: cta,
  });
  if (error) throw new VitrineRequestError(503, "event_unavailable");
  if (!data) throw new VitrineRequestError(404, "not_found");
}
