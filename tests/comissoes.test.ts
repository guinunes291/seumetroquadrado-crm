import { describe, it, expect } from "vitest";
import {
  round2,
  parsePercent,
  calcularComissoes,
  validarSplit,
  calcularLiquido,
  mesBounds,
  ultimosMeses,
  parseMesValue,
  computeTotais,
  computeResumoVendas,
  beneficiariosDasLinhas,
  buildExportRows,
  sortComissoes,
  statusLabel,
  statusIntent,
  tipoLabel,
  tipoHue,
  type ComissaoRow,
} from "@/lib/comissoes";

function comissao(over: Partial<ComissaoRow> = {}): ComissaoRow {
  return {
    id: "c1",
    venda_id: "v1",
    lead_id: "l1",
    beneficiario_id: "u1",
    beneficiario_nome: "Ana Souza",
    tipo: "corretor",
    status: "pendente",
    data_pagamento: null,
    valor_base: 350000,
    percentual: 1.85,
    valor_comissao: 6475,
    percentual_desconto: 0,
    valor_liquido: 6475,
    contrato_vgv: 350000,
    observacoes: null,
    created_at: "2026-07-01T12:00:00Z",
    venda: {
      data_assinatura: "2026-07-01",
      projeto_nome: "Residencial Aurora",
      valor_venda: 350000,
      distrato: false,
      corretor_id: "u1",
    },
    ...over,
  };
}

describe("round2", () => {
  it("arredonda para 2 casas", () => {
    expect(round2(6166.666605)).toBe(6166.67);
    expect(round2(12250.0)).toBe(12250);
    expect(round2(0)).toBe(0);
  });

  it("caso de paridade com o round(numeric,2) do SQL: 333.333,33 × 1,85%", () => {
    // No banco: round(333333.33 * 1.85 / 100, 2) = 6166.67
    expect(round2((333333.33 * 1.85) / 100)).toBe(6166.67);
  });

  it("meio-centavo em float: documenta o comportamento do helper", () => {
    // 1001 × 0,5% = 5.005 → half-up para 5.01 (igual ao numeric do banco
    // neste caso; divergências de 1 centavo são possíveis em floats exóticos —
    // a fonte da verdade é sempre o trigger SQL).
    expect(round2((1001 * 0.5) / 100)).toBe(5.01);
  });
});

describe("parsePercent", () => {
  it("aceita vírgula ou ponto", () => {
    expect(parsePercent("1,85")).toBe(1.85);
    expect(parsePercent("3.50")).toBe(3.5);
    expect(parsePercent(" 2 ")).toBe(2);
    expect(parsePercent("0")).toBe(0);
  });

  it("rejeita vazio e lixo (não zera em silêncio)", () => {
    expect(parsePercent("")).toBeNull();
    expect(parsePercent("   ")).toBeNull();
    expect(parsePercent("abc")).toBeNull();
    expect(parsePercent("3,5,0")).toBeNull();
    expect(parsePercent("-1")).toBeNull();
    expect(parsePercent("1.8.5")).toBeNull();
  });
});

describe("calcularComissoes", () => {
  it("split padrão sobre R$ 350.000", () => {
    const r = calcularComissoes(350000, {
      total: 3.5,
      corretor: 1.85,
      gerente: 0.5,
      superintendente: 0.3,
    });
    expect(r.imobiliaria).toBe(12250);
    expect(r.corretor).toBe(6475);
    expect(r.gerente).toBe(1750);
    expect(r.superintendente).toBe(1050);
  });

  it("zeros produzem zeros", () => {
    const r = calcularComissoes(0, {
      total: 3.5,
      corretor: 1.85,
      gerente: 0.5,
      superintendente: 0.3,
    });
    expect(r).toEqual({ imobiliaria: 0, corretor: 0, gerente: 0, superintendente: 0 });
    const r2 = calcularComissoes(350000, { total: 0, corretor: 0, gerente: 0, superintendente: 0 });
    expect(r2.imobiliaria).toBe(0);
  });
});

