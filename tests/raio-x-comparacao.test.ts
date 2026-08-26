import { describe, expect, it } from "vitest";
import { compararComPeriodoAnterior } from "@/features/inteligencia/raio-x-derive";
import type { PerformanceDrillRow } from "@/features/inteligencia/queries";

const mes = (m: string, vendas: number, vgv: number, visitas = 0): PerformanceDrillRow => ({
  mes: m,
  leads_recebidos: 0,
  interacoes: 0,
  contatos: 0,
  agendamentos_criados: 0,
  visitas_realizadas: visitas,
  no_shows: 0,
  analises: 0,
  tarefas_concluidas: 0,
  vendas,
  vgv,
  primeira_resposta_p50_min: null,
  atualizado_em: null,
});

describe("compararComPeriodoAnterior", () => {
  it("série vazia devolve janela zerada, sem base e sem delta", () => {
    const r = compararComPeriodoAnterior([], 6);
    expect(r.atual).toEqual({ meses: 0, vendas: 0, vgv: 0, visitas: 0 });
    expect(r.anterior).toBeNull();
    expect(r.deltaVendasPct).toBeNull();
    expect(r.deltaVgvPct).toBeNull();
    expect(r.deltaVisitasPct).toBeNull();
  });

  it("1 mês só: agrega o que existe e não inventa base de comparação", () => {
    const r = compararComPeriodoAnterior([mes("2026-08-01", 2, 500_000, 4)], 6);
    expect(r.atual).toEqual({ meses: 1, vendas: 2, vgv: 500_000, visitas: 4 });
    expect(r.anterior).toBeNull();
    expect(r.deltaVendasPct).toBeNull();
  });

  it("janela cheia: agrega atual vs. anterior de IGUAL tamanho, com delta %", () => {
    const r = compararComPeriodoAnterior(
      [
        mes("2026-05-01", 1, 100_000, 5),
        mes("2026-06-01", 1, 100_000, 5),
        mes("2026-07-01", 2, 300_000, 8),
        mes("2026-08-01", 2, 300_000, 7),
      ],
      2,
    );
    expect(r.atual).toEqual({ meses: 2, vendas: 4, vgv: 600_000, visitas: 15 });
    expect(r.anterior).toEqual({ meses: 2, vendas: 2, vgv: 200_000, visitas: 10 });
    expect(r.deltaVendasPct).toBe(100);
    expect(r.deltaVgvPct).toBe(200);
    expect(r.deltaVisitasPct).toBe(50);
  });

  it("janela anterior partida (incompleta) não compara — absoluto contra base menor mentiria", () => {
    const r = compararComPeriodoAnterior(
      [mes("2026-06-01", 1, 100_000), mes("2026-07-01", 2, 200_000), mes("2026-08-01", 3, 300_000)],
      2,
    );
    expect(r.atual.meses).toBe(2);
    expect(r.atual.vendas).toBe(5);
    // Só sobrou 1 mês para uma janela de 2: sem base honesta.
    expect(r.anterior).toBeNull();
    expect(r.deltaVendasPct).toBeNull();
  });

  it("base 0 anula só o delta daquela métrica (nunca Infinity)", () => {
    const r = compararComPeriodoAnterior(
      [
        mes("2026-05-01", 0, 0, 5),
        mes("2026-06-01", 0, 0, 5),
        mes("2026-07-01", 2, 300_000, 5),
        mes("2026-08-01", 1, 200_000, 15),
      ],
      2,
    );
    expect(r.anterior).toEqual({ meses: 2, vendas: 0, vgv: 0, visitas: 10 });
    expect(r.deltaVendasPct).toBeNull();
    expect(r.deltaVgvPct).toBeNull();
    expect(r.deltaVisitasPct).toBe(100);
  });

  it("ordena a série antes de fatiar (a MV não garante ordem)", () => {
    const r = compararComPeriodoAnterior(
      [
        mes("2026-08-01", 4, 0),
        mes("2026-05-01", 1, 0),
        mes("2026-07-01", 3, 0),
        mes("2026-06-01", 2, 0),
      ],
      2,
    );
    expect(r.atual.vendas).toBe(7); // jul + ago
    expect(r.anterior?.vendas).toBe(3); // mai + jun
    expect(r.deltaVendasPct).toBe(133);
  });

  it("meses ALÉM das duas janelas ficam de fora do cálculo", () => {
    const r = compararComPeriodoAnterior(
      [
        mes("2026-04-01", 99, 0),
        mes("2026-05-01", 1, 0),
        mes("2026-06-01", 1, 0),
        mes("2026-07-01", 2, 0),
        mes("2026-08-01", 2, 0),
      ],
      2,
    );
    expect(r.atual.vendas).toBe(4);
    expect(r.anterior?.vendas).toBe(2); // abril (99) não entra
  });
});
