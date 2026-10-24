// Troca de modelo da IA governada (23/10/2026): o model_id da governança pode
// ser um Claude direto (chave própria) ou um id do gateway do Lovable.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { jsonEstavel } from "../src/lib/samiq-confirmar.server";
import { etapaBloqueadaSemDono, mensagemEtapaNaoAplicada } from "../src/lib/samiq-propostas";

describe("etapa que o funil não aplica", () => {
  it("bloqueia Em atendimento para lead sem corretor na hora de propor", () => {
    expect(etapaBloqueadaSemDono("em_atendimento", null)).toMatch(/sem corretor/);
    expect(etapaBloqueadaSemDono("em_atendimento", "u1")).toBeNull();
    expect(etapaBloqueadaSemDono("aguardando_retorno", null)).toBeNull();
  });

  it("explica o motivo quando o funil devolve a etapa", () => {
    const msg = mensagemEtapaNaoAplicada("em_atendimento", "aguardando_atendimento", null);
    expect(msg).toContain("Aguardando atendimento");
    expect(msg).toContain("sem corretor responsável");
  });
});

describe("status editada", () => {
  it("ordem de chaves diferente não conta como edição", () => {
    expect(jsonEstavel({ a: 1, b: { c: 2, d: 3 } })).toBe(jsonEstavel({ b: { d: 3, c: 2 }, a: 1 }));
    expect(jsonEstavel({ a: 1 })).not.toBe(jsonEstavel({ a: 2 }));
  });
});

import { tarefaNoMesmoHorario } from "../src/lib/samiq-propostas";

describe("tarefa no mesmo horário (sem duplicar)", () => {
  const abertas = [
    { id: "julho", data_vencimento: "2026-07-26T15:06:27.386+00:00" },
    { id: "auto", data_vencimento: "2026-10-24T13:00:00+00:00" },
    { id: "tarde", data_vencimento: "2026-10-24T18:00:00+00:00" },
  ];

  it("reaproveita a tarefa aberta no mesmo horário, mesmo em outro formato de data", () => {
    expect(tarefaNoMesmoHorario(abertas, "2026-10-24T10:00:00-03:00")?.id).toBe("auto");
  });

  it("aceita até 2 h de diferença e escolhe a mais próxima", () => {
    expect(tarefaNoMesmoHorario(abertas, "2026-10-24T11:30:00-03:00")?.id).toBe("auto");
    expect(tarefaNoMesmoHorario(abertas, "2026-10-24T14:30:00-03:00")?.id).toBe("tarde");
  });

  it("horário diferente cria tarefa nova", () => {
    expect(tarefaNoMesmoHorario(abertas, "2026-10-26T14:00:00-03:00")).toBeNull();
    expect(tarefaNoMesmoHorario([], "2026-10-24T10:00:00-03:00")).toBeNull();
    expect(tarefaNoMesmoHorario(abertas, "data ruim")).toBeNull();
  });
});
