import { describe, expect, it } from "vitest";
import {
  agregarCoortes,
  coorteSemDado,
  taxasDePassagem,
  vendasPorSemana,
} from "@/features/inteligencia/funil-derive";
import type { FunilCoorteRow } from "@/features/inteligencia/queries";

const coorte = (p: Partial<FunilCoorteRow>): FunilCoorteRow => ({
  mes_coorte: "2026-06-01",
  leads: 0,
  atingiu_atendimento: 0,
  atingiu_agendado: 0,
  atingiu_visita: 0,
  atingiu_analise: 0,
  vendas: 0,
  perdidos: 0,
  cobertura_pct: 100,
  atualizado_em: null,
  ...p,
});

describe("agregarCoortes", () => {
  it("soma volumes e pondera cobertura pelos leads", () => {
    const agg = agregarCoortes([
      coorte({ leads: 100, atingiu_atendimento: 60, vendas: 5, cobertura_pct: 100 }),
      coorte({ mes_coorte: "2026-07-01", leads: 300, atingiu_atendimento: 90, vendas: 3, cobertura_pct: 20 }),
    ]);
    expect(agg).not.toBeNull();
    expect(agg!.leads).toBe(400);
    expect(agg!.atingiu_atendimento).toBe(150);
    expect(agg!.vendas).toBe(8);
    // (100×100 + 20×300) / 400 = 40
    expect(agg!.cobertura_pct).toBe(40);
  });

  it("sem linhas devolve null (não zero falso)", () => {
    expect(agregarCoortes([])).toBeNull();
  });
});

describe("taxasDePassagem", () => {
  it("calcula passagem etapa→etapa e conversão acumulada", () => {
    const agg = agregarCoortes([
      coorte({
        leads: 200,
        atingiu_atendimento: 100,
        atingiu_agendado: 50,
        atingiu_visita: 30,
        atingiu_analise: 12,
        vendas: 6,
      }),
    ])!;
    const taxas = taxasDePassagem(agg);
    const agendado = taxas.find((t) => t.etapa.chave === "atingiu_agendado")!;
    expect(agendado.taxa_passagem_pct).toBe(50); // 50 de 100 atendidos
    expect(agendado.conversao_acumulada_pct).toBe(25); // 50 de 200 leads
    const vendas = taxas.find((t) => t.etapa.chave === "vendas")!;
    expect(vendas.taxa_passagem_pct).toBe(50); // 6 de 12 análises
    expect(vendas.conversao_acumulada_pct).toBe(3); // 6 de 200
  });

  it("denominador zero vira null, nunca Infinity", () => {
    const agg = agregarCoortes([coorte({ leads: 10 })])!;
    const taxas = taxasDePassagem(agg);
    const visita = taxas.find((t) => t.etapa.chave === "atingiu_visita")!;
    expect(visita.taxa_passagem_pct).toBeNull();
  });
});

describe("coorteSemDado", () => {
  it("cobertura abaixo do limiar (import legado) = sem dado", () => {
    expect(coorteSemDado(20, 60)).toBe(true);
    expect(coorteSemDado(80, 60)).toBe(false);
    expect(coorteSemDado(null, 60)).toBe(true);
  });
});

describe("vendasPorSemana", () => {
  it("agrupa a série diária por segunda-feira ISO", () => {
    const semanas = vendasPorSemana([
      { dia: "2026-07-20", vendas: 1 }, // segunda
      { dia: "2026-07-22", vendas: 2 }, // mesma semana
      { dia: "2026-07-27", vendas: 3 }, // semana seguinte
    ]);
    expect(semanas).toEqual([
      { semana: "2026-07-20", vendas: 3 },
      { semana: "2026-07-27", vendas: 3 },
    ]);
  });
});
