import { describe, it, expect } from "vitest";
import {
  fmtBRL,
  fmtBRLCompact,
  fmtInt,
  fmtMinutos,
  fmtHoras,
  deltaPct,
  conversaoEtapas,
  pctSeguro,
} from "@/features/dashboard/format";

describe("formatação pt-BR", () => {
  it("fmtBRL sem centavos", () => {
    expect(fmtBRL(1234567)).toContain("1.234.567");
    expect(fmtBRL(null)).toContain("0");
  });
  it("fmtBRLCompact abrevia milhões", () => {
    const s = fmtBRLCompact(1200000);
    expect(s.toLowerCase()).toContain("mi");
  });
  it("fmtInt agrupa milhar", () => {
    expect(fmtInt(12345)).toBe("12.345");
  });
  it("fmtMinutos", () => {
    expect(fmtMinutos(45)).toBe("45min");
    expect(fmtMinutos(95)).toBe("1h35");
    expect(fmtMinutos(120)).toBe("2h");
    expect(fmtMinutos(60 * 72)).toBe("3d");
    expect(fmtMinutos(null)).toBe("0min");
  });
  it("fmtHoras converte para minutos", () => {
    expect(fmtHoras(1.5)).toBe("1h30");
  });
});

describe("deltaPct — comparação com período anterior", () => {
  it("calcula subida e descida", () => {
    expect(deltaPct(120, 100)).toEqual({ pct: 20, direction: "up" });
    expect(deltaPct(80, 100)).toEqual({ pct: -20, direction: "down" });
    expect(deltaPct(100, 100)).toEqual({ pct: 0, direction: "flat" });
  });
  it("anterior ausente → não comparável", () => {
    expect(deltaPct(10, null).pct).toBeNull();
    expect(deltaPct(10, undefined).pct).toBeNull();
  });
  it("anterior 0: evita +∞%", () => {
    expect(deltaPct(0, 0)).toEqual({ pct: 0, direction: "flat" });
    expect(deltaPct(5, 0).pct).toBeNull();
  });
});

describe("conversaoEtapas — % etapa→etapa do funil", () => {
  it("usa a etapa anterior como base", () => {
    const r = conversaoEtapas([
      { etapa: "Novos", quantidade: 200 },
      { etapa: "Em atendimento", quantidade: 100 },
      { etapa: "Fechados", quantidade: 10 },
    ]);
    expect(r[0].pctAnterior).toBeNull();
    expect(r[1].pctAnterior).toBe(50);
    expect(r[2].pctAnterior).toBe(10);
  });
  it("base 0 → null (não NaN)", () => {
    const r = conversaoEtapas([
      { etapa: "A", quantidade: 0 },
      { etapa: "B", quantidade: 0 },
    ]);
    expect(r[1].pctAnterior).toBeNull();
  });
});

describe("pctSeguro", () => {
  it("calcula percentual com 1 casa", () => {
    expect(pctSeguro(1, 3)).toBe(33.3);
  });
  it("denominador 0 → null", () => {
    expect(pctSeguro(1, 0)).toBeNull();
  });
});
