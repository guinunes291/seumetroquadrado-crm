import { describe, it, expect } from "vitest";
import { casarColagem, diffMateriais, parseColagem, urlValida } from "@/lib/materiais";

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

describe("parseColagem", () => {
  it("aceita TAB (o que sai do Sheets) e ponto-e-vírgula", () => {
    const texto = "MA Lapa\thttps://a/book.pdf\thttps://a/tab.pdf\nMA Mooca;https://b/book.pdf";
    expect(parseColagem(texto)).toEqual([
      { nome: "MA Lapa", book_url: "https://a/book.pdf", tabela_precos_url: "https://a/tab.pdf" },
      { nome: "MA Mooca", book_url: "https://b/book.pdf", tabela_precos_url: "" },
    ]);
  });

  it("ignora linhas em branco", () => {
    expect(parseColagem("\n\n  \nMA Lapa;https://a/b.pdf\n")).toHaveLength(1);
  });
});

describe("casarColagem", () => {
  const projetos = [
    { id: "1", nome: "MA Lapa Residence", book_url: null, tabela_precos_url: null },
    { id: "2", nome: "MA Mooca", book_url: null, tabela_precos_url: null },
    { id: "3", nome: "Elevato Brooklin", book_url: null, tabela_precos_url: null },
    { id: "4", nome: "MA Brooklin", book_url: null, tabela_precos_url: null },
  ];

  it("casa por nome exato ignorando acento e caixa", () => {
    const r = casarColagem(
      [{ nome: "ma mooca", book_url: "https://a/b.pdf", tabela_precos_url: "" }],
      projetos,
    );
    expect(r.aplicados).toEqual([
      { projeto: projetos[1], valores: { book_url: "https://a/b.pdf" } },
    ]);
    expect(r.ignorados).toEqual([]);
  });

  it("casa por continência quando o nome do Drive é mais curto", () => {
    const r = casarColagem(
      [{ nome: "MA Lapa", book_url: "https://a/b.pdf", tabela_precos_url: "" }],
      projetos,
    );
    expect(r.aplicados[0].projeto.id).toBe("1");
  });

  it("NÃO expande abreviação: 'MA Lapa' não vira 'Mundo Apto Lapa' por conta própria", () => {
    // Limite consciente. O Drive abrevia a construtora ("MA") e o CRM às vezes
    // escreve por extenso; adivinhar isso escreveria o book errado num projeto
    // parecido. A linha volta para a pessoa renomear ou casar à mão.
    const r = casarColagem(
      [{ nome: "MA Lapa", book_url: "https://a/b.pdf", tabela_precos_url: "" }],
      [{ id: "9", nome: "Mundo Apto Lapa", book_url: null, tabela_precos_url: null }],
    );
    expect(r.aplicados).toEqual([]);
    expect(r.ignorados).toEqual(["MA Lapa"]);
  });

  it("não adivinha quando mais de um projeto casa", () => {
    const r = casarColagem(
      [{ nome: "Brooklin", book_url: "https://a/b.pdf", tabela_precos_url: "" }],
      projetos,
    );
    expect(r.aplicados).toEqual([]);
    expect(r.ignorados).toEqual(["Brooklin"]);
  });

  it("devolve o nome quando não existe projeto correspondente", () => {
    const r = casarColagem(
      [{ nome: "Projeto Fantasma", book_url: "https://a/b.pdf", tabela_precos_url: "" }],
      projetos,
    );
    expect(r.ignorados).toEqual(["Projeto Fantasma"]);
  });

  it("ignora linha sem nenhum link — não serve para apagar material por engano", () => {
    const r = casarColagem([{ nome: "MA Mooca", book_url: "", tabela_precos_url: "" }], projetos);
    expect(r.aplicados).toEqual([]);
    expect(r.ignorados).toEqual(["MA Mooca"]);
  });

  it("aplica só o campo preenchido, preservando o outro", () => {
    const r = casarColagem(
      [{ nome: "MA Mooca", book_url: "", tabela_precos_url: "https://a/t.pdf" }],
      projetos,
    );
    expect(r.aplicados[0].valores).toEqual({ tabela_precos_url: "https://a/t.pdf" });
  });
});
