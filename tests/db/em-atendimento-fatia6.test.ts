/**
 * REGRA DOS 65 — Fatia 6: a tentativa sem resposta (migration 20261011120500,
 * desenho em docs/ops/em-atendimento-teto-65.md §2 decisão 14 e §8.11).
 *
 * "O lead que não atendeu deve ir para Aguardando retorno, e não continuar
 * em Aguardando atendimento, pois já foi feito algo com aquele lead."
 *
 *  1. registrar_contato_lead: tentativa (não atendeu) do corretor DONO em
 *     lead Novo/Aguardando atendimento → Aguardando retorno, com o rastro
 *     (lead_status_transitions + lead_eventos com origem 'tentativa') e o
 *     follow-up. Qualificação Corretor fica; gestão, SDR e dono-com-papel-
 *     de-gestão só gravam o contato; 'sem interesse' não é tentativa.
 *  2. A cadência D0–D3 continua em Aguardando retorno, e de lá o "Cliente
 *     respondeu" leva a Em atendimento.
 *  3. A ficha continua fechada: a matriz não ganhou o destino.
 *  4. O classificador: entrada por tentativa segue o relógio de 5 dias sem
 *     toque; o retorno combinado continua com data + tolerância.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarLead,
  criarUsuario,
  errCode,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let admin: UsuarioTeste;
let ana: UsuarioTeste;
let bia: UsuarioTeste;
let sdr: UsuarioTeste;
let cfgAntes: unknown;

const DIA = 24 * 60 * 60 * 1000;
const futuro = (dias: number) => new Date(Date.now() + dias * DIA).toISOString();

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await comoSuperuser(c);
  cfgAntes = (
    await c.query(`SELECT valor FROM public.gestao_config WHERE chave = 'em_atendimento'`)
  ).rows[0]?.valor;
});

afterAll(async () => {
  await c.query(`ROLLBACK`).catch(() => undefined);
  await comoSuperuser(c);
  if (cfgAntes !== undefined) {
    await c.query(
      `UPDATE public.gestao_config SET valor = $1::jsonb WHERE chave = 'em_atendimento'`,
      [JSON.stringify(cfgAntes)],
    );
  }
  await limparDados(c);
  await c.end();
});

beforeEach(async () => {
  await limparDados(c);
  await comoSuperuser(c);
  admin = await criarUsuario(c, { nome: "Admin 65", papel: "admin" });
  ana = await criarUsuario(c, { nome: "Ana Corretora", papel: "corretor" });
  bia = await criarUsuario(c, { nome: "Bia Corretora", papel: "corretor" });
  sdr = await criarUsuario(c, { nome: "Sara SDR", papel: "sdr" });
});

type Opts = {
  status?: string;
  dono?: UsuarioTeste | null;
  origem?: string;
  cadencia?: string | null;
};

/** Lead sem toque nenhum, com a cadência controlada (o INSERT com dono põe D0). */
async function lead(opts: Opts = {}): Promise<string> {
  const id = await criarLead(c, {
    corretorId: opts.dono === null ? null : (opts.dono ?? ana).id,
    status: opts.status ?? "aguardando_atendimento",
    origem: opts.origem ?? "outro",
  });
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.leads
        SET cadencia_etapa = $2, cadencia_prazo_ts = NULL,
            ultimo_contato = NULL, ultima_interacao = now()
      WHERE id = $1`,
    [id, opts.cadencia ?? null],
  );
  return id;
}

type Contato = {
  ok: true;
  interacao_id: string | null;
  tarefa_id: string | null;
  respondeu: boolean;
  entrou: boolean;
  moveu: boolean;
  via: string | null;
  status: string;
  lotado: Record<string, unknown> | null;
};

async function rpc<T = Record<string, unknown>>(
  como: UsuarioTeste,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  await comoUsuario(c, como.id);
  try {
    return (await c.query(sql, params)).rows[0]?.r as T;
  } finally {
    await comoSuperuser(c);
  }
}

/** O contato como a tela registra (registrar_contato_lead). */
async function contato(
  como: UsuarioTeste,
  leadId: string,
  opts: {
    tipo?: string;
    resultado?: string;
    acao?: string | null;
    followup?: string | null;
    criarTarefa?: boolean;
  } = {},
): Promise<Contato> {
  return rpc<Contato>(
    como,
    `SELECT public.registrar_contato_lead($1, $2, $3, NULL, $4, $5::timestamptz, NULL, $6::boolean) AS r`,
    [
      leadId,
      opts.tipo ?? "ligacao",
      opts.resultado ?? "nao_atendeu",
      opts.acao === undefined ? "Tentar de novo" : opts.acao,
      opts.followup === undefined ? futuro(1) : opts.followup,
      opts.criarTarefa ?? true,
    ],
  );
}

async function estado(id: string) {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT status::text AS status, cadencia_etapa, proximo_followup, proxima_acao
         FROM public.leads WHERE id = $1`,
      [id],
    )
  ).rows[0];
}

