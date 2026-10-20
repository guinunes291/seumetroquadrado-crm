import { describe, expect, it } from "vitest";
import { comissaoIndividualSocio, SOCIO_PERCENTUAL, SOCIOS_PERCENTUAL_TOTAL } from "@/lib/comissao-socios";

describe("Comissão dos sócios", () => {
  it("destina 0,3% do valor da venda para cada sócio", () => {
    expect(SOCIO_PERCENTUAL).toBe(0.3);
    expect(comissaoIndividualSocio(289200)).toBe(867.6);
  });
  it("reserva 0,6% no total para os dois sócios", () => {
    expect(SOCIOS_PERCENTUAL_TOTAL).toBe(0.6);
    expect(comissaoIndividualSocio(289200) * 2).toBe(1735.2);
  });
});