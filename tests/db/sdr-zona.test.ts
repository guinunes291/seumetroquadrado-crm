/**
 * SDR — zona de interesse obrigatória no registro (migration 20261010120900).
 *
 * Decisão do dono (05/10/2026): o lead que vem agendado ou com análise do SDR
 * precisa da zona em que o cliente tem interesse, escolhida no registro, para
 * ser entregue a corretores que atendem aquela zona.
 *
 *  1. agendar_visita_sdr / entregar_lead_sdr sem zona resolvível: SMQZ2 e
 *     nada gravado (sem agendamento, sem log, lead continua na base);
 *  2. com `_zona`: canoniza, grava em leads.zona e a roleta entrega só a quem
 *     atende a zona (quem está na frente do rodízio mas é de outra zona é
 *     pulado); zona inválida é 22023;
 *  3. bairro mapeado (zonas_bairros) resolve a zona sem escolha explícita;
 *  4. a visita pelo modal comum num lead da base do SDR exige a zona da ficha;
 *  5. a exigência vale com a zona estrita desligada (a zona é dado do SDR);
 *  6. acesso: anon sem EXECUTE; assinaturas antigas não existem.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarUsuario,
  darRegiao,
  errCode,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();
let admin: UsuarioTeste;
let sdr: UsuarioTeste;
let ana: UsuarioTeste; // atende Leste
let bia: UsuarioTeste; // atende Sul, na frente do rodízio
let roletaId: string;
let zonaEstritaAntes: unknown;

const futuro = (dias: number) => new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();
// Cada visita num horário próprio: a Ana só atende Leste e a roleta pula
// quem tem conflito de agenda no horário pedido.
let horario = 0;
const proximoHorario = () =>
  new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + ++horario * 2 * 60 * 60 * 1000).toISOString();

async function setFlag(chave: string, valor: unknown) {
  await comoSuperuser(c);
  await c.query(`UPDATE public.distribuicao_settings SET valor = $1::jsonb WHERE chave = $2`, [
    JSON.stringify(valor),
    chave,
  ]);
}

/** Lead criado pelo SDR: nasce na base dele (sdr_id), sem corretor. */
async function leadDoSdr(opts: { bairro?: string | null; emAtendimento?: boolean } = {}) {
  await comoUsuario(c, sdr.id);
  const r = await c.query(
    `INSERT INTO public.leads (nome, telefone, origem, status, bairro)
     VALUES ('Cliente Zona', '1198' || lpad((random() * 9999999)::int::text, 7, '0'), 'outro', 'novo', $1)
     RETURNING id`,
    [opts.bairro ?? null],
  );
  const id = r.rows[0].id as string;
  if (opts.emAtendimento) {
    await c.query(
      `SELECT public.transicionar_lead($1, 'em_atendimento', NULL, 'Ligar e qualificar')`,
      [id],
    );
  }
  await comoSuperuser(c);
  return id;
}

async function estado(id: string) {
  await comoSuperuser(c);
  const l = (
    await c.query(
      `SELECT status::text AS status, zona, corretor_id, sdr_entregue_em FROM public.leads WHERE id = $1`,
      [id],
    )
  ).rows[0];
  const ag = (
    await c.query(`SELECT count(*)::int AS n FROM public.agendamentos WHERE lead_id = $1`, [id])
  ).rows[0].n as number;
  const log = (
    await c.query(`SELECT count(*)::int AS n FROM public.distribution_log WHERE lead_id = $1`, [id])
  ).rows[0].n as number;
  return { ...l, agendamentos: ag, logs: log };
}

async function agendar(id: string, zona: string | null) {
  await comoUsuario(c, sdr.id);
  try {
    return (
      await c.query(
        `SELECT public.agendar_visita_sdr($1, $2::timestamptz, NULL, NULL, 'Estande', NULL, NULL, $3) AS res`,
        [id, proximoHorario(), zona],
      )
    ).rows[0].res as Record<string, unknown>;
  } finally {
    await comoSuperuser(c);
  }
}

