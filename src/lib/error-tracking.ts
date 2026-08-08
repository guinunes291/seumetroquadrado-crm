// Error tracking próprio falando o protocolo do Sentry (store API) via fetch —
// sem SDK. Por quê: zero dependência nova (nada no bundle, nada no npm audit),
// e o mesmo módulo serve navegador, SSR/Workers e edge functions (Deno).
// O que se perde do SDK (breadcrumbs, tracing, source maps) não é o que a
// métrica C1 pede: C1 é "saber que quebrou em <15 min", e para isso bastam
// tipo, mensagem, stack e rota.
//
// Módulo PURO e isomórfico: quem sabe de env é o chamador
// (error-tracking.client.ts lê VITE_SENTRY_DSN; error-tracking.server.ts lê
// process.env.SENTRY_DSN em tempo de request — regra do Workers). Sem DSN,
// os chamadores são no-op.

export type TrackContext = {
  /** Como o erro foi capturado (onerror, unhandledrejection, react_error_boundary, ssr, server_fn, edge). */
  mechanism?: string;
  handled?: boolean;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  /** URL SEM query string (usar sanitizeRequestUrl) — query pode carregar secret/token. */
  request?: { url?: string; method?: string };
  /** Só o id — nunca nome/e-mail/telefone. */
  userId?: string | null;
};

export type ParsedDsn = { endpoint: string; authHeader: string };

/** DSN `https://<key>@<host>/<projectId>` → endpoint de store + auth header. */
export function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const u = new URL(dsn);
    const key = u.username;
    const projectId = u.pathname.replace(/\//g, "");
    if (!key || !projectId || !/^\d+$/.test(projectId)) return null;
    return {
      endpoint: `${u.protocol}//${u.host}/api/${projectId}/store/`,
      authHeader: `Sentry sentry_version=7, sentry_client=smq-crm/1.0, sentry_key=${key}`,
    };
  } catch {
    return null;
  }
}

/** Remove query e hash — secrets/tokens em URL nunca saem do processo (P-3 ensinou). */
export function sanitizeRequestUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.split(/[?#]/)[0] ?? url;
  }
}

const MAX_STRING = 4000;
const truncate = (value: string | undefined | null): string | undefined =>
  value == null ? undefined : value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  try {
    return new Error(JSON.stringify(error)?.slice(0, 400) ?? String(error));
  } catch {
    return new Error(String(error));
  }
}

export function buildEvent(error: unknown, ctx: TrackContext = {}, environment = "production") {
  const err = toError(error);
  return {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "javascript",
    level: "error",
    environment,
    exception: {
      values: [{ type: err.name || "Error", value: truncate(err.message) ?? "(sem mensagem)" }],
    },
    tags: {
      mechanism: ctx.mechanism ?? "manual",
      handled: String(ctx.handled ?? false),
      ...ctx.tags,
    },
    extra: { stack: truncate(err.stack), ...ctx.extra },
    ...(ctx.request ? { request: ctx.request } : {}),
    ...(ctx.userId ? { user: { id: ctx.userId } } : {}),
  };
}

export type TrackEvent = ReturnType<typeof buildEvent>;

/** Envia com timeout curto e nunca lança — rastreamento jamais piora um erro. */
export async function sendEvent(
  dsn: string,
  event: TrackEvent,
  timeoutMs = 1500,
): Promise<boolean> {
  const parsed = parseDsn(dsn);
  if (!parsed) return false;
  try {
    const res = await fetch(parsed.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sentry-Auth": parsed.authHeader },
      body: JSON.stringify(event),
      signal:
        typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    return res.ok;
  } catch {
    return false;
  }
}
