import { describe, expect, it } from "vitest";
import { flattenDashboardKpis, pctDelta } from "@/features/dashboard/derive";

describe("pctDelta", () => {
  it("calcula variação percentual inteira", () => {
    expect(pctDelta(12, 10)).toBe(20);
    expect(pctDelta(8, 10)).toBe(-20);
  });

  it("retorna null sem base de comparação (prev ausente ou zero)", () => {
    expect(pctDelta(12, null)).toBeNull();
    expect(pctDelta(12, undefined)).toBeNull();
    expect(pctDelta(12, 0)).toBeNull();
  });
});

describe("flattenDashboardKpis", () => {
  it("achata o shape aninhado {pipeline, periodo, prev} da RPC atual", () => {
    const flat = flattenDashboardKpis({
      pipeline: {
        novo: 2,
        aguardando_atendimento: 30,
        aguardando_retorno: 5,
        em_atendimento: 40,
        agendado: 7,
        visita_realizada: 3,
        analise_credito: 4,
        em_aberto: 91,
        sem_corretor: 6,
      },
      periodo: { leads_novos: 120, agendamentos: 22, visitas: 15, perdidos: 9, vendas: 5, vgv: 1_200_000 },
      prev: { leads_novos: 100, agendamentos: 20, visitas: 10, perdidos: 12, vendas: 4, vgv: 1_000_000 },
    });
    expect(flat.aguardando).toBe(30);
    expect(flat.em_atendimento).toBe(40);
    expect(flat.sem_corretor).toBe(6);
    expect(flat.total).toBe(120);
    expect(flat.contrato_fechado).toBe(5);
    expect(flat.perdido).toBe(9);
    expect(flat.vgv).toBe(1_200_000);
    expect(flat.deltas.total).toBe(20);
    expect(flat.deltas.contrato_fechado).toBe(25);
    expect(flat.deltas.perdido).toBe(-25);
    expect(flat.deltas.vgv).toBe(20);
  });

  it("aceita o shape plano legado sem quebrar", () => {
    const flat = flattenDashboardKpis({
      total: 50,
      aguardando: 10,
      em_atendimento: 20,
      contrato_fechado: 3,
      perdido: 2,
      sem_corretor: 1,
    });
    expect(flat.total).toBe(50);
    expect(flat.aguardando).toBe(10);
    expect(flat.contrato_fechado).toBe(3);
    expect(flat.deltas.total).toBeNull();
  });

  it("prev nulo (período aberto) não gera delta falso", () => {
    const flat = flattenDashboardKpis({
      pipeline: { aguardando_atendimento: 1 },
      periodo: { leads_novos: 10, vendas: 1, perdidos: 0, vgv: 0 },
      prev: null,
    });
    expect(flat.deltas.total).toBeNull();
    expect(flat.deltas.contrato_fechado).toBeNull();
  });

  it("dados ausentes viram zeros, nunca NaN", () => {
    const flat = flattenDashboardKpis(null);
    expect(flat.total).toBe(0);
    expect(flat.aguardando).toBe(0);
    expect(Number.isNaN(flat.vgv)).toBe(false);
  });
});
