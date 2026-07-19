// Helper para autenticar endpoints públicos de leitura via X-API-Key.
// Usado pelos routes em src/routes/api/public/leads/* e /metricas.
import { createHash, timingSafeEqual } from "crypto";
import { rateLimit, __resetRateLimit as __resetGenericRateLimit } from "@/lib/rate-limit";
import { legacyApiWindowIsOpen } from "@/lib/api-legacy-window";

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
  "etapa",
  "estado",
  "motivo_handoff",
  "handoff_em",
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
  // Qualificação
  "renda_estimada",
  "tem_fgts",
  "fgts_valor",
  "tipo_renda",
  "decisor",
  "faixa_mcmv",
  "resumo_qualificacao",
  "created_at",
  "updated_at",
] as const;

export const PUBLIC_LEAD_SELECT = PUBLIC_LEAD_FIELDS.join(",");

/** Normaliza temperatura para MAIÚSCULO no payload retornado. */
export function shapeLeadForPublic<T extends Record<string, unknown> | null | undefined>(
  lead: T,
): T {
  if (!lead || typeof lead !== "object") return lead;
  const t = (lead as Record<string, unknown>).temperatura;
  if (typeof t === "string" && t) {
    (lead as Record<string, unknown>).temperatura = t.toUpperCase();
  }
  return lead;
}

// Rate limit por chave/IP, reusando o helper genérico (janela fixa em memória).
// Não substitui um rate limit de borda (Cloudflare), mas evita enumeração/abuso trivial.
const RATE_LIMIT_MAX = Number(process.env.PUBLIC_API_RATE_LIMIT ?? 60); // req/min
const RATE_LIMIT_WINDOW_MS = 60_000;

function clientIds(request: Request): string[] {
  const key = request.headers.get("x-api-key") ?? "";
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  // Nunca mantenha fragmentos do segredo como chave do limiter/log.
  const keyId = key ? createHash("sha256").update(key, "utf8").digest("hex").slice(0, 24) : "";
  const ids = keyId ? [`pubapi:k:${keyId}`] : [];
  if (ip !== "unknown") {
    ids.push(`pubapi:ip:${createHash("sha256").update(ip, "utf8").digest("hex").slice(0, 24)}`);
  }
  return ids.length ? ids : ["pubapi:ip:unknown"];
}

export function checkRateLimit(request: Request, now = Date.now()): Response | null {
  for (const id of clientIds(request)) {
    const r = rateLimit(id, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS, now);
    if (!r.allowed) {
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
  }
  return null;
}

// Apenas para testes.
export function __resetRateLimit() {
  __resetGenericRateLimit();
}

/**
 * Rate limit em duas camadas: memória (barreira barata por instância) e
 * banco (RPC consumir_api_rate_limit — régua real, compartilhada entre as
 * instâncias do Worker; padrão do landing webhook generalizado na migration
 * 20260719124000). Indisponibilidade do banco NÃO derruba a rota (fail-open
 * com log): rate limit é proteção de abuso, não autenticação — e a camada
 * de memória continua ativa.
 */
export async function checkRateLimitDistribuido(
  request: Request,
  now = Date.now(),
): Promise<Response | null> {
  const local = checkRateLimit(request, now);
  if (local) return local;

  const key = request.headers.get("x-api-key") ?? "";
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const base = key ? `pubapi:k:${key}` : `pubapi:ip:${ip}`;
  const keyHash = createHash("sha256").update(base, "utf8").digest("hex");

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("consumir_api_rate_limit", {
      _key_hash: keyHash,
      _max_requests: RATE_LIMIT_MAX,
      _window_seconds: Math.round(RATE_LIMIT_WINDOW_MS / 1000),
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.allowed === false) {
      const retry = Number(row.retry_after_seconds ?? 60) || 60;
      return new Response(
        JSON.stringify({ error: "rate_limit_exceeded", retry_after_s: retry }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retry),
            "Cache-Control": "no-store",
          },
        },
      );
    }
  } catch (err) {
    console.warn("rate limit distribuído indisponível; seguindo com o limite em memória", err);
  }
  return null;
}

export function checkReadApiKey(request: Request): Response | null {
  if (!legacyApiWindowIsOpen()) {
    return new Response(JSON.stringify({ error: "legacy_api_disabled" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const expected = process.env.READ_API_KEY;
  if (!expected) {
    return new Response(JSON.stringify({ error: "READ_API_KEY não configurada no servidor" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const provided = request.headers.get("x-api-key") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  // Autenticado: aplica rate limit por chave.
  return checkRateLimit(request);
}

export const PUBLIC_API_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Authorization",
  "Access-Control-Max-Age": "86400",
};

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: PUBLIC_API_CORS_HEADERS });
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...PUBLIC_API_CORS_HEADERS,
    },
  });
}
