import { describe, it, expect } from "vitest";
import { slugify, webhookUrl, maskToken } from "@/lib/projetos";

describe("slugify", () => {
  it("normaliza nomes em pt-BR", () => {
    expect(slugify("Edifício São João")).toBe("edificio-sao-joao");
    expect(slugify("  Residencial  Aurora  ")).toBe("residencial-aurora");
    expect(slugify("Projeto #1 — Fase 2!")).toBe("projeto-1-fase-2");
  });
  it("limita comprimento a 60 chars", () => {
    expect(slugify("a".repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe("webhookUrl", () => {
  it("monta URL sem barra dupla", () => {
    expect(webhookUrl("https://app.com/", "abc123")).toBe("https://app.com/api/public/webhooks/lead/abc123");
    expect(webhookUrl("https://app.com", "abc123")).toBe("https://app.com/api/public/webhooks/lead/abc123");
  });
});

describe("maskToken", () => {
  it("mostra primeiros e últimos 4 chars", () => {
    expect(maskToken("abcdefghijklmnop")).toBe("abcd••••••••mnop");
  });
  it("mascara totalmente tokens curtos", () => {
    expect(maskToken("abc")).toBe("•••");
    expect(maskToken("")).toBe("");
  });
});
