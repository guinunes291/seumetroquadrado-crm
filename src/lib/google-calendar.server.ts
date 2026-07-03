// Google Calendar (Fase B) — lado servidor: OAuth 2.0 e sincronização one-way
// (CRM → Google) dos agendamentos para a agenda do corretor responsável.
//
// Feature-flag: tudo é no-op amigável quando GOOGLE_CLIENT_ID/SECRET não estão
// configurados, então o CRM funciona igual sem credenciais.
//
// IMPORTANTE: importe este módulo apenas via import() dinâmico dentro de
// handlers/server functions (padrão do projeto para código .server.ts).

import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const SCOPES = "https://www.googleapis.com/auth/calendar.events openid email";
const STATE_TTL_MS = 10 * 60_000;

export function isGoogleCalendarConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

function stateSecret(): string {
  // Reusa um secret já presente no ambiente para assinar o state do OAuth.
  const s = process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("Sem secret disponível para assinar o state do OAuth");
  return s;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

/** state = base64url(userId|exp|hmac) — evita CSRF e dispensa sessão no callback. */
export function buildOAuthState(userId: string): string {
  const exp = Date.now() + STATE_TTL_MS;
  const payload = `${userId}|${exp}`;
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return b64url(`${payload}|${sig}`);
}

export function verifyOAuthState(state: string): string | null {
  try {
    const [userId, expStr, sig] = Buffer.from(state, "base64url").toString().split("|");
    if (!userId || !expStr || !sig) return null;
    if (Number(expStr) < Date.now()) return null;
    const expected = createHmac("sha256", stateSecret())
      .update(`${userId}|${expStr}`)
      .digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return userId;
  } catch {
    return null;
  }
}

export function redirectUri(origin: string): string {
  return process.env.GOOGLE_OAUTH_REDIRECT_URI || `${origin}/api/google/oauth/callback`;
}

export function buildConsentUrl(userId: string, origin: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state: buildOAuthState(userId),
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...body,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google token endpoint ${res.status}: ${txt.slice(0, 300)}`);
  }
  return (await res.json()) as TokenResponse;
}

/** Extrai o e-mail do id_token (JWT vindo direto do Google via TLS). */
function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

/** Troca o code por tokens e persiste a conexão do usuário (service-role). */
export async function completeOAuth(userId: string, code: string, origin: string): Promise<void> {
  const tok = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(origin),
  });
  if (!tok.refresh_token) {
    throw new Error("Google não retornou refresh_token — remova o acesso do app na conta Google e tente de novo");
  }
  const { error } = await supabaseAdmin
    .from("google_calendar_connections" as never)
    .upsert({
      user_id: userId,
      refresh_token: tok.refresh_token,
      access_token: tok.access_token,
      access_token_expira_em: new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString(),
      google_email: emailFromIdToken(tok.id_token),
      sync_enabled: true,
      updated_at: new Date().toISOString(),
    } as never);
  if (error) throw new Error(error.message);
}

type Connection = {
  user_id: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expira_em: string | null;
  calendar_id: string;
  google_email: string | null;
  sync_enabled: boolean;
};

async function getConnection(userId: string): Promise<Connection | null> {
  const { data, error } = await supabaseAdmin
    .from("google_calendar_connections" as never)
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as Connection) ?? null;
}

async function getValidAccessToken(conn: Connection): Promise<string> {
  const validUntil = conn.access_token_expira_em ? Date.parse(conn.access_token_expira_em) : 0;
  if (conn.access_token && validUntil > Date.now()) return conn.access_token;

  const tok = await tokenRequest({ grant_type: "refresh_token", refresh_token: conn.refresh_token });
  await supabaseAdmin
    .from("google_calendar_connections" as never)
    .update({
      access_token: tok.access_token,
      access_token_expira_em: new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("user_id", conn.user_id);
  return tok.access_token;
}

type AgendamentoRow = {
  id: string;
  corretor_id: string;
  lead_id: string | null;
  titulo: string;
  descricao: string | null;
  local: string | null;
  tipo: string;
  status: string;
  data_inicio: string;
  data_fim: string;
  timezone: string | null;
  google_event_id: string | null;
  deleted_at: string | null;
};

export type SyncResult = { synced: boolean; reason?: string };

/**
 * Espelha o agendamento na agenda Google do corretor responsável.
 * Cria/atualiza o evento; cancelamentos e lixeira removem o evento.
 * Nunca lança para o chamador de UI — retorna {synced:false, reason}.
 */
export async function syncAgendamento(agendamentoId: string): Promise<SyncResult> {
  if (!isGoogleCalendarConfigured()) return { synced: false, reason: "não configurado" };

  const { data, error } = await supabaseAdmin
    .from("agendamentos")
    .select(
      "id, corretor_id, lead_id, titulo, descricao, local, tipo, status, data_inicio, data_fim, timezone, google_event_id, deleted_at",
    )
    .eq("id", agendamentoId)
    .maybeSingle();
  if (error) return { synced: false, reason: error.message };
  const ag = data as unknown as AgendamentoRow | null;
  if (!ag) return { synced: false, reason: "agendamento não encontrado" };

  const conn = await getConnection(ag.corretor_id).catch(() => null);
  if (!conn || !conn.sync_enabled) return { synced: false, reason: "corretor sem Google conectado" };

  try {
    const token = await getValidAccessToken(conn);
    const calId = encodeURIComponent(conn.calendar_id || "primary");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    const remover = ag.status === "cancelado" || !!ag.deleted_at;
    if (remover) {
      if (ag.google_event_id) {
        await fetch(`${CALENDAR_API}/calendars/${calId}/events/${ag.google_event_id}`, {
          method: "DELETE",
          headers,
        });
        await supabaseAdmin
          .from("agendamentos")
          .update({ google_event_id: null } as never)
          .eq("id", ag.id);
      }
      return { synced: true };
    }

    let leadInfo = "";
    if (ag.lead_id) {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("nome, telefone")
        .eq("id", ag.lead_id)
        .maybeSingle();
      if (lead) leadInfo = `Lead: ${lead.nome}${lead.telefone ? ` (${lead.telefone})` : ""}\n`;
    }

    const tz = ag.timezone || "America/Sao_Paulo";
    const body = JSON.stringify({
      summary: ag.titulo,
      description: `${leadInfo}${ag.descricao ?? ""}`.trim() || undefined,
      location: ag.local || undefined,
      start: { dateTime: ag.data_inicio, timeZone: tz },
      end: { dateTime: ag.data_fim, timeZone: tz },
      source: { title: "CRM Seu Metro Quadrado", url: `${process.env.APP_ORIGIN ?? ""}/agendamentos` },
    });

    let res: Response;
    if (ag.google_event_id) {
      res = await fetch(`${CALENDAR_API}/calendars/${calId}/events/${ag.google_event_id}`, {
        method: "PATCH",
        headers,
        body,
      });
      // Evento apagado manualmente no Google → recria.
      if (res.status === 404 || res.status === 410) {
        res = await fetch(`${CALENDAR_API}/calendars/${calId}/events`, { method: "POST", headers, body });
      }
    } else {
      res = await fetch(`${CALENDAR_API}/calendars/${calId}/events`, { method: "POST", headers, body });
    }
    if (!res.ok) {
      const txt = await res.text();
      return { synced: false, reason: `Google Calendar ${res.status}: ${txt.slice(0, 200)}` };
    }
    const ev = (await res.json()) as { id?: string };
    if (ev.id && ev.id !== ag.google_event_id) {
      await supabaseAdmin
        .from("agendamentos")
        .update({ google_event_id: ev.id } as never)
        .eq("id", ag.id);
    }
    return { synced: true };
  } catch (e) {
    return { synced: false, reason: e instanceof Error ? e.message : "erro desconhecido" };
  }
}
