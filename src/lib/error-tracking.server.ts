// Rastreamento de erro no SERVIDOR (SSR/Workers e server functions).
// Gated: sem SENTRY_DSN é no-op. O env é lido DENTRO da chamada — no
// Cloudflare Workers process.env só liga em tempo de request (regra
// documentada em config.server.ts); leitura em escopo de módulo daria
// undefined para sempre.
//
// O envio é aguardado (com timeout curto do sendEvent): promessa solta depois
// da resposta pode ser cancelada pelo Workers, e este código só roda no
// caminho de ERRO — latência extra ali é aceitável, perder o evento não.

import { buildEvent, sendEvent, sanitizeRequestUrl, type TrackContext } from "./error-tracking";

export async function captureServerError(
  error: unknown,
  ctx: { mechanism: string; request?: Request; extra?: TrackContext["extra"] },
): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const event = buildEvent(
    error,
    {
      mechanism: ctx.mechanism,
      handled: false,
      extra: ctx.extra,
      request: ctx.request
        ? { url: sanitizeRequestUrl(ctx.request.url), method: ctx.request.method }
        : undefined,
    },
    process.env.SENTRY_ENVIRONMENT ?? "production",
  );
  await sendEvent(dsn, event);
}
