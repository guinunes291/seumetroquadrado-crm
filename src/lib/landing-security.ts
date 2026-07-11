import { createHmac } from "node:crypto";

export const MAX_LANDING_BYTES = 32_768;
export const MAX_TURNSTILE_TOKEN_LENGTH = 2_048;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type JsonObject = Record<string, unknown>;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeLandingPayload(body: JsonObject): JsonObject {
  const sanitized = Object.create(null) as JsonObject;
  for (const [key, value] of Object.entries(body)) {
    if (
      key === "turnstile_token" ||
      key === "cf-turnstile-response" ||
      key === "website" ||
      key === "simHp"
    ) {
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isJsonObject(value)) return value;

  const sorted = Object.create(null) as JsonObject;
  for (const key of Object.keys(value).sort()) sorted[key] = canonicalize(value[key]);
  return sorted;
}

export function canonicalLandingPayload(body: JsonObject): string {
  return JSON.stringify(canonicalize(sanitizeLandingPayload(body)));
}

export function hashLandingValue(secret: string, domain: string, value: string): string {
  return createHmac("sha256", secret).update(`${domain}\0${value}`, "utf8").digest("hex");
}

export function validIdempotencyKey(value: string | null): value is string {
  return (
    value !== null && value.length >= 16 && value.length <= 200 && /^[A-Za-z0-9._:-]+$/.test(value)
  );
}

export function parseAllowedOrigins(raw: string | undefined): Set<string> {
  const result = new Set<string>();
  for (const candidate of raw?.split(",") ?? []) {
    const trimmed = candidate.trim();
    if (!trimmed || trimmed === "*") continue;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        result.add(parsed.origin);
      }
    } catch {
      // Configuracao invalida e ignorada; lista vazia faz o endpoint falhar fechado.
    }
  }
  return result;
}

export function requestOriginAllowed(origin: string | null, allowed: Set<string>): boolean {
  if (origin === null) return true;
  try {
    return allowed.has(new URL(origin).origin) && new URL(origin).origin === origin;
  } catch {
    return false;
  }
}

export function landingResponseHeaders(
  origin: string | null,
  allowed: Set<string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin && requestOriginAllowed(origin, allowed)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "content-type, accept, idempotency-key";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}

export type LimitedBodyResult =
  | { ok: true; raw: string }
  | { ok: false; error: "payload_too_large" | "invalid_body" };

export async function readRequestBodyLimited(
  request: Request,
  maxBytes = MAX_LANDING_BYTES,
): Promise<LimitedBodyResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (!Number.isSafeInteger(declared) || declared < 0) {
      return { ok: false, error: "invalid_body" };
    }
    if (declared > maxBytes) return { ok: false, error: "payload_too_large" };
  }

  if (!request.body) return { ok: true, raw: "" };
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let raw = "";

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        return { ok: false, error: "payload_too_large" };
      }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
    return { ok: true, raw };
  } catch {
    return { ok: false, error: "invalid_body" };
  } finally {
    reader.releaseLock();
  }
}

export type TurnstileVerification =
  | { ok: true }
  | { ok: false; transient: boolean; error: "required" | "invalid" | "unavailable" };

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function verifyTurnstileToken(
  token: unknown,
  secret: string,
  fetchImpl: FetchLike = globalThis.fetch,
  timeoutMs = 5_000,
): Promise<TurnstileVerification> {
  if (typeof token !== "string" || token.length < 1) {
    return { ok: false, transient: false, error: "required" };
  }
  if (token.length > MAX_TURNSTILE_TOKEN_LENGTH) {
    return { ok: false, transient: false, error: "invalid" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, transient: true, error: "unavailable" };

    const result: unknown = await response.json();
    if (!isJsonObject(result) || result.success !== true) {
      return { ok: false, transient: false, error: "invalid" };
    }
    return { ok: true };
  } catch {
    return { ok: false, transient: true, error: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}
