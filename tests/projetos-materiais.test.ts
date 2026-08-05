import { describe, it, expect } from "vitest";
import { diffMateriais, urlValida } from "@/lib/materiais";

describe("urlValida", () => {
  it("aceita link de Drive colado da barra de endereço", () => {
    expect(urlValida("https://drive.google.com/file/d/1abc/view?usp=drive_link")).toBe(true);
    expect(urlValida("http://exemplo.com/tabela.pdf")).toBe(true);
  });

  it("aceita campo vazio — apagar um link é edição legítima", () => {
    expect(urlValida("")).toBe(true);
    expect(urlValida("   ")).toBe(true);
  });

  it("recusa o que não abre no navegador", () => {
    expect(urlValida("drive.google.com/file/d/1abc")).toBe(false);
    expect(urlValida("//servidor/pasta/book.pdf")).toBe(false);
    expect(urlValida("javascript:alert(1)")).toBe(false);
  });
});

describe("diffMateriais", () => {
  const gravado = { book_url: "https://a/book.pdf", tabela_precos_url: null };

  it("não reporta mudança quando nada mudou", () => {
    expect(
      diffMateriais(gravado, { book_url: "https://a/book.pdf", tabela_precos_url: "" }),
    ).toEqual({});
  });

  it("ignora espaço em volta — colar do Drive costuma trazer sobra", () => {
    expect(
      diffMateriais(gravado, { book_url: "  https://a/book.pdf  ", tabela_precos_url: "" }),
    ).toEqual({});
  });

  it("grava NULL ao esvaziar, não string vazia", () => {
    expect(diffMateriais(gravado, { book_url: "", tabela_precos_url: "" })).toEqual({
      book_url: null,
    });
  });

  it("reporta só o campo que mudou", () => {
    expect(
      diffMateriais(gravado, {
        book_url: "https://a/book.pdf",
        tabela_precos_url: "https://a/tabela.pdf",
      }),
    ).toEqual({ tabela_precos_url: "https://a/tabela.pdf" });
  });

  it("trata ausência de coluna como nulo", () => {
    expect(
      diffMateriais(
        { book_url: null, tabela_precos_url: null },
        { book_url: "", tabela_precos_url: "" },
      ),
    ).toEqual({});
  });
});
