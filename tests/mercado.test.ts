import { describe, it, expect } from "vitest";
import { mkProjeto } from "./helpers/projeto";
import {
  gvizToRows,
  linkSeguro,
  normalizarPreco,
  rowsToEmpreendimentos,
  unwrapGviz,
  type PlanilhaEmpreendimento,
} from "@/lib/vitrine/planilha-mercado";
import {
  aplicarFiltrosMercado,
  chaveMercado,
  filtrosMercadoVazios,
  mesclarMercado,
  situacaoDaPlanilha,
  zonasDoMercado,
  type MercadoFilters,
} from "@/lib/vitrine/mercado";
import {
  calcularPoderDeCompra,
  classificar,
  coberturaPercentual,
  perfilClienteVazio,
  RENDA_MINIMA,
  type PerfilCliente,
} from "@/lib/vitrine/poder-de-compra";

const mkPlanilha = (over: Partial<PlanilhaEmpreendimento> = {}): PlanilhaEmpreendimento => ({
  construtora: null,
  nome: "Da planilha",
  status: null,
  cidade: null,
  regiao: null,
  endereco: null,
  lat: null,
  lng: null,
  precoMin: null,
  precoMax: null,
  m2min: null,
  m2max: null,
  bookUrl: null,
  tabelaUrl: null,
  atualizadoEm: null,
  ...over,
});

const perfil = (over: Partial<PerfilCliente>): PerfilCliente => ({
  ...perfilClienteVazio,
  ...over,
});

const filtros = (over: Partial<MercadoFilters>): MercadoFilters => ({
  ...filtrosMercadoVazios,
  ...over,
});

const nomes = (itens: { nome: string }[]) => itens.map((e) => e.nome);

// ---------------------------------------------------------------------------
// Leitura da planilha
// ---------------------------------------------------------------------------

describe("planilha de mercado — leitura do gviz", () => {
  it("desembrulha a resposta JSONP que o Google devolve mesmo com out:json", () => {
    const corpo = `/*O_o*/\ngoogle.visualization.Query.setResponse({"table":{"rows":[]}});`;
    expect(unwrapGviz(corpo)).toEqual({ table: { rows: [] } });
  });

  it("recusa corpo sem JSON em vez de devolver dado vazio", () => {
    expect(() => unwrapGviz("erro 403 forbidden")).toThrow();
  });

  it("converte datas do Sheets para dd/mm/aaaa", () => {
    const json = { table: { rows: [{ c: [{ v: "Date(2026,7,15)" }, { v: 12 }, null] }] } };
    expect(gvizToRows(json)).toEqual([["15/08/2026", "12", ""]]);
  });
});

describe("planilha de mercado — linhas para empreendimentos", () => {
  const cabecalho = ["Construtora", "Empreendimento", "Status"];
  const linha = (over: string[] = []) => {
    const base = Array.from({ length: 18 }, () => "");
    base[0] = "Vibra";
    base[1] = "Vibra Tatuapé";
    base[2] = "Em obras";
    base[6] = "-23,55";
    base[7] = "-46,63";
    base[8] = "285000";
    over.forEach((v, i) => {
      if (v !== "") base[i] = v;
    });
    return base;
  };

  it("devolve null quando o cabeçalho 'Construtora' não existe", () => {
    expect(rowsToEmpreendimentos([["Outra coisa"], ["x"]])).toBeNull();
  });

  it("lê a linha completa, aceitando vírgula decimal nas coordenadas", () => {
    const [emp] = rowsToEmpreendimentos([cabecalho, linha()])!;
    expect(emp.nome).toBe("Vibra Tatuapé");
    expect(emp.construtora).toBe("Vibra");
    expect(emp.lat).toBeCloseTo(-23.55);
    expect(emp.lng).toBeCloseTo(-46.63);
    expect(emp.precoMin).toBe(285000);
  });

  it("descarta linhas sem nome e as marcadas para apagar", () => {
    const semNome = linha();
    semNome[1] = "";
    const marcada = linha();
    marcada[1] = "TESTE - apagar antes de usar";
    expect(rowsToEmpreendimentos([cabecalho, semNome, marcada])).toEqual([]);
  });

  it("não carrega as colunas de contato e WhatsApp", () => {
    const comContato = linha();
    comContato[14] = "Joana";
    comContato[15] = "11999998888";
    const [emp] = rowsToEmpreendimentos([cabecalho, comContato])!;
    expect(JSON.stringify(emp)).not.toContain("11999998888");
    expect(JSON.stringify(emp)).not.toContain("Joana");
  });
});

