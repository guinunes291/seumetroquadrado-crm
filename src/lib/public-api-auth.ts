// Helper para autenticar endpoints públicos de leitura via X-API-Key.
// Usado pelos routes em src/routes/api/public/leads/* e /metricas.
import { timingSafeEqual } from "crypto";

// Campos do lead seguros para exposição na API pública de leitura.
// PII sensível (cpf, renda_informada, entrada_disponivel, observacoes) é
// deliberadamente OMITIDA: a API é autenticada por uma única chave estática
// compartilhada e sem escopo por projeto, então um vazamento da chave não
// pode resultar em exportação de dados sensíveis dos leads (risco LGPD).
export const PUBLIC_LEAD_FIELDS = [
  "id",
  "nome",
  "email",
  "telefone",
  "origem",
  "status",
  "temperatura",
  "corretor_id",
  "projeto_id",
  "projeto_nome",
  "campanha",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "usa_fgts",
  "proximo_followup",
  "ultimo_contato",
  "ultima_interacao",
  "data_distribuicao",
  "created_at",
  "updated_at",
] as const;

export const PUBLIC_LEAD_SELECT = PUBLIC_LEAD_FIELDS.join(",");

// Rate limit simples em memória (janela fixa por chave/IP). Não substitui um
// rate limit de borda (Cloudflare), mas evita enumeração/abuso trivial.
const RATE_LIMIT_MAX = Number(process.env.PUBLIC_API_RATE_LIMIT ?? 60); // req
const RATE_LIMIT_WINDOW_MS = 60_000; // por minuto
const buckets = new Map<string, { count: number; resetAt: number }>();

function clientId(request: Request): string {
  const key = request.headers.get("x-api-key") ?? "";
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  // Identifica pela chave quando presente; senão pelo IP.
  return key ? `k:${key.slice(0, 12)}` : `ip:${ip}`;
}

export function checkRateLimit(request: Request, now = Date.now()): Response | null {
  const id = clientId(request);
  const bucket = buckets.get(id);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(id, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return new Response(
      JSON.stringify({ error: "rate_limit_exceeded", retry_after_s: retryAfter }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
          "Cache-Control": "no-store",
        },
      },
    );
  }
  return null;
}

// Apenas para testes.
export function __resetRateLimit() {
  buckets.clear();
}

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
  // Autenticado: aplica rate limit por chave.
  return checkRateLimit(request);
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
