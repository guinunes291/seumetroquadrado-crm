// Regras puras dos materiais de venda da página de produto
// (docs/portal-empreendimento.md).
import { describe, expect, it } from "vitest";
import {
  TIPOS_MATERIAL,
  TITULO_BOOK_LEGADO,
  TITULO_TABELA_LEGADA,
  agruparMateriais,
  chaveDaUrl,
  eventoDeAbertura,
  hostLegivel,
  inferirTipoPelaUrl,
  materiaisDoProjeto,
  moverMaterial,
  proximaOrdem,
  textoMateriaisParaWhatsApp,
  validarMaterial,
  type MaterialRow,
} from "@/lib/projeto-materiais";

const linha = (
  over: Partial<MaterialRow> & Pick<MaterialRow, "id" | "tipo" | "url">,
): MaterialRow => ({
  titulo: over.id,
  descricao: null,
  ordem: 0,
  ativo: true,
  ...over,
});

describe("materiaisDoProjeto — fusão das colunas antigas com a tabela", () => {
  it("book e tabela das colunas do projeto entram como legados, na frente do tipo", () => {
    const lista = materiaisDoProjeto(
      {
        book_url: "https://drive.google.com/book",
        tabela_precos_url: "https://drive.google.com/tabela",
      },
      [
        linha({
          id: "b2",
          tipo: "book",
          url: "https://drive.google.com/book-lazer",
          titulo: "Book do lazer",
        }),
      ],
    );
    expect(lista.map((m) => m.id)).toEqual(["legado:book", "b2", "legado:tabela"]);
    expect(lista[0]).toMatchObject({ titulo: TITULO_BOOK_LEGADO, origem: "projeto" });
    expect(lista[2]).toMatchObject({ titulo: TITULO_TABELA_LEGADA, origem: "projeto" });
  });

  it("não duplica um material da tabela que aponta para a mesma URL do legado", () => {
    const lista = materiaisDoProjeto({ book_url: "https://Drive.Google.com/book/" }, [
      linha({ id: "dup", tipo: "book", url: "https://drive.google.com/book#page=1" }),
    ]);
    expect(lista).toHaveLength(1);
    expect(lista[0].id).toBe("legado:book");
  });

  it("esconde inativos mesmo que o banco os devolva (gestão enxerga pela RLS)", () => {
    const lista = materiaisDoProjeto({}, [
      linha({ id: "a", tipo: "planta", url: "https://x/a", ativo: false }),
      linha({ id: "b", tipo: "planta", url: "https://x/b" }),
    ]);
    expect(lista.map((m) => m.id)).toEqual(["b"]);
  });

  it("respeita a ordem da gestão dentro do tipo e a ordem dos tipos entre grupos", () => {
    const lista = materiaisDoProjeto({}, [
      linha({ id: "v", tipo: "video", url: "https://x/v" }),
      linha({ id: "p2", tipo: "planta", url: "https://x/p2", ordem: 20 }),
      linha({ id: "p1", tipo: "planta", url: "https://x/p1", ordem: 10 }),
      linha({ id: "t", tipo: "tabela", url: "https://x/t" }),
    ]);
    expect(lista.map((m) => m.id)).toEqual(["t", "p1", "p2", "v"]);
  });

  it("ignora colunas em branco", () => {
    expect(materiaisDoProjeto({ book_url: "  ", tabela_precos_url: null }, [])).toEqual([]);
  });
});

describe("agruparMateriais", () => {
  it("agrupa na ordem canônica e pula tipos vazios", () => {
    const grupos = agruparMateriais(
      materiaisDoProjeto({ tabela_precos_url: "https://x/t" }, [
        linha({ id: "a", tipo: "arte", url: "https://x/a" }),
        linha({ id: "p", tipo: "planta", url: "https://x/p" }),
      ]),
    );
    expect(grupos.map((g) => g.tipo)).toEqual(["tabela", "planta", "arte"]);
    expect(grupos[1].plural).toBe("Plantas");
  });

  it("cobre todos os tipos do CHECK da migration", () => {
    expect(TIPOS_MATERIAL.map((t) => t.tipo)).toEqual([
      "book",
      "tabela",
      "planta",
      "video",
      "tour",
      "memorial",
      "apresentacao",
      "arte",
      "outro",
    ]);
  });
});

