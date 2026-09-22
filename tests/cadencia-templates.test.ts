/**
 * Cadência D1/D2/D3 — a parte que o cliente final enxerga.
 *
 * O que está testado aqui é o texto que sai no WhatsApp dele e o número para
 * onde vai. Erro nessas duas coisas não aparece como erro: aparece como
 * mensagem esquisita ou conversa aberta com número errado, e o corretor acha
 * que mandou.
 */
import { describe, expect, it } from "vitest";
import {
  acaoPrimaria,
  aplicarPlaceholders,
  linkWhatsApp,
  rotuloProgresso,
} from "@/features/cadencia/templates";

const D1 =
  "Oi, {nome}! Tudo bem? Aqui é da Seu Metro Quadrado. Você pediu informações sobre o {empreendimento} e acabei de tentar te ligar.";

describe("aplicarPlaceholders", () => {
  it("usa o PRIMEIRO nome, não o nome completo", () => {
    const texto = aplicarPlaceholders(D1, {
      nome: "Maria das Graças Silva",
      empreendimento: "Cury Leopoldina",
    });
    expect(texto).toContain("Oi, Maria!");
    expect(texto).not.toContain("das Graças");
  });

  it("troca todas as ocorrências da mesma chave", () => {
    const t = aplicarPlaceholders(
      "{nome}, o {empreendimento} é seu, {nome}. Veja o {empreendimento}.",
      {
        nome: "João Pedro",
        empreendimento: "Vibra Vila Maria",
      },
    );
    expect(t).toBe("João, o Vibra Vila Maria é seu, João. Veja o Vibra Vila Maria.");
  });

  it("não deixa placeholder cru vazar quando falta o dado", () => {
    const t = aplicarPlaceholders(D1, { nome: null, empreendimento: null });
    expect(t).not.toContain("{nome}");
    expect(t).not.toContain("{empreendimento}");
    expect(t).toContain("o empreendimento");
  });

  it("nome só com espaços não vira string vazia no meio da frase", () => {
    const t = aplicarPlaceholders("Oi, {nome}!", { nome: "   " });
    expect(t).toBe("Oi, tudo bem!");
  });
});

describe("linkWhatsApp", () => {
  it("prefixa o 55 num celular sem DDI", () => {
    expect(linkWhatsApp("(11) 98765-4321", "oi")).toBe("https://wa.me/5511987654321?text=oi");
  });

  it("NÃO duplica o 55 num número que já vem em E.164", () => {
    expect(linkWhatsApp("+55 11 98765-4321", "oi")).toBe("https://wa.me/5511987654321?text=oi");
  });

  it("aceita fixo com DDD (10 dígitos)", () => {
    expect(linkWhatsApp("1134567890", "oi")).toBe("https://wa.me/551134567890?text=oi");
  });

  it("recusa número curto demais para ser discável", () => {
    expect(linkWhatsApp("98765432", "oi")).toBeNull();
    expect(linkWhatsApp("", "oi")).toBeNull();
    expect(linkWhatsApp(null, "oi")).toBeNull();
  });

  it("escapa o texto, inclusive quebra de linha e acento", () => {
    const url = linkWhatsApp("11987654321", "Olá, João!\nTudo bem?");
    expect(url).toContain("text=Ol%C3%A1%2C%20Jo%C3%A3o!%0ATudo%20bem%3F");
  });
});

describe("rotuloProgresso", () => {
  it("mostra o contador de ligações em D1 e D2", () => {
    expect(rotuloProgresso({ etapa: "D1", ligacoes_validas: 1, whatsapp_enviado: false })).toBe(
      "D1 · 1 de 2 ligações · WhatsApp pendente",
    );
  });

  it("D3 não tem ligação no rótulo — é só a mensagem de encerramento", () => {
    expect(rotuloProgresso({ etapa: "D3", ligacoes_validas: 0, whatsapp_enviado: true })).toBe(
      "D3 · WhatsApp enviado",
    );
  });

  it("não passa de 2 no contador, mesmo com ligação extra registrada", () => {
    expect(
      rotuloProgresso({ etapa: "D2", ligacoes_validas: 5, whatsapp_enviado: false }),
    ).toContain("2 de 2 ligações");
  });
});

describe("acaoPrimaria", () => {
  const base = { telefone_suspeito: false } as const;

  it("antes das 2 ligações, ligar é o destaque", () => {
    expect(
      acaoPrimaria({ ...base, etapa: "D1", ligacoes_validas: 1, whatsapp_enviado: false }),
    ).toBe("ligar");
  });

  it("com as 2 ligações feitas, o WhatsApp vira o destaque", () => {
    expect(
      acaoPrimaria({ ...base, etapa: "D1", ligacoes_validas: 2, whatsapp_enviado: false }),
    ).toBe("whatsapp");
  });

  it("etapa cumprida não destaca nada", () => {
    expect(
      acaoPrimaria({ ...base, etapa: "D2", ligacoes_validas: 2, whatsapp_enviado: true }),
    ).toBe("nenhuma");
  });

  it("D3 começa direto no WhatsApp", () => {
    expect(
      acaoPrimaria({ ...base, etapa: "D3", ligacoes_validas: 0, whatsapp_enviado: false }),
    ).toBe("whatsapp");
  });

  it("telefone suspeito não sugere canal nenhum", () => {
    expect(
      acaoPrimaria({
        etapa: "D1",
        ligacoes_validas: 0,
        whatsapp_enviado: false,
        telefone_suspeito: true,
      }),
    ).toBe("nenhuma");
  });
});
