import { describe, expect, it } from "vitest";
import { leadFlags, leadRowIntent } from "@/lib/lead-flags";

const NOW = new Date("2026-07-13T12:00:00Z");
const horasAtras = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const diasAtras = (d: number) => horasAtras(d * 24);

describe("leadFlags", () => {
  it("lead recém-chegado aguardando = novo (nunca atrasado)", () => {
    const flags = leadFlags(
      {
        status: "aguardando_atendimento",
        temperatura: null,
        created_at: horasAtras(2),
        ultima_interacao: null,
      },
      { now: NOW },
    );
    expect(flags).toContain("novo");
    expect(flags).not.toContain("atrasado");
    // aguardando não ganha "sem_contato" — a fila é medida por "atrasado"
    expect(flags).not.toContain("sem_contato");
  });

  it("aguardando há 24h+ vira atrasado", () => {
    const flags = leadFlags(
      {
        status: "aguardando_atendimento",
        temperatura: null,
        created_at: diasAtras(2),
        ultima_interacao: null,
      },
      { now: NOW },
    );
    expect(flags).toEqual(["atrasado"]);
  });

  it("quente esfriando (3d+ sem contato) = quente + em_risco", () => {
    const flags = leadFlags(
      {
        status: "em_atendimento",
        temperatura: "quente",
        created_at: diasAtras(20),
        ultima_interacao: diasAtras(4),
      },
      { now: NOW },
    );
    expect(flags).toContain("quente");
    expect(flags).toContain("em_risco");
  });

  it("parado 10d+ absorve sem_contato", () => {
    const flags = leadFlags(
      {
        status: "em_atendimento",
        temperatura: "morno",
        created_at: diasAtras(30),
        ultima_interacao: diasAtras(12),
      },
      { now: NOW },
    );
    expect(flags).toContain("parado");
    expect(flags).not.toContain("sem_contato");
  });

  it("sem contato 5-9d marca sem_contato", () => {
    const flags = leadFlags(
      {
        status: "em_atendimento",
        temperatura: null,
        created_at: diasAtras(30),
        ultima_interacao: diasAtras(6),
      },
      { now: NOW },
    );
    expect(flags).toEqual(["sem_contato"]);
  });

  it("status finalizado não gera flag de inatividade nem quente", () => {
    const flags = leadFlags(
      {
        status: "perdido",
        temperatura: "quente",
        created_at: diasAtras(60),
        ultima_interacao: diasAtras(45),
      },
      { now: NOW },
    );
    expect(flags).toEqual([]);
  });

  it("agendado ganha com_visita", () => {
    const flags = leadFlags(
      {
        status: "agendado",
        temperatura: "morno",
        created_at: diasAtras(3),
        ultima_interacao: diasAtras(1),
      },
      { now: NOW },
    );
    expect(flags).toContain("com_visita");
  });
});

describe("leadRowIntent", () => {
  it("pior flag vence (em_risco > parado > novo)", () => {
    expect(leadRowIntent(["novo"])).toBe("info");
    expect(leadRowIntent(["sem_contato"])).toBe("warning");
    expect(leadRowIntent(["quente", "em_risco"])).toBe("danger");
    expect(leadRowIntent(["parado", "com_visita"])).toBe("warning");
    expect(leadRowIntent([])).toBeNull();
  });
});
