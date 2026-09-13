import { describe, it, expect } from "vitest";
import {
  formatBRL,
  formatArea,
  calcStats,
  descreverTipologia,
  resumoPorTipologia,
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

describe("resumoPorTipologia — espelho por tipologia da página de produto", () => {
  const unidades = [
    {
      tipologia: "2 dorms",
      dormitorios: 2,
      area_privativa: 45,
      valor: 260000,
      status: "disponivel" as const,
    },
    {
      tipologia: "2 dorms",
      dormitorios: 2,
      area_privativa: 52,
      valor: 250000,
      status: "disponivel" as const,
    },
    {
      tipologia: "2 dorms",
      dormitorios: 2,
      area_privativa: "48",
      valor: 240000,
      status: "vendida" as const,
    },
    {
      tipologia: "Studio",
      dormitorios: 1,
      area_privativa: 28,
      valor: null,
      status: "reservada" as const,
    },
    {
      tipologia: null,
      dormitorios: null,
      area_privativa: null,
      valor: 300000,
      status: "bloqueada" as const,
    },
  ];

  it("agrupa por tipologia+dorms, conta por status e ordena por dormitórios (sem dado no fim)", () => {
    const r = resumoPorTipologia(unidades);
    expect(r.map((g) => g.chave)).toEqual(["Studio|1", "2 dorms|2", "|"]);
    expect(r[1]).toMatchObject({
      total: 3,
      disponiveis: 2,
      vendidas: 1,
      reservadas: 0,
      bloqueadas: 0,
    });
    expect(r[2]).toMatchObject({ total: 1, bloqueadas: 1, tipologia: null, dormitorios: null });
  });

  it("área e menor valor consideram só as unidades DISPONÍVEIS", () => {
    const g = resumoPorTipologia(unidades).find((x) => x.chave === "2 dorms|2")!;
    expect(g.areaMin).toBe(45);
    expect(g.areaMax).toBe(52); // a vendida de 48 m² não entra, a "52" entra
    expect(g.valorMinDisponivel).toBe(250000); // a vendida de 240 mil não entra
    const studio = resumoPorTipologia(unidades).find((x) => x.chave === "Studio|1")!;
    expect(studio.areaMin).toBeNull(); // reservada não conta como disponível
    expect(studio.valorMinDisponivel).toBeNull();
  });

  it("descreve a tipologia sem repetir dormitórios quando o nome já os traz", () => {
    const r = resumoPorTipologia(unidades);
    expect(descreverTipologia(r.find((x) => x.chave === "2 dorms|2")!)).toBe("2 dorms · 45–52 m²");
    expect(descreverTipologia(r.find((x) => x.chave === "Studio|1")!)).toBe("Studio");
    expect(descreverTipologia(r.find((x) => x.chave === "|")!)).toBe("Sem tipologia");
    expect(
      descreverTipologia({
        chave: "Tipo A|3",
        tipologia: "Tipo A",
        dormitorios: 3,
        total: 1,
        disponiveis: 1,
        reservadas: 0,
        vendidas: 0,
        bloqueadas: 0,
        areaMin: 70,
        areaMax: 70,
        valorMinDisponivel: null,
      }),
    ).toBe("Tipo A · 3 dorms · 70 m²");
  });

  it("lista vazia devolve lista vazia", () => {
    expect(resumoPorTipologia([])).toEqual([]);
  });
});
