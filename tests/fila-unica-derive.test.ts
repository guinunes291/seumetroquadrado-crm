import { describe, expect, it } from "vitest";
import {
  BUCKET_ORDER,
  buildFilaUnica,
  filaParaScript,
  type LeadExtras,
  type SemAcaoRow,
} from "@/features/fila-unica/derive";
import type { AtendimentoInbox } from "@/features/atendimento/inbox";
import type { AtendimentoLead, QueueItem, QueueKey } from "@/features/atendimento/derive";
import type { FilaFollowUp, FilaItem } from "@/features/followup/fila-client";

const agora = new Date("2026-09-12T12:00:00Z");

function lead(partial: Partial<AtendimentoLead> & { id: string; nome: string }): AtendimentoLead {
  return {
    telefone: "11999990000",
    email: null,
    status: "em_atendimento",
    temperatura: "morno",
    ultima_interacao: "2026-09-10T12:00:00Z",
    proximo_followup: null,
    projeto_nome: null,
    created_at: "2026-09-01T12:00:00Z",
    corretor_id: "c1",
    origem: "facebook",
    renda_informada: null,
    entrada_disponivel: null,
    usa_fgts: null,
    ...partial,
  };
}

function item(l: AtendimentoLead, extra: Partial<QueueItem> = {}): QueueItem {
  return {
    lead: l,
    score: 50,
    tier: "media",
    motivo: "motivo da inbox",
    docsPendentes: 0,
    ...extra,
  };
}

function inbox(
  filas: Partial<Record<QueueKey, QueueItem[]>>,
  counts: Partial<Record<QueueKey, number>> = {},
): AtendimentoInbox {
  const vazio: AtendimentoInbox["filas"] = {
    novos: [],
    responder: [],
    followups: [],
    esfriando: [],
    confirmar_visita: [],
    docs: [],
  };
  const f = { ...vazio, ...filas };
  return {
    filas: f,
    counts: {
      novos: counts.novos ?? f.novos.length,
      responder: counts.responder ?? f.responder.length,
      followups: counts.followups ?? f.followups.length,
      esfriando: counts.esfriando ?? f.esfriando.length,
      confirmar_visita: counts.confirmar_visita ?? f.confirmar_visita.length,
      docs: counts.docs ?? f.docs.length,
    },
  };
}

function toque(partial: Partial<FilaItem> & { id: string; nome: string }): FilaItem {
  return {
    telefone: "11999990000",
    email: null,
    status: "aguardando_retorno",
    temperatura: "morno",
    origem: "facebook",
    projeto_id: null,
    projeto_nome: null,
    corretor_id: "c1",
    created_at: "2026-09-01T12:00:00Z",
    ultima_interacao: "2026-09-09T12:00:00Z",
    proxima_acao: "retomar",
    proximo_followup: "2026-09-11T12:00:00Z",
    renda_informada: null,
    entrada_disponivel: null,
    usa_fgts: null,
    observacoes: null,
    minutos_vencido: 60,
    tentativas: 2,
    respondeu: false,
    ...partial,
  };
}

function regua(itens: FilaItem[]): FilaFollowUp {
  return { gerado_em: agora.toISOString(), corretor_id: "c1", itens };
}

function semAcao(partial: Partial<SemAcaoRow> & { id: string; nome: string }): SemAcaoRow {
  return {
    telefone: "11999990000",
    status: "em_atendimento",
    temperatura: "frio",
    proximo_followup: null,
    ultima_interacao: "2026-08-20T12:00:00Z",
    ...partial,
  };
}

const extras = (m: Record<string, LeadExtras>) => new Map(Object.entries(m));