describe("planilha de mercado — saneamento", () => {
  it("corrige preço que o Sheets leu como decimal (285 -> 285.000)", () => {
    expect(normalizarPreco(285)).toBe(285000);
    expect(normalizarPreco(285000)).toBe(285000);
    expect(normalizarPreco(0)).toBeNull();
    expect(normalizarPreco(null)).toBeNull();
  });

  it("só aceita link http(s) e sem credencial embutida", () => {
    expect(linkSeguro("https://drive.google.com/book.pdf")).toBe(
      "https://drive.google.com/book.pdf",
    );
    expect(linkSeguro("javascript:alert(1)")).toBeNull();
    expect(linkSeguro("https://user:senha@x.com/a")).toBeNull();
    expect(linkSeguro("  ")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Mesclagem CRM + planilha
// ---------------------------------------------------------------------------

describe("mesclarMercado", () => {
  it("o CRM manda: item duplicado não vira dois pinos", () => {
    const itens = mesclarMercado(
      [mkProjeto({ id: "1", nome: "Vibra Tatuapé", construtora: "Vibra" })],
      [mkPlanilha({ nome: "vibra tatuapé", construtora: "VIBRA" })],
    );
    expect(itens).toHaveLength(1);
    expect(itens[0].origem).toBe("crm");
  });

  it("casa por nome quando a construtora está grafada diferente", () => {
    const itens = mesclarMercado(
      [mkProjeto({ id: "1", nome: "Vibra Tatuapé", construtora: "Vibra" })],
      [mkPlanilha({ nome: "Vibra Tatuapé", construtora: "Vibra Construtora", lat: -23.5 })],
    );
    expect(itens).toHaveLength(1);
    expect(itens[0].lat).toBe(-23.5);
  });

  it("a planilha preenche só o que falta no projeto do CRM", () => {
    const itens = mesclarMercado(
      [mkProjeto({ id: "1", nome: "Orbi", preco_a_partir: 300000, lat: null, lng: null })],
      [mkPlanilha({ nome: "Orbi", precoMin: 999999, lat: -23.5, lng: -46.6, m2min: 34 })],
    );
    expect(itens[0].precoMin).toBe(300000); // o CRM não é sobrescrito
    expect(itens[0].lat).toBe(-23.5); // a coordenada que faltava entra
    expect(itens[0].m2min).toBe(34);
  });

  it("o que só existe na planilha entra marcado como fora do catálogo", () => {
    const itens = mesclarMercado([], [mkPlanilha({ nome: "Só na planilha" })]);
    expect(itens[0].origem).toBe("planilha");
    expect(itens[0].projeto).toBeNull();
  });

  it("não repete o mesmo empreendimento duplicado dentro da própria planilha", () => {
    const itens = mesclarMercado(
      [],
      [mkPlanilha({ nome: "Repetido" }), mkPlanilha({ nome: "REPETIDO" })],
    );
    expect(itens).toHaveLength(1);
  });

  it("deriva zona do CRM e da planilha pela mesma regra", () => {
    const itens = mesclarMercado(
      [mkProjeto({ id: "1", nome: "A", zona_smq: "Zona Leste" })],
      [mkPlanilha({ nome: "B", regiao: "Zona Leste" })],
    );
    expect(itens.map((e) => e.zona)).toEqual(["Leste", "Leste"]);
  });

  it("chaveMercado cai para só o nome quando não há construtora", () => {
    expect(chaveMercado("Vibra Tatuapé", null)).toBe("vibra tatuape");
    expect(chaveMercado("Vibra Tatuapé", "Vibra")).toBe("vibra tatuape|vibra");
  });

  it("traduz o status da planilha para a situação do CRM", () => {
    expect(situacaoDaPlanilha("Pronto para morar")).toBe("Pronto");
    expect(situacaoDaPlanilha("Lançamento")).toBe("Lançamento");
    expect(situacaoDaPlanilha("Em obras")).toBe("Em obras");
    expect(situacaoDaPlanilha(null)).toBe("A confirmar");
  });
});

// ---------------------------------------------------------------------------
// Poder de compra (motor oficial do CRM, com o cenário otimista do mapa)
// ---------------------------------------------------------------------------

describe("poder de compra", () => {
  it("sem renda a simulação fica desligada", () => {
    expect(calcularPoderDeCompra(perfilClienteVazio)).toBeNull();
    expect(calcularPoderDeCompra(perfil({ renda: 0 }))).toBeNull();
  });

  it("renda abaixo da tabela devolve resultado que não enquadra, e não null", () => {
    const poder = calcularPoderDeCompra(perfil({ renda: RENDA_MINIMA - 100 }))!;
    expect(poder).not.toBeNull();
    expect(poder.orcamento.enquadra).toBe(false);
    expect(classificar(200000, poder)).toBe("nao-fecha");
  });

  it("o teto otimista (25%) é sempre maior ou igual ao padrão (20%)", () => {
    const poder = calcularPoderDeCompra(perfil({ renda: 3000 }))!;
    expect(poder.tetoOtimista).toBeGreaterThanOrEqual(poder.teto);
  });

  it("o reforço anual soma como recurso próprio do cliente", () => {
    const sem = calcularPoderDeCompra(perfil({ renda: 3000 }))!;
    const com = calcularPoderDeCompra(perfil({ renda: 3000, reforcoAnual: 10000 }))!;
    expect(com.orcamento.recursosNaoConstrutora).toBe(sem.orcamento.recursosNaoConstrutora + 10000);
  });

  it("carteira de 3 anos aumenta o financiamento (redutor de juros)", () => {
    const sem = calcularPoderDeCompra(perfil({ renda: 3000 }))!;
    const com = calcularPoderDeCompra(perfil({ renda: 3000, carteira3anos: true }))!;
    expect(com.orcamento.financiamento).toBeGreaterThan(sem.orcamento.financiamento);
  });

  it("classifica fecha / otimista / não fecha nas faixas certas", () => {
    const poder = calcularPoderDeCompra(perfil({ renda: 3000 }))!;
    expect(classificar(poder.teto - 1000, poder)).toBe("fecha");
    // Entre os dois tetos só fecha esticando o parcelamento para 25%.
    if (poder.tetoOtimista > poder.teto) {
      expect(classificar(poder.tetoOtimista - 1, poder)).toBe("otimista");
    }
    expect(classificar(poder.tetoOtimista + 50_000, poder)).toBe("nao-fecha");
  });

  it("sem preço não afirma nada", () => {
    const poder = calcularPoderDeCompra(perfil({ renda: 3000 }))!;
    expect(classificar(null, poder)).toBe("sem-preco");
    expect(coberturaPercentual(null, poder)).toBeNull();
  });

  it("cobertura cai conforme o imóvel encarece", () => {
    const poder = calcularPoderDeCompra(perfil({ renda: 3000 }))!;
    const barato = coberturaPercentual(150000, poder)!;
    const caro = coberturaPercentual(260000, poder)!;
    expect(barato).toBeGreaterThan(caro);
    expect(barato).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// Filtros da barra
// ---------------------------------------------------------------------------

describe("aplicarFiltrosMercado", () => {
  const lista = mesclarMercado(
    [
      mkProjeto({
        id: "1",
        nome: "Leste Barato",
        zona_smq: "Leste",
        preco_a_partir: 190000,
        dorms_min: 2,
        dorms_max: 2,
      }),
      mkProjeto({
        id: "2",
        nome: "Sul Caro",
        zona_smq: "Sul",
        preco_a_partir: 400000,
        dorms_min: 1,
        dorms_max: 1,
      }),
      mkProjeto({
        id: "3",
        nome: "Centro Consulta",
        zona_smq: "Centro",
        sob_consulta: true,
        dorms_min: 3,
        dorms_max: 3,
      }),
    ],
    [],
  );

  it("filtra por zona", () => {
    expect(nomes(aplicarFiltrosMercado(lista, filtros({ zona: "Leste" }), null))).toEqual([
      "Leste Barato",
    ]);
  });

  it("filtra por valor máximo e ignora 'sob consulta'", () => {
    expect(nomes(aplicarFiltrosMercado(lista, filtros({ precoAte: 200000 }), null))).toEqual([
      "Leste Barato",
    ]);
  });

  it("filtra por dormitórios", () => {
    expect(nomes(aplicarFiltrosMercado(lista, filtros({ dorm: "1 dorm" }), null))).toEqual([
      "Sul Caro",
    ]);
  });

  it("não esconde item sem dado de dormitório", () => {
    const semDorms = mesclarMercado([], [mkPlanilha({ nome: "Sem dorms" })]);
    expect(aplicarFiltrosMercado(semDorms, filtros({ dorm: "2+ dorms" }), null)).toHaveLength(1);
  });

  it("ordena por menor preço com 'sob consulta' no fim", () => {
    expect(nomes(aplicarFiltrosMercado(lista, filtros({ sort: "preco-asc" }), null))).toEqual([
      "Leste Barato",
      "Sul Caro",
      "Centro Consulta",
    ]);
  });

  it("busca textual ignora acento e caixa", () => {
    expect(nomes(aplicarFiltrosMercado(lista, filtros({ q: "CENTRO" }), null))).toEqual([
      "Centro Consulta",
    ]);
  });

  it("'só quem fecha' só age com simulação ativa", () => {
    expect(aplicarFiltrosMercado(lista, filtros({ soQueFecham: true }), null)).toHaveLength(3);
  });

  it("com simulação ativa, esconde quem não fecha nem no cenário otimista", () => {
    const poder = calcularPoderDeCompra(perfil({ renda: 2000 }))!;
    const visiveis = aplicarFiltrosMercado(lista, filtros({ soQueFecham: true }), poder);
    expect(visiveis.every((e) => classificar(e.precoMin, poder) !== "nao-fecha")).toBe(true);
    expect(nomes(visiveis)).not.toContain("Sul Caro");
  });

  it("a ordenação 'quem fecha primeiro' põe os que fecham no topo", () => {
    const poder = calcularPoderDeCompra(perfil({ renda: 4000, fgts: 30000 }))!;
    const ordenados = aplicarFiltrosMercado(
      lista,
      filtros({ sort: "cobertura", soQueFecham: false }),
      poder,
    );
    const pesos = ordenados.map((e) => classificar(e.precoMin, poder));
    const ordem = { fecha: 3, otimista: 2, "nao-fecha": 1, "sem-preco": 0 } as const;
    for (let i = 1; i < pesos.length; i++) {
      expect(ordem[pesos[i - 1]]).toBeGreaterThanOrEqual(ordem[pesos[i]]);
    }
  });
});

describe("zonasDoMercado", () => {
  it("devolve só as zonas presentes, na ordem dos chips", () => {
    const itens = mesclarMercado(
      [
        mkProjeto({ id: "1", nome: "A", zona_smq: "Centro" }),
        mkProjeto({ id: "2", nome: "B", zona_smq: "Leste" }),
        mkProjeto({ id: "3", nome: "C", cidade: "Guarulhos" }),
        mkProjeto({ id: "4", nome: "D" }),
      ],
      [],
    );
    expect(zonasDoMercado(itens)).toEqual(["Leste", "Centro", "Grande SP", "Sem zona"]);
  });
});
