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
  it("segue a ordem dos baldes: SLA, fundo, responder, follow-up, sem passo, esfriando, docs", () => {
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
      "Novo",
      "Fundo",
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

describe("filaParaScript", () => {
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
