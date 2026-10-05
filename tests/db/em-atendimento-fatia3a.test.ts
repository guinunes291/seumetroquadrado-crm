/**
 * REGRA DOS 65 — Fatia 3a: as portas de Em atendimento fechadas no banco
 * (migration 20261010120700, desenho em docs/ops/em-atendimento-teto-65.md §9).
 *
 *  1. ENTRADA pelo próprio corretor dono — a porta (_em_atendimento_travar):
 *     lead em cadência só pela Fila do Dia (EA067); contato registrado nas
 *     últimas 24 h (EA066); passo com DATA (EA068); e o teto (EA065). Gestão,
 *     serviço e SDR seguem livres. Fatia 3a.2 (migration 20261010120800): o
 *     corretor não ESCOLHE Em atendimento pela ficha (22023 na matriz) — o
 *     lead entra como consequência de registrar_contato_lead (o cliente
 *     respondeu + passo com data), pela cadência quando está nela.
 *  2. SAÍDA só por desfecho (corretor dono); gestão e SDR mantêm as antigas.
 *  3. Lead sem corretor não está em atendimento (gatilho); posse de lead
 *     nesse estado entra na Minha base.
 *  4. Trava da roleta (60/150) só com a regra ligada; em sombra, true.
 *  5. registrar_contato_lead: contato + consequência + passo numa transação.
 *  6. Portal é origem paga.
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
let tetoAntes: unknown;
let cfgAntes: unknown;

const TETO = 3;
const DIA = 24 * 60 * 60 * 1000;
const futuro = (dias: number) => new Date(Date.now() + dias * DIA).toISOString();

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await comoSuperuser(c);
  tetoAntes = (
    await c.query(
      `SELECT valor FROM public.gestao_config WHERE chave = 'capacidade_leads_ativos_por_corretor'`,
    )
  ).rows[0]?.valor;
  cfgAntes = (
    await c.query(`SELECT valor FROM public.gestao_config WHERE chave = 'em_atendimento'`)
  ).rows[0]?.valor;
  await c.query(
    `UPDATE public.gestao_config SET valor = $1::jsonb
      WHERE chave = 'capacidade_leads_ativos_por_corretor'`,
    [JSON.stringify(TETO)],
  );
});

afterAll(async () => {
  await c.query(`ROLLBACK`).catch(() => undefined);
  await comoSuperuser(c);
  if (tetoAntes !== undefined) {
    await c.query(
      `UPDATE public.gestao_config SET valor = $1::jsonb
        WHERE chave = 'capacidade_leads_ativos_por_corretor'`,
      [JSON.stringify(tetoAntes)],
    );
  }
  if (cfgAntes !== undefined) {
    await c.query(
      `UPDATE public.gestao_config SET valor = $1::jsonb WHERE chave = 'em_atendimento'`,
      [JSON.stringify(cfgAntes)],
    );
  }
  await c.query(
    `DELETE FROM public.roleta_participantes WHERE roleta_id IN (SELECT id FROM public.roletas WHERE slug = 'teste-65')`,
  );
  await c.query(`DELETE FROM public.roletas WHERE slug = 'teste-65'`);
  await limparDados(c);
  await c.end();
});

beforeEach(async () => {
  await limparDados(c);
  await comoSuperuser(c);
  if (cfgAntes !== undefined) {
    await c.query(
      `UPDATE public.gestao_config SET valor = $1::jsonb WHERE chave = 'em_atendimento'`,
      [JSON.stringify(cfgAntes)],
    );
  }
  admin = await criarUsuario(c, { nome: "Admin 65", papel: "admin" });
  ana = await criarUsuario(c, { nome: "Ana Corretora", papel: "corretor" });
  bia = await criarUsuario(c, { nome: "Bia Corretora", papel: "corretor" });
  sdr = await criarUsuario(c, { nome: "Sara SDR", papel: "sdr" });
});

type Opts = {
  status?: string;
  dono?: UsuarioTeste | null;
  origem?: string;
  /** Horas desde o último contato real (NULL = nunca). */
  horasSemContato?: number | null;
  cadencia?: string | null;
};

/** Lead com o relógio e a cadência controlados (a atribuição pelo INSERT põe D0). */
async function lead(opts: Opts = {}): Promise<string> {
  const id = await criarLead(c, {
    corretorId: opts.dono === null ? null : (opts.dono ?? ana).id,
    status: opts.status ?? "em_atendimento",
    origem: opts.origem ?? "outro",
  });
  await comoSuperuser(c);
  const horas = opts.horasSemContato === undefined ? 1 : opts.horasSemContato;
  await c.query(
    `UPDATE public.leads
        SET cadencia_etapa   = $2,
            cadencia_prazo_ts = NULL,
            ultimo_contato   = CASE WHEN $3::int IS NULL THEN NULL
                                    ELSE now() - make_interval(hours => $3::int) END,
            ultima_interacao = now()
      WHERE id = $1`,
    [id, opts.cadencia ?? null, horas],
  );
  return id;
}

