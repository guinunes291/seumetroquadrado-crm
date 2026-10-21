import { describe, expect, it } from "vitest";
import { telefoneNacionalCorretor, telefonePertenceACorretor } from "@/lib/telefone-corretor";

describe("telefone de corretor não pode ser cliente", () => {
  const corretores = [{ telefone: "+55 (11) 98765-4321" }, { telefone: "(55) 3333-4444" }];
  it("bloqueia o mesmo telefone com máscara ou DDI 55", () => {
    for (const telefone of ["11987654321", "(11) 98765-4321", "+55 11 98765-4321"]) {
      expect(telefonePertenceACorretor(telefone, corretores)).toBe(true);
    }
  });
  it("preserva o DDD e permite telefone diferente", () => {
    expect(telefonePertenceACorretor("21987654321", corretores)).toBe(false);
    expect(telefonePertenceACorretor("11987654322", corretores)).toBe(false);
  });
  it("não confunde DDD 55 com código de país", () => {
    expect(telefoneNacionalCorretor("5533334444")).toBe("5533334444");
    expect(telefonePertenceACorretor("+55 55 3333-4444", corretores)).toBe(true);
  });
  it("não associa telefones vazios ou incompletos", () => {
    expect(telefonePertenceACorretor("", [{ telefone: null }])).toBe(false);
    expect(telefoneNacionalCorretor("98765-4321")).toBeNull();
  });
});