describe("buildFilaUnica — um lead, um balde", () => {
  // A causa nº 1 de a fila perder credibilidade é a mesma pessoa aparecer
  // duas vezes: a inbox e a régua podem trazer o mesmo lead.
  it("deduplica entre fontes e fica com o balde mais urgente", () => {
    const l = lead({ id: "a", nome: "Ana", status: "aguardando_retorno" });
    const fila = buildFilaUnica({
      inbox: inbox({ responder: [item(l)] }),
      regua: regua([toque({ id: "a", nome: "Ana" })]),
      semAcao: [semAcao({ id: "a", nome: "Ana", status: "aguardando_retorno" })],
      agora,
    });
    expect(fila.itens).toHaveLength(1);
    expect(fila.itens[0].bucket).toBe("responder");
    expect(fila.total).toBe(1);
  });

  // Um lead em análise de crédito que "esfria" é dinheiro parado — vai para o
  // fundo do funil, nunca para "esfriando" (medido: 124 de 134 parados, 39%
  // de conversão).
  it("fundo do funil vence esfriando, follow-up e sem próximo passo", () => {
    const fila = buildFilaUnica({
      inbox: inbox({
        esfriando: [item(lead({ id: "e", nome: "Eva", status: "analise_credito" }))],
      }),
      regua: regua([toque({ id: "r", nome: "Rui", status: "agendado" })]),
      semAcao: [semAcao({ id: "s", nome: "Sol", status: "visita_realizada" })],
      agora,
    });
    expect(fila.itens.map((i) => i.bucket)).toEqual(["fundo", "fundo", "fundo"]);
    expect(fila.resumo.fundoParado).toBe(3);
  });

  it("etapas encerradas nunca entram", () => {
    const fila = buildFilaUnica({
      inbox: inbox({
        esfriando: [item(lead({ id: "v", nome: "Vendido", status: "contrato_fechado" }))],
      }),
      regua: null,
      semAcao: [semAcao({ id: "p", nome: "Perdido", status: "perdido" })],
      agora,
    });
    expect(fila.itens).toHaveLength(0);
    expect(fila.total).toBe(0);
  });
});

describe("buildFilaUnica — a precedência vale para qualquer fonte", () => {
  // followup_fila_v1 devolve TODO lead ativo sem toque agendado (venc NULL,
  // minutos_vencido 0). Isso não é "vence hoje": é lead sem próximo passo —
  // e ele não pode roubar a dedup do balde sem_acao.
  it("régua sem prazo (venc NULL) é 'sem próximo passo', não 'vence hoje'", () => {
    const fila = buildFilaUnica({
      inbox: inbox({}),
      regua: regua([
        toque({ id: "x", nome: "Xavier", proximo_followup: null, minutos_vencido: 0 }),
      ]),
      semAcao: [semAcao({ id: "x", nome: "Xavier" })],
      agora,
    });
    expect(fila.itens).toHaveLength(1);
    expect(fila.itens[0].bucket).toBe("sem_acao");
    expect(fila.itens[0].venceHoje).toBe(false);
    expect(fila.itens[0].prazo).toBeNull();
    expect(fila.itens[0].motivo).toContain("sem próximo passo definido");
    expect(fila.resumo).toMatchObject({ hoje: 0, semProximoPasso: 1 });
    expect(filaParaScript(fila.itens[0])).toBe("esfriando");
  });

  it("régua com toque de hoje (prazo real) é follow-up e conta em 'hoje'", () => {
    const fila = buildFilaUnica({
      inbox: inbox({}),
      regua: regua([
        toque({
          id: "h",
          nome: "Hoje",
          proximo_followup: "2026-09-12T18:00:00Z",
          minutos_vencido: 0,
        }),
      ]),
      semAcao: [],
      agora,
    });
    expect(fila.itens[0].bucket).toBe("followup");
    expect(fila.itens[0].venceHoje).toBe(true);
    expect(fila.resumo.hoje).toBe(1);
  });

  // O 16º lead de "responder" fica fora dos cards da inbox e chega pela
  // régua com respondeu=true: não pode virar "combinamos de retomar".
  it("régua com respondeu vai para 'responder' com o script certo", () => {
    const fila = buildFilaUnica({
      inbox: inbox({}),
      regua: regua([toque({ id: "r", nome: "Resp", respondeu: true })]),
      semAcao: [],
      agora,
    });
    expect(fila.itens[0].bucket).toBe("responder");
    expect(filaParaScript(fila.itens[0])).toBe("responder");
  });

  it("lead em primeiro contato vindo da régua ou de leads_sem_acao vai para o SLA", () => {
    const fila = buildFilaUnica({
      inbox: inbox({}),
      regua: regua([toque({ id: "a", nome: "A", status: "aguardando_atendimento" })]),
      semAcao: [semAcao({ id: "b", nome: "B", status: "novo" })],
      agora,
    });
    expect(fila.itens.map((i) => i.bucket)).toEqual(["sla", "sla"]);
    expect(filaParaScript(fila.itens[0])).toBe("novos");
    expect(fila.resumo.semProximoPasso).toBe(0);
  });
});

