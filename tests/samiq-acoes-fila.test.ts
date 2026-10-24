// Ações leves pedidas no mesmo passo (o AI SDK roda as ferramentas em
// paralelo) gravam uma de cada vez, na ordem em que chegaram: duas escritas
// na mesma ficha não se atropelam e a ordem do recibo é a ordem real.
import { describe, expect, it, vi } from "vitest";

const log: string[] = [];
let seq = 0;

vi.mock("@/lib/samiq-memoria.server", () => ({
  registrarPropostasSamiQ: async (a: { coletadas: Array<{ payload: { tipo: string } }> }) => [
    {
      id: `p${++seq}`,
      tipo: a.coletadas[0].payload.tipo,
      payload: a.coletadas[0].payload,
      leadNome: "Maria",
      status: "pendente",
    },
  ],
}));
vi.mock("@/lib/samiq-confirmar.server", () => ({
  confirmarPropostas: async (a: { itens: Array<{ id: string }> }) => {
    const id = a.itens[0].id;
    log.push(`inicio ${id}`);
    // a primeira demora mais: sem fila, a segunda terminaria antes
    await new Promise((r) => setTimeout(r, id === "p1" ? 30 : 1));
    log.push(`fim ${id}`);
    return [{ id, ok: true, status: "aceita", desfazerAte: "2026-10-25T00:00:00Z" }];
  },
}));

describe("criarExecucaoImediata", () => {
  it("duas ações no mesmo passo: a segunda só começa quando a primeira termina", async () => {
    const { criarExecucaoImediata } = await import("@/lib/samiq-acoes.server");
    const ex = criarExecucaoImediata({ supabase: {} as never, userId: "u1", executionId: "e1" });
    const coletada = (tipo: string) =>
      ({ payload: { tipo }, leadId: "l1", leadNome: "Maria" }) as never;
    const [a, b] = await Promise.all([
      ex.executar(coletada("registrar_contato")),
      ex.executar(coletada("atualizar_qualificacao")),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(log).toEqual(["inicio p1", "fim p1", "inicio p2", "fim p2"]);
    expect(ex.executadas.map((e) => [e.id, e.ordem])).toEqual([
      ["p1", 1],
      ["p2", 2],
    ]);
  });
});
