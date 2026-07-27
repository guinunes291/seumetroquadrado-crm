import { describe, expect, it } from "vitest";
import {
  buildAtendimentoQueues,
  scriptParaFila,
  type AtendimentoLead,
} from "@/features/atendimento/derive";

const agora = new Date("2026-07-09T12:00:00Z");

function lead(partial: Partial<AtendimentoLead> & { id: string; nome: string }): AtendimentoLead {
  return {
    telefone: "11999990000",
    email: null,
    status: "em_atendimento",
    temperatura: null,
    ultima_interacao: null,
    proximo_followup: null,
    projeto_nome: null,
    created_at: "2026-07-01T12:00:00Z",
    corretor_id: "c1",
    origem: "facebook",
    renda_informada: null,
    entrada_disponivel: null,
    usa_fgts: null,
    ...partial,
  };
}

describe("buildAtendimentoQueues", () => {
  it("classifica cada lead em NO MÁXIMO uma fila, na ordem de urgência", () => {
    const leads = [
      // respondeu (última interação recebida) E tem follow-up vencido → fila responder
      lead({ id: "a", nome: "Ana", proximo_followup: "2026-07-08T12:00:00Z" }),
      // follow-up vencido apenas
      lead({ id: "b", nome: "Bruno", proximo_followup: "2026-07-09T10:00:00Z" }),
      // quente sem contato há 4 dias
      lead({
        id: "c",
        nome: "Carla",
        temperatura: "quente",
        ultima_interacao: "2026-07-05T12:00:00Z",
      }),
      // só docs pendentes
      lead({ id: "d", nome: "Duda" }),
      // encerrado — não entra em fila alguma
      lead({ id: "e", nome: "Edu", status: "perdido", proximo_followup: "2026-07-01T12:00:00Z" }),
    ];
    const filas = buildAtendimentoQueues({
      leads,
      interacoes: [
        { lead_id: "a", direcao: "entrada", ocorreu_em: "2026-07-09T11:30:00Z" },
        { lead_id: "b", direcao: "saida", ocorreu_em: "2026-07-08T09:00:00Z" },
      ],
      docsPendentes: new Map([["d", 2]]),
      agora,
    });

    expect(filas.responder.map((i) => i.lead.id)).toEqual(["a"]);
    expect(filas.followups.map((i) => i.lead.id)).toEqual(["b"]);
    expect(filas.esfriando.map((i) => i.lead.id)).toEqual(["c"]);
    expect(filas.docs.map((i) => i.lead.id)).toEqual(["d"]);
    expect(filas.responder[0].motivo).toMatch(/aguarda retorno/);
    expect(filas.docs[0].docsPendentes).toBe(2);
  });

  it("lead aguardando primeiro atendimento entra em 'novos' mesmo sem NENHUM sinal", () => {
    // O caso que deixava a tela eternamente vazia: lead recém-distribuído,
    // sem interação, sem follow-up, sem docs — precisa aparecer para trabalhar.
    const filas = buildAtendimentoQueues({
      leads: [
        lead({ id: "n1", nome: "Nina", status: "aguardando_atendimento" }),
        lead({ id: "n2", nome: "Noah", status: "novo" }),
      ],
      interacoes: [],
      docsPendentes: new Map(),
      agora,
    });
    expect(filas.novos.map((i) => i.lead.id).sort()).toEqual(["n1", "n2"]);
    expect(filas.novos[0].motivo).toMatch(/aguarda o primeiro contato/);
  });

  it("'novos' vence as demais filas — primeiro contato antes de tudo", () => {
    const filas = buildAtendimentoQueues({
      leads: [
        lead({
          id: "n",
          nome: "Nara",
          status: "aguardando_atendimento",
          proximo_followup: "2026-07-08T12:00:00Z",
        }),
      ],
      interacoes: [{ lead_id: "n", direcao: "entrada", ocorreu_em: "2026-07-09T11:00:00Z" }],
      docsPendentes: new Map(),
      agora,
    });
    expect(filas.novos.map((i) => i.lead.id)).toEqual(["n"]);
    expect(filas.responder).toHaveLength(0);
    expect(filas.followups).toHaveLength(0);
  });

  it("régua única: quente sem interação REGISTRADA esfria contando da chegada", () => {
    // Antes, ultima_interacao NULL excluía o lead da fila "esfriando" para sempre.
    const filas = buildAtendimentoQueues({
      leads: [
        lead({
          id: "q",
          nome: "Quita",
          status: "em_atendimento",
          temperatura: "quente",
          ultima_interacao: null,
          created_at: "2026-07-01T12:00:00Z",
        }),
      ],
      interacoes: [],
      docsPendentes: new Map(),
      agora,
    });
    expect(filas.esfriando.map((i) => i.lead.id)).toEqual(["q"]);
  });

  it("usa apenas a interação mais recente por lead (lista desc)", () => {
    const filas = buildAtendimentoQueues({
      leads: [lead({ id: "a", nome: "Ana" })],
      interacoes: [
        { lead_id: "a", direcao: "saida", ocorreu_em: "2026-07-09T11:00:00Z" },
        { lead_id: "a", direcao: "entrada", ocorreu_em: "2026-07-08T10:00:00Z" },
      ],
      docsPendentes: new Map(),
      agora,
    });
    // A última foi SAÍDA (nós falamos por último) → não está em "responder".
    expect(filas.responder).toHaveLength(0);
  });

  it("ordena cada fila por score desc e limita a 15", () => {
    const muitos = Array.from({ length: 20 }, (_, i) =>
      lead({
        id: `l${i}`,
        nome: `Lead ${i}`,
        temperatura: i % 2 === 0 ? "quente" : "morno",
        ultima_interacao: "2026-07-04T12:00:00Z",
      }),
    );
    const filas = buildAtendimentoQueues({
      leads: muitos,
      interacoes: [],
      docsPendentes: new Map(),
      agora,
    });
    expect(filas.esfriando).toHaveLength(15);
    const scores = filas.esfriando.map((i) => i.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

describe("scriptParaFila", () => {
  it("gera mensagem com primeiro nome e projeto para cada fila", () => {
    expect(scriptParaFila("novos", "Nina Prado")).toContain("Nina");
    expect(scriptParaFila("novos", "Nina Prado", "Residencial Sol")).toContain("Residencial Sol");
    expect(scriptParaFila("responder", "Ana Souza")).toContain("Ana");
    expect(scriptParaFila("followups", "Bruno Lima", "Residencial Sol")).toContain(
      "Residencial Sol",
    );
    expect(scriptParaFila("esfriando", "Carla")).toMatch(/condições novas/);
    expect(scriptParaFila("docs", "Duda")).toMatch(/documento/);
  });
});
