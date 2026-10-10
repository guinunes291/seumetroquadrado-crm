// Motor de amortização (src/lib/amortizacao.ts). Os valores esperados vêm de
// uma implementação independente em Python (Decimal, arredondamento meio para
// cima), não do próprio motor — por que: um teste que compara o código com ele
// mesmo não pega erro de fórmula.

import { describe, expect, it } from "vitest";
import {
  compararSistemas,
  efetivaParaNominal,
  nominalParaEfetiva,
  nper,
  pmt,
  simularFinanciamento,
  taxaMensalDe,
  taxaMipNoMes,
  valorMaximoFinanciavel,
  type ParametrosFinanciamento,
} from "@/lib/amortizacao";

// Contrato "limpo": sem seguros, sem taxa adm, sem correção — só a matemática.
const limpo = (over: Partial<ParametrosFinanciamento> = {}): ParametrosFinanciamento => ({
  sistema: "PRICE",
  valorFinanciado: 100_000,
  valorImovel: 125_000,
  prazoMeses: 12,
  taxaJurosAnual: 12,
  tipoTaxa: "nominal",
  correcaoMensal: 0,
  mip: { modo: "taxa", taxaMensal: 0 },
  dfiTaxaMensal: 0,
  taxaAdministracao: 0,
  ...over,
});

const caixa = (over: Partial<ParametrosFinanciamento> = {}) =>
  limpo({
    valorFinanciado: 200_000,
    valorImovel: 250_000,
    prazoMeses: 420,
    taxaJurosAnual: 8.16,
    ...over,
  });

describe("taxas", () => {
  it("nominal ÷ 12 é a mensal; efetiva é a composta", () => {
    expect(taxaMensalDe(12, "nominal")).toBeCloseTo(0.01, 12);
    expect(nominalParaEfetiva(8.16)).toBeCloseTo(8.4722, 4);
    expect(efetivaParaNominal(8.4722085)).toBeCloseTo(8.16, 5);
    expect(taxaMensalDe(8.4722085, "efetiva")).toBeCloseTo(0.0816 / 12, 9);
  });

  it("pmt e nper são inversos", () => {
    const p = pmt(100_000, 0.01, 12);
    expect(p).toBeCloseTo(8884.88, 2);
    expect(nper(100_000, 0.01, p)).toBeCloseTo(12, 9);
    expect(nper(100_000, 0.01, 900)).toBe(Infinity); // não paga nem os juros
  });
});

describe("PRICE e SAC sem correção (casos de livro)", () => {
  it("PRICE 100 mil, 1% a.m., 12x: parcela fixa 8.884,88 e juros 6.618,53", () => {
    const r = simularFinanciamento(limpo());
    expect(r.linhas).toHaveLength(12);
    expect(r.linhas.every((l) => Math.abs(l.prestacao - 8884.88) <= 0.01)).toBe(true);
    expect(r.resumo.totalJuros).toBe(6618.53);
    expect(r.linhas.at(-1)?.saldoFinal).toBe(0);
    expect(r.resumo.totalAmortizado).toBe(100_000);
  });

  it("SAC 100 mil, 1% a.m., 12x: 9.333,33 → 8.416,66 e juros 6.500", () => {
    const r = simularFinanciamento(limpo({ sistema: "SAC" }));
    expect(r.resumo.primeiraPrestacao).toBe(9333.33);
    expect(r.linhas.at(-1)?.prestacao).toBe(8416.66);
    expect(r.resumo.totalJuros).toBe(6500);
    // amortização constante (saldo ÷ prazo restante: oscila no máximo 1 centavo)
    const amorts = r.linhas.map((l) => l.amortizacao);
    expect(Math.max(...amorts) - Math.min(...amorts)).toBeLessThanOrEqual(0.011);
  });

  it("contrato Caixa típico: 200 mil, 8,16% nominal, 420 meses", () => {
    const { SAC, PRICE } = compararSistemas(caixa());
    expect(PRICE.resumo.primeiraPrestacao).toBe(1443.82);
    expect(PRICE.resumo.totalJuros).toBe(406406.33);
    expect(SAC.resumo.primeiraPrestacao).toBe(1836.19);
    expect(SAC.linhas.at(-1)?.prestacao).toBe(479.43);
    expect(SAC.resumo.totalJuros).toBe(286280.27);
  });

  it("sem tarifas, seguros nem correção, o CET é a própria taxa", () => {
    const r = simularFinanciamento(caixa());
    expect(r.resumo.cetMensal).toBeCloseTo(0.0816 / 12, 6);
    expect(r.resumo.cetAnual).toBeCloseTo(8.4722, 3);
  });
});

