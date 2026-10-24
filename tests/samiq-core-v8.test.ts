// Cérebro da Sami v8 de ponta a ponta, com um modelo roteirizado (MockLanguageModelV3):
// grupos de ferramentas por intenção no 1º passo, abrir_ferramentas no meio,
// ação leve gravada na hora pelo núcleo do CONFIRMAR, pesada esperando OK,
// recibo + pendentes no texto do WhatsApp (o mesmo que vai para a memória),
// memória de trabalho do turno, controle por linguagem natural e o recibo que
// sobrevive a uma falha no meio do turno. Banco, memória e gateway são mocks.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3CallOptions, LanguageModelV3GenerateResult } from "@ai-sdk/provider";
import type { PropostaSamiQ } from "@/lib/samiq-propostas";

const LEAD = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const AGORA = new Date("2026-10-24T13:00:00.000Z"); // sáb 24/10 10:00 em SP

const m = vi.hoisted(() => ({
  passos: [] as Array<
    (
      o: LanguageModelV3CallOptions,
    ) => LanguageModelV3GenerateResult | Promise<LanguageModelV3GenerateResult>
  >,
  chamadas: [] as LanguageModelV3CallOptions[],
  registrar: vi.fn(),
  confirmar: vi.fn(),
  rejeitar: vi.fn(),
  desfazer: vi.fn(),
  gravarTurno: vi.fn(),
  gravarContexto: vi.fn(),
  finalizar: vi.fn(),
  maxToolSteps: 10,
}));

vi.mock("@/lib/samiq-governance.server", () => ({
  reserveSamiQExecution: vi.fn(async () => ({
    executionId: "exec-1",
    promptVersion: "samiq-2026-10-v8",
    modelId: "anthropic/claude-sonnet-5",
    systemPrompt: "Você é a Sami.",
    actionPrompt: "Você é o CRM do corretor no WhatsApp.",
    maxOutputTokens: 2000,
    toolsEnabled: true,
    maxToolSteps: m.maxToolSteps,
    custoMesPct: null,
    propostasEnabled: true,
  })),
  finishSamiQExecution: m.finalizar,
}));
vi.mock("@/lib/samiq-memoria.server", () => ({
  gravarTurnoSamiQ: m.gravarTurno,
  registrarPropostasSamiQ: m.registrar,
  gravarContextoTurnoSamiQ: m.gravarContexto,
}));
vi.mock("@/lib/samiq-confirmar.server", () => ({
  confirmarPropostas: m.confirmar,
  rejeitarPropostas: m.rejeitar,
  desfazerPropostas: m.desfazer,
}));
vi.mock("@/lib/samiq-diretrizes.server", () => ({ blocoDiretrizesSamiQ: async () => "" }));
vi.mock("@/lib/telefone-corretor.server", () => ({ telefoneEhDeCorretor: async () => false }));
vi.mock("@/lib/ai-gateway.server", () => ({
  createGovernedModelGateway: () => () =>
    new MockLanguageModelV3({
      doGenerate: async (o: LanguageModelV3CallOptions) => {
        m.chamadas.push(o);
        const passo = m.passos.shift();
        if (!passo) throw new Error("modelo chamado mais vezes que o roteiro");
        return passo(o);
      },
    }),
}));

const uso = {
  inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 50, text: 50, reasoning: 0 },
};
const chamar = (
  ...calls: Array<[string, Record<string, unknown>]>
): LanguageModelV3GenerateResult => ({
  content: calls.map(([toolName, input], i) => ({
    type: "tool-call" as const,
    toolCallId: `c${m.chamadas.length}-${i}`,
    toolName,
    input: JSON.stringify(input),
  })),
  finishReason: { unified: "tool-calls", raw: "tool_use" },
  usage: uso,
  warnings: [],
});
const falar = (text: string): LanguageModelV3GenerateResult => ({
  content: [{ type: "text", text }],
  finishReason: { unified: "stop", raw: "end_turn" },
  usage: uso,
  warnings: [],
});

const nomesDasFerramentas = (o: LanguageModelV3CallOptions) =>
  (o.tools ?? []).map((t) => t.name).sort();

