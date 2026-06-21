// Helper para autenticar endpoints públicos de leitura via X-API-Key.
// Usado pelos routes em src/routes/api/public/leads/* e /metricas.
import { timingSafeEqual } from "crypto";

export function checkReadApiKey(request: Request): Response | null {
  const expected = process.env.READ_API_KEY;
  if (!expected) {
    return new Response(
      JSON.stringify({ error: "READ_API_KEY não configurada no servidor" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  const provided = request.headers.get("x-api-key") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
