import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  extractVariables,
  normalizePhoneToWhatsApp,
  buildWhatsAppUrl,
} from "@/lib/templates";

describe("templates", () => {
  it("substitui placeholders simples", () => {
    expect(renderTemplate("Olá {{nome}}!", { nome: "Ana" })).toBe("Olá Ana!");
  });

  it("substitui múltiplos placeholders e mantém os ausentes", () => {
    const out = renderTemplate("Oi {{nome}}, sobre {{projeto}} ({{cidade}})", {
      nome: "João",
      projeto: "Vila Nova",
    });
    expect(out).toBe("Oi João, sobre Vila Nova ({{cidade}})");
  });

  it("ignora espaços dentro do placeholder", () => {
    expect(renderTemplate("{{  nome  }}", { nome: "Bia" })).toBe("Bia");
  });

  it("trata valor vazio como ausente", () => {
    expect(renderTemplate("Oi {{nome}}", { nome: "" })).toBe("Oi {{nome}}");
  });

  it("extrai variáveis sem duplicar", () => {
    const vars = extractVariables("{{nome}} {{nome}} {{projeto}}");
    expect(vars).toEqual(["nome", "projeto"]);
  });

  it("normaliza telefone brasileiro adicionando DDI", () => {
    expect(normalizePhoneToWhatsApp("(11) 98888-7777")).toBe("5511988887777");
    expect(normalizePhoneToWhatsApp("11 3333-4444")).toBe("551133334444");
  });

  it("preserva número que já tem DDI 55", () => {
    expect(normalizePhoneToWhatsApp("+55 11 98888-7777")).toBe("5511988887777");
  });

  it("retorna vazio para telefone vazio", () => {
    expect(normalizePhoneToWhatsApp("")).toBe("");
  });

  it("monta URL do WhatsApp com texto codificado", () => {
    const url = buildWhatsAppUrl("11988887777", "Olá, tudo bem?");
    expect(url).toContain("https://wa.me/5511988887777");
    expect(url).toContain("Ol%C3%A1%2C%20tudo%20bem%3F");
  });

  it("monta URL sem telefone quando vazio", () => {
    expect(buildWhatsAppUrl("", "Oi")).toBe("https://wa.me/?text=Oi");
  });
});