describe("buildFilaUnica — ordem", () => {
  it("segue a ordem dos baldes: fundo, SLA, responder, follow-up, sem passo, esfriando, docs", () => {
    const fila = buildFilaUnica({
      inbox: inbox({
        docs: [item(lead({ id: "d", nome: "Doc" }), { docsPendentes: 2 })],
        esfriando: [item(lead({ id: "e", nome: "Esf", temperatura: "quente" }))],
        responder: [item(lead({ id: "r", nome: "Resp" }))],
        confirmar_visita: [
          item(lead({ id: "f", nome: "Fundo", status: "agendado" }), { agendamentoId: "ag1" }),
        ],
        novos: [item(lead({ id: "n", nome: "Novo", status: "aguardando_atendimento" }))],
      }),
      regua: regua([toque({ id: "t", nome: "Toque" })]),
      semAcao: [semAcao({ id: "s", nome: "Sem" })],
      agora,
    });
    expect(fila.itens.map((i) => i.bucket)).toEqual(BUCKET_ORDER);
    expect(fila.itens.map((i) => i.lead.nome)).toEqual([
      "Fundo",
      "Novo",
      "Resp",
      "Toque",
      "Sem",
      "Esf",
      "Doc",
    ]);
  });

  // No fundo do funil o critério é dinheiro parado há mais tempo — não o
  // score, que empata (temperatura derivada da etapa). Sem data conhecida =
  // o mais negligenciado (espelha o NULLS FIRST de leads_sem_acao).
  it("dentro do fundo do funil, mais dias sem movimento primeiro; sem data vem antes de todos", () => {
    const fila = buildFilaUnica({
      inbox: inbox({
        esfriando: [
          item(
            lead({
              id: "a",
              nome: "Recente",
              status: "analise_credito",
              ultima_interacao: "2026-09-09T12:00:00Z",
            }),
            { score: 90, tier: "alta" },
          ),
          item(
            lead({
              id: "b",
              nome: "Antigo",
              status: "analise_credito",
              ultima_interacao: "2026-07-01T12:00:00Z",
            }),
            { score: 60, tier: "alta" },
          ),
        ],
      }),
      regua: null,
      semAcao: [
        semAcao({ id: "n", nome: "Nunca", status: "analise_credito", ultima_interacao: null }),
      ],
      agora,
    });
    expect(fila.itens.map((i) => i.lead.nome)).toEqual(["Nunca", "Antigo", "Recente"]);
    expect(fila.itens[0].diasParado).toBeNull();
    expect(fila.itens[1].diasParado).toBe(73);
  });

  // O relógio é o da Higiene: GREATEST(ultima_interacao, ultimo_contato).
  it("o enriquecimento traz ultimo_contato para o relógio e created_at/projeto/corretor para o card", () => {
    const fila = buildFilaUnica({
      inbox: inbox({
        esfriando: [
          item(
            lead({
              id: "a",
              nome: "Contato ontem",
              status: "agendado",
              ultima_interacao: "2026-07-01T12:00:00Z",
            }),
          ),
        ],
      }),
      regua: null,
      semAcao: [
        semAcao({ id: "s", nome: "Sem", status: "visita_realizada", ultima_interacao: null }),
      ],
      extras: extras({
        a: { ultimo_contato: "2026-09-11T12:00:00Z" },
        s: { created_at: "2026-06-01T12:00:00Z", projeto_nome: "Vibra Sabará", corretor_id: "c1" },
      }),
      agora,
    });
    const a = fila.itens.find((i) => i.lead.id === "a")!;
    const s = fila.itens.find((i) => i.lead.id === "s")!;
    expect(a.diasParado).toBe(1);
    expect(s.diasParado).toBe(103);
    expect(s.lead.projeto_nome).toBe("Vibra Sabará");
    expect(s.lead.corretor_id).toBe("c1");
    expect(s.lead.created_at).toBe("2026-06-01T12:00:00Z");
    expect(fila.itens.map((i) => i.lead.id)).toEqual(["s", "a"]);
  });

  it("no SLA vale a ordem da inbox (score), como em Atender", () => {
    const fila = buildFilaUnica({
      inbox: inbox({
        novos: [
          item(lead({ id: "a", nome: "Maior", status: "aguardando_atendimento" }), {
            score: 80,
            tier: "alta",
          }),
          item(lead({ id: "b", nome: "Menor", status: "aguardando_atendimento" }), {
            score: 40,
            tier: "media",
          }),
        ],
      }),
      regua: null,
      semAcao: [],
      agora,
    });
    expect(fila.itens.map((i) => i.lead.nome)).toEqual(["Maior", "Menor"]);
  });

  it("na régua, o toque mais vencido vem primeiro; empate de hoje segue o prazo, como o hub", () => {
    const fila = buildFilaUnica({
      inbox: inbox({}),
      regua: regua([
        toque({
          id: "b",
          nome: "Tarde",
          proximo_followup: "2026-09-12T18:00:00Z",
          minutos_vencido: 0,
        }),
        toque({ id: "c", nome: "Ontem", minutos_vencido: 1440 }),
        toque({
          id: "a",
          nome: "Cedo",
          proximo_followup: "2026-09-12T13:00:00Z",
          minutos_vencido: 0,
        }),
      ]),
      semAcao: [],
      agora,
    });
    expect(fila.itens.map((i) => i.lead.nome)).toEqual(["Ontem", "Cedo", "Tarde"]);
    expect(fila.itens[0].motivo).toContain("toque 3 da régua");
  });
});

