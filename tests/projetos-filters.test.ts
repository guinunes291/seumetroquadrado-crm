import { describe, it, expect } from "vitest";
import { applyFilters, emptyFilters, type Filters } from "@/components/projetos-filters";
import type { ProjetoRow } from "@/components/projeto-card";

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

const f = (over: Partial<Filters>): Filters => ({ ...emptyFilters, ...over });
const nomes = (rows: ProjetoRow[]) => rows.map((r) => r.nome).sort();

describe("applyFilters — busca textual", () => {
  const lista = [
    mk({ nome: "Residencial Aurora", construtora: "MRV", bairro: "Centro" }),
    mk({ nome: "Edifício São João", construtora: "Tenda", bairro: "Jardim América" }),
    mk({ nome: "Vila das Flores", endereco: "Rua das Acácias, 100" }),
  ];

  it("ignora maiúsculas/minúsculas", () => {
    expect(nomes(applyFilters(lista, f({ q: "AURORA" })))).toEqual(["Residencial Aurora"]);
  });

  it("ignora acentos (São ↔ sao, João ↔ joao)", () => {
    expect(nomes(applyFilters(lista, f({ q: "sao joao" })))).toEqual(["Edifício São João"]);
    expect(nomes(applyFilters(lista, f({ q: "edificio" })))).toEqual(["Edifício São João"]);
  });

  it("casa por nome parcial", () => {
    expect(nomes(applyFilters(lista, f({ q: "flor" })))).toEqual(["Vila das Flores"]);
  });

  it("busca em múltiplos campos (construtora, bairro, endereço)", () => {
    expect(nomes(applyFilters(lista, f({ q: "tenda" })))).toEqual(["Edifício São João"]);
    expect(nomes(applyFilters(lista, f({ q: "centro" })))).toEqual(["Residencial Aurora"]);
    expect(nomes(applyFilters(lista, f({ q: "acácias" })))).toEqual(["Vila das Flores"]);
  });

  it("retorna vazio quando nada casa", () => {
    expect(applyFilters(lista, f({ q: "inexistente" }))).toHaveLength(0);
  });

  it("emptyFilters retorna todos (limpar filtros)", () => {
    expect(applyFilters(lista, emptyFilters)).toHaveLength(3);
  });
});

describe("applyFilters — localização", () => {
  const lista = [
    mk({
      nome: "A",
      cidade: "São Paulo",
      regiao: "Zona Sul",
      bairro: "Moema",
      zona_smq: "Zona Sul",
    }),
    mk({ nome: "B", cidade: "São Paulo", regiao: "Centro", bairro: "Sé", zona_smq: "Centro" }),
    mk({ nome: "C", cidade: "Guarulhos", regiao: "Centro", bairro: "Centro" }),
  ];

  it("filtra por cidade", () => {
    expect(nomes(applyFilters(lista, f({ cidade: "Guarulhos" })))).toEqual(["C"]);
  });
  it("filtra por região", () => {
    expect(nomes(applyFilters(lista, f({ regiao: "Centro" })))).toEqual(["B", "C"]);
  });
  it("filtra por bairro", () => {
    expect(nomes(applyFilters(lista, f({ bairro: "Moema" })))).toEqual(["A"]);
  });
  it("filtra por zona e exclui quem não tem zona", () => {
    expect(nomes(applyFilters(lista, f({ zonas: ["Centro"] })))).toEqual(["B"]);
    expect(applyFilters(lista, f({ zonas: ["Zona Norte"] }))).toHaveLength(0);
  });
});

describe("applyFilters — construtora, status e fonte", () => {
  const lista = [
    mk({ nome: "A", construtora: "MRV", status_entrega: "Pronto", fonte: "interno" }),
    mk({ nome: "B", construtora: "Tenda", status_entrega: "Em obras", fonte: "parceiro" }),
  ];
  it("filtra por construtora (multi)", () => {
    expect(nomes(applyFilters(lista, f({ construtoras: ["MRV"] })))).toEqual(["A"]);
  });
  it("filtra por status da obra", () => {
    expect(nomes(applyFilters(lista, f({ status: ["Em obras"] })))).toEqual(["B"]);
  });
  it("filtra por fonte", () => {
    expect(nomes(applyFilters(lista, f({ fontes: ["parceiro"] })))).toEqual(["B"]);
  });
});