describe("correção monetária (TR)", () => {
  it("TR 0,17% a.m.: PRICE sobe todo mês e termina perto do dobro", () => {
    const r = simularFinanciamento(caixa({ correcaoMensal: 0.17 }));
    expect(r.resumo.primeiraPrestacao).toBe(1446.28);
    expect(r.linhas[12]?.prestacao).toBe(1476.06);
    expect(r.linhas.at(-1)?.prestacao).toBe(2946.7);
    expect(r.resumo.totalJuros).toBe(548628.46);
    expect(r.linhas.at(-1)?.saldoFinal).toBe(0);
  });

  it("TR 0,17% a.m.: SAC também é corrigido e quita em 420", () => {
    const r = simularFinanciamento(caixa({ sistema: "SAC", correcaoMensal: 0.17 }));
    expect(r.resumo.primeiraPrestacao).toBe(1839.31);
    expect(r.linhas[12]?.prestacao).toBe(1837.46);
    expect(r.linhas.at(-1)?.prestacao).toBe(978.47);
    expect(r.resumo.totalJuros).toBe(368890.06);
    expect(r.resumo.parcelasPagas).toBe(420);
  });

  it("série mês a mês: o último valor se repete", () => {
    const a = simularFinanciamento(limpo({ correcaoMensal: [0.1, 0.2] }));
    expect(a.linhas[0]?.correcao).toBe(100); // 100.000 × 0,1%
    expect(a.linhas[2]?.correcao).toBeCloseTo((a.linhas[2]?.saldoInicial ?? 0) * 0.002, 2);
  });
});

describe("seguros e taxa de administração", () => {
  it("MIP incide sobre o saldo corrigido; DFI sobre o imóvel; encargo soma tudo", () => {
    const r = simularFinanciamento(
      caixa({
        mip: { modo: "taxa", taxaMensal: 0.0002 },
        dfiTaxaMensal: 0.00004,
        taxaAdministracao: 25,
      }),
    );
    const l = r.linhas[0]!;
    expect(l.mip).toBe(40); // 200.000 × 0,02%
    expect(l.dfi).toBe(10); // 250.000 × 0,004%
    expect(l.encargoTotal).toBe(1443.82 + 40 + 10 + 25);
    expect(r.resumo.cetAnual!).toBeGreaterThan(8.4722);
  });

  it("MIP pondera a participação e a idade avança com o contrato", () => {
    const mip = {
      modo: "tabela" as const,
      proponentes: [
        { idade: 30, participacao: 0.5 },
        { idade: 45, participacao: 0.5 },
      ],
    };
    expect(taxaMipNoMes(mip, 1)).toBeCloseTo(0.5 * 0.0001 + 0.5 * 0.0003, 10);
    // mês 13: o de 30 virou 31 → muda de faixa
    expect(taxaMipNoMes(mip, 13)).toBeCloseTo(0.5 * 0.00015 + 0.5 * 0.0003, 10);
  });

  it("avisa quando idade + prazo passa de 80 anos e 6 meses", () => {
    const r = simularFinanciamento(
      caixa({ mip: { modo: "tabela", proponentes: [{ idade: 50, participacao: 1 }] } }),
    );
    expect(r.avisos.join(" ")).toMatch(/Prazo máximo para o proponente mais velho: 366 meses/);
  });
});

describe("amortização extraordinária", () => {
  it("reduzir prazo: mantém a parcela e quita antes", () => {
    const base = simularFinanciamento(caixa());
    const r = simularFinanciamento(
      caixa({ amortizacoesExtras: [{ parcela: 24, valor: 20_000, modo: "reduzir_prazo" }] }),
    );
    expect(r.resumo.parcelasPagas).toBeLessThan(base.resumo.parcelasPagas);
    expect(Math.abs((r.linhas[24]?.prestacao ?? 0) - 1443.82)).toBeLessThan(15);
    expect(r.resumo.totalJuros).toBeLessThan(base.resumo.totalJuros);
    expect(r.linhas.at(-1)?.saldoFinal).toBe(0);
  });

  it("reduzir parcela: mantém o prazo e a parcela cai", () => {
    const r = simularFinanciamento(
      caixa({ amortizacoesExtras: [{ parcela: 24, valor: 20_000, modo: "reduzir_parcela" }] }),
    );
    expect(r.resumo.parcelasPagas).toBe(420);
    expect(r.linhas[24]!.prestacao).toBeLessThan(r.linhas[23]!.prestacao - 100);
  });

  it("reduzir prazo economiza mais juros que reduzir parcela", () => {
    const extra = (modo: "reduzir_prazo" | "reduzir_parcela") =>
      simularFinanciamento(caixa({ amortizacoesExtras: [{ parcela: 12, valor: 30_000, modo }] }))
        .resumo.totalJuros;
    expect(extra("reduzir_prazo")).toBeLessThan(extra("reduzir_parcela"));
  });

  it("FGTS a cada 24 parcelas, 3 vezes", () => {
    const r = simularFinanciamento(
      caixa({
        sistema: "SAC",
        amortizacoesExtras: [
          { parcela: 24, valor: 10_000, modo: "reduzir_prazo", repetirACada: 24, vezes: 3 },
        ],
      }),
    );
    const com = r.linhas.filter((l) => l.amortizacaoExtra > 0).map((l) => l.parcela);
    expect(com).toEqual([24, 48, 72]);
    expect(r.resumo.totalAmortizacaoExtra).toBe(30_000);
    expect(r.resumo.totalAmortizado).toBe(200_000);
  });

  it("extra maior que o saldo quita o contrato na hora", () => {
    const r = simularFinanciamento(
      limpo({ amortizacoesExtras: [{ parcela: 3, valor: 999_999, modo: "reduzir_prazo" }] }),
    );
    expect(r.resumo.parcelasPagas).toBe(3);
    expect(r.linhas.at(-1)?.saldoFinal).toBe(0);
    expect(r.resumo.totalAmortizado).toBe(100_000);
  });
});

