import { describe, it, expect } from "vitest";
import {
  computeCopaTotal,
  configFromRows,
  totalSemanas,
  semanaAtual,
  faseDaSemana,
  decideVencedor,
  medalha,
} from "@/lib/copa";

const config = { agendamento: 25, visita: 40, analise: 60, venda: 150 };

describe("copa scoring", () => {
  it("computeCopaTotal multiplica contadores pela config", () => {
    expect(computeCopaTotal({ agendamentos: 2, visitas: 1, analise: 1, vendas: 1 }, config)).toBe(
      300,
    );
    expect(computeCopaTotal({ agendamentos: 0, visitas: 0, analise: 0, vendas: 0 }, config)).toBe(
      0,
    );
  });

  it("configFromRows usa valores do banco e cai no fallback", () => {
    const c = configFromRows([{ chave: "venda", pontos: 1000 }]);
    expect(c.venda).toBe(1000);
    expect(c.agendamento).toBe(25); // fallback
  });
});

describe("copa calendário", () => {
  it("totalSemanas cobre a edição 03/06–26/07", () => {
    expect(totalSemanas("2026-06-03", "2026-07-26")).toBe(8);
  });

  it("semanaAtual respeita início, meio e fim", () => {
    expect(semanaAtual("2026-06-03", "2026-07-26", new Date("2026-06-01T12:00:00"))).toBe(1);
    expect(semanaAtual("2026-06-03", "2026-07-26", new Date("2026-06-15T12:00:00"))).toBe(2);
    expect(semanaAtual("2026-06-03", "2026-07-26", new Date("2026-08-10T12:00:00"))).toBe(8);
  });

  it("faseDaSemana acha a fase e cai na última", () => {
    const fases = [
      { nome: "Grupos", ordem: 1, semana_inicio: 1, semana_fim: 3 },
      { nome: "Oitavas", ordem: 2, semana_inicio: 4, semana_fim: 4 },
      { nome: "Final", ordem: 6, semana_inicio: 8, semana_fim: 8 },
    ];
    expect(faseDaSemana(fases, 2)?.nome).toBe("Grupos");
    expect(faseDaSemana(fases, 4)?.nome).toBe("Oitavas");
    expect(faseDaSemana(fases, 9)?.nome).toBe("Final");
  });
});

describe("copa confronto e medalhas", () => {
  it("decideVencedor: empate favorece A", () => {
    expect(decideVencedor(10, 20, "a", "b")).toBe("b");
    expect(decideVencedor(20, 10, "a", "b")).toBe("a");
    expect(decideVencedor(5, 5, "a", "b")).toBe("a");
  });

  it("medalha por posição", () => {
    expect(medalha(1)).toBe("🥇");
    expect(medalha(3)).toBe("🥉");
    expect(medalha(4)).toBe("4º");
  });
});
