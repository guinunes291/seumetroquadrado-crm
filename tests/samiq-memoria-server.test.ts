import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  conversaAtivaSamiQ,
  gravarTurnoSamiQ,
  registrarPropostasSamiQ,
} from "@/lib/samiq-memoria.server";

const db = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));

beforeEach(() => vi.resetAllMocks());

describe("memória SamiQ — contrato das chamadas ao banco", () => {
  it("envia IDs nulos exigidos pela assinatura e redige PII antes da gravação", async () => {
    db.rpc.mockResolvedValue({ data: "conversa-nova", error: null });
    expect(
      await gravarTurnoSamiQ({
        userId: "usuario",
        pergunta: "Meu e-mail é cliente@example.com",
        resposta: "Contato pelo telefone (11) 99999-8888.",
      }),
    ).toBe("conversa-nova");
    expect(db.rpc).toHaveBeenCalledOnce();
    const [rpc, payload] = db.rpc.mock.calls[0];
    expect(rpc).toBe("samiq_gravar_turno");
    expect(payload).toMatchObject({ _user_id: "usuario", _conversa_id: null, _lead_id: null });
    expect(payload._pergunta).not.toContain("cliente@example.com");
    expect(payload._resposta).not.toContain("99999-8888");
    expect(payload).not.toHaveProperty("_canal");
    expect(db.from).not.toHaveBeenCalled();
  });

  it("refaz sem canal quando a assinatura WhatsApp ainda não está disponível", async () => {
    db.rpc
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } })
      .mockResolvedValueOnce({ data: "conversa", error: null });
    expect(
      await gravarTurnoSamiQ({
        userId: "usuario",
        pergunta: "Como está a agenda?",
        resposta: "Há uma visita hoje.",
        canal: "whatsapp",
      }),
    ).toBe("conversa");
    expect(db.rpc).toHaveBeenCalledTimes(2);
    expect(db.rpc.mock.calls[0][1]).toMatchObject({ _canal: "whatsapp", _conversa_id: null });
    expect(db.rpc.mock.calls[1][1]).not.toHaveProperty("_canal");
    expect(db.rpc.mock.calls[1][1]).toMatchObject({ _lead_id: null, _conversa_id: null });
  });

  it("registra propostas com execução/conversa nulas sem omitir argumentos obrigatórios", async () => {
    db.rpc.mockResolvedValue({ data: ["proposta-1"], error: null });
    const result = await registrarPropostasSamiQ({
      userId: "usuario",
      executionId: null,
      conversaId: null,
      coletadas: [
        {
          payload: { tipo: "anotar", leadId: "lead", nota: "Retornar amanhã" },
          leadId: "lead",
          leadNome: null,
        },
      ],
    });
    expect(db.rpc).toHaveBeenCalledWith(
      "samiq_registrar_propostas",
      expect.objectContaining({
        _execution_id: null,
        _conversa_id: null,
      }),
    );
    expect(result).toMatchObject([{ id: "proposta-1", tipo: "anotar", status: "pendente" }]);
  });

  it("mantém o filtro de usuário e canal ao retomar uma conversa recente", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "conversa", lead_id: null, atualizado_em: "2026-09-08T12:00:00Z" },
        error: null,
      }),
    };
    db.from.mockReturnValue(query);
    expect(
      await conversaAtivaSamiQ({
        userId: "usuario",
        canal: "whatsapp",
        agora: new Date("2026-09-08T13:00:00Z"),
      }),
    ).toEqual({ id: "conversa", leadId: null });
    expect(db.from).toHaveBeenCalledWith("samiq_conversas");
    expect(query.eq.mock.calls).toEqual([
      ["user_id", "usuario"],
      ["canal", "whatsapp"],
    ]);
  });
});
