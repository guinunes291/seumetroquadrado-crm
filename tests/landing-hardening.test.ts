import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(
  join(root, "supabase/migrations/20260711126000_landing_webhook_hardening.sql"),
  "utf8",
);
const handler = readFileSync(join(root, "src/routes/api/public/webhooks/landing.ts"), "utf8");

describe("contrato distribuído do webhook da landing", () => {
  it("consome rate limit atomicamente usando apenas uma hash", () => {
    expect(migration).toContain("landing_webhook_rate_limits");
    expect(migration).toContain("ON CONFLICT (key_hash) DO UPDATE");
    expect(migration).toContain("consume_landing_webhook_rate_limit");
    expect(migration).toMatch(/key_hash text PRIMARY KEY[\s\S]*\^\[0-9a-f\]\{64\}\$/);
    expect(handler).toContain('"consume_landing_webhook_rate_limit"');
    expect(handler).toContain('"landing-ip"');
    expect(handler).not.toContain('from "@/lib/rate-limit"');
  });

  it("faz claim, replay e recuperação por lease da Idempotency-Key", () => {
    expect(migration).toContain("landing_webhook_idempotency");
    expect(migration).toContain("begin_landing_webhook_request");
    expect(migration).toContain("complete_landing_webhook_request");
    expect(migration).toContain("release_landing_webhook_request");
    expect(migration).toContain("FOR UPDATE;");
    expect(migration).toContain("uq_leads_landing_idempotency_key_hash");
    expect(migration).toContain("jsonb_object_keys(_response_body)");
    expect(migration).toContain("'ok', 'accepted', 'error', 'retry_after_s'");
    expect(handler).toContain('request.headers.get("idempotency-key")');
    expect(handler).toContain('claim.disposition === "replay"');
    expect(handler).toContain("idempotency_request_hash: requestHash");
  });

  it("restringe tabelas e RPCs ao service_role e oferece limpeza expirada", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON public\.landing_webhook_rate_limits[\s\S]*FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.begin_landing_webhook_request[\s\S]*FROM PUBLIC, anon, authenticated[\s\S]*TO service_role/,
    );
    expect(migration).toContain("cleanup_landing_webhook_state");
    expect(migration).toContain("FOR UPDATE SKIP LOCKED");
    expect(migration).toContain("expires_at <= clock_timestamp()");
  });

  it("falha fechado em CORS/config, valida Turnstile e responde sem IDs", () => {
    expect(handler).toContain("LANDING_ALLOWED_ORIGINS");
    expect(handler).toContain("TURNSTILE_SECRET_KEY");
    expect(handler).toContain("verifyTurnstileToken");
    expect(handler).not.toContain("LANDING_WEBHOOK_SECRET");
    expect(handler).not.toContain('"Access-Control-Allow-Origin": "*"');
    expect(handler).not.toContain("error.message");
    expect(handler).toContain("const ACCEPTED_RESPONSE = { ok: true, accepted: true }");
  });
});
