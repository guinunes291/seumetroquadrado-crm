import { describe, expect, it } from "vitest";
import {
  AMOSTRA_MINIMA,
  diagnosticar,
  diasUteisRestantesNoMes,
  matematicaDaVenda,
  normalizarMeuFunil,
  passagens,
  planoDoMes,
  precisaEstudar,
  resumoPorOrigem,
  somarGrupo,
  timeDoGrupo,
  type ContagemFunil,
  type LinhaOrigem,
} from "@/features/meu-funil/meu-funil";

const c = (p: Partial<ContagemFunil>): ContagemFunil => ({
  recebidos: 0,
  conversou: 0,
  agendou: 0,
  visitou: 0,
  pasta: 0,
  vendas: 0,
  perdidos: 0,
  ...p,
});

const linha = (origem: string, grupo: "real" | "base", p: Partial<ContagemFunil>): LinhaOrigem => ({
  origem,
  grupo,
  ...c(p),
});

describe("normalizarMeuFunil", () => {
  it("payload inválido vira null; campos faltando viram zero, nunca NaN", () => {
    expect(normalizarMeuFunil(null)).toBeNull();
    const r = normalizarMeuFunil({ minhas: [{ origem: "facebook", recebidos: "12" }], mes: {} });
    expect(r?.minhas[0]).toMatchObject({
      origem: "facebook",
      grupo: "real",
      recebidos: 12,
      vendas: 0,
    });
    expect(r?.mes.meta_vendas).toBeNull();
    expect(r?.dias).toBe(90);
  });
});

describe("base importada fica fora do funil real", () => {
  const linhas = [
    linha("facebook", "real", {
      recebidos: 60,
      conversou: 30,
      agendou: 12,
      visitou: 8,
      pasta: 4,
      vendas: 2,
    }),
    linha("indicacao", "real", {
      recebidos: 10,
      conversou: 9,
      agendou: 6,
      visitou: 5,
      pasta: 3,
      vendas: 1,
    }),
    linha("importacao", "base", {
      recebidos: 800,
      conversou: 40,
      agendou: 6,
      visitou: 3,
      pasta: 1,
      vendas: 0,
    }),
  ];

  it("soma só o grupo pedido", () => {
    expect(somarGrupo(linhas, "real").recebidos).toBe(70);
    expect(somarGrupo(linhas, "base").recebidos).toBe(800);
  });

  it("leads por venda do funil real não é inflado pelas 800 fichas importadas", () => {
    const mat = matematicaDaVenda(somarGrupo(linhas, "real"), null);
    expect(mat.find((p) => p.chave === "recebidos")?.meu).toBe(23.3);
    expect(mat.find((p) => p.chave === "agendou")?.meu).toBe(6);
  });

  it("origens ordenadas da que mais vende; amostra pequena marcada", () => {
    const r = resumoPorOrigem(linhas, "real");
    expect(r.map((o) => o.origem)).toEqual(["indicacao", "facebook"]);
    expect(r[0]).toMatchObject({ pctVenda: 10, leadsPorVenda: 10, amostraPequena: false });
    expect(
      resumoPorOrigem([linha("site", "real", { recebidos: AMOSTRA_MINIMA - 1 })], "real")[0]
        .amostraPequena,
    ).toBe(true);
  });
});

describe("matematicaDaVenda", () => {
  it("sem venda, a razão é null (nunca infinito) e o time aparece como régua", () => {
    const mat = matematicaDaVenda(
      c({ recebidos: 30, conversou: 10 }),
      c({ recebidos: 300, conversou: 120, vendas: 10 }),
    );
    expect(mat[0]).toMatchObject({ chave: "recebidos", meu: null, time: 30 });
  });
});

describe("diagnosticar", () => {
  const time = c({
    recebidos: 1000,
    conversou: 600,
    agendou: 300,
    visitou: 200,
    pasta: 100,
    vendas: 50,
  });

  it("aponta a passagem que mais perde para o time", () => {
    // Conversa → agendamento: 10% contra 50% do time.
    const minha = c({ recebidos: 100, conversou: 60, agendou: 6, visitou: 4, pasta: 2, vendas: 1 });
    const d = diagnosticar(passagens(minha, time), minha);
    expect(d.foco).toBe("agendar");
    expect(d.passagem?.gapPp).toBe(-40);
  });

  it("tudo acima do time → o que falta é volume", () => {
    const minha = c({
      recebidos: 100,
      conversou: 90,
      agendou: 60,
      visitou: 50,
      pasta: 40,
      vendas: 30,
    });
    expect(diagnosticar(passagens(minha, time), minha).foco).toBe("volume");
  });

  it("amostra pequena não dá veredito", () => {
    const minha = c({ recebidos: 4, conversou: 1 });
    expect(diagnosticar(passagens(minha, time), minha).foco).toBe("conversar");
  });

  it("sem leads → volume", () => {
    expect(diagnosticar(passagens(c({}), time), c({})).foco).toBe("volume");
  });
});

describe("planoDoMes", () => {
  it("dias úteis contam hoje e param no fim do mês", () => {
    // 2026-09-23 é quarta: 23,24,25,28,29,30.
    expect(diasUteisRestantesNoMes("2026-09-23")).toBe(6);
    expect(diasUteisRestantesNoMes("2026-09-27")).toBe(3);
  });

  it("aplica a conversão do corretor às vendas que faltam e arredonda para cima", () => {
    const minha = matematicaDaVenda(
      c({ recebidos: 50, conversou: 25, agendou: 10, visitou: 6, pasta: 3, vendas: 2 }),
      null,
    );
    const p = planoDoMes({ meta: 5, vendasMes: 2, dia: "2026-09-23", minha });
    expect(p.faltam).toBe(3);
    expect(p.fonte).toBe("minha");
    expect(p.itens.find((i) => i.chave === "recebidos")).toMatchObject({ total: 75, porDia: 12.5 });
    expect(p.itens.find((i) => i.chave === "pasta")?.total).toBe(5);
  });

  it("sem venda própria usa a régua do time; meta batida zera o que falta", () => {
    const minha = matematicaDaVenda(
      c({ recebidos: 20 }),
      c({ recebidos: 100, conversou: 50, agendou: 20, visitou: 10, pasta: 5, vendas: 2 }),
    );
    expect(planoDoMes({ meta: 1, vendasMes: 0, dia: "2026-09-23", minha }).fonte).toBe("time");
    expect(planoDoMes({ meta: 2, vendasMes: 3, dia: "2026-09-23", minha }).faltam).toBe(0);
  });
});

describe("precisaEstudar", () => {
  it("corretor sem estudo hoje → abre, todo dia; já estudou ou não é corretor → não", () => {
    expect(precisaEstudar({ ehCorretor: true, estudoHoje: null })).toBe(true);
    expect(precisaEstudar({ ehCorretor: false, estudoHoje: null })).toBe(false);
    expect(
      precisaEstudar({
        ehCorretor: true,
        estudoHoje: {
          dia: "x",
          foco: "agendar",
          compromisso: null,
          segundos_na_tela: 200,
          concluido_em: "x",
        },
      }),
    ).toBe(false);
  });
});

describe("timeDoGrupo", () => {
  it("grupo ausente ou vazio → null", () => {
    expect(timeDoGrupo([], "real")).toBeNull();
    expect(timeDoGrupo([{ grupo: "real", corretores: 3, ...c({}) }], "real")).toBeNull();
  });
});