describe("buildFilaUnica — fontes e resumo", () => {
  // Fonte única com o hub Follow-Up: com a régua disponível, a fila
  // "followups" da inbox é ignorada (mesma regra de aplicarFilaRegua).
  it("com a régua disponível, a fila followups da inbox é ignorada", () => {
    const fila = buildFilaUnica({
      inbox: inbox({ followups: [item(lead({ id: "x", nome: "Inbox" }))] }),
      regua: regua([toque({ id: "y", nome: "Regua" })]),
      semAcao: [],
      agora,
    });
    expect(fila.itens.map((i) => i.lead.nome)).toEqual(["Regua"]);
  });

  it("sem a régua (banco antigo), a fila followups da inbox continua valendo", () => {
    const fila = buildFilaUnica({
      inbox: inbox({ followups: [item(lead({ id: "x", nome: "Inbox" }))] }),
      regua: null,
      semAcao: [],
      agora,
    });
    expect(fila.itens.map((i) => i.bucket)).toEqual(["followup"]);
  });

  it("resumo: vencidos, hoje, sem próximo passo, SLA (contagem do banco) e ocultos da inbox", () => {
    const fila = buildFilaUnica({
      inbox: inbox(
        { novos: [item(lead({ id: "n", nome: "Novo", status: "aguardando_atendimento" }))] },
        { novos: 7, esfriando: 12 },
      ),
      regua: regua([
        toque({ id: "a", nome: "Vencido", minutos_vencido: 120 }),
        toque({
          id: "b",
          nome: "Hoje",
          proximo_followup: "2026-09-12T15:00:00Z",
          minutos_vencido: 0,
        }),
      ]),
      semAcao: [semAcao({ id: "s", nome: "Sem" }), semAcao({ id: "t", nome: "Sem2" })],
      agora,
    });
    expect(fila.resumo).toEqual({
      vencidos: 1,
      hoje: 1,
      semProximoPasso: 2,
      slaCorrendo: 7,
      fundoParado: 0,
      // 6 novos além do card + 12 esfriando sem card algum.
      ocultosInbox: 18,
      emJogo: 0,
    });
  });

  it("sem próximo passo: o item não herda prazo nem ação sugerida", () => {
    const fila = buildFilaUnica({
      inbox: inbox({}),
      regua: null,
      semAcao: [semAcao({ id: "s", nome: "Sem", proximo_followup: "2026-09-10T12:00:00Z" })],
      agora,
    });
    expect(fila.itens[0].proximoPasso).toBeNull();
    expect(fila.itens[0].prazo).toBeNull();
    expect(fila.itens[0].vencidoMin).toBe(0);
    expect(fila.itens[0].motivo).toContain("sem próximo passo definido");
  });

  it("o teto corta os cards, mas o total conta a fila inteira recebida", () => {
    const rows = Array.from({ length: 6 }, (_, i) => semAcao({ id: `s${i}`, nome: `S${i}` }));
    const fila = buildFilaUnica({ inbox: inbox({}), regua: null, semAcao: rows, agora, limite: 4 });
    expect(fila.itens).toHaveLength(4);
    expect(fila.total).toBe(6);
    expect(fila.porBucket.sem_acao).toBe(6);
  });

  it("o projeto de interesse chega ao card por qualquer fonte", () => {
    const fila = buildFilaUnica({
      inbox: inbox({
        responder: [item(lead({ id: "a", nome: "A", projeto_nome: "Vibra Sabará" }))],
      }),
      regua: regua([toque({ id: "b", nome: "B", projeto_nome: "Liber Jaçanã" })]),
      semAcao: [semAcao({ id: "c", nome: "C" })],
      extras: extras({ c: { projeto_nome: "Novvo" } }),
      agora,
    });
    expect(fila.itens.map((i) => i.lead.projeto_nome)).toEqual([
      "Vibra Sabará",
      "Liber Jaçanã",
      "Novvo",
    ]);
  });
});

