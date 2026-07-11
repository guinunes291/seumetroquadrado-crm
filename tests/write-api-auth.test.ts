import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { requireWriteKeyOrLegacy, writeAgentLabel } from "@/lib/write-api-auth";
import { __resetRateLimit } from "@/lib/public-api-auth";

function reqWithKey(key?: string): Request {
  const headers = new Headers();
  if (key !== undefined) headers.set("x-api-key", key);
  headers.set("x-forwarded-for", "10.0.0.1");
  return new Request("https://x/api/public/leads/abc", { method: "PATCH", headers });
}

describe("requireWriteKeyOrLegacy", () => {
  beforeEach(() => {
    __resetRateLimit();
    vi.stubEnv("MCP_WRITE_API_KEY", "write-secret");
    vi.stubEnv("READ_API_KEY", "read-secret");
    vi.stubEnv("PUBLIC_API_LEGACY_ENABLED", "true");
    vi.stubEnv("PUBLIC_API_LEGACY_STARTED_AT", new Date(Date.now() - 60_000).toISOString());
    vi.stubEnv("PUBLIC_API_LEGACY_UNTIL", new Date(Date.now() + 3_600_000).toISOString());
    vi.stubEnv("PUBLIC_WRITE_ALLOW_READ_KEY", "");
    vi.stubEnv("PUBLIC_API_RATE_LIMIT", "1000");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("aceita a chave de ESCRITA (mode write_key)", () => {
    const r = requireWriteKeyOrLegacy(reqWithKey("write-secret"));
    expect(r).not.toBeInstanceOf(Response);
    if (!(r instanceof Response)) expect(r.mode).toBe("write_key");
  });

  it("rejeita chave inválida com 401", () => {
    const r = requireWriteKeyOrLegacy(reqWithKey("errada"));
    expect(r).toBeInstanceOf(Response);
    if (r instanceof Response) expect(r.status).toBe(401);
  });

  it("rejeita ausência de chave com 401", () => {
    const r = requireWriteKeyOrLegacy(reqWithKey());
    expect(r).toBeInstanceOf(Response);
    if (r instanceof Response) expect(r.status).toBe(401);
  });

  it("rejeita a chave de LEITURA por padrão (flag ausente/vazia)", () => {
    const r = requireWriteKeyOrLegacy(reqWithKey("read-secret"));
    expect(r).toBeInstanceOf(Response);
    if (r instanceof Response) expect(r.status).toBe(401);
  });

  it("aceita a chave de LEITURA somente com opt-in explícito true", () => {
    vi.stubEnv("PUBLIC_WRITE_ALLOW_READ_KEY", "true");
    const r = requireWriteKeyOrLegacy(reqWithKey("read-secret"));
    expect(r).not.toBeInstanceOf(Response);
    if (!(r instanceof Response)) expect(r.mode).toBe("legacy_read_key");
  });

  it("REJEITA a chave de leitura quando PUBLIC_WRITE_ALLOW_READ_KEY=false", () => {
    vi.stubEnv("PUBLIC_WRITE_ALLOW_READ_KEY", "false");
    const r = requireWriteKeyOrLegacy(reqWithKey("read-secret"));
    expect(r).toBeInstanceOf(Response);
    if (r instanceof Response) expect(r.status).toBe(401);
    // a chave de escrita continua valendo mesmo com a flag desligada
    const r2 = requireWriteKeyOrLegacy(reqWithKey("write-secret"));
    expect(r2).not.toBeInstanceOf(Response);
  });

  it("não interpreta variantes de true como opt-in", () => {
    vi.stubEnv("PUBLIC_WRITE_ALLOW_READ_KEY", "TRUE");
    const r = requireWriteKeyOrLegacy(reqWithKey("read-secret"));
    expect(r).toBeInstanceOf(Response);
    if (r instanceof Response) expect(r.status).toBe(401);
  });

  it("500 quando não há nenhuma chave configurada", () => {
    vi.stubEnv("MCP_WRITE_API_KEY", "");
    vi.stubEnv("READ_API_KEY", "");
    const r = requireWriteKeyOrLegacy(reqWithKey("qualquer"));
    expect(r).toBeInstanceOf(Response);
    if (r instanceof Response) expect(r.status).toBe(500);
  });

  it("rejeita todas as chaves globais quando a janela legada está desligada", () => {
    vi.stubEnv("PUBLIC_API_LEGACY_ENABLED", "false");
    const r = requireWriteKeyOrLegacy(reqWithKey("write-secret"));
    expect(r).toBeInstanceOf(Response);
    if (r instanceof Response) expect(r.status).toBe(401);
  });

  it("rejeita prazo expirado ou superior a sete dias", () => {
    vi.stubEnv("PUBLIC_API_LEGACY_UNTIL", new Date(Date.now() - 1_000).toISOString());
    expect(requireWriteKeyOrLegacy(reqWithKey("write-secret"))).toBeInstanceOf(Response);

    vi.stubEnv(
      "PUBLIC_API_LEGACY_UNTIL",
      new Date(Date.now() + 8 * 24 * 60 * 60 * 1_000).toISOString(),
    );
    expect(requireWriteKeyOrLegacy(reqWithKey("write-secret"))).toBeInstanceOf(Response);
  });
});

describe("writeAgentLabel", () => {
  it("rotula o modo para auditoria", () => {
    expect(writeAgentLabel("write_key")).toBe("mcp-write-key");
    expect(writeAgentLabel("legacy_read_key")).toBe("legacy-read-key");
  });
});
