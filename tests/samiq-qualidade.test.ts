// Painel de qualidade da Sami (D17) — regras puras: período, contrato do JSON
// e indicadores derivados que os tiles mostram.
import { describe, expect, it } from "vitest";
import {
  MetricasSamiQSchema,
  derivarIndicadoresSamiQ,
  formatarMs,
  formatarPct,
  periodoUltimosDias,
} from "@/features/samiq/qualidade-derive";

const base = {
  de: "2026-08-07",
  ate: "2026-09-05",
  escopo: "equipe" as const,
  execucoes: 120,
  concluidas: 110,
  falhas: 10,
  fallbacks: 3,
  usuarios_ativos: 8,
  conversas: 40,
  tool_calls: 200,
  tool_errors: 4,
  tokens: 1_500_000,
  custo_micros: 0,
  latencia_p50_ms: 1800,
  latencia_p95_ms: 6200,
  avaliacoes_positivas: 30,
  avaliacoes_negativas: 5,
  por_acao: [{ action: "pergunta_livre", total: 90 }],
  por_dia: [
    { dia: "2026-09-03", execucoes: 10, fallbacks: 1, usuarios: 3 },
    { dia: "2026-09-04", execucoes: 25, fallbacks: 0, usuarios: 5 },
  ],
};

describe("periodoUltimosDias", () => {
  it("fecha em hoje e abre (dias − 1) antes, em AAAA-MM-DD", () => {
    expect(periodoUltimosDias(30, new Date("2026-09-05T15:00:00Z"))).toEqual({
      _de: "2026-08-07",
      _ate: "2026-09-05",
    });
    expect(periodoUltimosDias(1, new Date("2026-09-05T15:00:00Z"))).toEqual({
      _de: "2026-09-05",
      _ate: "2026-09-05",
    });
  });
});

describe("derivarIndicadoresSamiQ", () => {
  it("percentuais sobre a base certa: fallback ÷ concluídas, 👍 ÷ avaliadas, erros ÷ chamadas", () => {
    const m = MetricasSamiQSchema.parse(base);
    const ind = derivarIndicadoresSamiQ(m);
    expect(ind.fallbackPct).toBe(2.7);
    expect(ind.aprovacaoPct).toBe(85.7);
    expect(ind.totalAvaliacoes).toBe(35);
    expect(ind.erroFerramentaPct).toBe(2);
    expect(ind.custoReais).toBeNull();
    expect(ind.sparkExecucoes).toEqual([10, 25]);
  });

  it("sem denominador o indicador é null (não 0%), e custo em reais só com pricing", () => {
    const ind = derivarIndicadoresSamiQ(
      MetricasSamiQSchema.parse({
        ...base,
        concluidas: 0,
        fallbacks: 0,
        tool_calls: 0,
        tool_errors: 0,
        avaliacoes_positivas: 0,
        avaliacoes_negativas: 0,
        custo_micros: 12_345_678,
        por_dia: [],
      }),
    );
    expect(ind.fallbackPct).toBeNull();
    expect(ind.aprovacaoPct).toBeNull();
    expect(ind.erroFerramentaPct).toBeNull();
    expect(ind.custoReais).toBeCloseTo(12.345678, 5);
    expect(ind.sparkExecucoes).toEqual([]);
  });

  it("o contrato rejeita JSON fora do formato da RPC", () => {
    expect(() => MetricasSamiQSchema.parse({ ...base, escopo: "mundo" })).toThrow();
    expect(() => MetricasSamiQSchema.parse({ ...base, execucoes: -1 })).toThrow();
  });
});

describe("formatação", () => {
  it("percentual e latência em PT-BR, com travessão para ausência", () => {
    expect(formatarPct(null)).toBe("—");
    expect(formatarPct(2.7)).toBe("2,7%");
    expect(formatarMs(null)).toBe("—");
    expect(formatarMs(850)).toBe("850 ms");
    expect(formatarMs(6200)).toBe("6,2 s");
  });
});
