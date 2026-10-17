/**
 * REPASSE POR SLA DE LEAD DE CAMPANHA — migration 20261009120200.
 *
 * O defeito: o repasse imediato (disparar_repasse_sla_lead) e o cron de leads
 * parados (redistribuir_leads_parados) chamavam a roleta ponderada de lead
 * NOVO para um lead que já tinha dono; ela respondia 'ja_atribuido' e o lead
 * ficava para sempre com quem estourou o SLA. No cron de parados ainda virava
 * laço: sem exceção nem backoff, o mesmo lead voltava a cada minuto.
 *
 * Elenco: Ana (Sul) e Bia (Sul) na campanha `jardim-bf`; Ana e Caio (Leste)
 * na campanha `equipe-guilherme`. Todos presentes. Desde as roletas simples
 * (20261023120000) toda campanha é de equipe fixa (a `jardim-bf`, que era
 * comum, também) e o lead sem zona sem ninguém livre na equipe vai para o
 * rodízio entre as filiais.
 * Desde as roletas por filial (20261018120000) o time da zona é a filial:
 * Ana e Bia na Barra Funda (Oeste, Norte, Sul); Caio na Liberdade e na Belém
 * (Centro, Leste, Grande SP).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarLead,
  criarUsuario,
  darRegiao,
  limparDados,
  novoClient,
  pool,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let admin: UsuarioTeste;
let ana: UsuarioTeste;
let bia: UsuarioTeste;
let caio: UsuarioTeste;
let v2Antes: unknown;

/** Lead de campanha já entregue a `dono`, com o relógio do SLA vencido. */
async function leadDeCampanha(opts: {
  nome: string;
  campanha: string;
  dono: UsuarioTeste;
  zona?: string | null;
  minutosAtras?: number;
}): Promise<string> {
  const id = await criarLead(c, { nome: opts.nome, origem: "outro" });
  await comoSuperuser(c);
  // Estado de partida montado direto (a guarda de zona não é o assunto aqui).
  await c.query(`SET session_replication_role = replica`);
  await c.query(
    `UPDATE public.leads
        SET corretor_id = $2, roleta_slug = $3, zona = $4,
            status = 'aguardando_atendimento', via_webhook = true,
            data_distribuicao = now() - make_interval(mins => $5),
            timestamp_recebimento = now() - make_interval(mins => $5),
            corretores_que_tentaram = ARRAY[$2::uuid]
      WHERE id = $1`,
    [id, opts.dono.id, opts.campanha, opts.zona ?? null, opts.minutosAtras ?? 60],
  );
  await c.query(`SET session_replication_role = DEFAULT`);
  return id;
}