describe("fase de obra", () => {
  it("só juros sobre o liberado (linear), sem amortizar; depois começa a 1ª parcela", () => {
    const r = simularFinanciamento(
      caixa({ faseObra: { meses: 24, cobrarSeguros: false, cobrarTaxaAdm: false } }),
    );
    const obra = r.linhas.filter((l) => l.fase === "obra");
    expect(obra).toHaveLength(24);
    expect(obra[0]!.saldoInicial).toBeCloseTo(200_000 / 24, 2);
    expect(obra[0]!.juros).toBe(56.67); // 8.333,33 × 0,68%
    expect(obra[23]!.juros).toBe(1360); // 200.000 × 0,68%
    expect(obra.every((l) => l.amortizacao === 0)).toBe(true);
    const primeira = r.linhas[24]!;
    expect(primeira.parcela).toBe(1);
    expect(primeira.saldoInicial).toBe(200_000);
    expect(primeira.prestacao).toBe(1443.82);
  });

  it("correção paga na obra não muda o saldo; capitalizada aumenta", () => {
    const paga = simularFinanciamento(caixa({ correcaoMensal: 0.17, faseObra: { meses: 12 } }));
    const cap = simularFinanciamento(
      caixa({ correcaoMensal: 0.17, faseObra: { meses: 12, pagarAtualizacaoMonetaria: false } }),
    );
    expect(paga.linhas[12]!.saldoInicial).toBe(200_000);
    expect(cap.linhas[12]!.saldoInicial).toBeGreaterThan(200_000);
  });

  it("cronograma físico-financeiro informado", () => {
    const r = simularFinanciamento(
      limpo({
        faseObra: {
          meses: 3,
          curvaLiberacao: [0.2, 0.5, 1],
          cobrarSeguros: false,
          cobrarTaxaAdm: false,
        },
      }),
    );
    expect(r.linhas.slice(0, 3).map((l) => l.juros)).toEqual([200, 500, 1000]);
  });
});

describe("renda", () => {
  it("comprometimento e renda mínima usam o encargo TOTAL da 1ª parcela", () => {
    const r = simularFinanciamento(caixa({ taxaAdministracao: 25, rendaFamiliar: 5000 }));
    expect(r.resumo.primeiraParcela).toBe(1468.82);
    expect(r.resumo.comprometimento).toBeCloseTo(1468.82 / 5000, 6);
    expect(r.resumo.rendaMinima).toBe(4896.07);
  });

  it("SAC exige mais renda que PRICE para o mesmo valor", () => {
    const { SAC, PRICE } = compararSistemas(caixa());
    expect(SAC.resumo.rendaMinima).toBeGreaterThan(PRICE.resumo.rendaMinima);
  });

  it("valor máximo financiável: a 1ª parcela cabe nos 30%", () => {
    const base = caixa({ taxaAdministracao: 25, dfiTaxaMensal: 0.000038 });
    const v = valorMaximoFinanciavel(base, 6000);
    const r = simularFinanciamento({ ...base, valorFinanciado: v });
    expect(r.resumo.primeiraParcela).toBeLessThanOrEqual(1800);
    const r2 = simularFinanciamento({ ...base, valorFinanciado: v + 1000 });
    expect(r2.resumo.primeiraParcela).toBeGreaterThan(1800);
  });

  it("competência rotula os meses", () => {
    const r = simularFinanciamento(limpo({ inicio: "2026-11" }));
    expect(r.linhas[0]!.competencia).toBe("nov/2026");
    expect(r.linhas[2]!.competencia).toBe("jan/2027");
  });
});

describe("arredondamento", () => {
  it("meio centavo sobe mesmo com ruído de ponto flutuante", async () => {
    const { centavos } = await import("@/lib/amortizacao");
    expect(centavos(66666.68 / 8)).toBe(8333.34);
    expect(centavos(1.005)).toBe(1.01);
    expect(centavos(-2.675)).toBe(-2.68);
    expect(centavos(8333.334)).toBe(8333.33);
  });
});
