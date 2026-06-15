import { describe, it, expect } from "vitest";
import {
  formatBRL,
  formatArea,
  calcStats,
  variacaoPercentual,
  UNIDADE_STATUS_LABEL,
} from "@/lib/unidades";

describe("unidades helpers", () => {
  it("formata BRL", () => {
    expect(formatBRL(350000)).toMatch(/R\$/);
    expect(formatBRL(null)).toBe("—");
    expect(formatBRL("abc")).toBe("—");
  });

  it("formata área", () => {
    expect(formatArea(65.5)).toContain("m²");
    expect(formatArea(null)).toBe("—");
  });

  it("calcula stats agregando por status e VGV", () => {
    const stats = calcStats([
      { status: "disponivel", valor: 400000 },
      { status: "disponivel", valor: 500000 },
      { status: "vendida", valor: 450000 },
      { status: "reservada", valor: 300000 },
      { status: "bloqueada", valor: null },
    ]);
    expect(stats.total).toBe(5);
    expect(stats.disponivel).toBe(2);
    expect(stats.vendida).toBe(1);
    expect(stats.reservada).toBe(1);
    expect(stats.bloqueada).toBe(1);
    expect(stats.vgvDisponivel).toBe(900000);
    expect(stats.ticketMedio).toBe((400000 + 500000 + 450000 + 300000) / 4);
  });

  it("calcula variação percentual", () => {
    expect(variacaoPercentual(100, 110)).toBe(10);
    expect(variacaoPercentual(200, 150)).toBe(-25);
    expect(variacaoPercentual(0, 100)).toBeNull();
    expect(variacaoPercentual(null, 100)).toBeNull();
  });

  it("expõe labels de status", () => {
    expect(UNIDADE_STATUS_LABEL.disponivel).toBe("Disponível");
    expect(UNIDADE_STATUS_LABEL.vendida).toBe("Vendida");
  });
});
