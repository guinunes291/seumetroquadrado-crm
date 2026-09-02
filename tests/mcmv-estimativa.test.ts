import { describe, it, expect } from "vitest";
import {
  arredondaPrestacao,
  avaliarRenda,
  faixaPorRenda,
  financiamentoMaximo,
  parcelaPrice,
  rendaMinimaEstimada,
} from "@/lib/mcmv-estimativa";

// Tabela de sanidade da skill analise-credito-mcmv (PRICE, amortização + juros).
describe("parcelaPrice", () => {
  it("bate com a tabela de sanidade", () => {
    expect(parcelaPrice(100_000, 12, 360)).toBeCloseTo(1028.61, 1);
    expect(parcelaPrice(200_000, 5, 420)).toBeCloseTo(1009.38, 1);
    expect(parcelaPrice(150_000, 8, 420)).toBeCloseTo(1065.39, 1);
  });

  it("sem valor financiado não há parcela", () => {
    expect(parcelaPrice(0, 7, 420)).toBe(0);
  });
});

describe("faixaPorRenda", () => {
  it("aplica os limites do CCFGTS de março/2026", () => {
    expect(faixaPorRenda(3_000).faixa).toBe("F1");
    expect(faixaPorRenda(3_200).faixa).toBe("F1");
    expect(faixaPorRenda(4_500).faixa).toBe("F2");
    expect(faixaPorRenda(8_000).faixa).toBe("F3");
    expect(faixaPorRenda(12_000).faixa).toBe("F4");
    expect(faixaPorRenda(20_000).faixa).toBe("SBPE");
  });
});

describe("financiamentoMaximo", () => {
  it("desconta taxa de administração, DFI e MIP da folga de 30%", () => {
    const semSeguros = (4_000 * 0.3 - 25) / parcelaPrice(1, 7, 420);
    const comSeguros = financiamentoMaximo(4_000, 7, { valorImovel: 220_000 });
    expect(comSeguros).toBeLessThan(semSeguros);
    expect(comSeguros).toBeGreaterThan(semSeguros * 0.9);
  });

  it("renda que não cobre nem a taxa de administração financia zero", () => {
    expect(financiamentoMaximo(50, 7, {})).toBe(0);
  });
});

describe("avaliarRenda", () => {
  it("renda F2 de R$ 4.000 cabe num produto de R$ 200 mil com entrada, e não cabe sem", () => {
    const semEntrada = avaliarRenda(4_000, 200_000);
    // 200 mil a 7% em 420 meses ≈ R$ 1.290 + seguros → acima de 30% de 4 mil (R$ 1.200).
    expect(semEntrada.cabe).toBe(false);
    expect(semEntrada.motivo).toBe("comprometimento");

    const comEntrada = avaliarRenda(4_000, 200_000, { entrada: 40_000 });
    expect(comEntrada.valorFinanciado).toBe(160_000);
    expect(comEntrada.cabe).toBe(true);
    expect(comEntrada.comprometimento).toBeLessThanOrEqual(0.3);
  });

  it("respeita o teto de imóvel da faixa mesmo com renda sobrando", () => {
    const r = avaliarRenda(9_000, 450_000, { entrada: 300_000 });
    expect(r.faixa.faixa).toBe("F3");
    expect(r.cabe).toBe(false);
    expect(r.motivo).toBe("acima_teto_faixa");
  });

  it("preço máximo cresce com a entrada e é coerente com o 'cabe'", () => {
    const base = avaliarRenda(5_000, 250_000);
    const comEntrada = avaliarRenda(5_000, 250_000, { entrada: 50_000 });
    expect(comEntrada.precoMaximo).toBeGreaterThan(base.precoMaximo);
    // Um imóvel exatamente no preço máximo estimado cabe (dentro da tolerância).
    const noLimite = avaliarRenda(5_000, Math.floor(base.precoMaximo));
    expect(noLimite.comprometimento).toBeLessThanOrEqual(0.3 + 0.002);
  });

  it("a prestação total inclui seguros e taxa de administração", () => {
    const r = avaliarRenda(6_000, 300_000);
    expect(r.prestacaoTotal).toBeGreaterThan(r.parcela + 25);
  });
});

describe("rendaMinimaEstimada", () => {
  it("é o inverso de avaliarRenda, arredondado para cima em múltiplos de 50", () => {
    const renda = rendaMinimaEstimada(200_000);
    expect(renda % 50).toBe(0);
    expect(avaliarRenda(renda, 200_000).comprometimento).toBeLessThanOrEqual(0.3);
    expect(avaliarRenda(renda - 200, 200_000).comprometimento).toBeGreaterThan(0.3);
  });
});

describe("arredondaPrestacao", () => {
  it("arredonda para múltiplo de R$ 10 — nunca ao centavo para o cliente", () => {
    expect(arredondaPrestacao(1_287.43)).toBe(1_290);
    expect(arredondaPrestacao(1_284.99)).toBe(1_280);
  });
});
