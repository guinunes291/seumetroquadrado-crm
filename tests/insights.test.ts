import { describe, expect, it } from "vitest";
import { gerarInsights } from "@/features/inteligencia/insights";

const serieBase = (dias: number, leadsPorDia: number, vendasPorDia = 0) =>
  Array.from({ length: dias }, (_, i) => ({
    dia: `2026-07-${String(i + 1).padStart(2, "0")}`,
    leads: leadsPorDia,
    agendamentos: 0,
    visitas: 0,
    vendas: vendasPorDia,
  }));

describe("gerarInsights", () => {
  it("aponta o maior gargalo entre etapas adjacentes", () => {
    const insights = gerarInsights({
      funil: [
        { etapa: "Novo", ordem: 1, quantidade: 100 },
        { etapa: "Atendimento", ordem: 2, quantidade: 80 },
        { etapa: "Visita", ordem: 3, quantidade: 20 }, // queda de 75%
        { etapa: "Contrato", ordem: 4, quantidade: 10 },
      ],
      serie: [],
      motivosPerda: [],
      diasRestantes: 10,
    });
    const gargalo = insights.find((i) => i.tipo === "gargalo");
    expect(gargalo).toBeTruthy();
    expect(gargalo!.titulo).toContain("Atendimento");
    expect(gargalo!.titulo).toContain("Visita");
    expect(gargalo!.intent).toBe("danger");
  });

  it("projeta as vendas do período pelo ritmo diário", () => {
    const insights = gerarInsights({
      funil: [],
      serie: serieBase(10, 5, 1), // 10 vendas em 10 dias → ritmo 1/dia
      motivosPerda: [],
      diasRestantes: 5,
    });
    const prev = insights.find((i) => i.tipo === "previsao");
    expect(prev).toBeTruthy();
    expect(prev!.titulo).toContain("15"); // 10 + 1×5
  });

  it("destaca motivo de perda dominante (≥30% com amostra mínima)", () => {
    const insights = gerarInsights({
      funil: [],
      serie: [],
      motivosPerda: [
        { motivo: "Renda insuficiente", quantidade: 8 },
        { motivo: "Sumiu", quantidade: 2 },
      ],
      diasRestantes: 0,
    });
    const perda = insights.find((i) => i.tipo === "perda");
    expect(perda).toBeTruthy();
    expect(perda!.titulo).toContain("Renda insuficiente");
  });

  it("detecta tendência de queda na entrada de leads", () => {
    const serie = [...serieBase(7, 10), ...serieBase(7, 4)];
    const insights = gerarInsights({
      funil: [],
      serie,
      motivosPerda: [],
      diasRestantes: 0,
    });
    const t = insights.find((i) => i.tipo === "tendencia");
    expect(t).toBeTruthy();
    expect(t!.titulo).toMatch(/caiu/);
    expect(t!.intent).toBe("danger");
  });

  it("não inventa insight com amostra pequena", () => {
    const insights = gerarInsights({
      funil: [
        { etapa: "Novo", ordem: 1, quantidade: 3 },
        { etapa: "Visita", ordem: 2, quantidade: 1 },
      ],
      serie: serieBase(3, 2),
      motivosPerda: [{ motivo: "Sumiu", quantidade: 2 }],
      diasRestantes: 10,
    });
    expect(insights.find((i) => i.tipo === "gargalo")).toBeFalsy();
    expect(insights.find((i) => i.tipo === "perda")).toBeFalsy();
    expect(insights.find((i) => i.tipo === "previsao")).toBeFalsy();
  });
});
