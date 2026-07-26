import { describe, expect, it } from "vitest";
import {
  agruparVendasPorMes,
  ticketMedio,
  topProjetos,
  type VendaAprovadaRow,
} from "@/features/dashboard/relatorios-derive";

const venda = (p: Partial<VendaAprovadaRow>): VendaAprovadaRow => ({
  valor_venda: 0,
  projeto_nome: null,
  aprovado_em: null,
  data_assinatura: null,
  created_at: null,
  ...p,
});

describe("agruparVendasPorMes", () => {
  it("agrupa pelo mês da aprovação (fallback assinatura → registro)", () => {
    const meses = agruparVendasPorMes([
      venda({ valor_venda: 200000, aprovado_em: "2026-06-10T12:00:00Z" }),
      venda({ valor_venda: "150000", data_assinatura: "2026-06-25" }),
      venda({ valor_venda: 300000, created_at: "2026-07-02T09:00:00Z" }),
    ]);
    expect(meses).toEqual([
      { mes: "2026-06-01", vendas: 2, vgv: 350000 },
      { mes: "2026-07-01", vendas: 1, vgv: 300000 },
    ]);
  });

  it("valor inválido conta a venda com VGV 0, nunca NaN", () => {
    const meses = agruparVendasPorMes([
      venda({ valor_venda: "abc" as never, aprovado_em: "2026-07-01T00:00:00Z" }),
    ]);
    expect(meses[0].vendas).toBe(1);
    expect(meses[0].vgv).toBe(0);
  });
});

describe("topProjetos", () => {
  it("ranqueia por VGV com empate por vendas e agrupa sem projeto", () => {
    const top = topProjetos(
      [
        venda({ valor_venda: 300000, projeto_nome: "Residencial A" }),
        venda({ valor_venda: 250000, projeto_nome: "Residencial A" }),
        venda({ valor_venda: 400000, projeto_nome: "Residencial B" }),
        venda({ valor_venda: 100000, projeto_nome: "  " }),
      ],
      2,
    );
    expect(top).toEqual([
      { projeto: "Residencial A", vendas: 2, vgv: 550000 },
      { projeto: "Residencial B", vendas: 1, vgv: 400000 },
    ]);
  });
});

describe("ticketMedio", () => {
  it("VGV ÷ vendas arredondado; sem vendas devolve null (não R$ 0 falso)", () => {
    expect(ticketMedio(550000, 2)).toBe(275000);
    expect(ticketMedio(0, 0)).toBeNull();
  });
});