async function lotar(dono = ana): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < TETO; i++) ids.push(await lead({ dono }));
  return ids;
}

/** A entrada pela ficha, como a tela faz (passo com data no pedido). */
async function entrar(
  como: UsuarioTeste,
  leadId: string,
  opts: { followup?: string | null; acao?: string | null } = {},
) {
  await comoUsuario(c, como.id);
  try {
    await c.query(
      `SELECT public.transicionar_lead($1, 'em_atendimento'::public.lead_status, NULL, $2, $3)`,
      [
        leadId,
        opts.acao === undefined ? "Dar sequência ao atendimento" : opts.acao,
        opts.followup === undefined ? futuro(1) : opts.followup,
      ],
    );
  } finally {
    await comoSuperuser(c);
  }
}

/** A porta em si (_em_atendimento_travar), como o banco a chama para o
 *  corretor dono do lead: cada motivo no seu código, por origem. */
async function porta(
  leadId: string,
  opts: { origem?: string; followup?: string | null } = {},
): Promise<string | null> {
  await comoSuperuser(c);
  return errCode(
    c.query(
      `SELECT public._em_atendimento_travar($1, l.status, l.corretor_id, l.corretor_id, false,
                                            $2::timestamptz, l.cadencia_etapa, $3)
         FROM public.leads AS l WHERE l.id = $1`,
      [leadId, opts.followup === undefined ? futuro(1) : opts.followup, opts.origem ?? "resposta"],
    ),
  );
}

type Contato = {
  ok: true;
  interacao_id: string | null;
  tarefa_id: string | null;
  respondeu: boolean;
  entrou: boolean;
  via: string | null;
  status: string;
  lotado: { em_atendimento?: number; teto?: number; lead_id?: string } | null;
};

/** O contato como a tela registra (registrar_contato_lead). */
async function contato(
  como: UsuarioTeste,
  leadId: string,
  opts: {
    tipo?: string;
    resultado?: string;
    conteudo?: string | null;
    acao?: string | null;
    followup?: string | null;
    titulo?: string | null;
    criarTarefa?: boolean;
  } = {},
): Promise<Contato> {
  return rpc<Contato>(
    como,
    `SELECT public.registrar_contato_lead($1, $2, $3, $4, $5, $6::timestamptz, $7, $8::boolean) AS r`,
    [
      leadId,
      opts.tipo ?? "ligacao",
      opts.resultado ?? "atendeu",
      opts.conteudo ?? null,
      opts.acao === undefined ? "Mandar o book" : opts.acao,
      opts.followup === undefined ? futuro(1) : opts.followup,
      opts.titulo ?? null,
      opts.criarTarefa ?? true,
    ],
  );
}

/** Os contatos da timeline (a "Mudança de status" que a transição grava fica fora). */
async function interacoes(leadId: string) {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT tipo::text AS tipo, titulo, autor_id, metadata
         FROM public.interacoes
        WHERE lead_id = $1 AND deleted_at IS NULL AND tipo <> 'mudanca_status'
        ORDER BY ocorreu_em, id`,
      [leadId],
    )
  ).rows;
}

async function tarefasAbertas(leadId: string) {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT id, titulo, tipo::text AS tipo, prioridade::text AS prioridade, data_vencimento
         FROM public.tarefas
        WHERE lead_id = $1 AND deleted_at IS NULL
          AND status IN ('pendente', 'em_andamento')
        ORDER BY data_vencimento, id`,
      [leadId],
    )
  ).rows;
}

async function comoServico<T>(fn: () => Promise<T>): Promise<T> {
  await c.query(`RESET ROLE`);
  await c.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ role: "service_role" }),
  ]);
  await c.query(`SET ROLE service_role`);
  try {
    return await fn();
  } finally {
    await comoSuperuser(c);
  }
}

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

async function estado(id: string) {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT status::text AS status, corretor_id, sdr_id, cadencia_etapa, proximo_followup, proxima_acao
         FROM public.leads WHERE id = $1`,
      [id],
    )
  ).rows[0];
}

async function interacao(
  leadId: string,
  autor: string | null,
  tipo: string,
  direcao: string,
  horas = 0,
) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, conteudo, ocorreu_em)
     VALUES ($1, $2, $3::public.interacao_tipo, $4::public.interacao_direcao, 'teste',
             now() - make_interval(hours => $5))`,
    [leadId, autor, tipo, direcao, horas],
  );
  // O gatilho de interações move ultimo_contato para "agora": o teste controla
  // o relógio pelo próprio evento, não pelo espelho.
  await c.query(`UPDATE public.leads SET ultimo_contato = NULL WHERE id = $1`, [leadId]);
}

