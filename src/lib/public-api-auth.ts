// Helper para autenticar endpoints públicos de leitura via X-API-Key.
// Usado pelos routes em src/routes/api/public/leads/* e /metricas.
import { timingSafeEqual } from "crypto";
import { rateLimit, __resetRateLimit as __resetGenericRateLimit } from "@/lib/rate-limit";

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

// Rate limit por chave/IP, reusando o helper genérico (janela fixa em memória).
// Não substitui um rate limit de borda (Cloudflare), mas evita enumeração/abuso trivial.
const RATE_LIMIT_MAX = Number(process.env.PUBLIC_API_RATE_LIMIT ?? 60); // req/min
const RATE_LIMIT_WINDOW_MS = 60_000;

function clientId(request: Request): string {
  const key = request.headers.get("x-api-key") ?? "";
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  // Identifica pela chave quando presente; senão pelo IP.
  return key ? `pubapi:k:${key.slice(0, 12)}` : `pubapi:ip:${ip}`;
}

export function checkRateLimit(request: Request, now = Date.now()): Response | null {
  const r = rateLimit(clientId(request), RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS, now);
  if (r.allowed) return null;
  return new Response(
    JSON.stringify({ error: "rate_limit_exceeded", retry_after_s: r.retryAfterS }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(r.retryAfterS),
        "Cache-Control": "no-store",
      },
    },
  );
}

// Apenas para testes.
export function __resetRateLimit() {
  __resetGenericRateLimit();
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
