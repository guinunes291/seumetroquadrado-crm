// DESFAZER pelo WhatsApp: a numeração é a do recibo que o corretor tem na tela.
// Desfazer o item 1 não pode transformar o antigo item 3 em "2".
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  desfazer: vi.fn(),
  gravarTurno: vi.fn(),
  gravarContexto: vi.fn(),
}));

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ ok: true }) }));
vi.mock("@/lib/samiq-governance.server", () => ({ SamiQQuotaError: class extends Error {} }));
vi.mock("@/lib/samiq-memoria.server", () => ({
  gravarTurnoSamiQ: m.gravarTurno,
  gravarContextoTurnoSamiQ: m.gravarContexto,
}));
vi.mock("@/lib/samiq-confirmar.server", () => ({
  confirmarPropostas: vi.fn(),
  rejeitarPropostas: vi.fn(),
  desfazerPropostas: m.desfazer,
}));

const LEAD = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.gravarTurno.mockResolvedValue("conv-1");
  m.gravarContexto.mockResolvedValue(true);
});

describe("desfazerPeloCanal", () => {
  it("desfaz o item pedido e mantém a lista do recibo (sem renumerar)", async () => {
    m.desfazer.mockResolvedValue([{ id: "a1", ok: true }]);
    const { desfazerPeloCanal } = await import("@/lib/samiq-canal.server");
    const r = await desfazerPeloCanal({
      corretor: { id: "u1", nome: "Guilherme" } as never,
      acoes: [
        {
          id: "a1",
          tipo: "anotar",
          status: "aceita",
          payload: { tipo: "anotar", leadId: LEAD, nota: "só depois das 18h" },
          leadNome: "Maria Silva",
        } as never,
      ],
      conversaId: "conv-1",
      mensagem: "DESFAZER 1",
      contexto: { executadas: ["a1", "a2", "a3"], pediu_decisao: true },
      mensagemId: "wamid.1",
    });
    expect(r.texto).toContain("Desfeito: Nota sobre Maria Silva");
    expect(m.desfazer).toHaveBeenCalledWith({ userId: "u1", ids: ["a1"] });
    const ctx = m.gravarContexto.mock.calls[0][0] as { contexto: Record<string, unknown> };
    // "DESFAZER 3" depois disso ainda aponta para a3, como no recibo.
    expect(ctx.contexto.executadas).toEqual(["a1", "a2", "a3"]);
    expect(ctx.contexto.pediu_decisao).toBe(false);
    expect(ctx.contexto.ultima_mensagem_id).toBe("wamid.1");
  });

  it("nada desfazível: avisa sem chamar o banco", async () => {
    const { desfazerPeloCanal } = await import("@/lib/samiq-canal.server");
    const r = await desfazerPeloCanal({
      corretor: { id: "u1", nome: "Guilherme" } as never,
      acoes: [],
      conversaId: "conv-1",
      mensagem: "DESFAZER",
      contexto: { executadas: ["a1"] },
    });
    expect(r.texto).toBe(
      "Não achei nada recente para desfazer nesta conversa (o desfazer vale por 24 h).",
    );
    expect(m.desfazer).not.toHaveBeenCalled();
  });
});

describe("o que volta pelo DESFAZER", () => {
  const AGORA = new Date("2026-10-24T13:00:00Z");
  it("motivoSemDesfazer: desfeito, tipo que não volta, fora do prazo", async () => {
    const { motivoSemDesfazer } = await import("@/lib/samiq-propostas");
    const base = { tipo: "anotar" as const, status: "aceita", desfazerAte: "2026-10-25T00:00:00Z" };
    expect(motivoSemDesfazer(base, AGORA)).toBeNull();
    expect(motivoSemDesfazer({ ...base, status: "editada" }, AGORA)).toBeNull();
    expect(motivoSemDesfazer({ ...base, status: "desfeita" }, AGORA)).toBe("ja_desfeito");
    expect(motivoSemDesfazer({ ...base, tipo: "fazer_checkin" }, AGORA)).toBe("nao_desfazivel");
    expect(motivoSemDesfazer({ ...base, tipo: "registrar_venda" }, AGORA)).toBe("nao_desfazivel");
    expect(motivoSemDesfazer({ ...base, desfazerAte: "2026-10-24T12:59:59Z" }, AGORA)).toBe(
      "fora_do_prazo",
    );
    expect(motivoSemDesfazer({ ...base, desfazerAte: null }, AGORA)).toBe("fora_do_prazo");
  });

  it("DESFAZER 1 num item que não volta explica o motivo em vez de dizer 'nada recente'", async () => {
    const { textoDoDesfazer } = await import("@/lib/samiq-canal");
    const checkin = {
      id: "c1",
      tipo: "fazer_checkin",
      status: "aceita",
      payload: { tipo: "fazer_checkin", modo: "loja", filial: "barra-funda" },
      leadNome: null,
    } as never;
    expect(textoDoDesfazer([], [], [{ acao: checkin, motivo: "nao_desfazivel" }])).toBe(
      "Check-in na filial Barra Funda: esse registro não volta pelo DESFAZER; me diga o que corrigir.",
    );
  });
});
