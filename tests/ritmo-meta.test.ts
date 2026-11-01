import { describe, expect, it } from "vitest";
import { fracaoUtilDoMes, situacaoNoRitmo } from "@/features/ranking/ranking-derive";
import { fraseDoRitmo } from "@/features/ranking/ranking-ui";

describe("fracaoUtilDoMes", () => {
  it("no mês corrente, conta dias úteis do calendário (seg–sáb por padrão)", () => {
    // Outubro/2026: 31 dias, 4 domingos → 27 úteis; até o dia 28 → 24.
    const r = fracaoUtilDoMes({ ano: 2026, mes: 10, hoje: new Date(2026, 9, 28) });
    expect(r).toEqual({ fracao: 24 / 27, passados: 24, total: 27 });
  });

  it("respeita feriados e dias úteis do calendário do pacing", () => {
    const r = fracaoUtilDoMes({
      ano: 2026,
      mes: 10,
      hoje: new Date(2026, 9, 28),
      calendario: { diasUteis: [1, 2, 3, 4, 5], feriados: ["2026-10-12"] },
    });
    // Seg–sex de outubro/2026: 22 úteis, menos o feriado de 12/10 → 21; até 28 → 19.
    expect(r).toEqual({ fracao: 19 / 21, passados: 19, total: 21 });
  });

  it("mês fechado ou futuro não tem linha do hoje", () => {
    const hoje = new Date(2026, 9, 28);
    expect(fracaoUtilDoMes({ ano: 2026, mes: 9, hoje })).toBeNull();
    expect(fracaoUtilDoMes({ ano: 2026, mes: 11, hoje })).toBeNull();
  });
});

describe("situacaoNoRitmo", () => {
  it("atrasado quando falta mais de 5% da meta para o esperado de hoje", () => {
    // Meta 4, 87% do mês → esperado 3,48; com 2 vendas está 1,48 atrás.
    expect(situacaoNoRitmo(2, 4, 0.87)).toMatchObject({ situacao: "atrasado" });
  });

  it("no ritmo dentro da folga de 5% da meta", () => {
    expect(situacaoNoRitmo(10, 20, 0.52)).toMatchObject({ situacao: "no_ritmo", esperado: 10.4 });
  });

  it("adiantado acima da folga", () => {
    expect(situacaoNoRitmo(15, 20, 0.5)).toMatchObject({ situacao: "adiantado", diferenca: 5 });
  });

  it("sem meta não há ritmo", () => {
    expect(situacaoNoRitmo(3, 0, 0.5)).toBeNull();
  });
});

describe("fraseDoRitmo", () => {
  const fmt = (n: number) => n.toLocaleString("pt-BR");

  it("vendas em inteiros: o ritmo pede o próximo inteiro e diz quantas faltam", () => {
    // 32 de meta, 24 de 27 dias úteis → 28,4 esperadas → pede 29; com 20, faltam 9.
    expect(fraseDoRitmo(20, 32, 24 / 27, fmt, "vendas")).toEqual({
      texto: "9 vendas atrás do ritmo — até hoje o ritmo pede 29 vendas",
      situacao: "atrasado",
    });
  });

  it("singular quando falta 1 venda", () => {
    expect(fraseDoRitmo(4, 10, 0.5, fmt, "vendas")?.texto).toBe(
      "1 venda atrás do ritmo — até hoje o ritmo pede 5 vendas",
    );
  });

  it("à frente por menos de uma venda inteira conta como no ritmo", () => {
    // Meta 4 a 50%: esperado 2; com 2,0 está no ritmo.
    expect(fraseDoRitmo(2, 4, 0.5, fmt, "vendas")).toEqual({
      texto: "No ritmo — até hoje o ritmo pede 2 vendas",
      situacao: "no_ritmo",
    });
    // Esperado 1,6 (folga 0,2): 2 vendas está 0,4 à frente — menos de uma inteira.
    expect(fraseDoRitmo(2, 4, 0.4, fmt, "vendas")?.situacao).toBe("no_ritmo");
  });

  it("à frente por vendas inteiras", () => {
    expect(fraseDoRitmo(15, 20, 0.5, fmt, "vendas")?.texto).toBe(
      "5 vendas à frente do ritmo — até hoje o ritmo pede 10 vendas",
    );
  });

  it("valor em R$ (sem unidade) mantém uma casa decimal", () => {
    expect(fraseDoRitmo(15.5, 20, 0.5, fmt)?.texto).toBe(
      "5,5 à frente do ritmo — até hoje o ritmo pede 10",
    );
  });
});