/** Carteira com a Maria Silva em atendimento (o suficiente para buscar, validar e agendar). */
function supabaseDaCarteira() {
  const maria = {
    id: LEAD,
    nome: "Maria Silva",
    status: "em_atendimento",
    temperatura: "quente",
    projeto_nome: "Vibra Sabará",
    corretor_id: "u1",
    telefone: "(11) 98765-4321",
    telefone_e164: "5511987654321",
    proximo_followup: null,
    ultima_interacao: null,
    origem: "facebook",
    created_at: "2026-10-01T00:00:00Z",
  };
  return {
    from(tabela: string) {
      const ops: string[] = [];
      const resposta = () => {
        if (tabela === "leads" && ops.includes("maybeSingle")) return { data: maria, error: null };
        if (tabela === "leads" && ops.includes("ilike")) return { data: [], error: null };
        if (tabela === "leads") return { data: [maria], error: null };
        return { data: [], error: null };
      };
      const q: Record<string, unknown> = new Proxy(
        {},
        {
          get(_a, prop) {
            if (prop === "then")
              return (ok: (v: unknown) => unknown) => Promise.resolve(resposta()).then(ok);
            if (prop === "maybeSingle" || prop === "single") {
              return () => {
                ops.push(String(prop));
                return Promise.resolve(resposta());
              };
            }
            return () => {
              ops.push(String(prop));
              return q;
            };
          },
        },
      );
      return q;
    },
    rpc: async () => ({ data: null, error: null }),
  } as never;
}

let seq = 0;
beforeEach(() => {
  process.env.LOVABLE_API_KEY = "teste";
  m.passos = [];
  m.chamadas = [];
  m.maxToolSteps = 10;
  seq = 0;
  for (const f of [
    m.registrar,
    m.confirmar,
    m.rejeitar,
    m.desfazer,
    m.gravarTurno,
    m.gravarContexto,
    m.finalizar,
  ]) {
    f.mockReset();
  }
  m.finalizar.mockResolvedValue(true);
  m.gravarTurno.mockResolvedValue("conv-1");
  m.gravarContexto.mockResolvedValue(true);
  m.registrar.mockImplementation(
    async (a: {
      coletadas: Array<{ payload: PropostaSamiQ["payload"]; leadNome: string | null }>;
    }) =>
      a.coletadas.map((c) => ({
        id: `p${++seq}`,
        tipo: c.payload.tipo,
        payload: c.payload,
        leadNome: c.leadNome,
        status: "pendente",
      })),
  );
  m.confirmar.mockImplementation(async (a: { itens: Array<{ id: string }> }) =>
    a.itens.map((i) => ({
      id: i.id,
      ok: true,
      status: "aceita",
      desfazerAte: "2026-10-25T13:00:00Z",
      efeito: "entrou em Em atendimento",
    })),
  );
});

async function responder(
  extra: Record<string, unknown> = {},
  pergunta = "A Maria Silva topou visitar sábado 10h",
) {
  const { responderSamiQ } = await import("@/lib/samiq-core.server");
  return responderSamiQ({
    supabase: supabaseDaCarteira(),
    userId: "u1",
    canal: "whatsapp",
    modoEscrita: "por_risco",
    agora: AGORA,
    data: { action: "pergunta_livre", pergunta, historico: [], conversaId: undefined },
    ...extra,
  });
}

