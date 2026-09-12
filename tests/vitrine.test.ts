import { describe, it, expect } from "vitest";
import { deriveSituacao, entregaBadge } from "@/lib/vitrine/vitrine";
import { normalizeZona } from "@/lib/zonas";
import { mensagemEmpreendimento } from "@/lib/whatsapp";
import { mkProjeto as mk } from "./helpers/projeto";

describe("deriveSituacao", () => {
  it("reconhece Pronto, Lançamento e Em obras pelo texto", () => {
    expect(deriveSituacao(mk({ status_entrega: "Pronto" }))).toBe("Pronto");
    expect(deriveSituacao(mk({ status_entrega: "Lançamento" }))).toBe("Lançamento");
    expect(deriveSituacao(mk({ status_entrega: "Em obras" }))).toBe("Em obras");
  });

  it("trata data futura como Em obras mesmo sem texto", () => {
    expect(deriveSituacao(mk({ ano_entrega: 2028 }))).toBe("Em obras");
  });

  it("cai em 'A confirmar' quando não há sinal", () => {
    expect(deriveSituacao(mk({}))).toBe("A confirmar");
  });
});

describe("entregaBadge", () => {
  it("monta 'Entrega MM/AAAA' para obra com mês e ano", () => {
    expect(
      entregaBadge(mk({ status_entrega: "Em obras", mes_entrega: 6, ano_entrega: 2028 })),
    ).toBe("Entrega 06/2028");
  });

  it("usa só o ano quando não há mês", () => {
    expect(entregaBadge(mk({ status_entrega: "Em obras", ano_entrega: 2028 }))).toBe(
      "Entrega 2028",
    );
  });

  it("para pronto devolve a própria situação", () => {
    expect(entregaBadge(mk({ status_entrega: "Pronto" }))).toBe("Pronto");
  });
});

describe("normalizeZona", () => {
  it("normaliza aliases e caixa", () => {
    expect(normalizeZona("leste")).toBe("Leste");
    expect(normalizeZona("Central")).toBe("Centro");
    expect(normalizeZona("Zona desconhecida")).toBeNull();
    expect(normalizeZona(null)).toBeNull();
  });
});

describe("mensagemEmpreendimento", () => {
  it("usa só o primeiro nome e cita o empreendimento", () => {
    const msg = mensagemEmpreendimento("Maria Clara", {
      nome: "MK2 Estação",
      bairro: "Vila Carmosina",
    });
    expect(msg).toContain("Oi, Maria!");
    expect(msg).toContain("MK2 Estação");
    expect(msg).toContain("Vila Carmosina");
  });

  it("acrescenta o link do book quando informado", () => {
    const msg = mensagemEmpreendimento("João", {
      nome: "Today Tatuapé",
      bookUrl: "https://x/book.pdf",
    });
    expect(msg).toContain("Book do empreendimento: https://x/book.pdf");
  });

  it("omite o book quando ausente", () => {
    const msg = mensagemEmpreendimento("Ana", { nome: "Orbi Saúde" });
    expect(msg).not.toContain("Book do empreendimento");
  });
});
