import { describe, it, expect } from "vitest";
import {
  CAMPOS_COMPLETUDE,
  completudeProjeto,
  descreveFaltando,
  PESO_COMPLETUDE,
} from "@/lib/projetos-completude";

const completo = {
  preco_a_partir: 250_000,
  sob_consulta: false,
  book_url: "https://drive/book.pdf",
  tabela_precos_url: "https://drive/tabela.pdf",
  capa_url: "https://cdn/capa.jpg",
  metragem_min: 38,
  metragem_max: 52,
  dorms_min: 2,
  dorms_max: 2,
  status_entrega: "Obras",
  ano_entrega: 2028,
  renda_minima: 3_800,
  diferenciais: ["Lazer completo"],
};

describe("completudeProjeto", () => {
  it("os pesos somam 100 e o cadastro completo pontua 100", () => {
    const soma = CAMPOS_COMPLETUDE.reduce((acc, c) => acc + PESO_COMPLETUDE[c], 0);
    expect(soma).toBe(100);
    const r = completudeProjeto(completo, "Sul");
    expect(r.score).toBe(100);
    expect(r.faltando).toEqual([]);
    expect(r.prontoParaPrateleira).toBe(true);
  });

  it("'Sob consulta' marcado conta como preço decidido, não como falta", () => {
    const r = completudeProjeto({ ...completo, preco_a_partir: null, sob_consulta: true }, "Sul");
    expect(r.faltando).not.toContain("preco");
  });

  it("lista o que falta na ordem do peso", () => {
    const r = completudeProjeto(
      { ...completo, preco_a_partir: null, capa_url: null, renda_minima: null },
      "Sul",
    );
    expect(r.faltando).toEqual(["preco", "capa", "renda"]);
    expect(r.score).toBe(100 - 20 - 15 - 3);
  });

  it("mínimo da prateleira: zona conhecida e ao menos um material", () => {
    expect(
      completudeProjeto({ ...completo, tabela_precos_url: null }, "Leste").prontoParaPrateleira,
    ).toBe(true);
    expect(
      completudeProjeto({ ...completo, book_url: null, tabela_precos_url: null }, "Leste")
        .prontoParaPrateleira,
    ).toBe(false);
    expect(completudeProjeto(completo, null).prontoParaPrateleira).toBe(false);
  });

  it("projeto vazio pontua zero", () => {
    const r = completudeProjeto({}, null);
    expect(r.score).toBe(0);
    expect(r.faltando).toHaveLength(CAMPOS_COMPLETUDE.length);
  });
});

describe("descreveFaltando", () => {
  it("resume os três primeiros e conta o resto", () => {
    expect(descreveFaltando(["preco", "book", "tabela", "capa", "zona"])).toBe(
      "Falta: Preço a partir de, Book, Tabela de preços e mais 2",
    );
    expect(descreveFaltando([])).toBe("Cadastro completo");
  });
});