async function entregar(id: string, zona: string | null) {
  await comoUsuario(c, sdr.id);
  try {
    return (
      await c.query(
        `SELECT public.entregar_lead_sdr($1, 'Cliente com documentos em mãos', $2) AS res`,
        [id, zona],
      )
    ).rows[0].res as Record<string, unknown>;
  } finally {
    await comoSuperuser(c);
  }
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await comoSuperuser(c);
  zonaEstritaAntes = (
    await c.query(`SELECT valor FROM public.distribuicao_settings WHERE chave = 'zona_estrita'`)
  ).rows[0]?.valor;
  await setFlag("zona_estrita", true);
  await setFlag("sdr_ativo", true);
  admin = await criarUsuario(c, { nome: "Admin Zona", papel: "admin" });
  sdr = await criarUsuario(c, { nome: "Carla SDR", papel: "sdr" });
  ana = await criarUsuario(c, { nome: "Ana Leste", papel: "corretor" });
  bia = await criarUsuario(c, { nome: "Bia Sul", papel: "corretor" });
  for (const [u, tel] of [
    [ana, "11999990001"],
    [bia, "11999990002"],
  ] as const) {
    await c.query(`UPDATE public.profiles SET telefone = $2, ativo = true WHERE id = $1`, [
      u.id,
      tel,
    ]);
  }
  await darRegiao(c, ana.id, ["Leste"]);
  await darRegiao(c, bia.id, ["Sul"]);
  roletaId = (await c.query(`SELECT id FROM public.roletas WHERE slug = 'agendados-sdr'`)).rows[0]
    .id as string;
  // Bia entra primeiro: sem o filtro de zona, o rodízio a escolheria.
  await c.query(
    `INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo, incluido_por, incluido_em)
     VALUES ($1, $2, true, $3, now() - interval '2 days'), ($1, $4, true, $3, now() - interval '1 day')`,
    [roletaId, bia.id, admin.id, ana.id],
  );
});

afterAll(async () => {
  await c.query(`ROLLBACK`).catch(() => undefined);
  await setFlag("sdr_ativo", false);
  if (zonaEstritaAntes !== undefined) await setFlag("zona_estrita", zonaEstritaAntes);
  await comoSuperuser(c);
  await c.query(`DELETE FROM public.roleta_participantes WHERE roleta_id = $1`, [roletaId]);
  await limparDados(c);
  await c.end();
});

beforeEach(async () => {
  await setFlag("zona_estrita", true);
});

describe("agendar visita: a zona é obrigatória", () => {
  it("sem zona resolvível recusa (SMQZ2) e nada é gravado", async () => {
    const id = await leadDoSdr();
    expect(await errCode(agendar(id, null))).toBe("SMQZ2");
    expect(await estado(id)).toMatchObject({
      status: "aguardando_atendimento",
      zona: null,
      corretor_id: null,
      sdr_entregue_em: null,
      agendamentos: 0,
      logs: 0,
    });
  });

  it("a mensagem diz o que fazer, e o DETAIL aponta o campo", async () => {
    const id = await leadDoSdr();
    await comoUsuario(c, sdr.id);
    const e = await agendar(id, null).then(
      () => null,
      (err: { message: string; detail?: string }) => err,
    );
    expect(e?.message).toMatch(/zona em que o cliente tem interesse/);
    expect(e?.message).toMatch(/Norte, Sul, Leste, Oeste, Centro ou Grande SP/);
    expect(JSON.parse(e?.detail ?? "{}")).toMatchObject({ lead_id: id, campo: "zona" });
  });

  it("com a zona escolhida: canoniza, grava na ficha e entrega a quem atende a zona", async () => {
    const id = await leadDoSdr();
    const res = await agendar(id, "Zona Leste");
    expect(res).toMatchObject({ ok: true, corretor_id: ana.id, regra: "roleta_sdr" });
    // A Bia estava na frente do rodízio, mas é da Sul: foi pulada.
    expect(await estado(id)).toMatchObject({
      status: "agendado",
      zona: "Leste",
      corretor_id: ana.id,
      agendamentos: 1,
    });
  });

  it("a zona escolhida vale mais que a da ficha: Sul na ficha, Leste no registro → Leste", async () => {
    const id = await leadDoSdr();
    await c.query(`UPDATE public.leads SET zona = 'Sul' WHERE id = $1`, [id]);
    const res = await agendar(id, "Leste");
    expect(res).toMatchObject({ ok: true, corretor_id: ana.id });
    expect((await estado(id)).zona).toBe("Leste");
  });

  it("zona inválida: 22023 e nada gravado", async () => {
    const id = await leadDoSdr();
    expect(await errCode(agendar(id, "Marte"))).toBe("22023");
    expect(await estado(id)).toMatchObject({ zona: null, agendamentos: 0, logs: 0 });
  });

  it("bairro mapeado resolve a zona sem escolha explícita (Água Rasa → Leste)", async () => {
    const id = await leadDoSdr({ bairro: "Água Rasa" });
    const res = await agendar(id, null);
    expect(res).toMatchObject({ ok: true, corretor_id: ana.id });
  });

  it("ninguém da zona na roleta de agendados: vai ao time da zona, nunca a outra zona", async () => {
    // Centro: ninguém dos agendados atende; o time da zona (roleta zona-centro)
    // também está vazio → o SDR recebe o motivo e o lead fica na base. A RPC
    // falha inteira: nem a zona escolhida fica (o SDR escolhe de novo).
    const id = await leadDoSdr();
    const e = await agendar(id, "Centro").then(
      () => null,
      (err: { code?: string; message: string }) => err,
    );
    expect(e?.code).toBe("22023");
    expect(e?.message).toMatch(/nenhum corretor apto/);
    expect(e?.message).toMatch(/sem_corretor_na_zona/);
    expect(await estado(id)).toMatchObject({ zona: null, corretor_id: null, agendamentos: 0 });
  });
});

