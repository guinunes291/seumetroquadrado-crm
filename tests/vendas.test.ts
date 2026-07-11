import { describe, it, expect } from "vitest";
import { validarVenda } from "@/lib/vendas";
import type { SplitPercentuais } from "@/lib/comissoes";

const splitOk: SplitPercentuais = {
  total: 3.5,
  corretor: 1.85,
  gerente: 0.5,
  superintendente: 0.3,
};

describe("validarVenda", () => {
  it("aceita uma venda bem-formada", () => {
    expect(
      validarVenda({
        valorVenda: 350000,
        dataAssinatura: "2026-07-01",
        hoje: "2026-07-10",
        split: splitOk,
      }),
    ).toBeNull();
  });

  it("rejeita valor <= 0 ou inválido", () => {
    expect(
      validarVenda({
        valorVenda: 0,
        dataAssinatura: "2026-07-01",
        hoje: "2026-07-10",
        split: splitOk,
      }),
    ).toMatch(/valor/i);
    expect(
      validarVenda({
        valorVenda: NaN,
        dataAssinatura: "2026-07-01",
        hoje: "2026-07-10",
        split: splitOk,
      }),
    ).toMatch(/valor/i);
  });

  it("rejeita data de assinatura futura", () => {
    expect(
      validarVenda({
        valorVenda: 350000,
        dataAssinatura: "2026-07-20",
        hoje: "2026-07-10",
        split: splitOk,
      }),
    ).toMatch(/futura/i);
  });

  it("rejeita split ausente ou inconsistente", () => {
    expect(
      validarVenda({
        valorVenda: 1,
        dataAssinatura: "2026-07-01",
        hoje: "2026-07-10",
        split: null,
      }),
    ).toMatch(/[Pp]ercentuais/);
    // partes excedem o total
    expect(
      validarVenda({
        valorVenda: 1,
        dataAssinatura: "2026-07-01",
        hoje: "2026-07-10",
        split: { total: 1, corretor: 2, gerente: 0, superintendente: 0 },
      }),
    ).toMatch(/excede/i);
  });
});
