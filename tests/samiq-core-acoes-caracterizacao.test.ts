// Caracterização de src/lib/samiq-core.server.ts escrita ANTES da quebra do
// arquivo em módulos, no caminho que tests/samiq-core-v8.test.ts não cobre:
// as ações rápidas SEM ferramentas (resumo, objeção, projeto ideal,
// checklist, funil, prioridades). Para cada uma: o que o turno lê do banco
// (e em que ordem), o prompt que vai ao modelo, a finalização, a memória e a
// resposta; e os erros (lead não encontrado, contexto e gateway). Os valores
// esperados foram capturados do código original e revisados à mão.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";

const LEAD = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

const m = vi.hoisted(() => ({
  prompts: [] as string[],
  toolsEnabled: false,
  falhaGateway: false,
  finalizar: vi.fn(),
  gravarTurno: vi.fn(),
  gravarContexto: vi.fn(),
}));

vi.mock("@/lib/samiq-governance.server", () => ({
  reserveSamiQExecution: vi.fn(async (a: Record<string, unknown>) => {
    m.prompts.push(`reserva ${JSON.stringify(a)}`);
    return {
      executionId: "exec-1",
      promptVersion: "samiq-2026-10-v8",
      modelId: "anthropic/claude-sonnet-5",
      systemPrompt: "Você é a Sami.",
      actionPrompt: "Instrução da ação.",
      maxOutputTokens: 800,
      toolsEnabled: m.toolsEnabled,
      maxToolSteps: 4,
      custoMesPct: 12,
      propostasEnabled: false,
    };
  }),
  finishSamiQExecution: m.finalizar,
}));
vi.mock("@/lib/samiq-memoria.server", () => ({
  gravarTurnoSamiQ: m.gravarTurno,
  registrarPropostasSamiQ: vi.fn(),
  gravarContextoTurnoSamiQ: m.gravarContexto,
}));
vi.mock("@/lib/samiq-diretrizes.server", () => ({
  blocoDiretrizesSamiQ: async () => " [diretrizes]",
}));
vi.mock("@/lib/ai-gateway.server", () => ({
  createGovernedModelGateway: () => () =>
    new MockLanguageModelV3({
      doGenerate: async (o: LanguageModelV3CallOptions) => {
        const partes = o.prompt.map((p) =>
          typeof p.content === "string"
            ? `${p.role}: ${p.content}`
            : `${p.role}: ${p.content.map((c) => ("text" in c ? c.text : c.type)).join(" ")}`,
        );
        m.prompts.push(...partes);
        if (m.falhaGateway) throw new Error("gateway caiu");
        return {
          content: [{ type: "text", text: "  Resposta da Sami.  " }],
          finishReason: { unified: "stop", raw: "end_turn" },
          usage: {
            inputTokens: { total: 900, noCache: 900, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 40, text: 40, reasoning: 0 },
          },
          warnings: [],
        };
      },
    }),
}));

import { criarGravador } from "./helpers/supabase-gravador";
import { INBOX, LEAD_ROW } from "./helpers/samiq-core-falsos";

function banco(extra: Record<string, unknown> = {}) {
  return criarGravador({
    leads: [LEAD_ROW],
    interacoes: [{ tipo: "whatsapp", direcao: "saida", ocorreu_em: "2026-10-20T10:00:00Z" }],
    documentacoes: [{ tipo: "cpf", status: "recebido" }],
    objecoes: [
      { objecao: "Parcela alta", resposta: "Mostre a simulação com FGTS." },
      { objecao: "Longe do trabalho", resposta: "Fale do metrô." },
    ],
    projetos: [
      {
        nome: "Vibra Lapa",
        bairro: "Lapa",
        cidade: "São Paulo",
        regiao: "Oeste",
        tipologia: "2d",
        dorms_min: 2,
        dorms_max: 2,
        preco_a_partir: 289000,
      },
    ],
    "rpc:pipeline_snapshot_v2": [
      { etapa: "em_atendimento", quantidade: 12 },
      { etapa: "agendado", quantidade: 3 },
    ],
    "rpc:atendimento_inbox_v2": INBOX,
    ...extra,
  });
}

async function turno(data: Record<string, unknown>, g = banco()) {
  const { responderSamiQ } = await import("@/lib/samiq-core.server");
  const r = await responderSamiQ({
    supabase: g.cliente as never,
    userId: "u1",
    canal: "painel",
    data: data as never,
    agora: new Date("2026-10-24T13:00:00Z"),
  });
  return { r, chamadas: g.chamadas };
}

beforeEach(() => {
  process.env.LOVABLE_API_KEY = "teste";
  m.prompts = [];
  m.toolsEnabled = false;
  m.falhaGateway = false;
  m.finalizar.mockReset().mockResolvedValue(true);
  m.gravarTurno.mockReset().mockResolvedValue("conv-9");
  m.gravarContexto.mockReset().mockResolvedValue(true);
});

