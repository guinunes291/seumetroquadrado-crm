import { describe, expect, it } from "vitest";
import { buildMissionQueue, computeStreak } from "@/features/command-center/derive";

const agora = new Date("2026-07-09T12:00:00Z");

describe("buildMissionQueue", () => {
  it("funde as três fontes, deduplica por lead e ordena por score", () => {
    const fila = buildMissionQueue({
      agora,
      sla: [
        {
          lead_id: "a",
          nome: "Ana",
          telefone: "11999990000",
          status: "aguardando_atendimento",
          minutos_decorridos: 90,
          sla_status: "estourado",
        },
      ],
      quentes: [
        // "a" também é quente — deve virar UMA missão com as duas fontes.
        {
          id: "a",
          nome: "Ana",
          telefone: "11999990000",
          status: "aguardando_atendimento",
          ultima_interacao: null,
        },
        {
          id: "b",
          nome: "Bruno",
          telefone: null,
          status: "em_atendimento",
          ultima_interacao: "2026-07-08T12:00:00Z",
        },
      ],
      semAcao: [
        {
          id: "c",
          nome: "Carla",
          telefone: "1188887777",
          status: "novo",
          temperatura: "frio",
          ultima_interacao: "2026-07-01T12:00:00Z",
        },
      ],
    });

    expect(fila.map((m) => m.leadId)).toContain("a");
    expect(fila).toHaveLength(3);
    // "a" acumulou fontes sla + quente e mantém o maior score.
    const ana = fila.find((m) => m.leadId === "a")!;
    expect(ana.fontes).toEqual(expect.arrayContaining(["sla", "quente"]));
    expect(ana.semProximaAcao).toBe(false);
    // Ordenação: score desc — Ana (quente + SLA) vem antes de Carla (fria).
    expect(fila[0].leadId).toBe("a");
    const scores = fila.map((m) => m.score);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
  });

  it("ignora SLA não estourado e marca semProximaAcao para o guardrail", () => {
    const fila = buildMissionQueue({
      agora,
      sla: [
        {
          lead_id: "x",
          nome: "X",
          telefone: null,
          status: "novo",
          minutos_decorridos: 3,
          sla_status: "ok",
        },
      ],
      quentes: [],
      semAcao: [
        {
          id: "y",
          nome: "Yara",
          telefone: null,
          status: "em_atendimento",
          temperatura: "morno",
          ultima_interacao: null,
        },
      ],
    });
    expect(fila.map((m) => m.leadId)).toEqual(["y"]);
    expect(fila[0].semProximaAcao).toBe(true);
    expect(fila[0].motivo).toMatch(/sem próxima ação/i);
  });

  it("limita a fila a 12 missões", () => {
    const semAcao = Array.from({ length: 30 }, (_, i) => ({
      id: `l${i}`,
      nome: `Lead ${i}`,
      telefone: null,
      status: "novo",
      temperatura: "frio",
      ultima_interacao: null,
    }));
    expect(buildMissionQueue({ agora, sla: [], quentes: [], semAcao })).toHaveLength(12);
  });
});

describe("computeStreak", () => {
  it("conta dias consecutivos terminando hoje", () => {
    expect(computeStreak(["2026-07-07", "2026-07-08", "2026-07-09"], "2026-07-09")).toBe(3);
  });

  it("hoje sem atividade ainda não quebra a sequência", () => {
    expect(computeStreak(["2026-07-07", "2026-07-08"], "2026-07-09")).toBe(2);
  });

  it("buraco na sequência zera a contagem anterior", () => {
    expect(computeStreak(["2026-07-05", "2026-07-06", "2026-07-08"], "2026-07-09")).toBe(1);
    expect(computeStreak([], "2026-07-09")).toBe(0);
  });
});
