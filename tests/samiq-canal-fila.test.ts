// Fila do canal no banco (v8): retentativa do n8n recebe a resposta guardada,
// mensagens do mesmo corretor rodam em ordem e tudo cabe nos 90 s do n8n.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  respostas: [] as Array<{ data: unknown; error: unknown }>,
  chamadas: [] as Array<{ fn: string; args: Record<string, unknown> }>,
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      m.chamadas.push({ fn, args });
      if (fn === "samiq_canal_concluir") return { data: true, error: null };
      return m.respostas.shift() ?? { data: null, error: { code: "XX000" } };
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ ok: true }) }));
vi.mock("@/lib/samiq-governance.server", () => ({ SamiQQuotaError: class extends Error {} }));
vi.mock("@/lib/samiq-memoria.server", () => ({
  gravarTurnoSamiQ: vi.fn(),
  gravarContextoTurnoSamiQ: vi.fn(),
}));
vi.mock("@/lib/samiq-confirmar.server", () => ({
  confirmarPropostas: vi.fn(),
  rejeitarPropostasDetalhado: vi.fn(),
  desfazerPropostas: vi.fn(),
}));

/** Relógio de mentira: cada "dormir" anda o tempo, sem esperar de verdade. */
function relogio() {
  let t = 1_000_000;
  return {
    agora: () => t,
    dormir: async (ms: number) => {
      t += ms;
    },
    andar: (ms: number) => {
      t += ms;
    },
  };
}

beforeEach(() => {
  m.respostas = [];
  m.chamadas = [];
});

describe("entrarNaFilaDoCanal", () => {
  it("livre: processa com o orçamento inteiro e guarda a resposta no fim", async () => {
    const { entrarNaFilaDoCanal, SAMI_CANAL_ORCAMENTO_MS } =
      await import("@/lib/samiq-canal.server");
    const r0 = relogio();
    m.respostas.push({ data: { acao: "processar", id: "fila-1", tentativa: "t-1" }, error: null });
    const t = await entrarNaFilaDoCanal({
      corretorId: "u1",
      mensagemId: "wamid.A",
      relogio: r0.agora,
      dormir: r0.dormir,
    });
    expect(t.tipo).toBe("processar");
    if (t.tipo !== "processar") return;
    expect(t.prazoMs).toBe(SAMI_CANAL_ORCAMENTO_MS);
    expect(m.chamadas[0]).toMatchObject({
      fn: "samiq_canal_iniciar",
      args: { _user_id: "u1", _mensagem_id: "wamid.A", _forcar: false },
    });
    await t.concluir({ ok: true, texto: "Gravei no CRM: ..." });
    expect(m.chamadas.at(-1)).toMatchObject({
      fn: "samiq_canal_concluir",
      args: {
        _id: "fila-1",
        _tentativa: "t-1",
        _status: "respondida",
        _resposta: { ok: true, texto: "Gravei no CRM: ..." },
      },
    });
  });

  it("retentativa de mensagem já respondida: devolve a resposta guardada, sem processar", async () => {
    const { entrarNaFilaDoCanal } = await import("@/lib/samiq-canal.server");
    m.respostas.push({
      data: { acao: "repetida", resposta: { ok: true, tipo: "resposta", texto: "recibo" } },
      error: null,
    });
    const t = await entrarNaFilaDoCanal({ corretorId: "u1", mensagemId: "wamid.A" });
    expect(t).toEqual({
      tipo: "repetida",
      resposta: { ok: true, tipo: "resposta", texto: "recibo" },
    });
  });

  it("mensagem anterior rodando: espera a vez e desconta a espera do prazo do turno", async () => {
    const { entrarNaFilaDoCanal, SAMI_CANAL_ORCAMENTO_MS } =
      await import("@/lib/samiq-canal.server");
    const r0 = relogio();
    m.respostas.push(
      { data: { acao: "aguardar", motivo: "fila" }, error: null },
      { data: { acao: "aguardar", motivo: "fila" }, error: null },
      { data: { acao: "processar", id: "fila-2", tentativa: "t-2" }, error: null },
    );
    const t = await entrarNaFilaDoCanal({
      corretorId: "u1",
      mensagemId: "wamid.B",
      relogio: r0.agora,
      dormir: r0.dormir,
    });
    expect(t.tipo).toBe("processar");
    if (t.tipo !== "processar") return;
    expect(t.prazoMs).toBe(SAMI_CANAL_ORCAMENTO_MS - 3_000);
  });

  it("fila parada demais: segue mesmo assim (forçando) para responder dentro do tempo do n8n", async () => {
    const { entrarNaFilaDoCanal, SAMI_CANAL_ESPERA_FILA_MS } =
      await import("@/lib/samiq-canal.server");
    const r0 = relogio();
    const voltas = Math.ceil(SAMI_CANAL_ESPERA_FILA_MS / 1_500) + 1;
    for (let i = 0; i < voltas; i++) {
      m.respostas.push({ data: { acao: "aguardar", motivo: "fila" }, error: null });
    }
    m.respostas.push({ data: { acao: "processar", id: "fila-3", tentativa: "t-3" }, error: null });
    const t = await entrarNaFilaDoCanal({
      corretorId: "u1",
      mensagemId: "wamid.C",
      relogio: r0.agora,
      dormir: r0.dormir,
    });
    expect(t.tipo).toBe("processar");
    expect(m.chamadas.filter((c) => c.fn === "samiq_canal_iniciar").at(-1)?.args._forcar).toBe(
      true,
    );
  });

  it("a original ainda roda depois de muito tempo: a cópia fica calada (a original responde)", async () => {
    const { entrarNaFilaDoCanal, SAMI_CANAL_ESPERA_MESMA_MS } =
      await import("@/lib/samiq-canal.server");
    const r0 = relogio();
    const voltas = Math.ceil(SAMI_CANAL_ESPERA_MESMA_MS / 1_500) + 2;
    for (let i = 0; i < voltas; i++) {
      m.respostas.push({ data: { acao: "aguardar", motivo: "mesma_mensagem" }, error: null });
    }
    const t = await entrarNaFilaDoCanal({
      corretorId: "u1",
      mensagemId: "wamid.A",
      relogio: r0.agora,
      dormir: r0.dormir,
    });
    expect(t).toEqual({ tipo: "em_andamento" });
  });

  it("banco sem a fila (migration ainda não aplicada): processa sem ela", async () => {
    const { entrarNaFilaDoCanal } = await import("@/lib/samiq-canal.server");
    m.respostas.push({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    });
    const t = await entrarNaFilaDoCanal({ corretorId: "u1", mensagemId: "wamid.D" });
    expect(t.tipo).toBe("processar");
    if (t.tipo !== "processar") return;
    await t.concluir({ ok: true });
    expect(m.chamadas.some((c) => c.fn === "samiq_canal_concluir")).toBe(false);
  });

  it("sem id do WhatsApp (n8n antigo): entra na fila com um id próprio", async () => {
    const { entrarNaFilaDoCanal } = await import("@/lib/samiq-canal.server");
    m.respostas.push({ data: { acao: "processar", id: "fila-5", tentativa: "t-5" }, error: null });
    await entrarNaFilaDoCanal({ corretorId: "u1", mensagemId: null });
    expect(String(m.chamadas[0].args._mensagem_id)).toMatch(/^sem-id:/);
  });
});
