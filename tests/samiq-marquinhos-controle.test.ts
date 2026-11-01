import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ desfazer: vi.fn() }));
vi.mock("@/lib/samiq-confirmar.server", () => ({
  desfazerPropostas: mocks.desfazer,
  confirmarPropostas: vi.fn(),
  rejeitarPropostasDetalhado: vi.fn(),
}));

import { criarFerramentasDeControleSamiQ } from "@/lib/samiq-controle.server";

describe("trava de desfazer do Marquinhos, inclusive por ferramenta de IA", () => {
  it("recusa CANCELAR mesmo com uma nota gravada no recibo", async () => {
    const ferramentas = criarFerramentasDeControleSamiQ({
      supabase: {} as never,
      userId: "admin",
      textoDoCorretor: "CANCELAR",
      pendentes: [],
      executadas: [{
        id: "nota", tipo: "anotar", status: "aceita", leadNome: "Teste QA",
        payload: { tipo: "anotar", leadId: "lead", nota: "teste" },
        desfazerAte: "2026-11-02T20:00:00Z",
      }],
      contexto: { canalOrigem: "marquinhos" },
      registro: { confirmadas: [], descartadas: [], desfeitas: [] },
      agora: new Date("2026-11-01T20:00:00Z"),
    });
    const ferramenta = ferramentas.desfazer_acoes;
    if (!ferramenta?.execute) throw new Error("Esperava ferramenta de desfazer disponível");
    const resultado = await ferramenta.execute({ itens: [1] }, { toolCallId: "qa", messages: [] });
    expect(resultado).toMatchObject({ erro: "precisa_desfazer" });
    expect(mocks.desfazer).not.toHaveBeenCalled();
  });
});