async function lead(id: string) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT corretor_id, corretor_anterior_id, roleta_slug, tentativas_redistribuicao,
            data_distribuicao > now() - interval '1 minute' AS relogio_reiniciado
       FROM public.leads WHERE id = $1`,
    [id],
  );
  return r.rows[0];
}

async function ultimoLog(id: string) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT regra_aplicada, roleta_slug, resultado, tipo::text AS tipo
       FROM public.distribution_log WHERE lead_id = $1
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [id],
  );
  return r.rows[0];
}

async function disparar(id: string, quem: UsuarioTeste) {
  await comoUsuario(c, quem.id);
  const r = await c.query(`SELECT public.disparar_repasse_sla_lead($1) AS ok`, [id]);
  await comoSuperuser(c);
  return r.rows[0].ok as boolean;
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await comoSuperuser(c);
  v2Antes = (
    await c.query(`SELECT valor FROM public.distribuicao_settings WHERE chave = 'modelo_v2_ativo'`)
  ).rows[0]?.valor;
  await c.query(
    `UPDATE public.distribuicao_settings SET valor = 'false'::jsonb WHERE chave = 'modelo_v2_ativo'`,
  );
  await c.query(
    `UPDATE public.distribuicao_settings SET valor = 'true'::jsonb WHERE chave = 'zona_estrita'`,
  );

  admin = await criarUsuario(c, { nome: "Ada Admin", papel: "admin" });
  ana = await criarUsuario(c, { nome: "Ana Sul", papel: "corretor" });
  bia = await criarUsuario(c, { nome: "Bia Sul", papel: "corretor" });
  caio = await criarUsuario(c, { nome: "Caio Leste", papel: "corretor" });
  await comoSuperuser(c);
  for (const [i, u] of [ana, bia, caio].entries()) {
    await c.query(`UPDATE public.profiles SET telefone = $2 WHERE id = $1`, [
      u.id,
      `1197777000${i}`,
    ]);
  }
  await darRegiao(c, ana.id, ["Sul"]);
  await darRegiao(c, bia.id, ["Sul"]);
  await darRegiao(c, caio.id, ["Leste"]);

  await comoUsuario(c, admin.id);
  for (const [slug, quem] of [
    ["jardim-bf", ana],
    ["jardim-bf", bia],
    ["equipe-guilherme", ana],
    ["equipe-guilherme", caio],
  ] as const) {
    await c.query(`SELECT public.gerenciar_participante_roleta($1, $2::uuid, 'incluir')`, [
      slug,
      quem.id,
    ]);
  }
  for (const u of [ana, bia, caio]) {
    await comoUsuario(c, u.id);
    await c.query(`SELECT public.presenca_checkin('loja', 'barra-funda')`);
  }
  await comoSuperuser(c);
});

afterAll(async () => {
  await comoSuperuser(c);
  if (v2Antes !== undefined) {
    await c.query(
      `UPDATE public.distribuicao_settings SET valor = $1::jsonb WHERE chave = 'modelo_v2_ativo'`,
      [JSON.stringify(v2Antes)],
    );
  }
  await limparDados(c);
  await c.end();
  await pool.end();
});

describe("repasse imediato (tela, quando o relógio zera)", () => {
  let id: string;

  it("lead da campanha sai de quem estourou e vai para o colega DA MESMA campanha", async () => {
    id = await leadDeCampanha({ nome: "Sem zona BF", campanha: "jardim-bf", dono: ana });
    expect(await disparar(id, ana)).toBe(true); // antes: false ('ja_atribuido')
    expect(await lead(id)).toMatchObject({
      corretor_id: bia.id,
      corretor_anterior_id: ana.id,
      roleta_slug: "jardim-bf", // o pino da campanha fica
      tentativas_redistribuicao: 1,
      relogio_reiniciado: true, // o SLA da Bia começa agora
    });
    expect(await ultimoLog(id)).toMatchObject({
      regra_aplicada: "repasse_campanha:jardim-bf:tierB",
      roleta_slug: "jardim-bf",
      resultado: "sucesso",
      tipo: "redistribuicao",
    });
  });

  it("sem mais ninguém na campanha, lead sem zona: o rodízio entre as filiais (13/10/2026)", async () => {
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads SET data_distribuicao = now() - interval '1 hour' WHERE id = $1`,
      [id],
    );
    // Ana e Bia (as duas da jardim-bf, e o time da Barra Funda) já tiveram o
    // lead: a Barra Funda é pulada e o Caio, da Liberdade, recebe.
    expect(await disparar(id, bia)).toBe(true);
    expect(await lead(id)).toMatchObject({
      corretor_id: caio.id,
      corretor_anterior_id: bia.id,
      roleta_slug: "filial-liberdade",
    });
  });

  it("ninguém livre em filial nenhuma: fica com o dono atual e a exceção abre (alerta + backoff)", async () => {
    // Lead novo (o anterior já gastou as duas tentativas de repasse): a Ana e
    // o Caio já o tiveram; o dono atual é a Bia.
    const outro = await leadDeCampanha({ nome: "Sem saída BF", campanha: "jardim-bf", dono: bia });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET corretores_que_tentaram = $2 WHERE id = $1`, [
      outro,
      [ana.id, caio.id],
    ]);
    expect(await disparar(outro, bia)).toBe(false);
    expect((await lead(outro)).corretor_id).toBe(bia.id);
    const e = await c.query(
      `SELECT motivo, status FROM public.distribuicao_excecoes WHERE lead_id = $1`,
      [outro],
    );
    expect(e.rows[0]).toEqual({ motivo: "sem_corretor_elegivel", status: "pendente" });
  });
});

describe("cron de leads parados", () => {
  it("equipe fixa: repassa dentro da equipe (Ana → Caio)", async () => {
    const id = await leadDeCampanha({
      nome: "Parado da equipe",
      campanha: "equipe-guilherme",
      dono: ana,
      minutosAtras: 25 * 60,
    });
    await comoSuperuser(c);
    await c.query(`SELECT public.redistribuir_leads_parados()`);
    expect(await lead(id)).toMatchObject({
      corretor_id: caio.id,
      roleta_slug: "equipe-guilherme",
      tentativas_redistribuicao: 1,
    });
  });

  it("lead sem saída não vira laço: depois de 3 tentativas o cron para de mexer nele", async () => {
    // Todos (a jardim-bf e as filiais) já tiveram o lead: ninguém para receber.
    const id = await leadDeCampanha({
      nome: "Parado sem saída",
      campanha: "jardim-bf",
      dono: bia,
      minutosAtras: 25 * 60,
    });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET corretores_que_tentaram = $2 WHERE id = $1`, [
      id,
      [ana.id, bia.id, caio.id],
    ]);
    const tentativasDoLog = async () =>
      (
        await c.query(
          `SELECT count(*)::int AS n FROM public.distribution_log
            WHERE lead_id = $1 AND resultado = 'sem_corretor'`,
          [id],
        )
      ).rows[0].n as number;

    for (let i = 0; i < 5; i++) await c.query(`SELECT public.redistribuir_leads_parados()`);
    // Antes: 5 rodadas = 5 tentativas mudas e o lead de volta na próxima.
    expect(await tentativasDoLog()).toBe(3);
    expect((await lead(id)).corretor_id).toBe(bia.id);
  });
});

