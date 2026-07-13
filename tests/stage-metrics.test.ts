import { describe, expect, it } from "vitest";
import { computeStageMetrics, formatVgvCompact } from "@/features/pipeline/stage-metrics";
import { hitTest } from "@/features/pipeline/use-pointer-dnd";

const ORDER = [
  "aguardando_atendimento",
  "em_atendimento",
  "agendado",
  "visita_realizada",
  "analise_credito",
  "contrato_fechado",
] as const;

describe("computeStageMetrics", () => {
  it("calcula funil acumulado e conversão entre etapas adjacentes", () => {
    const m = computeStageMetrics(
      [
        { etapa: "aguardando_atendimento", quantidade: 40 },
        { etapa: "em_atendimento", quantidade: 30 },
        { etapa: "agendado", quantidade: 15 },
        { etapa: "visita_realizada", quantidade: 10 },
        { etapa: "analise_credito", quantidade: 4 },
        { etapa: "contrato_fechado", quantidade: 1 },
        { etapa: "perdido", quantidade: 99 }, // fora do funil — ignorado
      ],
      ORDER,
    );
    // acumulado: 100, 60, 30, 15, 5, 1
    expect(m.get("aguardando_atendimento")!.acumulado).toBe(100);
    expect(m.get("em_atendimento")!.acumulado).toBe(60);
    expect(m.get("aguardando_atendimento")!.conversaoPct).toBeNull(); // primeira etapa
    expect(m.get("em_atendimento")!.conversaoPct).toBe(60); // 60/100
    expect(m.get("agendado")!.conversaoPct).toBe(50); // 30/60
    expect(m.get("contrato_fechado")!.conversaoPct).toBe(20); // 1/5
  });

  it("propaga VGV quando o snapshot (v3) fornece; null quando não (v2)", () => {
    const comVgv = computeStageMetrics(
      [{ etapa: "em_atendimento", quantidade: 2, vgv: 500_000 }],
      ORDER,
    );
    expect(comVgv.get("em_atendimento")!.vgv).toBe(500_000);
    const semVgv = computeStageMetrics([{ etapa: "em_atendimento", quantidade: 2 }], ORDER);
    expect(semVgv.get("em_atendimento")!.vgv).toBeNull();
  });

  it("etapas sem linhas viram zero (não undefined)", () => {
    const m = computeStageMetrics([], ORDER);
    expect(m.get("agendado")).toMatchObject({ count: 0, acumulado: 0, conversaoPct: null });
  });
});

describe("formatVgvCompact", () => {
  it("compacta em mi/mil e esconde zero", () => {
    expect(formatVgvCompact(1_250_000)).toBe("R$ 1,3 mi");
    expect(formatVgvCompact(850_000)).toBe("R$ 850 mil");
    expect(formatVgvCompact(900)).toBe("R$ 900");
    expect(formatVgvCompact(0)).toBeNull();
    expect(formatVgvCompact(null)).toBeNull();
  });
});

describe("hitTest (drag por ponteiro)", () => {
  const rects = [
    { id: "col-a", left: 0, top: 0, right: 100, bottom: 400 },
    { id: "col-b", left: 110, top: 0, right: 210, bottom: 400 },
  ];
  it("encontra a coluna sob o ponto", () => {
    expect(hitTest(rects, 50, 200)).toBe("col-a");
    expect(hitTest(rects, 150, 10)).toBe("col-b");
  });
  it("null fora de qualquer alvo (gap entre colunas, fora do board)", () => {
    expect(hitTest(rects, 105, 200)).toBeNull();
    expect(hitTest(rects, 300, 200)).toBeNull();
  });
  it("bordas contam como dentro", () => {
    expect(hitTest(rects, 100, 400)).toBe("col-a");
  });
});
