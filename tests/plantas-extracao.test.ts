// Plantas do book: heurística de página, legenda sugerida, leitura defensiva do
// jsonb e extração do ID do Drive (usada pelo proxy /api/book-pdf).
import { describe, expect, it } from "vitest";
import {
  ehProvavelPlanta,
  idDoDrive,
  legendaDaPlanta,
  parsePlantas,
  pontuarPaginaPlanta,
  PLANTAS_MAX,
} from "@/lib/plantas";

// Textos no formato que o pdf.js devolve de books reais (itens colados por espaço).
const PAGINA_PLANTA =
  "PLANTA TIPO 2 DORMS Área privativa 41,52 m² Sala de estar/jantar Cozinha A.S. Banho Dorm. 1 Dorm. 2 Terraço Finais 3 e 4";
const PAGINA_LAZER =
  "LAZER COMPLETO Piscina adulto e infantil Churrasqueira Salão de festas Playground Implantação do térreo";
const PAGINA_FACHADA = "Perspectiva ilustrada da fachada. Imagem meramente ilustrativa.";

describe("pontuarPaginaPlanta", () => {
  it("página de planta pontua acima do limiar; lazer e fachada não", () => {
    expect(ehProvavelPlanta(PAGINA_PLANTA)).toBe(true);
    expect(ehProvavelPlanta(PAGINA_LAZER)).toBe(false);
    expect(ehProvavelPlanta(PAGINA_FACHADA)).toBe(false);
    expect(pontuarPaginaPlanta(PAGINA_PLANTA)).toBeGreaterThan(pontuarPaginaPlanta(PAGINA_LAZER));
  });

  it("book só-imagem (sem texto) não pré-marca nada", () => {
    expect(pontuarPaginaPlanta("")).toBe(0);
    expect(pontuarPaginaPlanta("   ")).toBe(0);
  });

  it("ignora acento e caixa", () => {
    expect(ehProvavelPlanta("planta tipo 1 dormitório área útil 33 m2 sala cozinha banho")).toBe(
      true,
    );
  });
});

describe("legendaDaPlanta", () => {
  it("monta dorms · área · finais", () => {
    expect(legendaDaPlanta(PAGINA_PLANTA)).toBe("2 dorms · 41,52 m² · final 3 e 4");
  });

  it("'tipo 2' não vira final (é o nº de dorms)", () => {
    expect(legendaDaPlanta("Planta tipo 2 dorms 38 m²")).toBe("2 dorms · 38 m²");
  });

  it("singular e sem dado", () => {
    expect(legendaDaPlanta("1 dorm 28,5 m2")).toBe("1 dorm · 28,5 m²");
    expect(legendaDaPlanta("Implantação")).toBeNull();
  });
});

describe("parsePlantas", () => {
  it("aceita só https, normaliza legenda/página e corta no máximo", () => {
    const raw = [
      {
        url: "https://x.supabase.co/storage/v1/object/public/projetos-plantas/a/p3.jpg",
        legenda: " 2 dorms ",
        pagina: 3,
      },
      { url: "http://inseguro/p.jpg", legenda: "x", pagina: 1 },
      { url: "javascript:alert(1)" },
      { url: "https://ok/p.jpg", legenda: "", pagina: -2 },
      "lixo",
      null,
    ];
    expect(parsePlantas(raw)).toEqual([
      {
        url: "https://x.supabase.co/storage/v1/object/public/projetos-plantas/a/p3.jpg",
        legenda: "2 dorms",
        pagina: 3,
      },
      { url: "https://ok/p.jpg", legenda: null, pagina: null },
    ]);
    const muitas = Array.from({ length: 20 }, (_, i) => ({ url: `https://ok/${i}.jpg` }));
    expect(parsePlantas(muitas)).toHaveLength(PLANTAS_MAX);
  });

  it("valor que não é lista vira lista vazia", () => {
    expect(parsePlantas(null)).toEqual([]);
    expect(parsePlantas({})).toEqual([]);
  });
});

describe("idDoDrive", () => {
  it("extrai de /file/d/ID e de ?id=", () => {
    expect(idDoDrive("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing")).toBe(
      "1AbCdEfGhIjKlMnOp",
    );
    expect(idDoDrive("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp")).toBe(
      "1AbCdEfGhIjKlMnOp",
    );
  });

  it("recusa host que não é Drive (o proxy nunca busca URL arbitrária)", () => {
    expect(idDoDrive("https://evil.example.com/file/d/1AbCdEfGhIjKlMnOp/view")).toBeNull();
    expect(idDoDrive("http://169.254.169.254/latest")).toBeNull();
    expect(idDoDrive("não é url")).toBeNull();
    expect(idDoDrive(null)).toBeNull();
  });
});
