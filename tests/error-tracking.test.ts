// Rastreador de erro próprio (item 0.1 da estrategia-2026-08): módulo puro
// (parse de DSN, montagem de evento, sanitização de URL) + contratos de
// integração lidos do fonte, no padrão da casa.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildEvent, parseDsn, sanitizeRequestUrl } from "@/lib/error-tracking";

describe("parseDsn", () => {
  it("extrai endpoint de store e auth header de um DSN válido", () => {
    const parsed = parseDsn("https://abc123@o4507.ingest.sentry.io/4509999");
    expect(parsed?.endpoint).toBe("https://o4507.ingest.sentry.io/api/4509999/store/");
    expect(parsed?.authHeader).toContain("sentry_key=abc123");
    expect(parsed?.authHeader).toContain("sentry_version=7");
  });

  it("rejeita DSN sem chave, sem projeto ou fora de formato", () => {
    expect(parseDsn("https://host.io/123")).toBeNull(); // sem chave
    expect(parseDsn("https://key@host.io/")).toBeNull(); // sem projeto
    expect(parseDsn("https://key@host.io/nao-numerico")).toBeNull();
    expect(parseDsn("nem-url")).toBeNull();
  });
});

describe("sanitizeRequestUrl", () => {
  it("remove query e hash — secret em URL nunca sai do processo", () => {
    expect(sanitizeRequestUrl("https://x.io/functions/lead-intake?secret=abc#f")).toBe(
      "https://x.io/functions/lead-intake",
    );
  });

  it("degrada com segurança para strings que não parseiam como URL", () => {
    expect(sanitizeRequestUrl("/caminho/relativo?token=x")).toBe("/caminho/relativo");
  });
});

describe("buildEvent", () => {
  it("monta o evento com mecanismo, ambiente e stack truncada", () => {
    const err = new Error("boom");
    const event = buildEvent(err, { mechanism: "onerror", handled: false }, "staging");
    expect(event.environment).toBe("staging");
    expect(event.tags.mechanism).toBe("onerror");
    expect(event.tags.handled).toBe("false");
    expect(event.exception.values[0]).toMatchObject({ type: "Error", value: "boom" });
    expect(event.event_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("aceita não-Error e nunca lança", () => {
    expect(buildEvent("string solta").exception.values[0].value).toBe("string solta");
    expect(buildEvent({ estranho: true }).exception.values[0].value).toContain("estranho");
    expect(buildEvent(undefined).exception.values[0].value).toBeTruthy();
  });

  it("trunca mensagens gigantes (limite de 4000)", () => {
    const event = buildEvent(new Error("x".repeat(10_000)));
    expect((event.exception.values[0].value ?? "").length).toBeLessThanOrEqual(4001);
  });

  it("só carrega o id do usuário — nunca nome/e-mail", () => {
    const event = buildEvent(new Error("x"), { userId: "uuid-1" });
    expect(event).toMatchObject({ user: { id: "uuid-1" } });
    expect(JSON.stringify(event)).not.toMatch(/email|nome|telefone/);
  });
});

describe("contratos de integração (fonte como texto)", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("servidor captura nos 3 pontos onde o erro morria em console.error", () => {
    const server = read("src/server.ts");
    const start = read("src/start.ts");
    expect(server).toContain("captureServerError");
    expect(server).toContain("ssr_swallowed");
    expect(server).toContain("ssr_fetch");
    expect(start).toContain("captureServerError");
  });

  it("cliente instala listeners globais via import dinâmico (chunk de entrada intacto)", () => {
    const root = read("src/routes/__root.tsx");
    expect(root).toContain('import("@/lib/error-tracking-browser")');
    expect(root).toContain("initErrorTracking");
    const client = read("src/lib/error-tracking-browser.ts");
    expect(client).toContain("MAX_EVENTS_PER_SESSION");
    expect(client).toContain("unhandledrejection");
  });

  it("servidor lê o DSN dentro da chamada (env por request no Workers)", () => {
    const server = read("src/lib/error-tracking.server.ts");
    expect(server).toMatch(/captureServerError[\s\S]*process\.env\.SENTRY_DSN/);
  });

  it("edge functions têm o util compartilhado e o lead-intake usa", () => {
    const shared = read("supabase/functions/_shared/error-tracking.ts");
    expect(shared).toContain("comCapturaDeErro");
    expect(read("supabase/functions/lead-intake/index.ts")).toContain("comCapturaDeErro");
  });
});
