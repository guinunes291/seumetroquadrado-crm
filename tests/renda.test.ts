import { describe, it, expect } from "vitest";
import { parseRenda } from "@/lib/renda";

describe("parseRenda", () => {
  it("lê as grafias comuns do cadastro e do teclado", () => {
    expect(parseRenda("4.000")).toBe(4_000);
    expect(parseRenda("R$ 4000")).toBe(4_000);
    expect(parseRenda("4 mil")).toBe(4_000);
    expect(parseRenda("4.500,50")).toBe(4_501);
    expect(parseRenda("3,2 mil")).toBe(3_200);
  });

  it("vazio, texto solto e zero não viram renda", () => {
    expect(parseRenda("")).toBeNull();
    expect(parseRenda(null)).toBeNull();
    expect(parseRenda("a combinar")).toBeNull();
    expect(parseRenda("0")).toBeNull();
  });
});
