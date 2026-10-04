/**
 * REGRA DOS 65 — Fatia 3a: as portas de Em atendimento fechadas no banco
 * (migration 20261010120700, desenho em docs/ops/em-atendimento-teto-65.md §9).
 *
 *  1. ENTRADA pelo próprio corretor dono: lead em cadência só pela Fila do
 *     Dia (EA067); contato registrado nas últimas 24 h (EA066); passo com
 *     DATA (EA068); e o teto (EA065). Gestão, serviço e SDR seguem livres.
 *  2. SAÍDA só por desfecho (corretor dono); gestão e SDR mantêm as antigas.
 *  3. Lead sem corretor não está em atendimento (gatilho); posse de lead
 *     nesse estado entra na Minha base.
 *  4. Trava da roleta (60/150) só com a regra ligada; em sombra, true.
 *  5. iniciar_atendimento_lead: contato + entrada numa transação só.
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

describe("entrada em Em atendimento: contato registrado", () => {
  it("sem contato nas últimas 24 h, a ficha recusa (EA066); com contato, entra", async () => {
    const id = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    expect(await errCode(entrar(ana, id))).toBe("EA066");
    expect((await estado(id)).status).toBe("aguardando_atendimento");

    await interacao(id, ana.id, "ligacao", "saida");
    await entrar(ana, id);
    expect((await estado(id)).status).toBe("em_atendimento");
  });

  it("contato de 30 horas não vale; de 1 hora vale (ultimo_contato: a cadência grava assim)", async () => {
    const velho = await lead({ status: "aguardando_atendimento", horasSemContato: 30 });
    expect(await errCode(entrar(ana, velho))).toBe("EA066");
    const recente = await lead({ status: "aguardando_atendimento", horasSemContato: 1 });
    await entrar(ana, recente);
    expect((await estado(recente)).status).toBe("em_atendimento");
  });

  it("o que conta: cliente escreveu, chamada feita, WhatsApp do corretor; nota e mudança de status não", async () => {
    const porNota = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    await interacao(porNota, ana.id, "nota", "interna");
    await interacao(porNota, null, "mudanca_status", "interna");
    expect(await errCode(entrar(ana, porNota))).toBe("EA066");

    const escreveu = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    await interacao(escreveu, null, "whatsapp", "entrada");
    await entrar(ana, escreveu);
    expect((await estado(escreveu)).status).toBe("em_atendimento");

    const chamada = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.chamadas (lead_id, corretor_id, numero, direcao, status, criado_em)
       VALUES ($1, $2, '11999990000', 'saida', 'atendida', now() - interval '2 hours')`,
      [chamada, ana.id],
    );
    await entrar(ana, chamada);
    expect((await estado(chamada)).status).toBe("em_atendimento");
  });

  it("anti-ioiô: de Aguardando retorno só volta com contato registrado", async () => {
    const id = await lead({ status: "aguardando_retorno", horasSemContato: 48 });
    expect(await errCode(entrar(ana, id))).toBe("EA066");
    await interacao(id, null, "whatsapp", "entrada");
    await entrar(ana, id);
    expect((await estado(id)).status).toBe("em_atendimento");
  });

  it("a exigência é do corretor dono: gestão, serviço e SDR na carteira de outro seguem livres", async () => {
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

describe("entrada em Em atendimento: passo com data", () => {
  it("texto sem data não basta (EA068); tarefa futura existente basta; data no pedido basta", async () => {
    const semData = await lead({ status: "aguardando_atendimento" });
    expect(await errCode(entrar(ana, semData, { followup: null }))).toBe("EA068");

    const comTarefa = await lead({ status: "aguardando_atendimento" });
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.tarefas (lead_id, corretor_id, titulo, tipo, status, prioridade, data_vencimento)
       VALUES ($1, $2, 'Ligar amanhã', 'ligacao', 'pendente', 'alta', now() + interval '1 day')`,
      [comTarefa, ana.id],
    );
    await entrar(ana, comTarefa, { followup: null });
    expect((await estado(comTarefa)).status).toBe("em_atendimento");

    const comData = await lead({ status: "aguardando_atendimento" });
    await entrar(ana, comData, { followup: futuro(2) });
    expect((await estado(comData)).status).toBe("em_atendimento");
  });

  it("a ordem das portas: cadência, contato, passo, teto", async () => {
    await lotar();
    const id = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    // Lotado, sem contato e sem data: o primeiro motivo que o corretor consegue
    // resolver é o contato.
    expect(await errCode(entrar(ana, id, { followup: null }))).toBe("EA066");
    await interacao(id, ana.id, "ligacao", "saida");
    expect(await errCode(entrar(ana, id, { followup: null }))).toBe("EA068");
    expect(await errCode(entrar(ana, id))).toBe("EA065");
  });
});

describe("entrada em Em atendimento: lead na cadência", () => {
  it("D0–D3 só entra pela Fila do Dia (EA067); 'Cliente respondeu' entra e tira da cadência", async () => {
    const id = await lead({ status: "aguardando_atendimento", cadencia: "D1" });
    expect(await errCode(entrar(ana, id))).toBe("EA067");
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
// 5. iniciar_atendimento_lead
// ---------------------------------------------------------------------------

describe("iniciar_atendimento_lead", () => {
  it("registra o contato, entra e cria a tarefa do passo, numa transação", async () => {
    const id = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    await rpc(
      ana,
      `SELECT public.iniciar_atendimento_lead($1, 'whatsapp', 'Mandar o book', $2) AS r`,
      [id, futuro(1)],
    );
    expect(await estado(id)).toMatchObject({
      status: "em_atendimento",
      proxima_acao: "Mandar o book",
    });
    await comoSuperuser(c);
    const i = await c.query(
      `SELECT titulo, autor_id FROM public.interacoes WHERE lead_id = $1 AND tipo = 'whatsapp'`,
      [id],
    );
    expect(i.rows).toEqual([{ titulo: "Contato inicial via WhatsApp", autor_id: ana.id }]);
    const t = await c.query(
      `SELECT titulo FROM public.tarefas WHERE lead_id = $1 AND status = 'pendente' AND deleted_at IS NULL`,
      [id],
    );
    expect(t.rows).toEqual([{ titulo: "Mandar o book" }]);
  });

  it("lotado: EA065 e o contato não fica gravado (nada de toque no lead recusado)", async () => {
    await lotar();
    const id = await lead({ status: "aguardando_atendimento", horasSemContato: null });
    expect(
      await errCode(rpc(ana, `SELECT public.iniciar_atendimento_lead($1, 'ligacao') AS r`, [id])),
    ).toBe("EA065");
    await comoSuperuser(c);
    expect(
      (await c.query(`SELECT count(*)::int AS n FROM public.interacoes WHERE lead_id = $1`, [id]))
        .rows[0].n,
    ).toBe(0);
    expect((await estado(id)).status).toBe("aguardando_atendimento");
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

  it("lead em cadência: a RPC também manda para a Fila do Dia; lead de outro: fora da carteira", async () => {
    const d1 = await lead({ status: "aguardando_atendimento", cadencia: "D1" });
    expect(
      await errCode(rpc(ana, `SELECT public.iniciar_atendimento_lead($1, 'ligacao') AS r`, [d1])),
    ).toBe("EA067");
    const daBia = await lead({ status: "aguardando_atendimento", dono: bia });
    expect(
      await errCode(
        rpc(ana, `SELECT public.iniciar_atendimento_lead($1, 'ligacao') AS r`, [daBia]),
      ),
    ).toBe("42501");
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
