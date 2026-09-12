import { describe, expect, it } from "vitest";
import {
  conversaoAproximada,
  geometriaDoDegrau,
  montarFunil,
  PASSAGENS,
  tomDaPassagem,
  type FunilRow,
} from "@/features/fila-unica/funil-derive";

const row = (
  recorte: string,
  etapa: string,
  ordem: number,
  quantidade: number,
  parados = 0,
): FunilRow => ({
  recorte,
  etapa,
  ordem,
  quantidade,
  parados,
});

// A carteira de um corretor, no formato que fila_funil_v1 devolve.
const ROWS: FunilRow[] = [
  row("base", "aguardando_atendimento", 1, 20, 12),
  row("base", "aguardando_retorno", 2, 6, 5),
  row("base", "qualificacao_corretor", 3, 10, 9),
  row("base", "em_atendimento", 4, 40, 36),
  row("base", "agendado", 5, 4, 2),
  row("base", "visita_realizada", 6, 3, 1),
  row("base", "analise_credito", 7, 8, 7),
  row("base", "venda", 8, 5),
  row("base", "perdido", 99, 30),
  row("safra", "aguardando_atendimento", 1, 5, 2),
  row("safra", "em_atendimento", 4, 9, 4),
  row("safra", "agendado", 5, 1),
  row("safra", "perdido", 99, 3),
];

describe("montarFunil — base inteira", () => {
  const f = montarFunil(ROWS, "base");

  it("oito degraus na ordem do funil; 'entrada' só aparece com lead sem dono", () => {
    expect(f.etapas.map((e) => e.key)).toEqual([
      "aguardando_atendimento",
      "aguardando_retorno",
      "qualificacao_corretor",
      "em_atendimento",
      "agendado",
      "visita_realizada",
      "analise_credito",
      "venda",
    ]);
    const comEntrada = montarFunil([...ROWS, row("base", "entrada", 0, 2)], "base");
    expect(comEntrada.etapas[0]).toMatchObject({ key: "entrada", quantidade: 2, pctParados: null });
    expect(comEntrada.passagens[0]).toMatchObject({
      de: "entrada",
      label: "distribuição",
      meta: 100,
    });
  });

  it("total, perdidos à parte, parados só no funil comercial", () => {
    expect(f.total).toBe(96);
    expect(f.perdidos).toBe(30);
    const venda = f.etapas.find((e) => e.key === "venda")!;
    expect(venda).toMatchObject({ quantidade: 5, parados: 0, pctParados: null });
    const emAt = f.etapas.find((e) => e.key === "em_atendimento")!;
    expect(emAt).toMatchObject({ parados: 36, pctParados: 90 });
  });

  it("largura pela raiz quadrada do volume sobre o maior; piso para etapa vazia", () => {
    const maior = f.etapas.find((e) => e.key === "em_atendimento")!;
    expect(maior.largura).toBe(1);
    const agendado = f.etapas.find((e) => e.key === "agendado")!;
    expect(agendado.largura).toBeCloseTo(Math.sqrt(4 / 40), 5);
    const vazio = montarFunil([row("base", "em_atendimento", 4, 10)], "base");
    expect(vazio.etapas.find((e) => e.key === "venda")!.largura).toBe(0.1);
    expect(vazio.etapas.find((e) => e.key === "agendado")!.largura).toBe(0.1);
  });

  it("conversão aproximada: chegou à seguinte ou além ÷ chegou a esta ou além, contra a meta", () => {
    // em_atendimento → agendado: chegou a em_atendimento ou além = 40+4+3+8+5 = 60;
    // chegou a agendado ou além = 20. 20/60 = 33% contra meta 70% → crit.
    const p = f.passagens.find((p) => p.de === "em_atendimento")!;
    expect(p).toMatchObject({ para: "agendado", atual: 33, meta: 70, tom: "crit", nota: null });
    // analise_credito → venda: 5/13 = 38% contra 30% → good.
    const fech = f.passagens.find((p) => p.de === "analise_credito")!;
    expect(fech).toMatchObject({ atual: 38, meta: 30, tom: "good" });
    expect(f.passagens).toHaveLength(7);
  });

  it("vazamentos: as três etapas com mais leads parados, com percentual", () => {
    expect(f.vazamentos.map((v) => v.key)).toEqual([
      "em_atendimento",
      "aguardando_atendimento",
      "qualificacao_corretor",
    ]);
    expect(f.vazamentos[0]).toMatchObject({ parados: 36, pctParados: 90 });
  });
});

describe("montarFunil — safra", () => {
  const f = montarFunil(ROWS, "safra", { dias: 30 });

  it("etapas sem linha valem zero e a venda não é medida (ciclo maior que a janela)", () => {
    expect(f.etapas.find((e) => e.key === "analise_credito")).toMatchObject({
      quantidade: 0,
      pctParados: null,
      largura: 0.1,
    });
    const fech = f.passagens.find((p) => p.para === "venda")!;
    expect(fech).toMatchObject({ atual: null, tom: null, nota: "ciclo maior que 30 dias" });
    expect(f.nota).toContain("últimos 30 dias");
    expect(f.perdidos).toBe(3);
    expect(f.total).toBe(15);
  });

  it("passagem sem lead no denominador fica sem dado, não zero", () => {
    // visita_realizada → analise_credito: ninguém chegou a visita ou além na safra.
    const p = f.passagens.find((p) => p.de === "visita_realizada")!;
    expect(p).toMatchObject({ atual: null, nota: "sem lead na etapa" });
  });
});

describe("helpers", () => {
  it("conversaoAproximada e tomDaPassagem", () => {
    expect(conversaoAproximada(0, 0)).toBeNull();
    expect(conversaoAproximada(10, 7)).toBe(70);
    expect(tomDaPassagem(null, 50)).toBeNull();
    expect(tomDaPassagem(50, 50)).toBe("good");
    expect(tomDaPassagem(36, 50)).toBe("warn");
    expect(tomDaPassagem(34, 50)).toBe("crit");
  });

  it("geometria do degrau: trapézio do topo (esta etapa) à base (a seguinte)", () => {
    const f = montarFunil(ROWS, "base");
    const i = f.etapas.findIndex((e) => e.key === "em_atendimento");
    const g = geometriaDoDegrau(f.etapas, i);
    expect(g.caixa).toBe(1);
    // topo cheio (0% de recuo), base recuada (agendado é bem mais estreito).
    expect(g.clipPath.startsWith("polygon(0% 0, 100% 0,")).toBe(true);
    const ultimo = geometriaDoDegrau(f.etapas, f.etapas.length - 1);
    expect(ultimo.caixa).toBeCloseTo(f.etapas[f.etapas.length - 1].largura, 5);
  });

  it("as metas da casa cobrem todas as divisas do funil, em ordem", () => {
    expect(PASSAGENS.map((p) => p.meta)).toEqual([100, 50, 50, 90, 70, 65, 75, 30]);
  });
});