describe("applyFilters — faixa de preço e sob consulta", () => {
  const lista = [
    mk({ nome: "Barato", preco_a_partir: 300_000 }),
    mk({ nome: "Caro", preco_a_partir: 600_000 }),
    mk({ nome: "Consulta", preco_a_partir: null, sob_consulta: true }),
  ];

  it("aplica preço mínimo e, por padrão, inclui sob consulta", () => {
    expect(nomes(applyFilters(lista, f({ precoMin: 400_000 })))).toEqual(["Caro", "Consulta"]);
  });
  it("exclui sob consulta quando includeSobConsulta=false", () => {
    expect(nomes(applyFilters(lista, f({ precoMin: 400_000, includeSobConsulta: false })))).toEqual(
      ["Caro"],
    );
  });
  it("aplica preço máximo", () => {
    expect(nomes(applyFilters(lista, f({ precoMax: 400_000 })))).toEqual(["Barato", "Consulta"]);
  });
  it("sem faixa, exclui sob consulta apenas quando includeSobConsulta=false", () => {
    expect(nomes(applyFilters(lista, f({ includeSobConsulta: false })))).toEqual([
      "Barato",
      "Caro",
    ]);
  });
});

describe("applyFilters — dormitórios, suítes e vagas", () => {
  it("dormitórios por bucket sobre o range min/max", () => {
    const lista = [
      mk({ nome: "1d", dorms_min: 1, dorms_max: 1 }),
      mk({ nome: "2-3d", dorms_min: 2, dorms_max: 3 }),
    ];
    expect(nomes(applyFilters(lista, f({ dorms: ["1"] })))).toEqual(["1d"]);
    expect(nomes(applyFilters(lista, f({ dorms: ["3+"] })))).toEqual(["2-3d"]);
    expect(nomes(applyFilters(lista, f({ dorms: ["2"] })))).toEqual(["2-3d"]);
  });

  it("suítes por bucket", () => {
    const lista = [mk({ nome: "0s", suites: 0 }), mk({ nome: "2s", suites: 2 })];
    expect(nomes(applyFilters(lista, f({ suites: ["2"] })))).toEqual(["2s"]);
  });

  it("vagas: respeita includeSemVaga para projetos sem dado", () => {
    const lista = [
      mk({ nome: "ComVaga", vagas_min: 1, vagas_max: 2 }),
      mk({ nome: "SemDado", vagas_min: null, vagas_max: null }),
    ];
    // padrão inclui os sem dado
    expect(nomes(applyFilters(lista, f({ vagas: ["1"] })))).toEqual(["ComVaga", "SemDado"]);
    // sem incluir, some quem não tem dado de vaga
    expect(nomes(applyFilters(lista, f({ vagas: ["1"], includeSemVaga: false })))).toEqual([
      "ComVaga",
    ]);
  });
});

describe("applyFilters — área e ano de entrega", () => {
  it("filtra por faixa de metragem (overlap)", () => {
    const lista = [
      mk({ nome: "Compacto", metragem_min: 30, metragem_max: 45 }),
      mk({ nome: "Amplo", metragem_min: 80, metragem_max: 120 }),
    ];
    expect(nomes(applyFilters(lista, f({ areaMin: 70 })))).toEqual(["Amplo"]);
    expect(nomes(applyFilters(lista, f({ areaMax: 50 })))).toEqual(["Compacto"]);
  });

  it("filtra por ano de entrega e exclui quem não tem ano", () => {
    const lista = [
      mk({ nome: "2025", ano_entrega: 2025 }),
      mk({ nome: "2027", ano_entrega: 2027 }),
      mk({ nome: "SemAno", ano_entrega: null }),
    ];
    expect(nomes(applyFilters(lista, f({ entregaAnoMin: 2026 })))).toEqual(["2027"]);
  });
});

describe("applyFilters — combinação de filtros", () => {
  it("combina busca + região + preço", () => {
    const lista = [
      mk({ nome: "Aurora Sul", regiao: "Zona Sul", preco_a_partir: 500_000 }),
      mk({ nome: "Aurora Norte", regiao: "Zona Norte", preco_a_partir: 500_000 }),
      mk({ nome: "Aurora Sul Cara", regiao: "Zona Sul", preco_a_partir: 900_000 }),
    ];
    const res = applyFilters(lista, f({ q: "aurora", regiao: "Zona Sul", precoMax: 600_000 }));
    expect(nomes(res)).toEqual(["Aurora Sul"]);
  });
});
