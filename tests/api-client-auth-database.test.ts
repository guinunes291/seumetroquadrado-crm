import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  client: null as null | {
    id: string;
    nome: string;
    segredo_hash: string;
    ativo: boolean;
    valido_de: string;
    valido_ate: string | null;
    revogado_em: string | null;
    equipe_id: string | null;
    projeto_id: string | null;
  },
  scopeGranted: true,
  updates: 0,
  audits: 0,
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "api_clientes") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: db.client, error: null }) }),
          }),
          update: () => ({
            eq: async () => {
              db.updates += 1;
              return { error: null };
            },
          }),
        };
      }
      if (table === "api_cliente_escopos") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: db.scopeGranted ? { escopo: "leads:read" } : null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "api_cliente_auditoria") {
        return {
          insert: async () => {
            db.audits += 1;
            return { error: null };
          },
        };
      }
      throw new Error(`tabela inesperada no mock: ${table}`);
    },
  },
}));

import { requireApiClientScope, sha256Hex } from "@/lib/api-client-auth.server";
import { __resetRateLimit } from "@/lib/public-api-auth";

const SECRET = "smq_live_um-segredo-longo-e-aleatorio";

function request() {
  return new Request("https://crm.test/api/public/leads", {
    headers: { "x-api-key": SECRET, "x-request-id": "req-123" },
  });
}

describe("autenticação no banco de clientes externos", () => {
  beforeEach(() => {
    __resetRateLimit();
    vi.stubEnv("PUBLIC_API_LEGACY_ENABLED", "false");
    db.client = {
      id: "11111111-1111-4111-8111-111111111111",
      nome: "n8n-comercial",
      segredo_hash: sha256Hex(SECRET),
      ativo: true,
      valido_de: "2026-07-01T00:00:00.000Z",
      valido_ate: "2026-07-20T00:00:00.000Z",
      revogado_em: null,
      equipe_id: "22222222-2222-4222-8222-222222222222",
      projeto_id: "33333333-3333-4333-8333-333333333333",
    };
    db.scopeGranted = true;
    db.updates = 0;
    db.audits = 0;
  });

  afterEach(() => vi.unstubAllEnvs());

  it("retorna identidade e restrições, atualizando last_used e auditoria", async () => {
    const result = await requireApiClientScope(
      request(),
      "leads:read",
      Date.parse("2026-07-11T12:00:00.000Z"),
    );
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) return;
    expect(result).toMatchObject({
      clientId: db.client?.id,
      clientName: "n8n-comercial",
      equipeId: db.client?.equipe_id,
      projetoId: db.client?.projeto_id,
      scope: "leads:read",
      mode: "client",
    });
    expect(db.updates).toBe(1);
    expect(db.audits).toBe(1);
  });

  it("nega cliente válido sem o escopo requerido", async () => {
    db.scopeGranted = false;
    const result = await requireApiClientScope(
      request(),
      "leads:read",
      Date.parse("2026-07-11T12:00:00.000Z"),
    );
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) expect(result.status).toBe(403);
    expect(db.updates).toBe(0);
    expect(db.audits).toBe(1);
  });

  it("nega credencial revogada sem consultar permissões", async () => {
    if (db.client) {
      db.client.ativo = false;
      db.client.revogado_em = "2026-07-10T12:00:00.000Z";
    }
    const result = await requireApiClientScope(
      request(),
      "leads:read",
      Date.parse("2026-07-11T12:00:00.000Z"),
    );
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) expect(result.status).toBe(401);
  });
});
