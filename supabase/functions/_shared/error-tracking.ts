// Rastreamento de erro das EDGE FUNCTIONS (Deno) — protocolo Sentry via fetch,
// sem SDK, espelho de src/lib/error-tracking.ts (as functions não conseguem
// importar de src/). Gated: sem SENTRY_DSN nos secrets da função é no-op.
//
// Uso: envolver o handler —
//   Deno.serve((req) => comCapturaDeErro("minha-fn", () => handle(req)));
// Falha de rastreamento nunca piora o erro original (try/catch interno).

export function parseDsn(dsn: string): { endpoint: string; authHeader: string } | null {
  try {
    const u = new URL(dsn);
    const key = u.username;
    const projectId = u.pathname.replace(/\//g, "");
    if (!key || !projectId || !/^\d+$/.test(projectId)) return null;
    return {
      endpoint: `${u.protocol}//${u.host}/api/${projectId}/store/`,
      authHeader: `Sentry sentry_version=7, sentry_client=smq-edge/1.0, sentry_key=${key}`,
    };
  } catch {
    return null;
  }
}

export async function reportEdgeError(error: unknown, funcao: string): Promise<void> {
  try {
    const dsn = Deno.env.get("SENTRY_DSN");
    if (!dsn) return;
    const parsed = parseDsn(dsn);
    if (!parsed) return;
    const err = error instanceof Error ? error : new Error(String(error));
    await fetch(parsed.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sentry-Auth": parsed.authHeader },
      body: JSON.stringify({
        event_id: crypto.randomUUID().replace(/-/g, ""),
        timestamp: new Date().toISOString(),
        platform: "javascript",
        level: "error",
        environment: Deno.env.get("SENTRY_ENVIRONMENT") ?? "production",
        exception: { values: [{ type: err.name || "Error", value: err.message.slice(0, 4000) }] },
        tags: { mechanism: "edge", funcao, handled: "false" },
        extra: { stack: err.stack?.slice(0, 4000) },
      }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // nunca propagar falha do rastreador
  }
}

/** Envelopa o handler: exceção não tratada é reportada e vira 500 JSON limpo. */
export async function comCapturaDeErro(
  funcao: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    console.error(`[${funcao}] erro não tratado:`, error);
    await reportEdgeError(error, funcao);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