describe("validarSplit", () => {
  it("ok quando a soma das partes é menor ou igual ao total", () => {
    expect(
      validarSplit({ total: 3.5, corretor: 1.85, gerente: 0.5, superintendente: 0.3 }).ok,
    ).toBe(true);
    expect(
      validarSplit({ total: 2.65, corretor: 1.85, gerente: 0.5, superintendente: 0.3 }).ok,
    ).toBe(true); // soma == total
  });

  it("erro quando a soma das partes excede o total", () => {
    const v = validarSplit({ total: 2, corretor: 1.85, gerente: 0.5, superintendente: 0.3 });
    expect(v.ok).toBe(false);
    expect(v.erros.some((e) => e.includes("excede"))).toBe(true);
  });

  it("erro para percentual fora de [0, 100]", () => {
    expect(validarSplit({ total: 101, corretor: 0, gerente: 0, superintendente: 0 }).ok).toBe(
      false,
    );
    expect(validarSplit({ total: 3.5, corretor: -1, gerente: 0, superintendente: 0 }).ok).toBe(
      false,
    );
  });

  it("aviso (não erro) quando o total é 0", () => {
    const v = validarSplit({ total: 0, corretor: 0, gerente: 0, superintendente: 0 });
    expect(v.ok).toBe(true);
    expect(v.avisos.length).toBeGreaterThan(0);
  });
});

describe("calcularLiquido", () => {
  it("aplica o desconto percentual", () => {
    expect(calcularLiquido(6475, 10)).toBe(5827.5);
    expect(calcularLiquido(6475, 0)).toBe(6475);
    expect(calcularLiquido(6475, 100)).toBe(0);
  });
});

describe("mesBounds / ultimosMeses / parseMesValue", () => {
  it("limites do mês como date strings [ini, fim)", () => {
    expect(mesBounds(2026, 7)).toEqual({ ini: "2026-07-01", fim: "2026-08-01" });
    expect(mesBounds(2026, 1)).toEqual({ ini: "2026-01-01", fim: "2026-02-01" });
  });

  it("dezembro vira o ano", () => {
    expect(mesBounds(2026, 12)).toEqual({ ini: "2026-12-01", fim: "2027-01-01" });
  });

  it("ultimosMeses: quantidade, ordem desc e virada de ano", () => {
    const meses = ultimosMeses(14, new Date(2026, 6, 15)); // julho/2026
    expect(meses).toHaveLength(14);
    expect(meses[0].value).toBe("2026-07");
    expect(meses[1].value).toBe("2026-06");
    expect(meses[6].value).toBe("2026-01");
    expect(meses[7].value).toBe("2025-12");
    expect(meses[0].label.toLowerCase()).toContain("julho");
    expect(meses[0].label).toContain("2026");
  });

  it("parseMesValue é o inverso do value", () => {
    expect(parseMesValue("2026-07")).toEqual({ ano: 2026, mes: 7 });
    expect(parseMesValue("2025-12")).toEqual({ ano: 2025, mes: 12 });
    expect(parseMesValue("2026-13")).toBeNull();
    expect(parseMesValue("2026-00")).toBeNull();
    expect(parseMesValue("todos")).toBeNull();
    expect(parseMesValue("2026-7")).toBeNull();
  });
});

describe("computeTotais", () => {
  it("VGV conta uma vez por venda (linhas da mesma venda compartilham o contrato)", () => {
    const rows = [
      comissao({ id: "a", tipo: "corretor", valor_liquido: 6475 }),
      comissao({ id: "b", tipo: "gerente", valor_liquido: 1750 }),
      comissao({ id: "c", tipo: "superintendente", valor_liquido: 1050 }),
    ];
    const t = computeTotais(rows);
    expect(t.vgv).toBe(350000); // não 1.050.000
    expect(t.pendente).toBe(9275);
    expect(t.total).toBe(9275);
  });

  it("linha órfã de venda conta o próprio contrato_vgv", () => {
    const rows = [comissao(), comissao({ id: "x", venda_id: null, contrato_vgv: 100000 })];
    expect(computeTotais(rows).vgv).toBe(450000);
  });

  it("separa por status; cancelada fora do total; legado recebido soma em paga", () => {
    const rows = [
      comissao({ id: "a", status: "pendente", valor_liquido: 100 }),
      comissao({ id: "b", status: "paga", valor_liquido: 200, venda_id: "v2" }),
      comissao({ id: "c", status: "recebido", valor_liquido: 50, venda_id: "v3" }),
      comissao({ id: "d", status: "cancelada", valor_liquido: 400, venda_id: "v4" }),
    ];
    const t = computeTotais(rows);
    expect(t.pendente).toBe(100);
    expect(t.paga).toBe(250);
    expect(t.cancelada).toBe(400);
    expect(t.total).toBe(350);
  });

  it("vazio retorna zeros", () => {
    expect(computeTotais([])).toEqual({ vgv: 0, pendente: 0, paga: 0, cancelada: 0, total: 0 });
  });
});

