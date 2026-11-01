import { describe, expect, it, vi } from "vitest";
import { origemDoEvento, raioAteOCanto, trocarTemaComCirculo } from "@/lib/theme-transition";

describe("raioAteOCanto", () => {
  it("do centro, alcança o canto pela meia-diagonal", () => {
    expect(raioAteOCanto(50, 50, 100, 100)).toBeCloseTo(Math.hypot(50, 50));
  });

  it("de um canto, precisa da diagonal inteira até o canto oposto", () => {
    expect(raioAteOCanto(0, 0, 300, 400)).toBe(500);
    expect(raioAteOCanto(300, 400, 300, 400)).toBe(500);
  });
});

describe("origemDoEvento", () => {
  const alvo = {
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 40 }),
  } as unknown as Element;

  it("clique do mouse usa o ponto do clique", () => {
    expect(origemDoEvento({ detail: 1, clientX: 42, clientY: 7, currentTarget: alvo })).toEqual({
      x: 42,
      y: 7,
    });
  });

  it("teclado (detail 0) usa o centro do item", () => {
    expect(origemDoEvento({ detail: 0, clientX: 0, clientY: 0, currentTarget: alvo })).toEqual({
      x: 60,
      y: 40,
    });
  });
});

describe("trocarTemaComCirculo", () => {
  it("sem View Transitions, aplica o tema na hora", () => {
    const aplicar = vi.fn();
    trocarTemaComCirculo(aplicar, { x: 1, y: 1 });
    expect(aplicar).toHaveBeenCalledOnce();
  });
});
