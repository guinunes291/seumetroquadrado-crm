import { describe, expect, it } from "vitest";
import { EFETIVACAO_FLAGS, marcosPendentes, vendaEfetivada } from "@/lib/vendas";

describe("marcos de efetivação da venda", () => {
  it("expõe os 3 marcos na ordem da esteira, com os rótulos oficiais", () => {
    expect(EFETIVACAO_FLAGS.map((flag) => flag.key)).toEqual([
      "contrato_assinado",
      "ato_pago",
      "apto_repasse",
    ]);
    expect(EFETIVACAO_FLAGS.map((flag) => flag.label)).toEqual([
      "Contrato Assinado",
      "Ato Pago",
      "Apto para repasse",
    ]);
  });

  it("vendaEfetivada só é true com os 3 marcos ativos", () => {
    expect(vendaEfetivada({ contrato_assinado: true, ato_pago: true, apto_repasse: true })).toBe(
      true,
    );
    expect(vendaEfetivada({ contrato_assinado: false, ato_pago: false, apto_repasse: false })).toBe(
      false,
    );
    expect(vendaEfetivada({ contrato_assinado: true, ato_pago: true, apto_repasse: false })).toBe(
      false,
    );
    expect(vendaEfetivada({ contrato_assinado: false, ato_pago: true, apto_repasse: true })).toBe(
      false,
    );
  });

  it("marcosPendentes lista os rótulos do que falta, na ordem da esteira", () => {
    expect(
      marcosPendentes({ contrato_assinado: false, ato_pago: false, apto_repasse: false }),
    ).toEqual(["Contrato Assinado", "Ato Pago", "Apto para repasse"]);
    expect(
      marcosPendentes({ contrato_assinado: true, ato_pago: false, apto_repasse: true }),
    ).toEqual(["Ato Pago"]);
    expect(
      marcosPendentes({ contrato_assinado: true, ato_pago: true, apto_repasse: true }),
    ).toEqual([]);
  });
});
