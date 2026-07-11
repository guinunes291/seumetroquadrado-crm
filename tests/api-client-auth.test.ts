import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { legacyApiWindowIsOpen, sha256Hex } from "@/lib/api-client-auth.server";

describe("credenciais de clientes externos", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("produz SHA-256 hexadecimal determinístico sem reter o segredo", () => {
    expect(sha256Hex("segredo-exemplo")).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex("segredo-exemplo")).toBe(sha256Hex("segredo-exemplo"));
    expect(sha256Hex("segredo-exemplo")).not.toContain("segredo-exemplo");
  });

  it("mantém o legado desligado por padrão", () => {
    vi.stubEnv("PUBLIC_API_LEGACY_ENABLED", "");
    vi.stubEnv("PUBLIC_API_LEGACY_STARTED_AT", "");
    vi.stubEnv("PUBLIC_API_LEGACY_UNTIL", "");
    expect(legacyApiWindowIsOpen()).toBe(false);
  });

  it("exige flag exata e prazo futuro de no máximo sete dias", () => {
    const now = Date.parse("2026-07-11T12:00:00.000Z");
    vi.stubEnv("PUBLIC_API_LEGACY_ENABLED", "true");
    vi.stubEnv("PUBLIC_API_LEGACY_STARTED_AT", "2026-07-11T11:00:00.000Z");
    vi.stubEnv("PUBLIC_API_LEGACY_UNTIL", "2026-07-14T12:00:00.000Z");
    expect(legacyApiWindowIsOpen(now)).toBe(true);

    vi.stubEnv("PUBLIC_API_LEGACY_UNTIL", "2026-07-19T12:00:00.000Z");
    expect(legacyApiWindowIsOpen(now)).toBe(false);

    vi.stubEnv("PUBLIC_API_LEGACY_UNTIL", "2026-07-10T12:00:00.000Z");
    expect(legacyApiWindowIsOpen(now)).toBe(false);
  });

  it("não ativa no futuro uma janela configurada para durar mais de sete dias", () => {
    vi.stubEnv("PUBLIC_API_LEGACY_ENABLED", "true");
    vi.stubEnv("PUBLIC_API_LEGACY_STARTED_AT", "2026-07-01T12:00:00.000Z");
    vi.stubEnv("PUBLIC_API_LEGACY_UNTIL", "2026-07-20T12:00:00.000Z");
    expect(legacyApiWindowIsOpen(Date.parse("2026-07-19T12:00:00.000Z"))).toBe(false);
  });
});

describe("contrato server-only da API externa", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  const migration = read("supabase/migrations/20260711125000_api_clientes.sql");

  it("armazena só hash, fecha RLS do navegador e enumera os seis escopos", () => {
    expect(migration).toContain("segredo_hash text NOT NULL UNIQUE");
    expect(migration).toContain("segredo_hash ~ '^[0-9a-f]{64}$'");
    expect(migration).toContain(
      "REVOKE ALL ON public.api_clientes FROM PUBLIC, anon, authenticated",
    );
    for (const scope of [
      "leads:read",
      "leads:write",
      "events:write",
      "sales:read",
      "commissions:read",
      "metrics:read",
    ]) {
      expect(migration).toContain(`'${scope}'`);
    }
  });

  it("migra cada família pública para seu escopo dedicado", () => {
    const expected: Record<string, string> = {
      "src/routes/api/public/leads/index.ts": "leads:read",
      "src/routes/api/public/leads/$id.ts": "leads:write",
      "src/routes/api/public/leads/$id.eventos.ts": "events:write",
      "src/routes/api/public/vendas/index.ts": "sales:read",
      "src/routes/api/public/comissoes/index.ts": "commissions:read",
      "src/routes/api/public/metricas.ts": "metrics:read",
    };
    for (const [path, scope] of Object.entries(expected)) {
      expect(read(path), path).toContain(`requireApiClientScope(request, "${scope}")`);
    }
  });

  it("não deixa endpoint de negócio dependente dos guards globais antigos", () => {
    for (const path of [
      "src/routes/api/public/leads/index.ts",
      "src/routes/api/public/leads/$id.ts",
      "src/routes/api/public/leads/$id.corretor.ts",
      "src/routes/api/public/leads/$id.eventos.ts",
      "src/routes/api/public/leads/$id.perda.ts",
      "src/routes/api/public/vendas/index.ts",
      "src/routes/api/public/comissoes/index.ts",
      "src/routes/api/public/metricas.ts",
    ]) {
      expect(read(path), path).not.toMatch(/checkReadApiKey|requireWriteKeyOrLegacy/);
    }
  });
});