describe("computeResumoVendas", () => {
  it("soma VGV e comissão da imobiliária, excluindo distratos", () => {
    const r = computeResumoVendas([
      { valor_venda: 350000, percentual_comissao: 3.5, distrato: false },
      { valor_venda: 200000, percentual_comissao: 3.5, distrato: false },
      { valor_venda: 1000000, percentual_comissao: 3.5, distrato: true },
    ]);
    expect(r.vgv).toBe(550000);
    expect(r.comissaoImobiliaria).toBe(19250);
  });

  it("vazio retorna zeros", () => {
    expect(computeResumoVendas([])).toEqual({ vgv: 0, comissaoImobiliaria: 0 });
  });
});

describe("beneficiariosDasLinhas", () => {
  it("únicos por id, ordenados por nome, ignorando sem beneficiário", () => {
    const rows = [
      comissao({ beneficiario_id: "u2", beneficiario_nome: "Zeca" }),
      comissao({ id: "b", beneficiario_id: "u1", beneficiario_nome: "Ana" }),
      comissao({ id: "c", beneficiario_id: "u1", beneficiario_nome: "Ana" }),
      comissao({ id: "d", beneficiario_id: null, beneficiario_nome: null }),
    ];
    expect(beneficiariosDasLinhas(rows)).toEqual([
      { id: "u1", nome: "Ana" },
      { id: "u2", nome: "Zeca" },
    ]);
  });
});

describe("buildExportRows", () => {
  it("gera colunas pt-BR com valores numéricos crus", () => {
    const [linha] = buildExportRows([comissao()]);
    expect(linha["Data assinatura"]).toBe("2026-07-01");
    expect(linha.Projeto).toBe("Residencial Aurora");
    expect(linha["Beneficiário"]).toBe("Ana Souza");
    expect(linha.Tipo).toBe("Corretor");
    expect(linha.VGV).toBe(350000);
    expect(linha["Percentual (%)"]).toBe(1.85);
    expect(linha["Valor comissão"]).toBe(6475);
    expect(linha["Valor líquido"]).toBe(6475);
    expect(linha.Status).toBe("Pendente");
  });

  it("linha sem beneficiário exibe o tipo com 'a atribuir'", () => {
    const [linha] = buildExportRows([
      comissao({ beneficiario_id: null, beneficiario_nome: null, tipo: "gerente" }),
    ]);
    expect(linha["Beneficiário"]).toBe("Gerente (a atribuir)");
  });
});

describe("sortComissoes", () => {
  it("ordena por data da venda desc, órfãs por último", () => {
    const rows = [
      comissao({ id: "antiga", venda: { ...comissao().venda!, data_assinatura: "2026-05-10" } }),
      comissao({ id: "orfa", venda: null, created_at: "2026-07-02T00:00:00Z" }),
      comissao({ id: "nova", venda: { ...comissao().venda!, data_assinatura: "2026-07-01" } }),
    ];
    expect(sortComissoes(rows).map((r) => r.id)).toEqual(["nova", "antiga", "orfa"]);
  });
});

describe("labels e tons", () => {
  it("statusLabel cobre canônicos, legados e desconhecidos", () => {
    expect(statusLabel("pendente")).toBe("Pendente");
    expect(statusLabel("paga")).toBe("Paga");
    expect(statusLabel("cancelada")).toBe("Cancelada");
    expect(statusLabel("recebido")).toBe("Recebida");
    expect(statusLabel("em_disputa")).toBe("Em disputa");
    expect(statusLabel("xpto")).toBe("xpto");
  });

  it("statusIntent com fallback neutral", () => {
    expect(statusIntent("pendente")).toBe("warning");
    expect(statusIntent("paga")).toBe("success");
    expect(statusIntent("cancelada")).toBe("neutral");
    expect(statusIntent("em_disputa")).toBe("danger");
    expect(statusIntent("xpto")).toBe("neutral");
  });

  it("tipoLabel/tipoHue com fallback", () => {
    expect(tipoLabel("corretor")).toBe("Corretor");
    expect(tipoLabel("gerente")).toBe("Gerente");
    expect(tipoLabel("superintendente")).toBe("Superintendente");
    expect(tipoLabel("outro")).toBe("outro");
    expect(tipoHue("corretor")).toBe("blue");
    expect(tipoHue("outro")).toBe("slate");
  });
});
