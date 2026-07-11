import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkPushDispatchAuth } from "@/lib/push/dispatch-auth";

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://crm.test/api/public/hooks/push-dispatch", {
    method: "POST",
    headers,
  });
}

describe("autenticação do push-dispatch", () => {
  it("falha como erro de configuração quando o segredo dedicado não existe", () => {
    expect(checkPushDispatchAuth(request(), undefined)).toBe("misconfigured");
  });

  it("aceita apenas x-push-secret com comparação exata", () => {
    expect(checkPushDispatchAuth(request({ "x-push-secret": "cron-secret" }), "cron-secret")).toBe(
      "authorized",
    );
    expect(checkPushDispatchAuth(request({ "x-push-secret": "errado" }), "cron-secret")).toBe(
      "unauthorized",
    );
  });

  it("nunca aceita anon/publishable pelo header apikey", () => {
    expect(checkPushDispatchAuth(request({ apikey: "cron-secret" }), "cron-secret")).toBe(
      "unauthorized",
    );
  });
});

describe("claim atômico da push_outbox", () => {
  const root = process.cwd();
  const migration = readFileSync(
    join(root, "supabase/migrations/20260711121000_push_outbox_claim.sql"),
    "utf8",
  );
  const handler = readFileSync(join(root, "src/routes/api/public/hooks/push-dispatch.ts"), "utf8");

  it("usa lease e bloqueio SKIP LOCKED em RPC restrita ao service_role", () => {
    expect(migration).toContain("claim_push_outbox");
    expect(migration).toContain("FOR UPDATE OF po SKIP LOCKED");
    expect(migration).toContain("lease_token");
    expect(migration).toContain("lease_expires_at");
    expect(migration).toMatch(/REVOKE ALL[\s\S]+FROM anon, authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE[\s\S]+TO service_role/);
  });

  it("o handler reivindica por RPC e só finaliza enquanto possui a lease", () => {
    expect(handler).toContain('.rpc("claim_push_outbox"');
    expect(handler).toContain('.eq("lease_token", leaseToken)');
    expect(handler).not.toContain("SUPABASE_ANON_KEY");
    expect(handler).not.toContain("SUPABASE_PUBLISHABLE_KEY");
  });
});
