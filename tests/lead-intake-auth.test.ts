// Contrato de autenticação do lead-intake (P-3 / item 0.7 da estrategia-2026-08).
// Edge functions são Deno e ficam fora do runtime do vitest — o contrato é
// assertado lendo o fonte, como os demais testes de fronteira do repo.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "supabase/functions/lead-intake/index.ts"), "utf8");

describe("lead-intake: autenticação por secret", () => {
  it("o header x-webhook-secret é o canal canônico", () => {
    expect(source).toContain('req.headers.get("x-webhook-secret")');
    // O header vem primeiro; a query é só fallback.
    expect(source).toContain("viaHeader ?? viaQuery");
  });

  it("o fallback por query string tem kill-switch sem redeploy", () => {
    expect(source).toContain("LEAD_INTAKE_ALLOW_QUERY_SECRET");
    // Com o switch desligado a query nem é lida — não existe caminho que a aceite.
    expect(source).toMatch(
      /allowQuerySecret\s*\?\s*new URL\(req\.url\)\.searchParams\.get\("secret"\)\s*:\s*null/,
    );
  });

  it("compara o secret em tempo constante e falha fechado", () => {
    expect(source).toContain("secretsIguais");
    expect(source).toContain('crypto.subtle.digest("SHA-256"');
    // Sem secret configurado ou sem credencial: 401, nunca prossegue.
    expect(source).toMatch(/!secret \|\| !provided \|\|/);
  });

  it("uso depreciado da query é sinalizado no payload (visível no Zapier)", () => {
    expect(source).toContain("deprecated_auth");
  });
});