async function ligar(mudar: Record<string, unknown>) {
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.gestao_config SET valor = valor || $1::jsonb WHERE chave = 'em_atendimento'`,
    [JSON.stringify(mudar)],
  );
}

// ---------------------------------------------------------------------------
// 1. A entrada
// ---------------------------------------------------------------------------

describe("a porta de Em atendimento (_em_atendimento_travar): cada motivo no seu código", () => {
  it("sem contato nas últimas 24 h recusa (EA066); com contato passa", async () => {
    const id = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    expect(await porta(id)).toBe("EA066");
    await interacao(id, ana.id, "ligacao", "saida");
    expect(await porta(id)).toBeNull();
  });

  it("contato de 30 horas não vale; de 1 hora vale (ultimo_contato: a cadência grava assim)", async () => {
    const velho = await lead({ status: "aguardando_atendimento", horasSemContato: 30 });
    expect(await porta(velho)).toBe("EA066");
    const recente = await lead({ status: "aguardando_atendimento", horasSemContato: 1 });
    expect(await porta(recente)).toBeNull();
  });

  it("o que conta: cliente escreveu, chamada feita, WhatsApp do corretor; nota e mudança de status não", async () => {
    const porNota = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    await interacao(porNota, ana.id, "nota", "interna");
    await interacao(porNota, null, "mudanca_status", "interna");
    expect(await porta(porNota)).toBe("EA066");

    const escreveu = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    await interacao(escreveu, null, "whatsapp", "entrada");
    expect(await porta(escreveu)).toBeNull();

    const chamada = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.chamadas (lead_id, corretor_id, numero, direcao, status, criado_em)
       VALUES ($1, $2, '11999990000', 'saida', 'atendida', now() - interval '2 hours')`,
      [chamada, ana.id],
    );
    expect(await porta(chamada)).toBeNull();
  });

  it("anti-ioiô: de Aguardando retorno só volta com contato registrado", async () => {
    const id = await lead({ status: "aguardando_retorno", horasSemContato: 48 });
    expect(await porta(id)).toBe("EA066");
    await interacao(id, null, "whatsapp", "entrada");
    expect(await porta(id)).toBeNull();
  });

  it("texto sem data não basta (EA068); tarefa futura existente basta; data no pedido basta", async () => {
    const semData = await lead({ status: "aguardando_atendimento" });
    expect(await porta(semData, { followup: null })).toBe("EA068");

    const comTarefa = await lead({ status: "aguardando_atendimento" });
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.tarefas (lead_id, corretor_id, titulo, tipo, status, prioridade, data_vencimento)
       VALUES ($1, $2, 'Ligar amanhã', 'ligacao', 'pendente', 'alta', now() + interval '1 day')`,
      [comTarefa, ana.id],
    );
    expect(await porta(comTarefa, { followup: null })).toBeNull();

    const comData = await lead({ status: "aguardando_atendimento" });
    expect(await porta(comData, { followup: futuro(2) })).toBeNull();
  });

  it("a ordem das portas: cadência, contato, passo, teto", async () => {
    await lotar();
    const id = await lead({
      status: "aguardando_atendimento",
      cadencia: "D1",
      horasSemContato: null,
    });
    // Pela ficha (origem 'transicao') a cadência vem primeiro.
    expect(await porta(id, { origem: "transicao", followup: null })).toBe("EA067");
    // Pela resposta (registrar_contato_lead) a cadência não é motivo — a
    // resposta é o que a cadência pede; aí o primeiro motivo que o corretor
    // resolve é o contato.
    expect(await porta(id, { followup: null })).toBe("EA066");
    await interacao(id, ana.id, "ligacao", "saida");
    expect(await porta(id, { followup: null })).toBe("EA068");
    expect(await porta(id)).toBe("EA065");
  });

  it("a origem muda o que se exige: troca e cadência não pedem contato; só a ficha pede fora da cadência", async () => {
    await lotar();
    const id = await lead({
      status: "aguardando_atendimento",
      cadencia: "D2",
      horasSemContato: null,
    });
    // 'troca' e 'cadencia' já carregam o contato (a troca registra o seu; a
    // cadência só chama pela resposta): passam direto ao passo e ao teto.
    expect(await porta(id, { origem: "troca", followup: null })).toBe("EA068");
    expect(await porta(id, { origem: "cadencia", followup: null })).toBe("EA068");
    expect(await porta(id, { origem: "troca" })).toBe("EA065");
    expect(await porta(id, { origem: "cadencia" })).toBe("EA065");
    expect(await porta(id, { origem: "ficha" })).toBe("22023");
  });

  it("a porta é do corretor dono: gestão, serviço e SDR na carteira de outro seguem livres", async () => {
    const a = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    await entrar(admin, a);
    expect((await estado(a)).status).toBe("em_atendimento");

    const b = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    await comoServico(async () => {
      await c.query(
        `SELECT public.transicionar_lead($1, 'em_atendimento'::public.lead_status, NULL, 'Serviço', NULL)`,
        [b],
      );
    });
    expect((await estado(b)).status).toBe("em_atendimento");

    // O SDR age na carteira de outro quando o lead é dele (sdr_id).
    const d = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    await c.query(`UPDATE public.leads SET sdr_id = $2 WHERE id = $1`, [d, sdr.id]);
    await entrar(sdr, d);
    expect((await estado(d)).status).toBe("em_atendimento");
  });
});

describe("pela ficha, o corretor dono não escolhe Em atendimento (Fatia 3a.2)", () => {
  it("de nenhum status, mesmo com contato e passo com data: 22023 na matriz, nada muda", async () => {
    for (const status of [
      "novo",
      "aguardando_atendimento",
      "aguardando_retorno",
      "qualificacao_corretor",
      "qualificado",
      "agendado",
      "analise_credito",
    ]) {
      const id = await lead({ status, horasSemContato: 1 });
      expect(await errCode(entrar(ana, id)), status).toBe("22023");
      expect((await estado(id)).status, status).toBe(status);
    }
  });

  it("a matriz diz o mesmo: só a gestão tem Em atendimento como destino", async () => {
    await comoSuperuser(c);
    const r = await c.query(`
      SELECT bool_or(public.transicao_lead_permitida(s, 'em_atendimento', false)) AS corretor,
             bool_and(public.transicao_lead_permitida(s, 'em_atendimento', true)) AS gestao
        FROM unnest(ARRAY['novo','aguardando_corretor','aguardando_atendimento','aguardando_retorno',
                          'qualificacao_corretor','qualificado','agendado','visita_realizada',
                          'proposta_enviada','analise_credito']::public.lead_status[]) AS s`);
    expect(r.rows[0]).toEqual({ corretor: false, gestao: true });
    const fechado = await c.query(
      `SELECT public.transicao_lead_permitida('contrato_fechado', 'em_atendimento', true) AS r`,
    );
    expect(fechado.rows[0].r).toBe(false);
  });
});

describe("entrada em Em atendimento: lead na cadência", () => {
  it("D0–D3 só entra pela Fila do Dia; 'Cliente respondeu' entra e tira da cadência", async () => {
    const id = await lead({ status: "aguardando_atendimento", cadencia: "D1" });
    // Pela ficha o corretor nem chega na porta (Fatia 3a.2: 22023 na matriz);
    // a EA067 fica para quem entra pela porta com origem 'transicao' (acima).
    expect(await errCode(entrar(ana, id))).toBe("22023");
    expect((await estado(id)).cadencia_etapa).toBe("D1");

    // A cadência registra cada tentativa; "respondeu" não repete a exigência
    // de contato (aqui o último contato tem 1 h, mas poderia ser de ontem).
    const r = await rpc(
      ana,
      `SELECT public.cadencia_marcar_respondeu($1, 'Ligar quinta', $2) AS r`,
      [id, futuro(2)],
    );
    expect(r).toMatchObject({ ok: true, etapa_anterior: "D1" });
    expect(await estado(id)).toMatchObject({
      status: "em_atendimento",
      cadencia_etapa: "respondeu",
    });
  });

  it("o teto vale também pela cadência: lotado recebe EA065 e nada muda", async () => {
    await lotar();
    const id = await lead({ status: "aguardando_atendimento", cadencia: "D0" });
    expect(
      await errCode(
        rpc(ana, `SELECT public.cadencia_marcar_respondeu($1, 'Ligar', $2) AS r`, [id, futuro(1)]),
      ),
    ).toBe("EA065");
    expect(await estado(id)).toMatchObject({
      status: "aguardando_atendimento",
      cadencia_etapa: "D0",
    });
  });

  it("gestão move lead em cadência pela ficha (correção de dado)", async () => {
    const id = await lead({
      status: "aguardando_atendimento",
      cadencia: "D2",
      horasSemContato: null,
    });
    await entrar(admin, id);
    expect((await estado(id)).status).toBe("em_atendimento");
  });
});

// ---------------------------------------------------------------------------
// 2. A saída
// ---------------------------------------------------------------------------

describe("saída de Em atendimento só por desfecho", () => {
  const sair = (como: UsuarioTeste, id: string, para: string) =>
    rpc(
      como,
      `SELECT public.transicionar_lead($1, $2::public.lead_status, 'teste', 'Próximo', $3) AS r`,
      [id, para, futuro(1)],
    );

  it("corretor dono: agendado, aguardando_retorno, analise_credito e perdido sim; qualificado, visita, qualificação não", async () => {
    for (const para of ["qualificado", "visita_realizada", "qualificacao_corretor"]) {
      const id = await lead();
      expect(await errCode(sair(ana, id, para))).toBe("22023");
      expect((await estado(id)).status).toBe("em_atendimento");
    }
    for (const para of ["agendado", "aguardando_retorno", "analise_credito"]) {
      const id = await lead();
      await sair(ana, id, para);
      expect((await estado(id)).status).toBe(para);
    }
  });

  it("gestão e SDR (na carteira de outro) mantêm as saídas antigas", async () => {
    const a = await lead();
    await sair(admin, a, "qualificado");
    expect((await estado(a)).status).toBe("qualificado");
    // O SDR entrega o lead que trabalhou (sdr_id): Qualificação Corretor.
    const b = await lead();
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET sdr_id = $2 WHERE id = $1`, [b, sdr.id]);
    await sair(sdr, b, "qualificacao_corretor");
    expect((await estado(b)).status).toBe("qualificacao_corretor");
  });

  it("a matriz do banco e a da tela dizem a mesma coisa para o corretor e para a gestão", async () => {
    await comoSuperuser(c);
    const r = await c.query(`
      SELECT public.transicao_lead_permitida('em_atendimento', 'qualificado', false) AS c_q,
             public.transicao_lead_permitida('em_atendimento', 'qualificado', true)  AS g_q,
             public.transicao_lead_permitida('em_atendimento', 'agendado', false)    AS c_a`);
    expect(r.rows[0]).toEqual({ c_q: false, g_q: true, c_a: true });
  });
});