async function transicoes(id: string) {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT de_status::text AS de, para_status::text AS para
         FROM public.lead_status_transitions WHERE lead_id = $1 ORDER BY created_at, id`,
      [id],
    )
  ).rows;
}

async function eventosTransicao(id: string) {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT payload ->> 'de_status' AS de, payload ->> 'para_status' AS para,
              payload ->> 'origem' AS origem, payload ->> 'motivo' AS motivo
         FROM public.lead_eventos
        WHERE lead_id = $1 AND tipo = 'transicao_lead'
        ORDER BY created_at, id`,
      [id],
    )
  ).rows;
}

async function tarefasAbertas(id: string) {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT titulo, prioridade::text AS prioridade, data_vencimento
         FROM public.tarefas
        WHERE lead_id = $1 AND deleted_at IS NULL AND status IN ('pendente', 'em_andamento')
        ORDER BY data_vencimento, id`,
      [id],
    )
  ).rows;
}

async function eventosCadencia(id: string) {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT payload ->> 'de_estado' AS de, payload ->> 'para_estado' AS para
         FROM public.lead_eventos WHERE lead_id = $1 AND tipo = 'cadencia_etapa'
        ORDER BY created_at, id`,
      [id],
    )
  ).rows;
}

/** O que o classificador decide para o lead (como o robô da 3b o lê). */
async function classificar(id: string, dono = ana) {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT acao, destino, dias_sem_toque FROM public._em_atendimento_classificar($1::uuid[])
        WHERE lead_id = $2`,
      [[dono.id], id],
    )
  ).rows[0];
}

/** Envelhece o lead: todo toque e o espelho do follow-up para trás no tempo. */
async function envelhecer(id: string, diasSemToque: number, followupHaDias: number | null) {
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.interacoes SET ocorreu_em = now() - make_interval(days => $2) WHERE lead_id = $1`,
    [id, diasSemToque],
  );
  await c.query(
    `UPDATE public.leads
        SET ultimo_contato = now() - make_interval(days => $2),
            created_at = now() - make_interval(days => $2 + 1),
            proximo_followup = CASE WHEN $3::int IS NULL THEN NULL
                                    ELSE now() - make_interval(days => $3::int) END
      WHERE id = $1`,
    [id, diasSemToque, followupHaDias],
  );
  if (followupHaDias !== null) {
    await c.query(
      `UPDATE public.tarefas SET data_vencimento = now() - make_interval(days => $2)
        WHERE lead_id = $1 AND deleted_at IS NULL`,
      [id, followupHaDias],
    );
  }
}

// ---------------------------------------------------------------------------
// 1. A consequência da tentativa
// ---------------------------------------------------------------------------

