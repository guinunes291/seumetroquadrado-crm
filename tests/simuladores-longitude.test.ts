// Fluxo da Longitude: regras do código do simulador oficial (modo linear):
// pré-chaves até a entrega, pós-chaves com o resto das parcelas, anuais em
// dezembro, periodicidade, adimplência e as quatro premissas práticas.
import { describe, expect, it } from "vitest";
import {
  cenariosEsperaLongitude,
  EMPREENDIMENTOS_LONGITUDE,
  empreendimentoLongitude,
  empreendimentoLongitudeDoProjeto,
  parcelasPorPrazo,
  premissasDe,
  simularLongitude,
  sugestaoPelasPremissas,
  textoStatusLongitude,
  type EntradaLongitude,
} from "@/lib/simuladores/longitude";

const citta = empreendimentoLongitude("Cittá")!;

// Cittá (60 parcelas; pré 25,99% da renda; pró-soluto pós 4,99%; total pós
// 40%): renda de R$ 4 mil, tabela R$ 220 mil, avaliação R$ 230 mil,
// financiamento R$ 160 mil + subsídio R$ 10 mil, entrega em jun/2028.
const base: EntradaLongitude = {
  empreendimento: citta,
  premissas: premissasDe(citta),
  hoje: "2026-10",
  entrega: "2028-06",
  renda: 4_000,
  valorTabela: 220_000,
  valorAvaliacao: 230_000,
  financiamento: 160_000,
  subsidio: 10_000,
  fgts: 0,
  primeiraParcela: 1_200,
  posParcelas: null,
  parcelas: {},
};

describe("empreendimentos (fallback do código)", () => {
  it("os 7 do código, com as premissas de lá", () => {
    expect(EMPREENDIMENTOS_LONGITUDE.map((e) => e.nome)).toEqual([
      "Vibe",
      "Zen",
      "Cittá",
      "Estação Dom Bosco",
      "Perus",
      "Rio Branco",
      "Tietê",
    ]);
    expect(empreendimentoLongitude("Vibe")?.premissas).toMatchObject({
      parcelasMax: 82,
      comprometimentoPre: 0.3599,
      proSolutoPosMax: 0.0899,
      comprometimentoTotal: 0.45,
      referenciaMinima: 0.6,
    });
  });

  it("projeto do catálogo casa com o empreendimento do simulador", () => {
    const casos: [string, string | null][] = [
      ["Longitude Città", "Cittá"],
      ["Longitude Estação Dom Bosco", "Estação Dom Bosco"],
      ["Zen Residence", "Zen"],
      ["Longitude Tietê", "Tietê"],
      ["Longitude Perus", "Perus"],
      ["Longitude Rio Branco", "Rio Branco"],
      ["Longitude Estacao Tucuruvi", null],
      ["Longitude Estação Guaianases", null],
    ];
    for (const [catalogo, simulador] of casos) {
      expect(empreendimentoLongitudeDoProjeto(catalogo)?.nome ?? null, catalogo).toBe(simulador);
    }
  });
});

describe("quantidades pelo prazo (_calcParcelasAuto)", () => {
  it("pré = meses até a entrega; pós = o resto; anuais = dezembros até a entrega", () => {
    expect(parcelasPorPrazo("2026-10", "2028-06", 60)).toEqual({
      pre: 20,
      anuais: 2,
      pos: 40,
      mesesAteEntrega: 20,
    });
    // Cada mês sai uma pré e entra uma pós; assinando em dezembro, aquele
    // dezembro não conta mais como anual.
    expect(parcelasPorPrazo("2026-11", "2028-06", 60)).toMatchObject({
      pre: 19,
      anuais: 2,
      pos: 41,
    });
    expect(parcelasPorPrazo("2026-12", "2028-06", 60)).toMatchObject({
      pre: 18,
      anuais: 1,
      pos: 42,
    });
    // Entrega com mais meses que o total: tudo em pré-chaves.
    expect(parcelasPorPrazo("2026-10", "2032-01", 48)).toMatchObject({ pre: 48, pos: 0 });
  });
});

