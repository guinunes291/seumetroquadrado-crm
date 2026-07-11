import { describe, expect, it, vi } from "vitest";
import {
  canonicalLandingPayload,
  hashLandingValue,
  landingResponseHeaders,
  parseAllowedOrigins,
  readRequestBodyLimited,
  requestOriginAllowed,
  validIdempotencyKey,
  verifyTurnstileToken,
} from "@/lib/landing-security";

describe("segurança do intake da landing", () => {
  it("usa allowlist CORS exata e nunca aceita wildcard ou origem parecida", () => {
    const allowed = parseAllowedOrigins(
      "https://landing.example, https://www.example.com/, *, javascript:alert(1)",
    );
    expect([...allowed]).toEqual(["https://landing.example", "https://www.example.com"]);
    expect(requestOriginAllowed("https://landing.example", allowed)).toBe(true);
    expect(requestOriginAllowed("https://landing.example.evil.test", allowed)).toBe(false);
    expect(landingResponseHeaders("https://landing.example", allowed)).toMatchObject({
      "Access-Control-Allow-Origin": "https://landing.example",
      Vary: "Origin",
    });
    expect(landingResponseHeaders("https://evil.test", allowed)).not.toHaveProperty(
      "Access-Control-Allow-Origin",
    );
  });

  it("exige uma Idempotency-Key limitada e calcula HMAC por domínio", () => {
    expect(validIdempotencyKey("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(validIdempotencyKey("curta")).toBe(false);
    expect(validIdempotencyKey("a".repeat(201))).toBe(false);
    expect(validIdempotencyKey("chave com espaco e longa")).toBe(false);

    const secret = "s".repeat(32);
    const ipHash = hashLandingValue(secret, "landing-ip", "203.0.113.10");
    const keyHash = hashLandingValue(secret, "idempotency-key", "203.0.113.10");
    expect(ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(ipHash).not.toContain("203.0.113.10");
    expect(ipHash).not.toBe(keyHash);
  });

  it("gera a mesma hash lógica sem depender da ordem ou do token Turnstile", () => {
    const first = canonicalLandingPayload({
      nome: "João",
      whatsapp: "11999999999",
      turnstile_token: "token-1",
      marketing: { utm_source: "google", utm_medium: "cpc" },
    });
    const retry = canonicalLandingPayload({
      marketing: { utm_medium: "cpc", utm_source: "google" },
      "cf-turnstile-response": "token-2",
      whatsapp: "11999999999",
      nome: "João",
    });
    expect(first).toBe(retry);
  });

  it("aplica o teto em bytes mesmo sem confiar em Content-Length", async () => {
    const ok = await readRequestBodyLimited(
      new Request("https://crm.test/hook", { method: "POST", body: "áá" }),
      4,
    );
    expect(ok).toEqual({ ok: true, raw: "áá" });

    const tooLarge = await readRequestBodyLimited(
      new Request("https://crm.test/hook", { method: "POST", body: "ááá" }),
      4,
    );
    expect(tooLarge).toEqual({ ok: false, error: "payload_too_large" });
  });

  it("valida Turnstile server-side sem enviar IP ou expor o secret ao cliente", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const form = new URLSearchParams(String(init?.body));
      expect(form.get("secret")).toBe("server-secret");
      expect(form.get("response")).toBe("browser-token");
      expect(form.has("remoteip")).toBe(false);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    await expect(
      verifyTurnstileToken("browser-token", "server-secret", fetchMock),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("distingue indisponibilidade transitória de token inválido", async () => {
    const unavailable = vi.fn(async () => new Response("bad gateway", { status: 502 }));
    const invalid = vi.fn(
      async () => new Response(JSON.stringify({ success: false }), { status: 200 }),
    );
    await expect(verifyTurnstileToken("token", "secret", unavailable)).resolves.toEqual({
      ok: false,
      transient: true,
      error: "unavailable",
    });
    await expect(verifyTurnstileToken("token", "secret", invalid)).resolves.toEqual({
      ok: false,
      transient: false,
      error: "invalid",
    });
  });
});