describe("tentativa sem resposta leva o lead a Aguardando retorno", () => {
  it("não atendeu em Aguardando atendimento: move, deixa o rastro e o follow-up", async () => {
    const id = await lead();
    const r = await contato(ana, id, { tipo: "whatsapp" });
    expect(r).toMatchObject({
      ok: true,
      respondeu: false,
      entrou: false,
      moveu: true,
      via: null,
      status: "aguardando_retorno",
      lotado: null,
    });
    expect(await estado(id)).toMatchObject({
      status: "aguardando_retorno",
      proxima_acao: "Tentar de novo",
    });
    expect(await transicoes(id)).toEqual([
      { de: "aguardando_atendimento", para: "aguardando_retorno" },
    ]);
    expect(await eventosTransicao(id)).toEqual([
      {
        de: "aguardando_atendimento",
        para: "aguardando_retorno",
        origem: "tentativa",
        motivo: "Contato — não atendeu",
      },
    ]);
    // O passo é a tarefa (prioridade média: ninguém respondeu).
    const t = await tarefasAbertas(id);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ titulo: "Tentar de novo", prioridade: "media" });
    expect((await estado(id)).proximo_followup).not.toBeNull();
  });

  it("de Novo também; sem follow-up no pedido o lead vai mesmo assim (sem data)", async () => {
    const id = await lead({ status: "novo" });
    const r = await contato(ana, id, { followup: null });
    expect(r).toMatchObject({ moveu: true, status: "aguardando_retorno", tarefa_id: null });
    expect(await estado(id)).toMatchObject({
      status: "aguardando_retorno",
      proximo_followup: null,
    });
  });

  it("segunda tentativa em Aguardando retorno: nada muda de etapa; o follow-up é atualizado (dedup)", async () => {
    const id = await lead();
    const r1 = await contato(ana, id);
    const r2 = await contato(ana, id, { acao: "Ligar à tarde" });
    expect(r1.moveu).toBe(true);
    expect(r2).toMatchObject({ moveu: false, entrou: false, status: "aguardando_retorno" });
    expect(await transicoes(id)).toHaveLength(1);
    const t = await tarefasAbertas(id);
    expect(t).toHaveLength(1);
    expect(t[0].titulo).toBe("Ligar à tarde");
  });

  it("Qualificação Corretor fica no relógio de 1 dia: a tentativa não move", async () => {
    const id = await lead({ status: "qualificacao_corretor" });
    const r = await contato(ana, id);
    expect(r).toMatchObject({ moveu: false, status: "qualificacao_corretor" });
    expect(await transicoes(id)).toEqual([]);
    expect(await tarefasAbertas(id)).toHaveLength(1);
  });

  it("'sem interesse' é resposta negativa, não tentativa: a etapa fica", async () => {
    const id = await lead();
    const r = await contato(ana, id, { resultado: "sem_interesse" });
    expect(r).toMatchObject({ moveu: false, entrou: false, status: "aguardando_atendimento" });
  });

  it("só o corretor DONO move: gestão, SDR e corretor de outra carteira só gravam o contato", async () => {
    const daAna = await lead();
    const g = await contato(admin, daAna);
    expect(g).toMatchObject({ moveu: false, status: "aguardando_atendimento" });
    expect(await transicoes(daAna)).toEqual([]);

    // Dono com papel de gestão: não é "tentativa de corretor" — e não pode
    // dar erro (a matriz recusaria a transição; a RPC nem tenta).
    const doAdmin = await lead({ dono: admin });
    const a = await contato(admin, doAdmin);
    expect(a).toMatchObject({ ok: true, moveu: false, status: "aguardando_atendimento" });

    // Carteira do SDR: o SDR tenta pelo caminho dele; aqui só o contato.
    const doSdr = await criarLead(c, { corretorId: null, status: "aguardando_atendimento" });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET sdr_id = $2 WHERE id = $1`, [doSdr, sdr.id]);
    const s = await contato(sdr, doSdr);
    expect(s).toMatchObject({ moveu: false, status: "aguardando_atendimento" });

    // Lead de outra corretora: nem acesso.
    const daBia = await lead({ dono: bia });
    expect(await errCode(contato(ana, daBia))).toBe("42501");
  });

  it("depois, o cliente respondeu: de Aguardando retorno entra em atendimento pela resposta", async () => {
    const id = await lead();
    await contato(ana, id);
    const r = await contato(ana, id, { resultado: "atendeu", acao: "Visita sábado" });
    expect(r).toMatchObject({
      entrou: true,
      moveu: false,
      via: "resposta",
      status: "em_atendimento",
    });
    expect(await transicoes(id)).toEqual([
      { de: "aguardando_atendimento", para: "aguardando_retorno" },
      { de: "aguardando_retorno", para: "em_atendimento" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// 2. A cadência continua
// ---------------------------------------------------------------------------

describe("a cadência D0–D3 continua em Aguardando retorno", () => {
  it("tentativa em D0 move a etapa do funil e deixa a cadência onde estava, sem tarefa", async () => {
    const id = await lead({ cadencia: "D0" });
    const r = await contato(ana, id);
    expect(r).toMatchObject({ moveu: true, status: "aguardando_retorno", tarefa_id: null });
    expect(await estado(id)).toMatchObject({
      status: "aguardando_retorno",
      cadencia_etapa: "D0",
      proximo_followup: null,
    });
    expect(await tarefasAbertas(id)).toHaveLength(0);
    // Nenhum evento de saída da cadência (tg_cadencia_sai_por_status ficou quieto).
    expect(await eventosCadencia(id)).toEqual([]);
  });

  it("'Cliente respondeu' na Fila do Dia leva o lead de Aguardando retorno a Em atendimento", async () => {
    const id = await lead({ cadencia: "D1" });
    await contato(ana, id);
    const r = await rpc<{ ok: boolean; etapa_anterior: string }>(
      ana,
      `SELECT public.cadencia_marcar_respondeu($1, 'Visita quinta', $2::timestamptz) AS r`,
      [id, futuro(2)],
    );
    expect(r).toMatchObject({ ok: true, etapa_anterior: "D1" });
    expect(await estado(id)).toMatchObject({
      status: "em_atendimento",
      cadencia_etapa: "respondeu",
      proxima_acao: "Visita quinta",
    });
    expect(await eventosCadencia(id)).toEqual([{ de: "D1", para: "respondeu" }]);
  });

  it("pela RPC do contato, a resposta de um lead em cadência que está em Aguardando retorno entra via 'cadencia'", async () => {
    const id = await lead({ cadencia: "D2" });
    await contato(ana, id);
    const r = await contato(ana, id, { resultado: "interessado", acao: "Mandar o book" });
    expect(r).toMatchObject({ entrou: true, via: "cadencia", status: "em_atendimento" });
    expect(await estado(id)).toMatchObject({
      status: "em_atendimento",
      cadencia_etapa: "respondeu",
    });
  });

  it("o gatilho: Aguardando retorno conta como prospecção; avançar para agendado continua encerrando", async () => {
    await comoSuperuser(c);
    const p = (
      await c.query(
        `SELECT public._cadencia_status_prospeccao('aguardando_retorno') AS ar,
                public._cadencia_status_prospeccao('aguardando_atendimento') AS aa,
                public._cadencia_status_prospeccao('agendado') AS ag`,
      )
    ).rows[0];
    expect(p).toEqual({ ar: true, aa: true, ag: false });

    const id = await lead({ cadencia: "D1" });
    await c.query(`SELECT set_config('app.transicionar_lead', 'on', true)`);
    await c.query(`UPDATE public.leads SET status = 'aguardando_retorno' WHERE id = $1`, [id]);
    expect(await estado(id)).toMatchObject({ status: "aguardando_retorno", cadencia_etapa: "D1" });
    await c.query(`SELECT set_config('app.transicionar_lead', 'on', true)`);
    await c.query(`UPDATE public.leads SET status = 'agendado' WHERE id = $1`, [id]);
    expect((await estado(id)).cadencia_etapa).toBe("respondeu");
  });
});

// ---------------------------------------------------------------------------
// 3. A ficha continua fechada
// ---------------------------------------------------------------------------

describe("a etapa não se escolhe (a matriz não abriu)", () => {
  it("corretor dono pela ficha: Aguardando atendimento → Aguardando retorno é 22023; a gestão também não tem", async () => {
    const id = await lead();
    await comoUsuario(c, ana.id);
    const code = await errCode(
      c.query(
        `SELECT public.transicionar_lead($1, 'aguardando_retorno'::public.lead_status, NULL, 'Retornar', $2::timestamptz)`,
        [id, futuro(1)],
      ),
    );
    await comoSuperuser(c);
    expect(code).toBe("22023");
    expect((await estado(id)).status).toBe("aguardando_atendimento");

    const m = (
      await c.query(
        `SELECT public.transicao_lead_permitida('aguardando_atendimento', 'aguardando_retorno', false) AS corretor,
                public.transicao_lead_permitida('aguardando_atendimento', 'aguardando_retorno', true) AS gestao,
                public.transicao_lead_permitida('novo', 'aguardando_retorno', false) AS de_novo`,
      )
    ).rows[0];
    expect(m).toEqual({ corretor: false, gestao: false, de_novo: false });
  });

  /** transicionar_lead com a origem posta à mão NA MESMA transação (como a
   *  RPC faz): o código do erro, ou null quando passou (e aí fica gravado). */
  async function comOrigemTentativa(como: UsuarioTeste, leadId: string): Promise<string | null> {
    await comoUsuario(c, como.id);
    await c.query(`BEGIN`);
    try {
      await c.query(`SELECT set_config('app.em_atendimento_origem', 'tentativa', true)`);
      const code = await errCode(
        c.query(
          `SELECT public.transicionar_lead($1, 'aguardando_retorno'::public.lead_status, 'Contato — não atendeu', 'Retornar', NULL)`,
          [leadId],
        ),
      );
      await c.query(code ? `ROLLBACK` : `COMMIT`);
      return code;
    } finally {
      await comoSuperuser(c);
    }
  }

  it("a origem 'tentativa' só vale para o dono, para Aguardando retorno e a partir de Novo/Aguardando atendimento", async () => {
    // Dono com papel de gestão não é "dono corretor": matriz → 22023.
    const doAdmin = await lead({ dono: admin });
    expect(await comOrigemTentativa(admin, doAdmin)).toBe("22023");
    expect((await estado(doAdmin)).status).toBe("aguardando_atendimento");

    // Dona, mas de Qualificação Corretor: a origem não abre esse caminho.
    const qualif = await lead({ status: "qualificacao_corretor" });
    expect(await comOrigemTentativa(ana, qualif)).toBe("22023");
    expect((await estado(qualif)).status).toBe("qualificacao_corretor");

    // Dona, de Aguardando atendimento, sem follow-up: é o caminho da RPC.
    const ok = await lead();
    expect(await comOrigemTentativa(ana, ok)).toBeNull();
    expect(await estado(ok)).toMatchObject({
      status: "aguardando_retorno",
      proximo_followup: null,
    });
    expect((await eventosTransicao(ok)).at(-1)).toMatchObject({
      para: "aguardando_retorno",
      origem: "tentativa",
    });
  });
});

// ---------------------------------------------------------------------------
// 4. O relógio da tentativa
// ---------------------------------------------------------------------------

describe("o classificador: tentativa segue o relógio de 5 dias, retorno combinado segue a data", () => {
  it("entrada por tentativa com follow-up vencido: 4 dias é base_ok, 5 dias sai por sem_toque", async () => {
    const id = await lead();
    await contato(ana, id);
    await envelhecer(id, 4, 3);
    expect(await classificar(id)).toMatchObject({
      acao: "base_ok",
      destino: null,
      dias_sem_toque: 4,
    });
    await envelhecer(id, 5, 4);
    expect(await classificar(id)).toMatchObject({
      acao: "sem_toque",
      destino: "bolsao",
      dias_sem_toque: 5,
    });
  });

  it("retorno combinado (desfecho de Em atendimento) continua: data vencida sem toque é retorno_vencido", async () => {
    const id = await lead({ status: "em_atendimento" });
    await comoUsuario(c, ana.id);
    await c.query(
      `SELECT public.transicionar_lead($1, 'aguardando_retorno'::public.lead_status, 'Esfriou', 'Voltar a falar', $2::timestamptz)`,
      [id, futuro(1)],
    );
    await comoSuperuser(c);
    expect((await eventosTransicao(id)).at(-1)).toMatchObject({
      para: "aguardando_retorno",
      origem: null,
    });
    await envelhecer(id, 4, 3);
    expect(await classificar(id)).toMatchObject({ acao: "retorno_vencido", destino: "bolsao" });
  });

  it("a entrada mais recente manda: tentativa, resposta, depois retorno combinado volta ao relógio da data", async () => {
    const id = await lead();
    await contato(ana, id); // tentativa → aguardando_retorno
    await contato(ana, id, { resultado: "atendeu", acao: "Visita" }); // → em_atendimento
    await comoUsuario(c, ana.id);
    await c.query(
      `SELECT public.transicionar_lead($1, 'aguardando_retorno'::public.lead_status, 'Pediu retorno', 'Ligar dia 20', $2::timestamptz)`,
      [id, futuro(1)],
    );
    await comoSuperuser(c);
    await envelhecer(id, 4, 3);
    expect(await classificar(id)).toMatchObject({ acao: "retorno_vencido" });
  });

  it("o robô da 3b escreve o status direto (sem evento de transição): a entrada dele vence a tentativa anterior", async () => {
    const id = await lead();
    await contato(ana, id); // tentativa → aguardando_retorno (evento com origem)
    // Resposta e depois "perde a vaga" como o robô faz: UPDATE direto, só o
    // rastro de lead_status_transitions (gatilho) — nenhum transicao_lead.
    await comoSuperuser(c);
    for (const status of ["em_atendimento", "aguardando_retorno"]) {
      await c.query(`SELECT set_config('app.transicionar_lead', 'on', true)`);
      await c.query(`UPDATE public.leads SET status = $2::public.lead_status WHERE id = $1`, [
        id,
        status,
      ]);
    }
    expect(await transicoes(id)).toHaveLength(3);
    expect(await eventosTransicao(id)).toHaveLength(1);
    await envelhecer(id, 4, 3);
    expect(await classificar(id)).toMatchObject({ acao: "retorno_vencido" });
  });

  it("na cadência o classificador nem olha o status: segue 'cadencia'", async () => {
    const id = await lead({ cadencia: "D0" });
    await contato(ana, id);
    await envelhecer(id, 6, null);
    expect(await classificar(id)).toMatchObject({ acao: "cadencia", destino: null });
  });
});
