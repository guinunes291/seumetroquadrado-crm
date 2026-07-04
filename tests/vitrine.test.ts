import { describe, it, expect } from "vitest";
import type { ProjetoRow } from "@/components/projeto-card";
import {
  applyVitrineFilters,
  deriveSituacao,
  entregaBadge,
  zonasDisponiveis,
  emptyVitrineFilters,
  type VitrineFilters,
} from "@/lib/vitrine/vitrine";
import {
  schematicProjection,
  pinColor,
  normalizeZona,
} from "@/lib/vitrine/map-projection";
import { mensagemEmpreendimento } from "@/lib/whatsapp";

// Fábrica de projeto com defaults nulos; sobrescreve só o que o teste precisa.
function mk(over: Partial<ProjetoRow>): ProjetoRow {
  return {
    id: "x",
    nome: "Projeto",
    slug: "projeto",
    construtora: null,
    cidade: null,
    regiao: null,
    bairro: null,
    endereco: null,
    logradouro: null,
    numero: null,
    observacoes: null,
    ativo: true,
    metragem_min: null,
    metragem_max: null,
    dorms_min: null,
    dorms_max: null,
    suites: null,
    tipologia: null,
    tipo_extra: null,
    vagas_min: null,
    vagas_max: null,
    vagas_observacao: null,
    preco_a_partir: null,
    sob_consulta: false,
    status_entrega: null,
    mes_entrega: null,
    ano_entrega: null,
    fonte: null,
    zona_smq: null,
    ...over,
  };
}

const f = (over: Partial<VitrineFilters>): VitrineFilters => ({ ...emptyVitrineFilters, ...over });
const nomes = (rows: ProjetoRow[]) => rows.map((r) => r.nome);

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
    expect(entregaBadge(mk({ status_entrega: "Em obras", mes_entrega: 6, ano_entrega: 2028 }))).toBe(
      "Entrega 06/2028",
    );
  });

  it("usa só o ano quando não há mês", () => {
    expect(entregaBadge(mk({ status_entrega: "Em obras", ano_entrega: 2028 }))).toBe("Entrega 2028");
  });

  it("para pronto devolve a própria situação", () => {
    expect(entregaBadge(mk({ status_entrega: "Pronto" }))).toBe("Pronto");
  });
});

describe("applyVitrineFilters", () => {
  const lista = [
    mk({ nome: "Leste Barato", zona_smq: "Leste", preco_a_partir: 190000, dorms_min: 2, dorms_max: 2 }),
    mk({ nome: "Sul Caro", zona_smq: "Sul", preco_a_partir: 400000, dorms_min: 1, dorms_max: 1 }),
    mk({
      nome: "Centro Consulta",
      zona_smq: "Centro",
      preco_a_partir: null,
      sob_consulta: true,
      dorms_min: 3,
      dorms_max: 3,
    }),
  ];

  it("filtra por zona (normalizando acento/caixa)", () => {
    expect(nomes(applyVitrineFilters(lista, f({ zona: "Leste" })))).toEqual(["Leste Barato"]);
  });

  it("filtra pelo orçamento e ignora 'sob consulta'", () => {
    expect(nomes(applyVitrineFilters(lista, f({ budget: 200000 })))).toEqual(["Leste Barato"]);
  });

  it("filtra por dormitórios (1 dorm)", () => {
    expect(nomes(applyVitrineFilters(lista, f({ dorm: "1 dorm" })))).toEqual(["Sul Caro"]);
  });

  it("ordena por menor preço com 'sob consulta' por último", () => {
    expect(nomes(applyVitrineFilters(lista, f({ sort: "preco-asc" })))).toEqual([
      "Leste Barato",
      "Sul Caro",
      "Centro Consulta",
    ]);
  });

  it("busca textual ignora acento e caixa", () => {
    expect(nomes(applyVitrineFilters(lista, f({ q: "CENTRO" })))).toEqual(["Centro Consulta"]);
  });
});

describe("zonasDisponiveis", () => {
  it("devolve zonas presentes na ordem geográfica", () => {
    const rows = [mk({ zona_smq: "Centro" }), mk({ zona_smq: "Leste" }), mk({ zona_smq: null })];
    expect(zonasDisponiveis(rows)).toEqual(["Leste", "Centro"]);
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

describe("pinColor", () => {
  it("mapeia o preço para a faixa correta", () => {
    expect(pinColor(null)).toBe("#AAB6C4");
    expect(pinColor(200000)).toBe("#87ACD1");
    expect(pinColor(250000)).toBe("#4E7FB0");
    expect(pinColor(300000)).toBe("#2C588C");
    expect(pinColor(400000)).toBe("#0F2A4A");
  });
});

describe("schematicProjection", () => {
  it("é determinística (mesmo id → mesmo ponto)", () => {
    const p = mk({ id: "abc", zona_smq: "Sul" });
    expect(schematicProjection(p)).toEqual(schematicProjection(p));
  });

  it("mantém o ponto dentro dos limites do mapa", () => {
    for (const zona of ["Norte", "Sul", "Leste", "Oeste", "Centro", null]) {
      const pt = schematicProjection(mk({ id: `id-${zona}`, zona_smq: zona }))!;
      expect(pt.x).toBeGreaterThanOrEqual(3);
      expect(pt.x).toBeLessThanOrEqual(97);
      expect(pt.y).toBeGreaterThanOrEqual(4);
      expect(pt.y).toBeLessThanOrEqual(96);
    }
  });
});

describe("mensagemEmpreendimento", () => {
  it("usa só o primeiro nome e cita o empreendimento", () => {
    const msg = mensagemEmpreendimento("Maria Clara", { nome: "MK2 Estação", bairro: "Vila Carmosina" });
    expect(msg).toContain("Oi, Maria!");
    expect(msg).toContain("MK2 Estação");
    expect(msg).toContain("Vila Carmosina");
  });

  it("acrescenta o link do book quando informado", () => {
    const msg = mensagemEmpreendimento("João", { nome: "Today Tatuapé", bookUrl: "https://x/book.pdf" });
    expect(msg).toContain("Book do empreendimento: https://x/book.pdf");
  });

  it("omite o book quando ausente", () => {
    const msg = mensagemEmpreendimento("Ana", { nome: "Orbi Saúde" });
    expect(msg).not.toContain("Book do empreendimento");
  });
});
