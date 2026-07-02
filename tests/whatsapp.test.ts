import { describe, it, expect } from "vitest";
import { mensagemPrimeiroContato, WHATSAPP_TITULO_PADRAO } from "@/lib/whatsapp";
import { buildWhatsAppUrl } from "@/lib/templates";

describe("mensagemPrimeiroContato", () => {
  it("usa só o primeiro nome", () => {
    expect(mensagemPrimeiroContato("Maria Clara Souza")).toBe(
      "Olá, Maria! Aqui é da Seu Metro Quadrado. Recebemos seu contato e gostaríamos de te ajudar. Posso te chamar agora?",
    );
  });

  it("funciona com nome único", () => {
    expect(mensagemPrimeiroContato("Wesley")).toContain("Olá, Wesley!");
  });

  it("inclui o projeto quando informado", () => {
    expect(mensagemPrimeiroContato("Ana Paula", "Residencial Aurora")).toContain(
      "Seu Metro Quadrado sobre o Residencial Aurora.",
    );
  });

  it("omite o sufixo de projeto quando nulo/vazio", () => {
    expect(mensagemPrimeiroContato("Ana", null)).toContain("Seu Metro Quadrado. Recebemos");
    expect(mensagemPrimeiroContato("Ana", "")).toContain("Seu Metro Quadrado. Recebemos");
  });

  it("compõe com buildWhatsAppUrl mantendo o texto codificado", () => {
    const msg = mensagemPrimeiroContato("João", "Vila das Flores");
    const url = buildWhatsAppUrl("(11) 98888-7777", msg);
    expect(url).toContain("https://wa.me/5511988887777?text=");
    expect(decodeURIComponent(url.split("text=")[1])).toBe(msg);
  });
});

describe("WHATSAPP_TITULO_PADRAO", () => {
  it("é o título usado no diálogo do detalhe do lead", () => {
    expect(WHATSAPP_TITULO_PADRAO).toBe("Mensagem enviada via WhatsApp");
  });
});