describe("buildFilaUnica — prazo e próximo passo dos itens da inbox", () => {
  // A inbox não traz minutos_vencido: o prazo é o proximo_followup do lead e
  // o vencimento é calculado aqui, no fuso de São Paulo.
  it("prazo passado vira vencido e o próximo passo cai na ação sugerida pela etapa", () => {
    const fila = buildFilaUnica({
      inbox: inbox({
        esfriando: [
          item(
            lead({
              id: "v",
              nome: "Vencido",
              status: "em_atendimento",
              proximo_followup: "2026-09-11T12:00:00Z",
            }),
          ),
        ],
      }),
      regua: null,
      semAcao: [],
      agora,
    });
    const [i] = fila.itens;
    expect(i.bucket).toBe("esfriando");
    expect(i.vencidoMin).toBe(24 * 60);
    expect(i.venceHoje).toBe(false);
    expect(i.proximoPasso).toBe("Agendar visita");
    expect(fila.resumo).toMatchObject({ vencidos: 1, hoje: 0 });
  });

  it("'vence hoje' é o dia de São Paulo, não o dia UTC", () => {
    const fila = buildFilaUnica({
      inbox: inbox({
        esfriando: [
          // 22h de 12/09 em São Paulo (01h de 13/09 em UTC): ainda é hoje.
          item(lead({ id: "h", nome: "Hoje", proximo_followup: "2026-09-13T01:00:00Z" })),
          // 01h de 13/09 em São Paulo: amanhã.
          item(lead({ id: "a", nome: "Amanha", proximo_followup: "2026-09-13T04:00:00Z" })),
        ],
      }),
      regua: null,
      semAcao: [],
      agora,
    });
    const por = Object.fromEntries(fila.itens.map((i) => [i.lead.id, i]));
    expect(por.h.venceHoje).toBe(true);
    expect(por.h.vencidoMin).toBe(0);
    expect(por.a.venceHoje).toBe(false);
    expect(por.a.vencidoMin).toBe(0);
    expect(fila.resumo).toMatchObject({ vencidos: 0, hoje: 1 });
  });

  it("etapa encerrada vinda da régua também fica de fora", () => {
    const fila = buildFilaUnica({
      inbox: inbox({}),
      regua: regua([toque({ id: "f", nome: "Fechado", status: "contrato_fechado" })]),
      semAcao: [],
      agora,
    });
    expect(fila.total).toBe(0);
    expect(fila.resumo.vencidos).toBe(0);
  });
});

