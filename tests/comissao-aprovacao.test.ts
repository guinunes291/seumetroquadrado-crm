import { describe, expect, it } from "vitest";
import { comissaoDaRegra, validarAjusteComissao } from "@/lib/comissao-aprovacao";

describe("comissão na aprovação", () => {
  it.each([[30, 1.2], [35, 1.4], [37, 1.48], [40, 1.6]])("Marquinhos com participação %s sobre total 4 resulta em %s do imóvel", (share, esperado) => {
    expect(comissaoDaRegra(4, share)).toBe(esperado);
  });
  it("exige justificativa para comissão diferente da regra", () => {
    expect(validarAjusteComissao(4, 30, 1.6, " ")).toBe("Informe a justificativa da alteração da comissão do corretor.");
  });
  it("permite exceção justificada", () => {
    expect(validarAjusteComissao(4, 30, 1.6, "Condição excepcional autorizada")).toBeNull();
  });
  it("não exige justificativa se segue a regra", () => {
    expect(validarAjusteComissao(4, 30, 1.2, "")).toBeNull();
  });
  it("alterar total mantém a mesma participação sem exigir justificativa", () => {
    expect(validarAjusteComissao(5, 30, 1.5, "")).toBeNull();
  });
});