describe("entregar ao corretor: a mesma exigência", () => {
  it("sem zona: SMQZ2, lead continua na base; com zona: Qualificação Corretor com quem atende", async () => {
    const id = await leadDoSdr({ emAtendimento: true });
    expect(await errCode(entregar(id, null))).toBe("SMQZ2");
    expect(await estado(id)).toMatchObject({
      status: "em_atendimento",
      corretor_id: null,
      sdr_entregue_em: null,
      logs: 0,
    });
    const res = await entregar(id, "ABC"); // ABC conta como Sul (decisão de 28/09)
    expect(res).toMatchObject({ ok: true, corretor_id: bia.id });
    expect(await estado(id)).toMatchObject({
      status: "qualificacao_corretor",
      zona: "Sul",
      corretor_id: bia.id,
    });
  });
});

describe("visita pelo modal comum (trigger em agendamentos)", () => {
  async function visitaPeloModal(leadId: string) {
    await comoUsuario(c, sdr.id);
    try {
      return (
        await c.query(
          `INSERT INTO public.agendamentos
             (lead_id, corretor_id, criado_por_id, tipo, status, titulo, local, data_inicio, data_fim)
           VALUES ($1, $2, $2, 'visita', 'agendado', 'Visita', 'Estande',
                   now() + interval '48 hours', now() + interval '49 hours')
           RETURNING corretor_id`,
          [leadId, sdr.id],
        )
      ).rows[0].corretor_id as string;
    } finally {
      await comoSuperuser(c);
    }
  }

  it("lead da base do SDR sem zona na ficha: a visita não nasce (SMQZ2); com zona, nasce no nome de quem atende", async () => {
    const semZona = await leadDoSdr({ emAtendimento: true });
    expect(await errCode(visitaPeloModal(semZona))).toBe("SMQZ2");
    expect(await estado(semZona)).toMatchObject({ corretor_id: null, agendamentos: 0 });

    const comZona = await leadDoSdr({ emAtendimento: true });
    await c.query(`UPDATE public.leads SET zona = 'Leste' WHERE id = $1`, [comZona]);
    expect(await visitaPeloModal(comZona)).toBe(ana.id);
    expect(await estado(comZona)).toMatchObject({ corretor_id: ana.id, agendamentos: 1 });
  });
});

describe("a exigência não depende da zona estrita", () => {
  it("com a zona estrita desligada, o SDR continua tendo de informar a zona", async () => {
    await setFlag("zona_estrita", false);
    const id = await leadDoSdr();
    expect(await errCode(agendar(id, null))).toBe("SMQZ2");
    // Com a zona, entra — e a zona fica gravada para quando a régua religar.
    const res = await agendar(id, "Norte");
    expect(res).toMatchObject({ ok: true });
    expect((await estado(id)).zona).toBe("Norte");
  });
});

describe("acesso", () => {
  it("anon não executa; as assinaturas antigas não existem; a exigência é interna", async () => {
    await comoSuperuser(c);
    const r = await c.query(`
      SELECT
        has_function_privilege('anon', 'public.agendar_visita_sdr(uuid,timestamptz,timestamptz,text,text,text,text,text)', 'EXECUTE') AS anon_agendar,
        has_function_privilege('authenticated', 'public.agendar_visita_sdr(uuid,timestamptz,timestamptz,text,text,text,text,text)', 'EXECUTE') AS auth_agendar,
        has_function_privilege('anon', 'public.entregar_lead_sdr(uuid,text,text)', 'EXECUTE') AS anon_entregar,
        has_function_privilege('authenticated', 'public.entregar_lead_sdr(uuid,text,text)', 'EXECUTE') AS auth_entregar,
        has_function_privilege('authenticated', 'public._sdr_exigir_zona(uuid,text)', 'EXECUTE') AS auth_exigir,
        to_regprocedure('public.agendar_visita_sdr(uuid,timestamptz,timestamptz,text,text,text,text)') IS NULL AS agendar_antiga_sumiu,
        to_regprocedure('public.entregar_lead_sdr(uuid,text)') IS NULL AS entregar_antiga_sumiu
    `);
    expect(r.rows[0]).toEqual({
      anon_agendar: false,
      auth_agendar: true,
      anon_entregar: false,
      auth_entregar: true,
      auth_exigir: false,
      agendar_antiga_sumiu: true,
      entregar_antiga_sumiu: true,
    });
  });
});