// ---------------------------------------------------------------------------
// 3. Lead sem corretor não está em atendimento
// ---------------------------------------------------------------------------

describe("lead sem corretor não está em atendimento", () => {
  it("nasce sem dono em Em atendimento: vira Aguardando atendimento", async () => {
    const id = await criarLead(c, { corretorId: null, status: "em_atendimento" });
    expect((await estado(id)).status).toBe("aguardando_atendimento");
  });

  it("perde o dono (Bolsão): sai de Em atendimento no mesmo UPDATE", async () => {
    const id = await lead();
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET corretor_id = NULL WHERE id = $1`, [id]);
    expect(await estado(id)).toMatchObject({ corretor_id: null, status: "aguardando_atendimento" });
  });

  it("lead do SDR (sdr_id) é carteira do SDR: fica em atendimento sem corretor", async () => {
    const id = await lead();
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET corretor_id = NULL, sdr_id = $2 WHERE id = $1`, [
      id,
      sdr.id,
    ]);
    expect(await estado(id)).toMatchObject({ corretor_id: null, status: "em_atendimento" });
  });

  it("serviço (telefonia) passa por Em atendimento em lead sem dono a caminho de agendado", async () => {
    const id = await criarLead(c, { corretorId: null, status: "novo" });
    await comoServico(async () => {
      await c.query(
        `SELECT public.transicionar_lead($1, 'em_atendimento'::public.lead_status, NULL, 'Discador', NULL)`,
        [id],
      );
      expect(
        (await c.query(`SELECT status::text AS s FROM public.leads WHERE id = $1`, [id])).rows[0].s,
      ).toBe("em_atendimento");
      await c.query(
        `SELECT public.transicionar_lead($1, 'agendado'::public.lead_status, NULL, 'Visita', $2)`,
        [id, futuro(2)],
      );
    });
    expect((await estado(id)).status).toBe("agendado");
  });

  it("posse de lead que estava 'em atendimento' sem ninguém entra na Minha base (lote, discador, roleta)", async () => {
    // O estado legado só nasce com o gatilho desligado (é o que a migration limpou).
    await comoSuperuser(c);
    await c.query(`ALTER TABLE public.leads DISABLE TRIGGER trg_zz_em_atendimento_posse`);
    let id: string;
    try {
      id = await criarLead(c, { corretorId: null, status: "em_atendimento" });
    } finally {
      await c.query(`ALTER TABLE public.leads ENABLE TRIGGER trg_zz_em_atendimento_posse`);
    }
    expect((await estado(id)).status).toBe("em_atendimento");
    await c.query(`UPDATE public.leads SET corretor_id = $2 WHERE id = $1`, [id, ana.id]);
    expect(await estado(id)).toMatchObject({
      corretor_id: ana.id,
      status: "aguardando_atendimento",
    });
    // E o lote da Prospecção não entrega lead "em atendimento": o Bolsão não o tem mais.
    const r = await c.query(
      `SELECT count(*)::int AS n FROM public.leads
        WHERE status = 'em_atendimento' AND corretor_id IS NULL AND sdr_id IS NULL`,
    );
    expect(r.rows[0].n).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. A trava da roleta
// ---------------------------------------------------------------------------

describe("trava da roleta (60/150)", () => {
  async function roleta(): Promise<string> {
    await comoSuperuser(c);
    // limparDados não apaga roletas: a fixture é idempotente.
    await c.query(
      `DELETE FROM public.roleta_participantes WHERE roleta_id IN (SELECT id FROM public.roletas WHERE slug = 'teste-65')`,
    );
    const r = await c.query(
      `INSERT INTO public.roletas (slug, nome, exigir_presenca) VALUES ('teste-65', 'Teste 65', false)
       ON CONFLICT (slug) DO UPDATE SET exigir_presenca = false, ativo = true RETURNING slug`,
    );
    await c.query(
      `INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo)
       SELECT id, $1, true FROM public.roletas WHERE slug = 'teste-65'`,
      [ana.id],
    );
    await c.query(`UPDATE public.profiles SET telefone = '11999990000' WHERE id = $1`, [ana.id]);
    return r.rows[0].slug as string;
  }
  const apto = async (slug: string) => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT apto, motivos FROM public._elegibilidade_roleta($1) WHERE corretor_id = $2`,
      [slug, ana.id],
    );
    return r.rows[0] as { apto: boolean; motivos: string[] };
  };

  it("em sombra a trava não existe, mesmo lotado", async () => {
    await lotar();
    await comoSuperuser(c);
    expect(
      (await c.query(`SELECT public._em_atendimento_recebe_lead($1) AS r`, [ana.id])).rows[0].r,
    ).toBe(true);
  });

  it("ligada: 60 em Em atendimento ou 150 na Minha base param a roleta, com o motivo", async () => {
    const slug = await roleta();
    await ligar({ modo: "ligado", trava_roleta: 2, teto_base: 3 });
    expect((await apto(slug)).apto).toBe(true);

    await lead();
    await lead();
    const a = await apto(slug);
    expect(a.apto).toBe(false);
    expect(a.motivos).toContain("regra_65_sem_vaga");

    // Libera Em atendimento, enche a Minha base.
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET status = 'agendado' WHERE corretor_id = $1`, [ana.id]);
    expect((await apto(slug)).apto).toBe(true);
    for (let i = 0; i < 3; i++) await lead({ status: "aguardando_atendimento" });
    expect((await apto(slug)).motivos).toContain("regra_65_sem_vaga");
  });

  it("o contador diz se o corretor recebe lead e conta a Minha base pela mesma função", async () => {
    await ligar({ modo: "ligado", trava_roleta: 2, teto_base: 3 });
    await lead();
    await lead();
    await lead({ status: "aguardando_retorno" });
    const r = await rpc<{ recebe_lead: boolean; minha_base: number; em_atendimento: number }>(
      ana,
      `SELECT public.em_atendimento_contador_v1() AS r`,
    );
    expect(r).toMatchObject({ recebe_lead: false, minha_base: 1, em_atendimento: 2 });
  });
});