describe("chaveDaUrl", () => {
  it("normaliza caixa do host, www, barra final e fragmento", () => {
    expect(chaveDaUrl("https://WWW.Exemplo.com/a/b/")).toBe("exemplo.com/a/b");
    expect(chaveDaUrl("https://exemplo.com/a/b#x")).toBe("exemplo.com/a/b");
  });

  it("mantém a query (dois arquivos do Drive diferem só pelo id)", () => {
    expect(chaveDaUrl("https://drive.google.com/open?id=1")).not.toBe(
      chaveDaUrl("https://drive.google.com/open?id=2"),
    );
  });
});

describe("inferirTipoPelaUrl", () => {
  it("host de vídeo vence o caminho", () => {
    expect(inferirTipoPelaUrl("https://www.youtube.com/watch?v=book-tour")).toBe("video");
    expect(inferirTipoPelaUrl("https://youtu.be/abc")).toBe("video");
    expect(inferirTipoPelaUrl("https://vimeo.com/123")).toBe("video");
  });

  it("reconhece tour, planta, tabela, memorial, apresentação e book pelo caminho", () => {
    expect(inferirTipoPelaUrl("https://my.matterport.com/show/?m=x")).toBe("tour");
    expect(inferirTipoPelaUrl("https://drive.google.com/file/d/x/Plantas%20Tipo.pdf")).toBe(
      "planta",
    );
    expect(inferirTipoPelaUrl("https://drive.google.com/tabela-de-precos-set.pdf")).toBe("tabela");
    expect(inferirTipoPelaUrl("https://x.com/memorial-descritivo.pdf")).toBe("memorial");
    expect(inferirTipoPelaUrl("https://x.com/treinamento-produto.pdf")).toBe("apresentacao");
    expect(inferirTipoPelaUrl("https://x.com/Book_Residencial.pdf")).toBe("book");
    expect(inferirTipoPelaUrl("https://www.canva.com/design/abc")).toBe("arte");
  });

  it("devolve null quando não dá para saber", () => {
    expect(inferirTipoPelaUrl("https://drive.google.com/file/d/xyz/view")).toBeNull();
    expect(inferirTipoPelaUrl("")).toBeNull();
  });
});

describe("hostLegivel", () => {
  it("nomeia hosts conhecidos e cai no domínio nos demais", () => {
    expect(hostLegivel("https://drive.google.com/x")).toBe("Google Drive");
    expect(hostLegivel("https://youtu.be/x")).toBe("YouTube");
    expect(hostLegivel("https://www.construtora.com.br/book.pdf")).toBe("construtora.com.br");
    expect(hostLegivel("não é url")).toBe("link");
  });
});

describe("eventoDeAbertura", () => {
  it("book e tabela mantêm os eventos históricos; o resto é material_abrir", () => {
    expect(eventoDeAbertura("book")).toBe("book_abrir");
    expect(eventoDeAbertura("tabela")).toBe("tabela_abrir");
    expect(eventoDeAbertura("planta")).toBe("material_abrir");
    expect(eventoDeAbertura("video")).toBe("material_abrir");
  });
});