describe("repasse respeita a zona estrita", () => {
  it("equipe fixa com lead da Leste: o repasse fica na equipe, de qualquer zona", async () => {
    // Decisão do dono (12/10/2026): na campanha de equipe fixa a campanha
    // manda — o repasse vai para quem está na equipe, mesmo que não atenda a
    // zona (a Ana é da Barra Funda; a guarda de região libera o participante).
    const id = await leadDeCampanha({
      nome: "Leste da equipe",
      campanha: "equipe-guilherme",
      dono: caio,
      zona: "Leste",
    });
    expect(await disparar(id, caio)).toBe(true);
    expect(await lead(id)).toMatchObject({
      corretor_id: ana.id,
      corretor_anterior_id: caio.id,
      roleta_slug: "equipe-guilherme",
    });
  });

  it("não há mais campanha comum: lead da Leste da jardim-bf fica na equipe (Ana → Bia)", async () => {
    // Antes de 13/10 a jardim-bf era comum e o lead ia para o time da zona.
    const id = await leadDeCampanha({
      nome: "Leste da BF",
      campanha: "jardim-bf",
      dono: ana,
      zona: "Leste",
    });
    expect(await disparar(id, ana)).toBe(true);
    expect(await lead(id)).toMatchObject({ corretor_id: bia.id, roleta_slug: "jardim-bf" });
  });

  it("campanha desligada: o repasse cai na triagem normal em vez de travar", async () => {
    await comoSuperuser(c);
    await c.query(`UPDATE public.roletas SET ativo = false WHERE slug = 'jardim-bf'`);
    try {
      const id = await leadDeCampanha({
        nome: "Sul da BF desligada",
        campanha: "jardim-bf",
        dono: ana,
        zona: "Sul",
      });
      expect(await disparar(id, ana)).toBe(true);
      expect(await lead(id)).toMatchObject({
        corretor_id: bia.id,
        roleta_slug: "filial-barra-funda",
      });
    } finally {
      await comoSuperuser(c);
      await c.query(`UPDATE public.roletas SET ativo = true WHERE slug = 'jardim-bf'`);
    }
  });
});
