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
  data_assinatura: null,
  ...p,
});

describe("agruparVendasPorMes", () => {
  it("agrupa pelo mês da ASSINATURA — nunca pelo registro ou pela aprovação", () => {
    const meses = agruparVendasPorMes([
      venda({ valor_venda: 200000, data_assinatura: "2026-06-10" }),
      venda({ valor_venda: "150000", data_assinatura: "2026-06-25" }),
      venda({ valor_venda: 300000, data_assinatura: "2026-07-02" }),
    ]);
    expect(meses).toEqual([
      { mes: "2026-06-01", vendas: 2, vgv: 350000 },
      { mes: "2026-07-01", vendas: 1, vgv: 300000 },
    ]);
  });

  it("venda sem data de assinatura não entra em mês nenhum", () => {
    const meses = agruparVendasPorMes([
      venda({ valor_venda: 500000, data_assinatura: null }),
      venda({ valor_venda: 100000, data_assinatura: "2026-06-01" }),
    ]);
    expect(meses).toEqual([{ mes: "2026-06-01", vendas: 1, vgv: 100000 }]);
  });

  it("valor inválido conta a venda com VGV 0, nunca NaN", () => {
    const meses = agruparVendasPorMes([
      venda({ valor_venda: "abc" as never, data_assinatura: "2026-07-01" }),
    ]);
    expect(meses[0].vendas).toBe(1);
    expect(meses[0].vgv).toBe(0);
  });
});

describe("topProjetos", () => {
  it("ranqueia por VGV com empate por vendas e agrupa sem projeto", () => {
    const top = topProjetos(
      [
        venda({
          valor_venda: 300000,
          projeto_nome: "Residencial A",
          data_assinatura: "2026-06-01",
        }),
        venda({
          valor_venda: 250000,
          projeto_nome: "Residencial A",
          data_assinatura: "2026-06-02",
        }),
        venda({
          valor_venda: 400000,
          projeto_nome: "Residencial B",
          data_assinatura: "2026-06-03",
        }),
        venda({ valor_venda: 100000, projeto_nome: "  ", data_assinatura: "2026-06-04" }),
      ],
      2,
    );
    expect(top).toEqual([
      { projeto: "Residencial A", vendas: 2, vgv: 550000 },
      { projeto: "Residencial B", vendas: 1, vgv: 400000 },
    ]);
  });

  it("venda sem assinatura fica de fora do ranking de produto", () => {
    const top = topProjetos([
      venda({ valor_venda: 900000, projeto_nome: "Fantasma", data_assinatura: null }),
      venda({ valor_venda: 100000, projeto_nome: "Real", data_assinatura: "2026-06-01" }),
    ]);
    expect(top).toEqual([{ projeto: "Real", vendas: 1, vgv: 100000 }]);
  });
});

describe("ticketMedio", () => {
  it("VGV ÷ vendas arredondado; sem vendas devolve null (não R$ 0 falso)", () => {
    expect(ticketMedio(550000, 2)).toBe(275000);
    expect(ticketMedio(0, 0)).toBeNull();
  });
});