describe("um turno do WhatsApp com o CRM inteiro", () => {
  it("grupos certos no 1º passo; leve grava na hora; pesada espera OK; recibo e memória batem", async () => {
    m.passos = [
      (o) => {
        const nomes = nomesDasFerramentas(o);
        // base + grupo agenda ("visitar", "sábado 10h"); venda e crédito ficam de fora
        for (const n of [
          "buscar_clientes",
          "registrar_contato",
          "abrir_ferramentas",
          "agendar_visita",
          "confirmar_visita",
        ]) {
          expect(nomes, n).toContain(n);
        }
        expect(nomes).not.toContain("registrar_venda");
        expect(nomes).not.toContain("enviar_analise_credito");
        // o cabeçalho leva o agora de SP e o calendário
        expect(JSON.stringify(o.prompt)).toContain("sábado, 24/10/2026, 10:00");
        return chamar(["buscar_clientes", { termo: "Maria Silva" }]);
      },
      () =>
        chamar(
          [
            "registrar_contato",
            { leadId: LEAD, canal: "whatsapp", resultado: "interessado", resumo: "topou visitar" },
          ],
          ["agendar_visita", { leadId: LEAD, inicioEm: "2026-10-31T10:00", local: "Vibra Sabará" }],
        ),
      () => falar("Boa! A Maria tá quente. Pede pra ela confirmar o horário um dia antes."),
    ];
    const r = await responder();

    // leve: registrada e executada pelo núcleo do CONFIRMAR, na hora
    expect(m.confirmar).toHaveBeenCalledTimes(1);
    expect(r.executadas?.map((p) => [p.tipo, p.status])).toEqual([["registrar_contato", "aceita"]]);
    // pesada: pendente, registrada depois do turno na conversa
    expect(r.propostas?.map((p) => p.tipo)).toEqual(["agendar_visita"]);
    expect(m.registrar).toHaveBeenLastCalledWith(expect.objectContaining({ conversaId: "conv-1" }));
    // data sem fuso virou horário de SP
    expect(r.propostas?.[0].payload).toMatchObject({ inicioEm: "2026-10-31T10:00:00-03:00" });

    // texto do canal: fala da Sami + recibo numerado + o que espera OK
    expect(r.textoCanal).toContain("Boa! A Maria tá quente.");
    expect(r.textoCanal).toContain(
      "Gravei no CRM:\n1) Contato com Maria Silva (entrou em Em atendimento",
    );
    expect(r.textoCanal).toContain("Algo errado? Responda DESFAZER.");
    expect(r.textoCanal).toContain(
      "Preciso do seu OK para:\n1) Visita de Maria Silva (sáb 31/10 10:00",
    );
    // a memória guarda exatamente o que o corretor viu
    expect(m.gravarTurno).toHaveBeenCalledWith(
      expect.objectContaining({ resposta: r.textoCanal, canal: "whatsapp" }),
    );

    // memória de trabalho para o próximo turno
    const ctx = m.gravarContexto.mock.calls[0][0] as {
      conversaId: string;
      executionId: string;
      contexto: Record<string, unknown>;
    };
    expect(ctx).toMatchObject({ conversaId: "conv-1", executionId: "exec-1" });
    expect(ctx.contexto).toMatchObject({
      pendentes: [r.propostas?.[0].id],
      executadas: [r.executadas?.[0].id],
      pediu_decisao: true,
      ambiguos: [],
    });
    expect((ctx.contexto.clientes as Array<{ id: string }>)[0].id).toBe(LEAD);
    expect(r.fallback).toBe(false);
  });

  it("abrir_ferramentas no passo N libera o grupo no passo N+1", async () => {
    m.passos = [
      (o) => {
        expect(nomesDasFerramentas(o)).not.toContain("registrar_venda");
        return chamar(["abrir_ferramentas", { grupos: ["venda"] }]);
      },
      (o) => {
        expect(nomesDasFerramentas(o)).toContain("registrar_venda");
        return falar("Me passa a unidade e o valor que eu registro a venda.");
      },
    ];
    const r = await responder({}, "oi");
    expect(r.texto).toContain("unidade e o valor");
    expect(m.confirmar).not.toHaveBeenCalled();
  });

  it("contexto do n8n vai para o cabeçalho (sem telefone), nunca para a pergunta do corretor", async () => {
    m.passos = [
      (o) => {
        const prompt = JSON.stringify(o.prompt);
        expect(prompt).toContain("Contexto do WhatsApp");
        expect(prompt).toContain("enviou o book do Vibra Sabará");
        // telefone do cliente que o n8n citou não chega ao modelo
        expect(prompt).not.toContain("98765-4321");
        return falar("Anotado.");
      },
    ];
    const r = await responder(
      {
        contextoCanal:
          "Últimas mensagens: corretor enviou o book do Vibra Sabará para (11) 98765-4321 ontem.",
      },
      "ela gostou do book",
    );
    expect(r.texto).toBe("Anotado.");
  });

  it("painel: nada grava na hora, tudo vira card; sem texto de canal nem memória de trabalho", async () => {
    m.passos = [
      () => chamar(["registrar_contato", { leadId: LEAD, canal: "ligacao", resultado: "atendeu" }]),
      () => falar("Preparei o registro do contato."),
    ];
    const { responderSamiQ } = await import("@/lib/samiq-core.server");
    const r = await responderSamiQ({
      supabase: supabaseDaCarteira(),
      userId: "u1",
      canal: "painel",
      agora: AGORA,
      data: { action: "pergunta_livre", pergunta: "liguei pra Maria Silva", leadId: LEAD },
    });
    expect(m.confirmar).not.toHaveBeenCalled();
    expect(r.propostas?.map((p) => p.tipo)).toEqual(["registrar_contato"]);
    expect(r.textoCanal).toBeUndefined();
    expect(m.gravarContexto).not.toHaveBeenCalled();
  });

  it("'pode marcar a visita': confirma a pendente pela fila da conversa e limpa a lista", async () => {
    const pendente: PropostaSamiQ = {
      id: "pend-1",
      tipo: "agendar_visita",
      payload: { tipo: "agendar_visita", leadId: LEAD, inicioEm: "2026-10-31T10:00:00-03:00" },
      leadNome: "Maria Silva",
      status: "pendente",
    };
    m.confirmar.mockResolvedValueOnce([
      {
        id: "pend-1",
        ok: true,
        status: "aceita",
        desfazerAte: "2026-10-25T13:00:00Z",
        efeito: "visita sáb 31/10 10:00; cliente em Agendado",
      },
    ]);
    m.passos = [
      (o) => {
        expect(nomesDasFerramentas(o)).toContain("confirmar_pendentes");
        expect(JSON.stringify(o.prompt)).toContain(
          "Esperando o OK do corretor (numeração do CONFIRMAR): 1) Visita de Maria Silva",
        );
        return chamar(["confirmar_pendentes", { itens: [1] }]);
      },
      () => falar("Visita marcada. Manda o endereço pra ela hoje."),
    ];
    const r = await responder(
      {
        recentes: { pendentes: [pendente], executadas: [] },
        contexto: { pendentes: ["pend-1"], pediu_decisao: true },
      },
      "pode marcar a visita",
    );
    expect(m.confirmar).toHaveBeenCalledWith(
      expect.objectContaining({ itens: [{ id: "pend-1" }] }),
    );
    expect(r.textoCanal).toContain(
      "Gravei no CRM:\n1) Visita de Maria Silva (visita sáb 31/10 10:00; cliente em Agendado",
    );
    expect(r.textoCanal).not.toContain("Preciso do seu OK");
    const ctx = m.gravarContexto.mock.calls[0][0] as { contexto: Record<string, unknown> };
    expect(ctx.contexto).toMatchObject({
      pendentes: [],
      executadas: ["pend-1"],
      pediu_decisao: false,
    });
  });

  it("'sim, mas muda pra 15h' não confirma: a trava em código barra o OK", async () => {
    const pendente: PropostaSamiQ = {
      id: "pend-2",
      tipo: "agendar_visita",
      payload: { tipo: "agendar_visita", leadId: LEAD, inicioEm: "2026-10-31T10:00:00-03:00" },
      leadNome: "Maria Silva",
      status: "pendente",
    };
    let retorno: unknown;
    m.passos = [
      () => chamar(["confirmar_pendentes", { itens: [1] }]),
      (o) => {
        retorno = o.prompt.at(-1);
        return falar("Combinado, ajusto para 15h.");
      },
    ];
    await responder(
      { recentes: { pendentes: [pendente], executadas: [] } },
      "sim, mas muda pra 15h",
    );
    expect(m.confirmar).not.toHaveBeenCalled();
    expect(JSON.stringify(retorno)).toContain("sem_ok_explicito");
  });

  it("'desfaz o 2': a numeração é a do recibo, mesmo com item que não volta antes dele", async () => {
    const checkin: PropostaSamiQ = {
      id: "exe-1",
      tipo: "fazer_checkin",
      payload: { tipo: "fazer_checkin", modo: "loja", filial: "barra-funda" },
      leadNome: null,
      status: "aceita",
      desfazerAte: null,
    };
    const contato: PropostaSamiQ = {
      id: "exe-2",
      tipo: "registrar_contato",
      payload: { tipo: "registrar_contato", leadId: LEAD, canal: "ligacao", resultado: "atendeu" },
      leadNome: "Maria Silva",
      status: "aceita",
      desfazerAte: "2026-10-25T12:00:00Z",
    };
    m.desfazer.mockResolvedValueOnce([{ id: "exe-2", ok: true }]);
    let retornoDoUm: unknown;
    m.passos = [
      (o) => {
        const prompt = JSON.stringify(o.prompt);
        expect(prompt).toContain(
          "Gravado recentemente (numeração do DESFAZER): 1) Check-in na filial Barra Funda [não volta pelo DESFAZER]; 2) Contato com Maria Silva",
        );
        expect(nomesDasFerramentas(o)).toContain("desfazer_acoes");
        return chamar(["desfazer_acoes", { itens: [1] }]);
      },
      (o) => {
        retornoDoUm = o.prompt.at(-1);
        return chamar(["desfazer_acoes", { itens: [2] }]);
      },
      () => falar("Pronto, tirei o contato."),
    ];
    const r = await responder(
      {
        recentes: { pendentes: [], executadas: [checkin, contato] },
        contexto: { executadas: ["exe-1", "exe-2"] },
      },
      "desfaz o 1 e o 2",
    );
    // o check-in não vai ao banco: o modelo recebe o motivo
    expect(JSON.stringify(retornoDoUm)).toContain("nao_desfazivel");
    expect(m.desfazer).toHaveBeenCalledTimes(1);
    expect(m.desfazer).toHaveBeenCalledWith(expect.objectContaining({ ids: ["exe-2"] }));
    expect(r.textoCanal).toContain("Desfeito: Contato com Maria Silva.");
    // a lista do recibo continua a mesma para o próximo DESFAZER
    const ctx = m.gravarContexto.mock.calls[0][0] as { contexto: Record<string, unknown> };
    expect(ctx.contexto.executadas).toEqual(["exe-1", "exe-2"]);
  });

  it("recibo velho em que nada mais volta: sem desfazer_acoes e sem linha no cabeçalho", async () => {
    const velho: PropostaSamiQ = {
      id: "exe-9",
      tipo: "anotar",
      payload: { tipo: "anotar", leadId: LEAD, nota: "liga depois das 18h" },
      leadNome: "Maria Silva",
      status: "aceita",
      desfazerAte: "2026-10-23T12:00:00Z", // antes de AGORA
    };
    m.passos = [
      (o) => {
        expect(nomesDasFerramentas(o)).not.toContain("desfazer_acoes");
        return falar("Esse registro já passou das 24 h. Me diz o que corrigir que eu anoto.");
      },
    ];
    await responder({ recentes: { pendentes: [], executadas: [velho] } }, "apaga aquela nota");
    expect(m.desfazer).not.toHaveBeenCalled();
  });

  it("falha no meio do turno depois de gravar: o recibo sai mesmo assim (o corretor não reenvia e duplica)", async () => {
    m.passos = [
      () => chamar(["registrar_contato", { leadId: LEAD, canal: "ligacao", resultado: "atendeu" }]),
      () => {
        throw new Error("gateway caiu");
      },
    ];
    const r = await responder({}, "liguei pra Maria Silva, atendeu");
    expect(r.fallback).toBe(true);
    expect(r.textoCanal).toContain("Tive um problema no meio da resposta");
    expect(r.textoCanal).toContain("Gravei no CRM:\n1) Contato com Maria Silva");
    expect(m.finalizar).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", fallback: true }),
    );
  });

  it("falha antes de gravar qualquer coisa: erro normal, execução marcada como falha", async () => {
    m.passos = [
      () => {
        throw new Error("gateway caiu");
      },
    ];
    await expect(responder({}, "oi")).rejects.toThrow("temporariamente indisponível");
    expect(m.finalizar).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    expect(m.gravarTurno).not.toHaveBeenCalled();
  });
});
