import { describe, it, expect } from "vitest";
import {
  SEMANAS,
  TOTAL_SEMANAS,
  semanaAtual,
  parseDDMM,
  shortName,
  medalha,
  computeCopaTotal,
  configFromRows,
} from "@/lib/copa";

const cfg = { agendamentos: 1, visitas: 5, documentacao: 10, vendas: 40 };

describe("copa — calendário", () => {
  it("tem 14 semanas", () => {
    expect(SEMANAS).toHaveLength(14);
    expect(TOTAL_SEMANAS).toBe(14);
    expect(SEMANAS[0].label).toBe("FASE DE GRUPOS");
    expect(SEMANAS[13].label).toBe("PREMIAÇÃO");
  });

  it("semanaAtual a partir de 03/06/2026", () => {
    expect(semanaAtual(new Date("2026-06-01T12:00:00"))).toBe(1); // antes do início
    expect(semanaAtual(new Date("2026-06-03T12:00:00"))).toBe(1);
    expect(semanaAtual(new Date("2026-06-15T12:00:00"))).toBe(2);
    expect(semanaAtual(new Date("2026-09-08T12:00:00"))).toBe(14); // clamp
  });

  it("parseDDMM converte para 2026", () => {
    const d = parseDDMM("03/06")!;
    expect(d.getMonth()).toBe(5); // junho
    expect(d.getDate()).toBe(3);
    expect(parseDDMM(null)).toBeNull();
  });
});

describe("copa — pontuação", () => {
  it("computeCopaTotal usa a config (1/5/10/40)", () => {
    expect(computeCopaTotal({ agendamentos: 2, visitas: 1, documentacao: 1, vendas: 1 }, cfg)).toBe(
      57,
    );
    expect(computeCopaTotal({ agendamentos: 0, visitas: 0, documentacao: 0, vendas: 0 }, cfg)).toBe(
      0,
    );
  });

  it("configFromRows usa banco e cai no fallback", () => {
    const c = configFromRows([{ chave: "vendas", pontos: 100 }]);
    expect(c.vendas).toBe(100);
    expect(c.agendamentos).toBe(1); // fallback
    expect(c.visitas).toBe(5);
  });
});

describe("copa — helpers", () => {
  it("shortName = primeiro + último", () => {
    expect(shortName("Bruno Soares Martins")).toBe("Bruno Martins");
    expect(shortName("Andrew")).toBe("Andrew");
  });
  it("medalha por posição", () => {
    expect(medalha(1)).toBe("🥇");
    expect(medalha(3)).toBe("🥉");
    expect(medalha(5)).toBe("5º");
  });
});