describe("samiq-core — ações rápidas sem ferramentas (caracterização)", () => {
  it("resumo do cliente: lê lead e interações, só o primeiro nome vai ao modelo", async () => {
    const { r, chamadas } = await turno({
      action: "resumo_cliente",
      leadId: LEAD,
      pergunta: "Ela ligou 11 98765-4321",
    });
    expect(chamadas).toMatchInlineSnapshot(`
      [
        "supabase.from(leads).select("nome, origem, status, temperatura, projeto_nome, renda_informada, entrada_disponivel, usa_fgts, proximo_followup, ultima_interacao, visita_data, visita_hora, visita_empreendimento, tipo_renda, faixa_mcmv").eq("id","6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b").maybeSingle()",
        "supabase.from(interacoes).select("tipo, direcao, ocorreu_em").eq("lead_id","6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b").is("deleted_at",null).order("ocorreu_em",{"ascending":false}).limit(12)",
      ]
    `);
    expect(m.prompts).toMatchInlineSnapshot(`
      [
        "reserva {"userId":"u1","action":"resumo_cliente","estimatedInputTokens":10000,"canal":"painel"}",
        "system: Você é a Sami. [diretrizes]",
        "user: Ação solicitada: Resumo do cliente.

      Instrução da ação.

      Detalhe do corretor: Ela ligou [TELEFONE]

      Contexto minimizado (samiq-2026-10-v8):
      {"cliente":{"origem":"facebook","status":"em_atendimento","temperatura":"quente","projeto_nome":"Vibra Lapa","renda_informada":"4500","entrada_disponivel":null,"usa_fgts":true,"proximo_followup":null,"ultima_interacao":"2026-10-20T10:00:00Z","visita_data":null,"visita_hora":null,"visita_empreendimento":null,"tipo_renda":"clt","faixa_mcmv":"F2","primeiro_nome":"Maria"},"ultimasInteracoes":[{"em":"2026-10-20T10:00:00Z","tipo":"whatsapp","direcao":"saida"}]}",
      ]
    `);
    expect(m.finalizar.mock.calls[0][0]).toMatchObject({
      status: "completed",
      inputTokens: 900,
      outputTokens: 40,
      toolCalls: 0,
      fallback: false,
    });
    expect(m.gravarTurno.mock.calls[0][0]).toMatchInlineSnapshot(`
      {
        "canal": "painel",
        "conversaId": null,
        "executionId": "exec-1",
        "ferramentas": [],
        "leadId": "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
        "pergunta": "Resumo do cliente: Ela ligou 11 98765-4321",
        "resposta": "Resposta da Sami.",
        "userId": "u1",
      }
    `);
    expect({ ...r, sugestoes: r.sugestoes.length }).toMatchInlineSnapshot(`
      {
        "conversaId": "conv-9",
        "custoMesPct": 12,
        "executadas": [],
        "executionId": "exec-1",
        "fallback": false,
        "ferramentas": [],
        "pendentes": [],
        "propostas": [],
        "sugestoes": 1,
        "texto": "Resposta da Sami.",
        "textoCanal": undefined,
      }
    `);
  });

  it("com ferramentas liberadas na versão ativa, o nome completo também entra no contexto", async () => {
    m.toolsEnabled = true;
    await turno({ action: "resumo_cliente", leadId: LEAD });
    expect(m.prompts.find((p) => p.startsWith("user:"))).toContain(
      '"nome":"Maria Aparecida Silva"',
    );
  });

  it("cada ação lê só o que precisa", async () => {
    const leituras: Record<string, string[]> = {};
    for (const [action, extra] of [
      ["checklist_docs", { leadId: LEAD }],
      ["responder_objecao", { leadId: LEAD, pergunta: "parcela alta" }],
      ["projeto_ideal", { leadId: LEAD }],
      ["analise_funil", {}],
      ["prioridade_dia", {}],
    ] as const) {
      const { chamadas } = await turno({ action, ...extra });
      leituras[action] = chamadas.filter(
        (c) => !c.includes("from(leads)") && !c.includes("from(interacoes)"),
      );
    }
    expect(leituras).toMatchInlineSnapshot(`
      {
        "analise_funil": [
          "supabase.rpc(pipeline_snapshot_v2,{"_corretor_id":"u1"})",
        ],
        "checklist_docs": [
          "supabase.from(documentacoes).select("tipo, status").eq("lead_id","6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b").limit(40)",
        ],
        "prioridade_dia": [
          "supabase.rpc(atendimento_inbox_v2,{"_corretor_id":"u1","_limit_per_queue":10})",
        ],
        "projeto_ideal": [
          "supabase.from(projetos).select("nome, bairro, cidade, regiao, tipologia, dorms_min, dorms_max, preco_a_partir").eq("ativo",true).is("deleted_at",null).limit(40)",
        ],
        "responder_objecao": [
          "supabase.from(objecoes).select("objecao, resposta").eq("ativo",true).order("ordem").limit(30)",
        ],
      }
    `);
  });

  it("o contexto de cada ação chega ao prompt (objeção da biblioteca, funil, catálogo, documentos)", async () => {
    const contexto: Record<string, string | undefined> = {};
    for (const [action, extra] of [
      ["checklist_docs", { leadId: LEAD }],
      ["responder_objecao", { leadId: LEAD, pergunta: "parcela alta" }],
      ["projeto_ideal", { leadId: LEAD }],
      ["analise_funil", {}],
      ["prioridade_dia", {}],
    ] as const) {
      m.prompts = [];
      await turno({ action, ...extra });
      contexto[action] = m.prompts
        .find((p) => p.startsWith("user:"))
        ?.split("Contexto minimizado")[1];
    }
    expect(contexto).toMatchInlineSnapshot(`
      {
        "analise_funil": " (samiq-2026-10-v8):
      {"funil":{"em_atendimento":12,"agendado":3}}",
        "checklist_docs": " (samiq-2026-10-v8):
      {"cliente":{"origem":"facebook","status":"em_atendimento","temperatura":"quente","projeto_nome":"Vibra Lapa","renda_informada":"4500","entrada_disponivel":null,"usa_fgts":true,"proximo_followup":null,"ultima_interacao":"2026-10-20T10:00:00Z","visita_data":null,"visita_hora":null,"visita_empreendimento":null,"tipo_renda":"clt","faixa_mcmv":"F2","primeiro_nome":"Maria"},"ultimasInteracoes":[{"em":"2026-10-20T10:00:00Z","tipo":"whatsapp","direcao":"saida"}],"documentacao":[{"documento":"cpf","status":"recebido"}]}",
        "prioridade_dia": " (samiq-2026-10-v8):
      {"fila":[{"primeiro_nome":"Rita","status":"aguardando_atendimento","temperatura":"morno","projeto":"Cury Interlagos","score":90,"motivo":"Chegou agora"},{"primeiro_nome":"Paulo","status":"aguardando_atendimento","temperatura":"morno","projeto":"Cury Interlagos","score":40,"motivo":"Chegou agora"}]}",
        "projeto_ideal": " (samiq-2026-10-v8):
      {"cliente":{"origem":"facebook","status":"em_atendimento","temperatura":"quente","projeto_nome":"Vibra Lapa","renda_informada":"4500","entrada_disponivel":null,"usa_fgts":true,"proximo_followup":null,"ultima_interacao":"2026-10-20T10:00:00Z","visita_data":null,"visita_hora":null,"visita_empreendimento":null,"tipo_renda":"clt","faixa_mcmv":"F2","primeiro_nome":"Maria"},"ultimasInteracoes":[{"em":"2026-10-20T10:00:00Z","tipo":"whatsapp","direcao":"saida"}],"catalogo":[{"nome":"Vibra Lapa","bairro":"Lapa","cidade":"São Paulo","regiao":"Oeste","tipologia":"2d","dorms_min":2,"dorms_max":2,"preco_a_partir":289000}]}",
        "responder_objecao": " (samiq-2026-10-v8):
      {"cliente":{"origem":"facebook","status":"em_atendimento","temperatura":"quente","projeto_nome":"Vibra Lapa","renda_informada":"4500","entrada_disponivel":null,"usa_fgts":true,"proximo_followup":null,"ultima_interacao":"2026-10-20T10:00:00Z","visita_data":null,"visita_hora":null,"visita_empreendimento":null,"tipo_renda":"clt","faixa_mcmv":"F2","primeiro_nome":"Maria"},"ultimasInteracoes":[{"em":"2026-10-20T10:00:00Z","tipo":"whatsapp","direcao":"saida"}],"respostaBiblioteca":"Mostre a simulação com FGTS."}",
      }
    `);
  });

  it("ação que precisa de lead sem lead: erro antes de reservar", async () => {
    await expect(turno({ action: "checklist_docs" })).rejects.toThrow(
      "Abra um lead (ou selecione um) para usar esta ação do SamiQ.",
    );
    expect(m.prompts).toEqual([]);
  });

  it("lead não encontrado, contexto indisponível e gateway fora: mensagem e falha registrada", async () => {
    const erros: string[] = [];
    const pegar = (p: Promise<unknown>) => p.catch((e: Error) => erros.push(e.message));
    await pegar(turno({ action: "resumo_cliente", leadId: LEAD }, banco({ leads: [] })));
    const quebrado = banco();
    const original = quebrado.cliente.rpc;
    quebrado.cliente.rpc = async (...a: Parameters<typeof original>) => ({
      ...(await original(...a)),
      error: { message: "x" } as never,
    });
    await pegar(turno({ action: "analise_funil" }, quebrado));
    m.falhaGateway = true;
    await pegar(turno({ action: "analise_funil" }));
    expect(erros).toMatchInlineSnapshot(`
      [
        "Lead não encontrado.",
        "Não foi possível montar o contexto do SamiQ.",
        "O SamiQ está temporariamente indisponível. Tente novamente.",
      ]
    `);
    expect(m.finalizar.mock.calls.map((c) => `${c[0].status} ${c[0].errorCode}`))
      .toMatchInlineSnapshot(`
      [
        "failed context_error",
        "failed context_error",
        "failed gateway_error",
      ]
    `);
  });
});
