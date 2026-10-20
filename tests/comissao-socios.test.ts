import { describe, expect, it } from "vitest";
import { comissaoIndividualSocio, FABIO_SOCIO_IDS, SOCIO_PERCENTUAL, SOCIOS_PERCENTUAL_TOTAL } from "@/lib/comissao-socios";

describe("Comissão dos sócios", () => {
  it("permite somente Fabio Magazoni na seleção de sócio Fábio", () => {
    expect(FABIO_SOCIO_IDS).toEqual(["5531c08f-e0dc-4289-90f3-b6105eab4c4c"]);
    expect(FABIO_SOCIO_IDS).not.toContain("69d35880-d2c3-4225-b07c-6cec02be8509");
  });
  it("destina 0,3% do valor da venda para cada sócio", () => {
    expect(SOCIO_PERCENTUAL).toBe(0.3);
    expect(comissaoIndividualSocio(289200)).toBe(867.6);
  });
  it("reserva 0,6% no total para os dois sócios", () => {
    expect(SOCIOS_PERCENTUAL_TOTAL).toBe(0.6);
    expect(comissaoIndividualSocio(289200) * 2).toBe(1735.2);
  });
});