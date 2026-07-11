import { timingSafeEqual } from "crypto";

export type PushDispatchAuthResult = "authorized" | "unauthorized" | "misconfigured";

function safeEqual(a: string, b: string): boolean {
  const provided = Buffer.from(a);
  const expected = Buffer.from(b);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/**
 * Autentica o cron de push exclusivamente com um segredo dedicado.
 *
 * Chaves anon/publishable são públicas e, portanto, nunca são aceitas como
 * credencial de dispatcher. A ausência do segredo é distinguida de uma
 * credencial inválida para que o handler reporte erro de configuração (500),
 * em vez de mascará-lo como falha do cliente (401).
 */
export function checkPushDispatchAuth(
  request: Request,
  expectedSecret: string | undefined = process.env.PUSH_DISPATCH_SECRET,
): PushDispatchAuthResult {
  if (!expectedSecret) return "misconfigured";

  const provided = request.headers.get("x-push-secret") ?? "";
  return safeEqual(provided, expectedSecret) ? "authorized" : "unauthorized";
}
