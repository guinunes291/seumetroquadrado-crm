import { describe, it, expect } from "vitest";
import { parcelaPrice, simular, parseValorBR, COMPROMETIMENTO_MAX } from "@/lib/simulador";

describe("simulador de financiamento", () => {
  it("parcelaPrice: juros zero divide igualmente pelo prazo", () => {
    expect(parcelaPrice(120000, 0, 120)).toBeCloseTo(1000, 5);
  });

  it("parcelaPrice: com juros, parcela > divisão simples", () => {
    const semJuros = 180000 / 360;
    expect(parcelaPrice(180000, 0.008, 360)).toBeGreaterThan(semJuros);
  });

  it("parcelaPrice: casos degenerados devolvem 0", () => {
    expect(parcelaPrice(0, 0.01, 360)).toBe(0);
    expect(parcelaPrice(100000, 0.01, 0)).toBe(0);
  });

  it("simular: financiado = imóvel - entrada", () => {
    const r = simular({ valorImovel: 200000, entrada: 20000, jurosAnual: 10, meses: 360 });
    expect(r.valorFinanciado).toBe(180000);
  });

  it("simular: parcela em faixa plausível p/ 180k em 360x a ~10% a.a.", () => {
    const r = simular({ valorImovel: 200000, entrada: 20000, jurosAnual: 10, meses: 360 });
    expect(r.parcela).toBeGreaterThan(1300);
    expect(r.parcela).toBeLessThan(1800);
  });

  it("simular: renda mínima = parcela / limite de comprometimento", () => {
    const r = simular({ valorImovel: 200000, entrada: 20000, jurosAnual: 10, meses: 360 });
    expect(r.rendaMinima).toBeCloseTo(r.parcela / COMPROMETIMENTO_MAX, 4);
  });

  it("simular: comprometimento = parcela / renda (null sem renda)", () => {
    const comRenda = simular({ valorImovel: 200000, entrada: 20000, jurosAnual: 10, meses: 360, rendaMensal: 6000 });
    expect(comRenda.comprometimentoRenda).toBeCloseTo(comRenda.parcela / 6000, 5);
    const semRenda = simular({ valorImovel: 200000, entrada: 20000, jurosAnual: 10, meses: 360 });
    expect(semRenda.comprometimentoRenda).toBeNull();
  });

  it("parseValorBR: formatos brasileiros e livres", () => {
    expect(parseValorBR("R$ 3.500,00")).toBe(3500);
    expect(parseValorBR("3.500")).toBe(3500);
    expect(parseValorBR("4500")).toBe(4500);
    expect(parseValorBR("R$2.000")).toBe(2000);
    expect(parseValorBR("1.234.567,89")).toBeCloseTo(1234567.89, 2);
    expect(parseValorBR("3,5")).toBeCloseTo(3.5, 5);
  });

  it("parseValorBR: vazio/nulo devolve null", () => {
    expect(parseValorBR(null)).toBeNull();
    expect(parseValorBR("")).toBeNull();
    expect(parseValorBR("sem número")).toBeNull();
  });
});
