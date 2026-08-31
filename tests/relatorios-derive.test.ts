import { describe, expect, it } from "vitest";
import {
  agruparVendasPorMes,
  comissoesPorBeneficiario,
  conversaoPorProjeto,
  esquecidosPorCorretor,
  ticketMedio,
  topProjetos,
  vgvPorCorretor,
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

describe("vgvPorCorretor", () => {
  it("soma vendas e VGV por corretor; venda sem corretor fica de fora", () => {
    const m = vgvPorCorretor([
      { corretor_id: "a", valor_venda: 200000 },
      { corretor_id: "a", valor_venda: "150000" },
      { corretor_id: "b", valor_venda: 300000 },
      { corretor_id: null, valor_venda: 900000 },
    ]);
    expect(m.get("a")).toEqual({ vendas: 2, vgv: 350000 });
    expect(m.get("b")).toEqual({ vendas: 1, vgv: 300000 });
    expect(m.size).toBe(2);
  });
});

describe("comissoesPorBeneficiario", () => {
  const linha = (p: Partial<Parameters<typeof comissoesPorBeneficiario>[0][number]>) => ({
    beneficiario_id: null,
    beneficiario_nome: null,
    tipo: "corretor",
    status: "pendente",
    valor_comissao: 0,
    valor_liquido: 0,
    ...p,
  });

  it("agrupa por beneficiário separando paga × pendente (líquido)", () => {
    const out = comissoesPorBeneficiario([
      linha({
        beneficiario_id: "a",
        beneficiario_nome: "Ana",
        status: "paga",
        valor_liquido: 1000,
      }),
      linha({
        beneficiario_id: "a",
        beneficiario_nome: "Ana",
        status: "pendente",
        valor_liquido: 500,
      }),
      linha({ beneficiario_id: "b", beneficiario_nome: "Beto", valor_liquido: 300 }),
    ]);
    expect(out[0]).toMatchObject({ nome: "Ana", paga: 1000, pendente: 500, total: 1500 });
    expect(out[1]).toMatchObject({ nome: "Beto", paga: 0, pendente: 300, total: 300 });
  });

  it("cancelada fica de fora; sem beneficiário agrupa pelo tipo (dinheiro não some)", () => {
    const out = comissoesPorBeneficiario([
      linha({ status: "cancelada", valor_liquido: 999 }),
      linha({ tipo: "gerente", valor_liquido: 200 }),
      linha({ tipo: "gerente", valor_liquido: 100 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ nome: "(gerente — a atribuir)", pendente: 300, total: 300 });
  });
});

describe("esquecidosPorCorretor", () => {
  it("conta por corretor e guarda o caso mais antigo; sem corretor fica de fora", () => {
    const out = esquecidosPorCorretor([
      { corretor_id: "a", ultima_atividade_em: "2026-08-10T10:00:00Z" },
      { corretor_id: "a", ultima_atividade_em: "2026-08-01T10:00:00Z" },
      { corretor_id: "b", ultima_atividade_em: "2026-08-20T10:00:00Z" },
      { corretor_id: null, ultima_atividade_em: "2026-07-01T10:00:00Z" },
    ]);
    expect(out[0]).toEqual({
      corretor_id: "a",
      total: 2,
      maisAntigo: "2026-08-01T10:00:00Z",
    });
    expect(out[1]).toEqual({
      corretor_id: "b",
      total: 1,
      maisAntigo: "2026-08-20T10:00:00Z",
    });
  });
});

describe("conversaoPorProjeto", () => {
  it("casa leads e vendas por projeto_id e calcula a conversão", () => {
    const out = conversaoPorProjeto(
      [
        { projeto_id: "p1", nome: "Residencial A", leads: 100 },
        { projeto_id: "p2", nome: "Residencial B", leads: 50 },
        { projeto_id: "p3", nome: "Sem interesse", leads: 0 },
      ],
      [
        { projeto_id: "p1", projeto_nome: "Residencial A", valor_venda: 200000 },
        { projeto_id: "p1", projeto_nome: "Residencial A", valor_venda: 250000 },
      ],
    );
    expect(out[0]).toEqual({
      nome: "Residencial A",
      leads: 100,
      vendas: 2,
      vgv: 450000,
      conv_pct: 2,
    });
    // Projeto sem lead E sem venda não aparece.
    expect(out.find((r) => r.nome === "Sem interesse")).toBeUndefined();
    // Sem venda: conversão 0, não null (há base de leads).
    expect(out.find((r) => r.nome === "Residencial B")).toMatchObject({ vendas: 0, conv_pct: 0 });
  });

  it("venda sem projeto_id casa pelo nome; sem base de leads a conversão é null", () => {
    const out = conversaoPorProjeto(
      [{ projeto_id: "p1", nome: "Residencial A", leads: 10 }],
      [
        { projeto_id: null, projeto_nome: "residencial a", valor_venda: 100000 },
        { projeto_id: null, projeto_nome: "Avulso Z", valor_venda: 300000 },
      ],
    );
    expect(out.find((r) => r.nome === "Residencial A")).toMatchObject({
      leads: 10,
      vendas: 1,
      conv_pct: 10,
    });
    expect(out.find((r) => r.nome === "Avulso Z")).toMatchObject({
      leads: 0,
      vendas: 1,
      conv_pct: null,
    });
  });
});