// ---------------------------------------------------------------------------
// 5. registrar_contato_lead — o contato é a ação; Em atendimento, a consequência
// ---------------------------------------------------------------------------

describe("registrar_contato_lead", () => {
  it("tentativa (não atendeu): interação e follow-up gravados; a etapa fica", async () => {
    const id = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    const r = await contato(ana, id, { tipo: "whatsapp", resultado: "nao_atendeu" });
    expect(r).toMatchObject({
      ok: true,
      respondeu: false,
      entrou: false,
      via: null,
      status: "aguardando_atendimento",
      lotado: null,
    });
    expect(await interacoes(id)).toEqual([
      {
        tipo: "whatsapp",
        titulo: "Contato — não atendeu",
        autor_id: ana.id,
        metadata: { origem: "registrar_contato", resultado: "nao_atendeu" },
      },
    ]);
    const t = await tarefasAbertas(id);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ id: r.tarefa_id, titulo: "Mandar o book", prioridade: "media" });
    expect((await estado(id)).status).toBe("aguardando_atendimento");
  });

  it("o cliente respondeu antes de Em atendimento: entra, com o passo com data e UMA tarefa (alta)", async () => {
    // Sem contato prévio: a RPC registra o seu na mesma transação, por isso
    // a porta nunca devolve EA066 por aqui.
    const id = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    const r = await contato(ana, id, { conteudo: "Quer ver o decorado sábado" });
    expect(r).toMatchObject({
      respondeu: true,
      entrou: true,
      via: "resposta",
      status: "em_atendimento",
    });
    expect(await estado(id)).toMatchObject({
      status: "em_atendimento",
      proxima_acao: "Mandar o book",
    });
    expect(await interacoes(id)).toEqual([
      {
        tipo: "ligacao",
        titulo: "Contato — atendeu",
        autor_id: ana.id,
        metadata: { origem: "registrar_contato", resultado: "atendeu" },
      },
    ]);
    const t = await tarefasAbertas(id);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({
      id: r.tarefa_id,
      titulo: "Mandar o book",
      tipo: "follow_up",
      prioridade: "alta",
    });
    // A auditoria da transição é do corretor (a consequência corre como ele).
    await comoSuperuser(c);
    const ev = await c.query(
      `SELECT payload->>'de_status' AS de, payload->>'para_status' AS para, payload->>'alterado_por' AS por
         FROM public.lead_eventos WHERE lead_id = $1 AND tipo = 'transicao_lead'`,
      [id],
    );
    expect(ev.rows).toEqual([
      { de: "aguardando_atendimento", para: "em_atendimento", por: ana.id },
    ]);
  });

  it("sem data no pedido, o passo é amanhã (a porta nunca vê EA068 por aqui)", async () => {
    const id = await lead({ status: "novo", horasSemContato: null });
    const r = await contato(ana, id, { followup: null, acao: null });
    expect(r).toMatchObject({ entrou: true, status: "em_atendimento" });
    const e = await estado(id);
    expect(e.proxima_acao).toMatch(/^Follow-up com /);
    const venc = (e.proximo_followup as Date).getTime();
    expect(venc).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
    expect(venc).toBeLessThan(Date.now() + 25 * 60 * 60 * 1000);
  });

  it("'interessado' e 'pediu retorno' também entram; 'sem interesse' não", async () => {
    for (const resultado of ["interessado", "pediu_retorno"]) {
      const id = await lead({ status: "aguardando_retorno", horasSemContato: null });
      expect((await contato(ana, id, { resultado })).entrou, resultado).toBe(true);
      expect((await estado(id)).status, resultado).toBe("em_atendimento");
    }
    const frio = await lead({ status: "aguardando_retorno", horasSemContato: null });
    const r = await contato(ana, frio, { resultado: "sem_interesse" });
    expect(r).toMatchObject({ respondeu: false, entrou: false, status: "aguardando_retorno" });
  });

  it("lead na cadência D0–D3 entra pela Fila do Dia (via 'cadencia') e sai da cadência", async () => {
    const id = await lead({
      status: "aguardando_atendimento",
      cadencia: "D1",
      horasSemContato: null,
    });
    const r = await contato(ana, id, { acao: "Ligar quinta", followup: futuro(2) });
    expect(r).toMatchObject({ entrou: true, via: "cadencia", status: "em_atendimento" });
    expect(await estado(id)).toMatchObject({
      status: "em_atendimento",
      cadencia_etapa: "respondeu",
      proxima_acao: "Ligar quinta",
    });
    // A cadência cria a tarefa do passo; a RPC não cria outra.
    expect(r.tarefa_id).toBeNull();
    expect(await tarefasAbertas(id)).toHaveLength(1);
    // Uma tentativa (não atendeu) na cadência não mexe na etapa nem na
    // cadência — e não cria tarefa: um follow-up com data encerraria a
    // cadência (trg_cadencia_sai_por_tarefa); a régua marca o próximo toque.
    const d2 = await lead({ status: "aguardando_atendimento", cadencia: "D2" });
    const t = await contato(ana, d2, { resultado: "nao_atendeu" });
    expect(t).toMatchObject({ entrou: false, via: null, tarefa_id: null });
    expect(await tarefasAbertas(d2)).toHaveLength(0);
    expect(await interacoes(d2)).toHaveLength(1);
    expect(await estado(d2)).toMatchObject({
      status: "aguardando_atendimento",
      cadencia_etapa: "D2",
    });
  });

  it("já em atendimento ou no fundo do funil: só o contato e o follow-up; a etapa fica", async () => {
    const dentro = await lead();
    const r1 = await contato(ana, dentro);
    expect(r1).toMatchObject({
      respondeu: true,
      entrou: false,
      via: null,
      status: "em_atendimento",
    });
    expect(await tarefasAbertas(dentro)).toHaveLength(1);

    const fundo = await lead({ status: "agendado" });
    const r2 = await contato(ana, fundo);
    expect(r2).toMatchObject({ entrou: false, status: "agendado" });
    expect((await estado(fundo)).status).toBe("agendado");
  });

  it("teto cheio: o contato e o passo ficam gravados, `lotado` volta e a troca faz o resto", async () => {
    const [sai] = await lotar();
    const id = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    const r = await contato(ana, id);
    expect(r).toMatchObject({
      respondeu: true,
      entrou: false,
      via: "resposta",
      status: "aguardando_atendimento",
      lotado: { em_atendimento: TETO, teto: TETO, lead_id: id },
    });
    expect(await interacoes(id)).toHaveLength(1);
    expect(await tarefasAbertas(id)).toHaveLength(1);
    expect((await estado(id)).status).toBe("aguardando_atendimento");
    // Nada de "Em atendimento" na auditoria: a transição não aconteceu.
    await comoSuperuser(c);
    const ev = await c.query(
      `SELECT count(*)::int AS n FROM public.lead_eventos WHERE lead_id = $1 AND tipo = 'transicao_lead'`,
      [id],
    );
    expect(ev.rows[0].n).toBe(0);

    // A janela "entra um, sai um": o contato já está lá, a troca só move.
    await rpc(
      ana,
      `SELECT public.trocar_vaga_em_atendimento($1, $2, 'esfriou', $3, NULL, NULL, NULL, NULL, NULL) AS r`,
      [id, sai, futuro(5)],
    );
    expect((await estado(id)).status).toBe("em_atendimento");
    expect(await interacoes(id)).toHaveLength(1);
  });

  it("a Fila do Dia pede sem tarefa (_criar_tarefa false): nada de tarefa dupla", async () => {
    const id = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    const r = await contato(ana, id, { criarTarefa: false, titulo: "Contato — atendeu · Fila" });
    expect(r).toMatchObject({ entrou: true, tarefa_id: null });
    expect(await tarefasAbertas(id)).toHaveLength(0);
    expect((await interacoes(id))[0].titulo).toBe("Contato — atendeu · Fila");
  });

  it("dedup do passo: follow-up aberto a ±1 dia é atualizado, não duplicado", async () => {
    const id = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    await comoSuperuser(c);
    const existente = (
      await c.query(
        `INSERT INTO public.tarefas (lead_id, corretor_id, titulo, tipo, status, prioridade, data_vencimento)
         VALUES ($1, $2, 'Ligar amanhã', 'follow_up', 'pendente', 'media', now() + interval '1 day')
         RETURNING id`,
        [id, ana.id],
      )
    ).rows[0].id;
    const r = await contato(ana, id, { followup: futuro(1) });
    expect(r.tarefa_id).toBe(existente);
    const t = await tarefasAbertas(id);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ id: existente, titulo: "Mandar o book", prioridade: "alta" });
  });

  it("gestão e SDR registram pelo mesmo caminho (sem a trava do dono)", async () => {
    await lotar();
    const a = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    const r = await contato(admin, a);
    expect(r).toMatchObject({ entrou: true, lotado: null, status: "em_atendimento" });

    const d = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET sdr_id = $2 WHERE id = $1`, [d, sdr.id]);
    expect((await contato(sdr, d)).entrou).toBe(true);
  });

  it("recusas: resultado ou canal inválidos, nota, lead de outro, lead inexistente", async () => {
    const id = await lead({ status: "aguardando_atendimento" });
    expect(await errCode(contato(ana, id, { resultado: "talvez" }))).toBe("22023");
    expect(await errCode(contato(ana, id, { tipo: "pombo" }))).toBe("22023");
    expect(await errCode(contato(ana, id, { tipo: "nota" }))).toBe("22023");
    expect(await errCode(contato(ana, id, { tipo: "mudanca_status" }))).toBe("22023");
    const daBia = await lead({ status: "aguardando_atendimento", dono: bia });
    expect(await errCode(contato(ana, daBia))).toBe("42501");
    // Também a tentativa (sem transição por trás para barrar): a carteira é
    // conferida pela própria RPC, antes de gravar qualquer coisa.
    expect(await errCode(contato(ana, daBia, { resultado: "nao_atendeu" }))).toBe("42501");
    expect(await interacoes(daBia)).toHaveLength(0);
    expect(await errCode(contato(ana, "00000000-0000-4000-8000-000000000000"))).toBe("P0002");
    expect(await interacoes(id)).toHaveLength(0);
  });

  it("depois da troca, quem entra tem o contato registrado pela própria troca", async () => {
    const [sai] = await lotar();
    const entra = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    await rpc(
      ana,
      `SELECT public.trocar_vaga_em_atendimento($1, $2, 'esfriou', $3, NULL, NULL, NULL, NULL, 'ligacao') AS r`,
      [entra, sai, futuro(5)],
    );
    expect((await estado(entra)).status).toBe("em_atendimento");
    await comoSuperuser(c);
    const i = await c.query(
      `SELECT titulo FROM public.interacoes WHERE lead_id = $1 AND tipo = 'ligacao'`,
      [entra],
    );
    expect(i.rows).toEqual([{ titulo: "Contato inicial por ligação" }]);
  });

  it("acesso: a RPC para quem está logado; iniciar_atendimento_lead não existe mais", async () => {
    await comoSuperuser(c);
    const r = await c.query(`
      SELECT has_function_privilege('authenticated',
               'public.registrar_contato_lead(uuid,text,text,text,text,timestamptz,text,boolean)', 'EXECUTE') AS auth,
             has_function_privilege('anon',
               'public.registrar_contato_lead(uuid,text,text,text,text,timestamptz,text,boolean)', 'EXECUTE') AS anon,
             (SELECT count(*)::int FROM pg_proc WHERE proname = 'iniciar_atendimento_lead') AS antiga`);
    expect(r.rows[0]).toEqual({ auth: true, anon: false, antiga: 0 });
  });
});

// ---------------------------------------------------------------------------
// 6. Portal é origem paga
// ---------------------------------------------------------------------------

describe("portal", () => {
  it("é origem paga: volta à roleta e sai do lote da Prospecção", async () => {
    await comoSuperuser(c);
    expect(
      (await c.query(`SELECT public.lead_origem_paga('portal'::public.lead_origem) AS r`)).rows[0]
        .r,
    ).toBe(true);
    const id = await criarLead(c, {
      corretorId: null,
      status: "aguardando_atendimento",
      origem: "portal",
    });
    await c.query(`UPDATE public.leads SET created_at = now() - interval '3 days' WHERE id = $1`, [
      id,
    ]);
    const r = await c.query(
      `SELECT public._prospeccao_lote_elegivel(l, $2, 30) AS r FROM public.leads AS l WHERE l.id = $1`,
      [id, ana.id],
    );
    expect(r.rows[0].r).toBe(false);
  });
});