describe("buildFilaUnica — empate no mesmo balde", () => {
  // O mesmo lead em análise de crédito chega pela inbox (esfriando) e pela
  // régua (toque vencido): os dois caem em "fundo". A inbox fica com o card,
  // mas o texto livre do próximo passo, o projeto e o vencimento medido pela
  // RPC são dela — não podem se perder na dedup.
  it("a inbox fica com o card, completado com o que só a régua sabe", () => {
    const fila = buildFilaUnica({
      inbox: inbox({
        esfriando: [
          item(
            lead({
              id: "e",
              nome: "Empate",
              status: "analise_credito",
              temperatura: "quente",
              proximo_followup: "2026-09-11T12:00:00Z",
            }),
            { motivo: "quente sem contato há 3 dia(s)" },
          ),
        ],
      }),
      regua: regua([
        toque({
          id: "e",
          nome: "Empate",
          status: "analise_credito",
          projeto_nome: "Liber Jaçanã",
          proxima_acao: "mandar a simulação da Caixa",
          proximo_followup: "2026-09-11T12:00:00Z",
          minutos_vencido: 1500,
          tentativas: 4,
        }),
      ]),
      semAcao: [],
      agora,
    });
    expect(fila.itens).toHaveLength(1);
    const [i] = fila.itens;
    expect(i).toMatchObject({
      bucket: "fundo",
      fonte: "inbox",
      motivo: "quente sem contato há 3 dia(s)",
      proximoPasso: "mandar a simulação da Caixa",
      vencidoMin: 1500,
      venceHoje: false,
    });
    expect(i.lead.projeto_nome).toBe("Liber Jaçanã");
    expect(fila.resumo).toMatchObject({ fundoParado: 1, vencidos: 1 });
  });

  it("o texto livre do card vencedor não é sobrescrito pelo da outra fonte", () => {
    const fila = buildFilaUnica({
      inbox: inbox({}),
      regua: regua([
        toque({ id: "s", nome: "Sla", status: "aguardando_atendimento", proxima_acao: "ligar" }),
      ]),
      semAcao: [semAcao({ id: "s", nome: "Sla", status: "aguardando_atendimento" })],
      agora,
    });
    expect(fila.itens).toHaveLength(1);
    expect(fila.itens[0]).toMatchObject({ bucket: "sla", fonte: "regua", proximoPasso: "ligar" });
  });
});

describe("filaParaScript", () => {
  it("fundo do funil sem fila de origem cai no script de follow-up", () => {
    const fila = buildFilaUnica({
      inbox: inbox({}),
      regua: null,
      semAcao: [semAcao({ id: "f", nome: "Fundo", status: "analise_credito" })],
      agora,
    });
    expect(fila.itens[0].bucket).toBe("fundo");
    expect(fila.itens[0].filaInbox).toBeNull();
    expect(filaParaScript(fila.itens[0])).toBe("followups");
  });

  it("usa a fila de origem da inbox e cai num script coerente para as demais fontes", () => {
    const fila = buildFilaUnica({
      inbox: inbox({
        confirmar_visita: [
          item(lead({ id: "f", nome: "F", status: "agendado" }), { agendamentoId: "ag" }),
        ],
      }),
      regua: regua([toque({ id: "r", nome: "R" })]),
      semAcao: [semAcao({ id: "s", nome: "S" })],
      agora,
    });
    const por = Object.fromEntries(fila.itens.map((i) => [i.lead.id, filaParaScript(i)]));
    expect(por).toEqual({ f: "confirmar_visita", r: "followups", s: "esfriando" });
  });
});

describe("buildFilaUnica — dinheiro em jogo", () => {
  it("o VGV do card vem do preço de tabela do projeto (extras); sem preço, null; a fila soma", () => {
    const extras = new Map([
      ["a", { valor_projeto: 250_000 }],
      ["b", { valor_projeto: null }],
    ]);
    const fila = buildFilaUnica({
      inbox: inbox({
        responder: [item(lead({ id: "a", nome: "Com preço" }))],
        esfriando: [item(lead({ id: "b", nome: "Sem preço", temperatura: "quente" }))],
      }),
      regua: null,
      semAcao: [],
      extras,
      agora,
    });
    expect(fila.itens.map((i) => i.valorEmJogo)).toEqual([250_000, null]);
    expect(fila.resumo.emJogo).toBe(250_000);
  });

  it("no empate entre fontes, o valor não se perde", () => {
    const extras = new Map([["t", { valor_projeto: 180_000 }]]);
    const fila = buildFilaUnica({
      inbox: inbox({ responder: [item(lead({ id: "t", nome: "Dois" }))] }),
      regua: regua([toque({ id: "t", nome: "Dois", respondeu: true })]),
      semAcao: [],
      extras,
      agora,
    });
    expect(fila.itens).toHaveLength(1);
    expect(fila.itens[0].valorEmJogo).toBe(180_000);
  });
});