describe("simulação", () => {
  it("linhas, tetos e adimplência", () => {
    const r = simularLongitude(base);
    const l = Object.fromEntries(r.linhas.map((x) => [x.id, x]));
    expect(r.saldo).toBe(50_000);
    expect(l.pre.qtd).toBe(20);
    expect(l.pre.meses[0]).toBe("2026-11");
    expect(l.pre.meses.at(-1)).toBe("2028-06");
    expect(l.anuais.meses).toEqual(["2026-12", "2027-12"]);
    expect(l.pos.qtd).toBe(40);
    expect(l.pos.meses[0]).toBe("2028-07");
    // Tetos: pré 25,99% da renda; anual 100%; pós 40% da renda − 1ª parcela.
    expect([l.pre.teto, l.anuais.teto, l.pos.teto]).toEqual([1039.6, 4000, 400]);
    expect(l.periodicidade.qtd).toBe(0); // 61 parcelas: sem periodicidade
    expect(l.adimplencia.total).toBe(10_000);
    // 20 × 1.039,60 + 2 × 4.000 + min(40 × 400; 4,99% de 220 mil) = 39.770
    expect(r.capacidadeParcelado).toBe(39_770);
    expect(r.atosMinimos).toBe(10_230);
  });

  it("preencher pelas premissas: APTO PARA VENDA", () => {
    const parcelas = sugestaoPelasPremissas(base);
    expect(parcelas).toMatchObject({ pre: 1039.6, anuais: 4000, pos: 274.45, ato: 10_230 });
    const r = simularLongitude({ ...base, parcelas });
    expect(r.status).toBe("apto");
    expect(textoStatusLongitude(r)).toBe(
      "APTO PARA VENDA! O fluxo atende as premissas da Longitude.",
    );
    expect(r.valorFinal).toBe(220_000);
    expect(r.diferenca).toBe(0);
    expect(r.premissas.proSolutoPos).toBeCloseTo(4.99, 2);
    // (10.230 + 170.000) ÷ 220.000
    expect(r.premissas.referencia).toBeCloseTo(81.92, 2);
    expect(r.conferencias.every((c) => c.ok)).toBe(true);
  });

  it("desconto (fluxo abaixo da tabela) pede aprovação", () => {
    const parcelas = { ...sugestaoPelasPremissas(base), ato: 9_230 };
    const r = simularLongitude({ ...base, parcelas });
    expect(r.diferenca).toBe(1_000);
    expect(r.status).toBe("aprovacao");
    expect(textoStatusLongitude(r)).toMatch(/^NECESSÁRIO APROVAÇÃO: desconto de R\$\s1\.000,00/);
  });

  it("ganho de preço não pede aprovação", () => {
    const parcelas = { ...sugestaoPelasPremissas(base), ato: 11_230 };
    const r = simularLongitude({ ...base, parcelas });
    expect(r.diferenca).toBe(-1_000);
    expect(r.status).toBe("apto");
  });

  it("pré acima do teto, financiamento acima de 80% da avaliação e outros", () => {
    const r = simularLongitude({
      ...base,
      financiamento: 190_000,
      parcelas: { ...sugestaoPelasPremissas(base), pre: 1_200, outros: 500 },
    });
    const falhas = r.conferencias.filter((c) => !c.ok).map((c) => c.id);
    expect(falhas).toEqual(expect.arrayContaining(["financiamento", "pre", "outros"]));
    expect(r.status).toBe("aprovacao");
  });

  it("periodicidade de R$ 100 no 37º mês com até 36 parcelas", () => {
    const domBosco = empreendimentoLongitude("Estação Dom Bosco")!;
    const r = simularLongitude({
      ...base,
      empreendimento: domBosco,
      premissas: premissasDe(domBosco),
      entrega: "2027-12",
      posParcelas: 10,
    });
    const per = r.linhas.find((l) => l.id === "periodicidade")!;
    expect(per.meses).toEqual(["2029-10"]);
    expect(per.total).toBe(100);
    expect(r.qtd).toMatchObject({ pre: 14, pos: 10, posMax: 34 });
  });

  it("sem entrega: aviso e nenhuma parcela de pré/pós", () => {
    const r = simularLongitude({ ...base, entrega: "" });
    expect(r.alertas.map((a) => a.codigo)).toContain("sem_entrega");
    expect(r.linhas.find((l) => l.id === "pre")?.qtd).toBe(0);
  });
});

describe("quanto custa esperar", () => {
  it("sai uma pré-chaves por mês; em dezembro sai também a anual daquele ano", () => {
    const c = cenariosEsperaLongitude(base);
    expect(c.map((x) => x.mensais)).toEqual([20, 19, 18, 17]);
    expect(c.map((x) => x.diferenca)).toEqual([0, 1_039.6, 6_079.2, 7_118.8]);
  });
});