describe("validarMaterial — espelha o CHECK da tabela", () => {
  it("aceita entrada completa e normaliza espaços/descrição vazia", () => {
    const r = validarMaterial({
      tipo: "planta",
      titulo: "  Planta 2 dorms ",
      url: " https://x.com/p.pdf ",
      descricao: "  ",
    });
    expect(r).toEqual({
      ok: true,
      valor: {
        tipo: "planta",
        titulo: "Planta 2 dorms",
        url: "https://x.com/p.pdf",
        descricao: null,
      },
    });
  });

  it("recusa tipo desconhecido, título vazio/longo, link sem http(s) e descrição longa", () => {
    expect(validarMaterial({ tipo: "pdf", titulo: "x", url: "https://x" }).ok).toBe(false);
    expect(validarMaterial({ tipo: "book", titulo: "  ", url: "https://x" }).ok).toBe(false);
    expect(validarMaterial({ tipo: "book", titulo: "a".repeat(121), url: "https://x" }).ok).toBe(
      false,
    );
    expect(validarMaterial({ tipo: "book", titulo: "x", url: "ftp://x" }).ok).toBe(false);
    expect(validarMaterial({ tipo: "book", titulo: "x", url: "drive.google.com/x" }).ok).toBe(
      false,
    );
    expect(
      validarMaterial({ tipo: "book", titulo: "x", url: "https://x", descricao: "d".repeat(301) })
        .ok,
    ).toBe(false);
  });
});

describe("textoMateriaisParaWhatsApp", () => {
  it("lista cada link com o rótulo do tipo quando é único e o título quando há vários", () => {
    const texto = textoMateriaisParaWhatsApp(
      "Residencial Aurora",
      materiaisDoProjeto({ book_url: "https://x/book" }, [
        linha({ id: "p1", tipo: "planta", url: "https://x/p1", titulo: "Planta 1 dorm" }),
        linha({ id: "p2", tipo: "planta", url: "https://x/p2", titulo: "Planta 2 dorms" }),
      ]),
    );
    expect(texto).toContain("*Materiais — Residencial Aurora*");
    expect(texto).toContain("• Book: https://x/book");
    expect(texto).toContain("• Planta 1 dorm: https://x/p1");
    expect(texto).toContain("• Planta 2 dorms: https://x/p2");
  });
});

describe("moverMaterial / proximaOrdem", () => {
  const linhas = [
    linha({ id: "p1", tipo: "planta", url: "https://x/p1", ordem: 10 }),
    linha({ id: "p2", tipo: "planta", url: "https://x/p2", ordem: 20 }),
    linha({ id: "p3", tipo: "planta", url: "https://x/p3", ordem: 30 }),
    linha({ id: "v1", tipo: "video", url: "https://x/v1", ordem: 10 }),
  ];

  it("troca com o vizinho do MESMO tipo e devolve só as ordens que mudaram", () => {
    expect(moverMaterial(linhas, "p3", "cima")).toEqual([
      { id: "p3", ordem: 20 },
      { id: "p2", ordem: 30 },
    ]);
  });

  it("não sai do grupo nem passa das bordas", () => {
    expect(moverMaterial(linhas, "p1", "cima")).toEqual([]);
    expect(moverMaterial(linhas, "p3", "baixo")).toEqual([]);
    expect(moverMaterial(linhas, "v1", "cima")).toEqual([]);
    expect(moverMaterial(linhas, "nao-existe", "baixo")).toEqual([]);
  });

  it("renumera de 10 em 10 quando as ordens vieram bagunçadas", () => {
    const bagunca = [
      linha({ id: "a", tipo: "arte", url: "https://x/a", ordem: 0 }),
      linha({ id: "b", tipo: "arte", url: "https://x/b", ordem: 0 }),
    ];
    // Empate de ordem desempata pelo título (a < b); mover "b" para cima inverte.
    expect(moverMaterial(bagunca, "b", "cima")).toEqual([
      { id: "b", ordem: 10 },
      { id: "a", ordem: 20 },
    ]);
  });

  it("material novo entra depois do último do tipo", () => {
    expect(proximaOrdem(linhas, "planta")).toBe(40);
    expect(proximaOrdem(linhas, "tour")).toBe(10);
  });
});
