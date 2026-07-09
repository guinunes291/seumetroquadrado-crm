import { describe, expect, it } from "vitest";
import {
  criarSprint,
  marcarFeito,
  parseSprint,
  proximoLead,
  sprintExpirado,
  sprintRestanteMs,
  type SprintLead,
} from "@/features/sprint/use-sprint";

const T0 = 1_800_000_000_000;
const fila: SprintLead[] = [
  { id: "a", nome: "Ana", telefone: "11999990000" },
  { id: "b", nome: "Bruno", telefone: null },
  { id: "c", nome: "Carla", telefone: "11888887777" },
];

describe("Modo Sprint (núcleo puro)", () => {
  it("cria sprint com fila snapshot limitada a 20 e meta mínima 1", () => {
    const grande = Array.from({ length: 30 }, (_, i) => ({
      id: `l${i}`,
      nome: `L${i}`,
      telefone: null,
    }));
    const s = criarSprint(grande, 30, 0, T0);
    expect(s.queue).toHaveLength(20);
    expect(s.goal).toBe(1);
    expect(s.done).toEqual([]);
  });

  it("conta o tempo restante e expira no fim da duração", () => {
    const s = criarSprint(fila, 30, 10, T0);
    expect(sprintRestanteMs(s, T0)).toBe(30 * 60_000);
    expect(sprintRestanteMs(s, T0 + 10 * 60_000)).toBe(20 * 60_000);
    expect(sprintExpirado(s, T0 + 29 * 60_000)).toBe(false);
    expect(sprintExpirado(s, T0 + 30 * 60_000)).toBe(true);
  });

  it("marca feito sem duplicar e avança o próximo lead", () => {
    let s = criarSprint(fila, 60, 3, T0);
    expect(proximoLead(s)?.id).toBe("a");
    s = marcarFeito(s, "a");
    s = marcarFeito(s, "a");
    expect(s.done).toEqual(["a"]);
    expect(proximoLead(s)?.id).toBe("b");
    s = marcarFeito(s, "b");
    s = marcarFeito(s, "c");
    expect(proximoLead(s)).toBeNull();
  });

  it("parseSprint rejeita payload corrompido e aceita estado válido", () => {
    expect(parseSprint(null)).toBeNull();
    expect(parseSprint("{broken")).toBeNull();
    expect(parseSprint(JSON.stringify({ startedAt: "x" }))).toBeNull();
    expect(
      parseSprint(JSON.stringify({ startedAt: T0, durationMin: 45, queue: [], done: [] })),
    ).toBeNull();
    const ok = criarSprint(fila, 90, 5, T0);
    expect(parseSprint(JSON.stringify(ok))).toEqual(ok);
  });
});
