import { describe, it, expect, vi } from "vitest";
import { validarAgendamento, invalidateAgendamentoQueries } from "@/lib/agendamentos";

const base = {
  leadId: "lead-1",
  corretorId: "c1",
  criadoPorId: "u1",
  tipo: "visita",
  titulo: "Visita - João",
  dataInicio: "2026-07-20T14:00:00.000Z",
  dataFim: "2026-07-20T15:00:00.000Z",
};

describe("validarAgendamento", () => {
  it("aceita um agendamento bem-formado", () => {
    expect(validarAgendamento(base)).toBeNull();
  });

  it("exige título", () => {
    expect(validarAgendamento({ ...base, titulo: "   " })).toMatch(/título/i);
  });

  it("rejeita fim <= início", () => {
    expect(validarAgendamento({ ...base, dataFim: base.dataInicio })).toMatch(/fim/i);
    expect(
      validarAgendamento({ ...base, dataFim: "2026-07-20T13:00:00.000Z" }),
    ).toMatch(/fim/i);
  });

  it("rejeita datas inválidas", () => {
    expect(validarAgendamento({ ...base, dataInicio: "não-é-data" })).toMatch(/início/i);
    expect(validarAgendamento({ ...base, dataFim: "não-é-data" })).toMatch(/fim/i);
  });
});

describe("invalidateAgendamentoQueries", () => {
  it("invalida a agenda geral e as queries do lead (fecha a divergência A4)", () => {
    const invalidated: unknown[] = [];
    const qc = {
      invalidateQueries: (arg: { queryKey: unknown[] }) => invalidated.push(arg.queryKey),
    } as never;
    invalidateAgendamentoQueries(qc, "lead-1");
    const keys = invalidated.map((k) => JSON.stringify(k));
    expect(keys).toContain(JSON.stringify(["agendamentos"]));
    expect(keys).toContain(JSON.stringify(["agendamentos-lead", "lead-1"]));
    expect(keys).toContain(JSON.stringify(["lead", "lead-1"]));
    expect(keys).toContain(JSON.stringify(["tarefas-lead", "lead-1"]));
  });

  it("sem leadId, invalida só as queries globais", () => {
    const invalidated: unknown[] = [];
    const qc = {
      invalidateQueries: (arg: { queryKey: unknown[] }) => invalidated.push(arg.queryKey),
    } as never;
    invalidateAgendamentoQueries(qc, null);
    const keys = invalidated.map((k) => JSON.stringify(k));
    expect(keys).toContain(JSON.stringify(["agendamentos"]));
    expect(keys).not.toContain(JSON.stringify(["agendamentos-lead", null]));
  });
});

// silencia console.warn dos testes que não o exercitam
vi.spyOn(console, "warn").mockImplementation(() => {});
