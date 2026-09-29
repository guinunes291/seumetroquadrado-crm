/**
 * LOTE DE PROSPECÇÃO (migration 20261005120000).
 *
 * Decisões do dono: o corretor pede até 30 clientes do Bolsão numa zona, eles
 * entram na cadência, novo lote só quando o anterior zerar, carteira cheia
 * bloqueia (28/09/2026) — e "esses 30 não fazem parte da base ativa do
 * corretor" (29/09/2026).
 *
 * O que está em jogo, na ordem em que quebraria a operação:
 *
 *  1. Quem vem: só Bolsão de verdade, pela zona certa (inclusive a zona que só
 *     o empreendimento sabe), e sempre dentro da cadência. Lead pago, fila da
 *     roleta, lead chegando agora, reserva viva do Discador e exceção em
 *     análise ficam fora.
 *  2. Fora da base ativa: o lote não ocupa vaga dos 65 nem a vaga de entrada
 *     da formação (senão a roleta para de mandar lead pago), não entra no
 *     badge do Modo Foco e vem depois da carteira na Fila do Dia.
 *  3. O SLA de 15 minutos não toma o lote.
 *  4. O que vence volta ao BOLSÃO como estava — nunca para a fila da roleta —
 *     e não volta para quem o deixou vencer.
 *  5. As travas (lote em andamento, carteira cheia, só corretor) e as portas
 *     antigas fechadas.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarEquipe,
  criarLead,
  criarProjeto,
  criarUsuario,
  errCode,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let admin: UsuarioTeste;
let corretor: UsuarioTeste;
let outro: UsuarioTeste;

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
});

afterAll(async () => {
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.cadencia_config SET modo = 'sombra', portas_legadas_bolsao = false WHERE id = 1`,
  );
  await limparDados(c);
  await c.end();
});

beforeEach(async () => {
  await limparDados(c);
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.cadencia_config SET modo = 'ativo', portas_legadas_bolsao = false WHERE id = 1`,
  );
  admin = await criarUsuario(c, { nome: "Admin Lote", papel: "admin" });
  corretor = await criarUsuario(c, { nome: "Corretor Lote", papel: "corretor" });
  outro = await criarUsuario(c, { nome: "Outro Corretor", papel: "corretor" });
});

type Resultado = {
  ok: boolean;
  motivo?: string;
  entregues?: number;
  lote_id?: string;
  zona?: string;
};

type Status = {
  lote_id: string | null;
  entregues: number;
  em_cadencia: number;
  ficaram: number;
  sairam: number;
  em_cadencia_total: number;
  vagas: number;
  pode_pedir: boolean;
  motivo: string | null;
  portas_legadas: boolean;
};

/** Cliente do Bolsão: sem dono, parado há dias, de origem de estoque. */
async function leadBolsao(
  opts: {
    zona?: string | null;
    projetoId?: string | null;
    bairro?: string | null;
    status?: string;
    origem?: string;
    diasCriado?: number;
    parado?: number;
  } = {},
): Promise<string> {
  const id = await criarLead(c, {
    corretorId: null,
    status: opts.status ?? "em_atendimento",
    origem: opts.origem ?? "importacao",
    projetoId: opts.projetoId ?? null,
  });
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.leads
        SET zona = $2, bairro = $3,
            created_at = now() - make_interval(days => $4),
            ultima_interacao = now() - make_interval(days => $5)
      WHERE id = $1`,
    [
      id,
      opts.zona === undefined ? "Leste" : opts.zona,
      opts.bairro ?? null,
      opts.diasCriado ?? 40,
      opts.parado ?? 20,
    ],
  );
  return id;
}

async function pedir(u: UsuarioTeste, zona = "Leste"): Promise<Resultado> {
  await comoUsuario(c, u.id);
  const r = await c.query(`SELECT public.prospeccao_pedir_lote($1) AS r`, [zona]);
  await comoSuperuser(c);
  return r.rows[0].r as Resultado;
}

async function status(u: UsuarioTeste): Promise<Status> {
  await comoUsuario(c, u.id);
  const r = await c.query(`SELECT public.prospeccao_lote_status_v1() AS s`);
  await comoSuperuser(c);
  return r.rows[0].s as Status;
}

async function lead(id: string) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT corretor_id, status::text AS status, cadencia_etapa, classe_lead, via_webhook,
            prospeccao_lote_id, data_distribuicao
       FROM public.leads WHERE id = $1`,
    [id],
  );
  return r.rows[0] as {
    corretor_id: string | null;
    status: string;
    cadencia_etapa: string | null;
    classe_lead: string;
    via_webhook: boolean;
    prospeccao_lote_id: string | null;
    data_distribuicao: Date | null;
  };
}

async function doCorretor(u: UsuarioTeste): Promise<string[]> {
  await comoSuperuser(c);
  const r = await c.query(`SELECT id FROM public.leads WHERE corretor_id = $1 ORDER BY id`, [u.id]);
  return r.rows.map((x) => x.id as string);
}

/** Troca o teto da carteira (chave escalar) e restaura no fim. */
async function comTeto<T>(teto: number, fn: () => Promise<T>): Promise<T> {
  await comoSuperuser(c);
  const antes = (
    await c.query(
      `SELECT valor FROM public.gestao_config WHERE chave = 'capacidade_leads_ativos_por_corretor'`,
    )
  ).rows[0]?.valor;
  await c.query(
    `UPDATE public.gestao_config SET valor = $1::jsonb
      WHERE chave = 'capacidade_leads_ativos_por_corretor'`,
    [JSON.stringify(teto)],
  );
  try {
    return await fn();
  } finally {
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.gestao_config SET valor = $1::jsonb
        WHERE chave = 'capacidade_leads_ativos_por_corretor'`,
      [JSON.stringify(antes ?? 65)],
    );
  }
}

async function vencerPrazo(ids: string[]) {
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.leads SET cadencia_prazo_ts = now() - interval '3 days' WHERE id = ANY($1)`,
    [ids],
  );
}

async function rodarVencidos() {
  await comoSuperuser(c);
  await c.query(`SELECT * FROM public.cadencia_vencidos('ativo')`);
}

// ---------------------------------------------------------------------------
// 1. Quem vem no lote
// ---------------------------------------------------------------------------

describe("quem vem no lote", () => {
  it("entrega até 30, direto em Lead chegou (D0), com a proteção do SLA", async () => {
    for (let i = 0; i < 33; i++) await leadBolsao({ status: i % 2 ? "novo" : "em_atendimento" });

    const r = await pedir(corretor);
    expect(r).toMatchObject({ ok: true, entregues: 30, zona: "Leste" });

    const ids = await doCorretor(corretor);
    expect(ids).toHaveLength(30);
    for (const id of ids) {
      const l = await lead(id);
      expect(l.cadencia_etapa).toBe("D0");
      expect(l.prospeccao_lote_id).toBe(r.lote_id);
      // O SLA de 15 minutos só olha classe 'quente' (motor v2) ou via_webhook
      // (motor v1): com os dois desligados, ninguém toma o lote.
      expect(l.classe_lead).toBe("base");
      expect(l.via_webhook).toBe(false);
      expect(["aguardando_atendimento", "em_atendimento"]).toContain(l.status);
    }

    const s = await status(corretor);
    expect(s).toMatchObject({
      entregues: 30,
      em_cadencia: 30,
      ficaram: 0,
      sairam: 0,
      pode_pedir: false,
      motivo: "lote_em_andamento",
    });
  });

  it("acha a zona pelo lead, pelo bairro e pelo empreendimento ('Zona Leste', 'ZL')", async () => {
    await comoSuperuser(c);
    const bairroLeste = (
      await c.query(`SELECT bairro FROM public.zonas_bairros WHERE zona = 'Leste' LIMIT 1`)
    ).rows[0].bairro as string;
    const projZonaSmq = await criarProjeto(c, { nome: "Residencial Itaquera" });
    const projRegiao = await criarProjeto(c, { nome: "Residencial Penha" });
    const projOeste = await criarProjeto(c, { nome: "Residencial Lapa" });
    await c.query(`UPDATE public.projetos SET zona_smq = 'Zona Leste' WHERE id = $1`, [
      projZonaSmq,
    ]);
    await c.query(`UPDATE public.projetos SET zona_smq = NULL, regiao = 'ZL' WHERE id = $1`, [
      projRegiao,
    ]);
    await c.query(`UPDATE public.projetos SET zona_smq = 'Zona Oeste' WHERE id = $1`, [projOeste]);

    const pelaZona = await leadBolsao({ zona: "Leste" });
    const peloBairro = await leadBolsao({ zona: null, bairro: bairroLeste });
    const peloProjeto = await leadBolsao({ zona: null, projetoId: projZonaSmq });
    const pelaRegiao = await leadBolsao({ zona: null, projetoId: projRegiao });
    await leadBolsao({ zona: null, projetoId: projOeste });
    await leadBolsao({ zona: "Oeste" });

    const r = await pedir(corretor, "Zona Leste");
    expect(r).toMatchObject({ ok: true, entregues: 4, zona: "Leste" });
    expect(await doCorretor(corretor)).toEqual(
      [pelaZona, peloBairro, peloProjeto, pelaRegiao].sort(),
    );
  });

  it("deixa fora o que não é do Bolsão ou não entra na cadência", async () => {
    const sdr = await criarUsuario(c, { nome: "SDR Lote", papel: "sdr" });
    const controle = await leadBolsao({ parado: 200 });

    const pago = await leadBolsao({ origem: "facebook", parado: 300 });
    const filaDaRoleta = await leadBolsao({ status: "aguardando_corretor", parado: 300 });
    const chegandoAgora = await leadBolsao({ status: "novo", diasCriado: 0, parado: 0 });
    const qualificado = await leadBolsao({ status: "qualificado", parado: 300 });
    const qualifCorretor = await leadBolsao({ status: "qualificacao_corretor", parado: 300 });
    // Perdido "sem contato" o Bolsão aceita (dá para retrabalhar), mas a
    // cadência não: fica fora do lote.
    const perdido = await leadBolsao({ parado: 300 });
    const comSdr = await leadBolsao({ parado: 300 });
    const reservadoNoDiscador = await leadBolsao({ parado: 300 });
    const emExcecao = await leadBolsao({ status: "novo", parado: 300 });
    const emDescanso = await leadBolsao({ parado: 300 });
    const devolvidoPorEle = await leadBolsao({ parado: 300 });
    const optOut = await leadBolsao({ parado: 300 });

    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET sdr_id = $2 WHERE id = $1`, [comSdr, sdr.id]);
    await c.query(
      `INSERT INTO public.bolsao_discagem (lead_id, corretor_id, modo, expira_em)
       VALUES ($1, $2, 'um_a_um', now() + interval '2 hours')`,
      [reservadoNoDiscador, outro.id],
    );
    await c.query(
      `INSERT INTO public.distribuicao_excecoes (lead_id, motivo, status)
       VALUES ($1, 'sem_corretor_elegivel', 'pendente')`,
      [emExcecao],
    );
    await c.query(`UPDATE public.leads SET cadencia_etapa = 'descanso' WHERE id = $1`, [
      emDescanso,
    ]);
    await c.query(
      `INSERT INTO public.devolucao_log
         (lote_id, lead_id, corretor_anterior_id, grupo, destino, modo, aplicado)
       VALUES (gen_random_uuid(), $1, $2, 'estoque', 'bolsao', 'ativo', true)`,
      [devolvidoPorEle, corretor.id],
    );
    await c.query(`UPDATE public.leads SET opt_out = true WHERE id = $1`, [optOut]);
    await c.query(
      `UPDATE public.leads
          SET status = 'perdido', motivo_perda_categoria = 'sem_contato', motivo_perdido = 'Sem contato'
        WHERE id = $1`,
      [perdido],
    );
    expect(
      (
        await c.query(`SELECT public._bolsao_elegivel(l) AS b FROM public.leads l WHERE id = $1`, [
          perdido,
        ])
      ).rows[0].b,
    ).toBe(true);

    const r = await pedir(corretor);
    expect(r).toMatchObject({ ok: true, entregues: 1 });
    expect(await doCorretor(corretor)).toEqual([controle]);

    for (const id of [
      pago,
      filaDaRoleta,
      chegandoAgora,
      qualificado,
      qualifCorretor,
      perdido,
      comSdr,
      reservadoNoDiscador,
      emExcecao,
      emDescanso,
      devolvidoPorEle,
      optOut,
    ]) {
      expect((await lead(id)).corretor_id).toBeNull();
    }
  });

  it("zona sem cliente disponível não cria lote; zona inexistente é erro", async () => {
    await leadBolsao({ zona: "Oeste" });
    expect(await pedir(corretor, "Sul")).toMatchObject({ ok: false, motivo: "zona_vazia" });
    await comoSuperuser(c);
    const lotes = await c.query(`SELECT count(*)::int AS n FROM public.prospeccao_lotes`);
    expect(lotes.rows[0].n).toBe(0);

    await comoUsuario(c, corretor.id);
    expect(await errCode(c.query(`SELECT public.prospeccao_pedir_lote('Marte')`))).toBe("22023");
    await comoSuperuser(c);
  });

  it("dois corretores pedindo juntos nunca recebem o mesmo cliente", async () => {
    for (let i = 0; i < 3; i++) await leadBolsao();

    const c2 = novoClient();
    await c2.connect();
    try {
      // O primeiro pedido segura as linhas até o COMMIT; o segundo pula as
      // travadas (SKIP LOCKED) em vez de esperar ou duplicar.
      await comoUsuario(c2, corretor.id);
      await c2.query("BEGIN");
      const r1 = await c2.query(`SELECT public.prospeccao_pedir_lote('Leste') AS r`);
      expect(r1.rows[0].r).toMatchObject({ ok: true, entregues: 3 });

      expect(await pedir(outro)).toMatchObject({ ok: false, motivo: "zona_vazia" });
      await c2.query("COMMIT");
    } finally {
      await c2.end();
    }
    expect(await doCorretor(corretor)).toHaveLength(3);
    expect(await doCorretor(outro)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Fora da base ativa
// ---------------------------------------------------------------------------

describe("o lote fica fora da base ativa do corretor", () => {
  it("não ocupa vaga dos 65 nem a vaga de entrada da formação (a roleta segue mandando)", async () => {
    for (let i = 0; i < 30; i++) await leadBolsao();

    await comoSuperuser(c);
    const antes = await c.query(
      `SELECT public.carteira_vagas_v1($1) AS vagas, public.carteira_vagas_entrada_v1($1) AS entrada`,
      [corretor.id],
    );
    expect(antes.rows[0]).toEqual({ vagas: 65, entrada: 20 });

    expect(await pedir(corretor)).toMatchObject({ ok: true, entregues: 30 });

    const depois = await c.query(
      `SELECT public.carteira_vagas_v1($1) AS vagas, public.carteira_vagas_entrada_v1($1) AS entrada`,
      [corretor.id],
    );
    expect(depois.rows[0]).toEqual({ vagas: 65, entrada: 20 });

    // Um lead pago que chega agora ocupa a formação normalmente.
    await criarLead(c, { corretorId: corretor.id, status: "aguardando_atendimento" });
    await comoUsuario(c, corretor.id);
    const f = await c.query(`SELECT public.carteira_formacao_v1() AS f`);
    await comoSuperuser(c);
    expect(f.rows[0].f).toMatchObject({
      em_formacao: 1,
      em_lote_prospeccao: 30,
      vagas_entrada: 19,
      ocupadas: 0,
    });
  });

  it("o tamanho não depende das vagas: com 1 vaga livre ainda vêm os 30", async () => {
    for (let i = 0; i < 30; i++) await leadBolsao();
    await criarLead(c, { corretorId: corretor.id, status: "agendado" });

    await comTeto(2, async () => {
      expect((await status(corretor)).vagas).toBe(1);
      expect(await pedir(corretor)).toMatchObject({ ok: true, entregues: 30 });
    });
  });

  it("não entra no badge do Modo Foco e vem depois da carteira na Fila do Dia", async () => {
    for (let i = 0; i < 3; i++) await leadBolsao();
    expect(await pedir(corretor)).toMatchObject({ ok: true, entregues: 3 });

    // Um lead da carteira, chegado agora, na mesma etapa (D0) do lote.
    const daCarteira = await criarLead(c, {
      corretorId: corretor.id,
      status: "aguardando_atendimento",
    });

    await comoUsuario(c, corretor.id);
    const nav = await c.query(`SELECT public.nav_pendencias() AS n`);
    expect(nav.rows[0].n.atendimento).toBe(1);

    const fila = await c.query(`SELECT public.cadencia_fila_v1() AS f`);
    await comoSuperuser(c);
    const itens = fila.rows[0].f.itens as { id: string; lote: boolean; etapa: string }[];
    expect(itens).toHaveLength(4);
    expect(itens[0]).toMatchObject({ id: daCarteira, lote: false, etapa: "D0" });
    expect(itens.slice(1).every((i) => i.lote && i.etapa === "D0")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Saídas: respondeu fica, vencido volta ao Bolsão
// ---------------------------------------------------------------------------

describe("as saídas do lote", () => {
  it("quem avança fica com o corretor e libera o próximo lote quando o resto sai", async () => {
    const a = await leadBolsao();
    const b = await leadBolsao();
    expect(await pedir(corretor)).toMatchObject({ ok: true, entregues: 2 });

    // Avançou pela ficha: sai da cadência como 'respondeu' e fica na carteira.
    await c.query(`UPDATE public.leads SET status = 'agendado' WHERE id = $1`, [a]);
    expect(await lead(a)).toMatchObject({ corretor_id: corretor.id, cadencia_etapa: "respondeu" });
    expect(await status(corretor)).toMatchObject({
      em_cadencia: 1,
      ficaram: 1,
      pode_pedir: false,
    });

    // O outro troca de dono (transferência da gestão): o lote o solta.
    await c.query(`UPDATE public.leads SET corretor_id = $2 WHERE id = $1`, [b, outro.id]);
    expect((await lead(b)).prospeccao_lote_id).toBeNull();

    expect(await status(corretor)).toMatchObject({
      entregues: 2,
      em_cadencia: 0,
      ficaram: 1,
      sairam: 1,
      pode_pedir: true,
      motivo: null,
    });
  });

  it("vencido volta ao BOLSÃO como estava (nunca à fila da roleta) e não volta para ele", async () => {
    const eraNovo = await leadBolsao({ status: "novo" });
    const eraAtendimento = await leadBolsao({ status: "em_atendimento" });
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads SET data_distribuicao = '2026-01-10T12:00:00Z', classe_lead = 'quente'
        WHERE id = $1`,
      [eraNovo],
    );
    // Controle: lead da carteira (não é lote) vencido vai para a roleta.
    const controle = await criarLead(c, {
      corretorId: corretor.id,
      status: "aguardando_atendimento",
    });

    const r = await pedir(corretor);
    expect(r).toMatchObject({ ok: true, entregues: 2 });
    expect(await lead(eraNovo)).toMatchObject({ status: "aguardando_atendimento" });

    await vencerPrazo([eraNovo, eraAtendimento, controle]);
    await rodarVencidos();

    const n = await lead(eraNovo);
    expect(n).toMatchObject({
      corretor_id: null,
      status: "novo",
      classe_lead: "quente",
      cadencia_etapa: null,
      prospeccao_lote_id: null,
    });
    expect(n.data_distribuicao?.toISOString()).toBe("2026-01-10T12:00:00.000Z");
    expect(await lead(eraAtendimento)).toMatchObject({
      corretor_id: null,
      status: "em_atendimento",
      // A classe de antes do lote (o padrão da coluna) volta junto.
      classe_lead: "quente",
      cadencia_etapa: null,
    });
    expect(await lead(controle)).toMatchObject({
      corretor_id: null,
      status: "aguardando_corretor",
    });

    await comoSuperuser(c);
    const ev = await c.query(
      `SELECT payload->>'para_estado' AS para FROM public.lead_eventos
        WHERE lead_id = $1 AND tipo = 'cadencia_etapa' ORDER BY created_at DESC LIMIT 1`,
      [eraNovo],
    );
    expect(ev.rows[0].para).toBe("bolsao");
    const log = await c.query(
      `SELECT regra_aplicada FROM public.distribution_log
        WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [eraNovo],
    );
    expect(log.rows[0].regra_aplicada).toBe("lote_prospeccao_etapa_vencida");

    expect(await status(corretor)).toMatchObject({ sairam: 2, pode_pedir: true });

    // Anti-ioiô: quem deixou vencer não recebe de volta; outro corretor sim.
    expect(await pedir(corretor)).toMatchObject({ ok: false, motivo: "zona_vazia" });
    expect(await pedir(outro)).toMatchObject({ ok: true, entregues: 2 });
  });
});

// ---------------------------------------------------------------------------
// 4. Travas
// ---------------------------------------------------------------------------

describe("travas do pedido", () => {
  it("lote em andamento bloqueia o próximo", async () => {
    await leadBolsao();
    await leadBolsao();
    expect(await pedir(corretor)).toMatchObject({ ok: true, entregues: 2 });
    expect(await pedir(corretor)).toMatchObject({ ok: false, motivo: "lote_em_andamento" });
  });

  it("carteira de 65 cheia bloqueia", async () => {
    await leadBolsao();
    await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    await comTeto(1, async () => {
      expect(await status(corretor)).toMatchObject({ vagas: 0, motivo: "carteira_cheia" });
      expect(await pedir(corretor)).toMatchObject({ ok: false, motivo: "carteira_cheia" });
    });
  });

  it("só corretor pede lote", async () => {
    await leadBolsao();
    expect(await pedir(admin)).toMatchObject({ ok: false, motivo: "so_corretor" });
  });
});

// ---------------------------------------------------------------------------
// 5. Portas antigas e o painel da gestão
// ---------------------------------------------------------------------------

describe("portas antigas fechadas para o corretor", () => {
  it("resgate da Reserva e assumir pelo Discador recusam o corretor; a chave religa", async () => {
    const meu = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const doBolsao = await leadBolsao();

    await comoUsuario(c, corretor.id);
    const resg = await c.query(`SELECT public.carteira_resgatar($1) AS r`, [meu]);
    expect(resg.rows[0].r).toMatchObject({ ok: false, motivo: "porta_fechada_use_lote" });
    await comoSuperuser(c);
    const assumir = await c.query(`SELECT public.discador_bolsao_assumir_v1($1, $2) AS r`, [
      doBolsao,
      corretor.id,
    ]);
    expect(assumir.rows[0].r).toMatchObject({ ok: false, motivo: "porta_fechada_use_lote" });

    await c.query(`UPDATE public.cadencia_config SET portas_legadas_bolsao = true WHERE id = 1`);
    await comoUsuario(c, corretor.id);
    const resg2 = await c.query(`SELECT public.carteira_resgatar($1) AS r`, [meu]);
    expect(resg2.rows[0].r).toMatchObject({ ok: true });
    await comoSuperuser(c);
    const assumir2 = await c.query(`SELECT public.discador_bolsao_assumir_v1($1, $2) AS r`, [
      doBolsao,
      corretor.id,
    ]);
    expect(assumir2.rows[0].r).toMatchObject({ ok: true, motivo: "assumido" });
  });

  it("a admissão do estoque diz por que não roda; o ensaio continua", async () => {
    await comoUsuario(c, admin.id);
    expect(await errCode(c.query(`SELECT * FROM public.cadencia_fase0_admitir('ativo')`))).toBe(
      "55000",
    );
    const ensaio = await c.query(`SELECT * FROM public.cadencia_fase0_admitir('sombra')`);
    await comoSuperuser(c);
    expect(ensaio.rows).toHaveLength(1);
    expect(ensaio.rows[0].modo).toBe("sombra");
  });
});

describe("painel dos lotes (gestão)", () => {
  it("o gestor vê os lotes do time, não os de outro time; corretor não abre", async () => {
    const gestor = await criarUsuario(c, { nome: "Gestor Lote", papel: "gestor" });
    const equipe = await criarEquipe(c, { gestorId: gestor.id });
    await c.query(`UPDATE public.profiles SET equipe_id = $2 WHERE id = $1`, [corretor.id, equipe]);
    await leadBolsao();
    await leadBolsao({ zona: "Sul" });
    expect(await pedir(corretor)).toMatchObject({ ok: true });
    expect(await pedir(outro, "Sul")).toMatchObject({ ok: true });

    await comoUsuario(c, gestor.id);
    const r = await c.query(`SELECT * FROM public.prospeccao_lotes_painel_v1()`);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      corretor_id: corretor.id,
      zona: "Leste",
      entregues: 1,
      em_cadencia: 1,
    });

    await comoUsuario(c, admin.id);
    const tudo = await c.query(`SELECT * FROM public.prospeccao_lotes_painel_v1()`);
    expect(tudo.rows).toHaveLength(2);

    await comoUsuario(c, corretor.id);
    expect(await errCode(c.query(`SELECT * FROM public.prospeccao_lotes_painel_v1()`))).toBe(
      "42501",
    );
    await comoSuperuser(c);
  });
});

// ---------------------------------------------------------------------------
// 6. Grande SP, a 6ª zona (migration 20261007120000)
// ---------------------------------------------------------------------------

describe("Grande SP como 6ª zona do lote", () => {
  /** Empreendimento com os quatro campos que a regra da vitrine lê. */
  async function projeto(
    nome: string,
    campos: { zona_smq?: string; regiao?: string; cidade?: string; bairro?: string },
  ) {
    const id = await criarProjeto(c, { nome });
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.projetos SET zona_smq = $2, regiao = $3, cidade = $4, bairro = $5 WHERE id = $1`,
      [
        id,
        campos.zona_smq ?? null,
        campos.regiao ?? null,
        campos.cidade ?? null,
        campos.bairro ?? null,
      ],
    );
    return id;
  }

  it("Guarulhos entra na Grande SP pela regra da vitrine; ABC é Sul; a capital segue igual", async () => {
    // Os dois casos medidos em produção (29/09): Merito e Next Guarulhos.
    const merito = await projeto("Merito Guarulhos", {
      zona_smq: "Grande SP",
      regiao: "Grande SP",
    });
    const next = await projeto("Next Guarulhos", { zona_smq: "Grande SP", regiao: "Norte" });
    const soCidade = await projeto("Parque Guarulhos", { cidade: "Guarulhos" });
    const abc = await projeto("Residencial Santo André", {
      zona_smq: "Grande SP",
      cidade: "Santo André",
    });
    const santana = await projeto("Residencial Santana", {
      zona_smq: "Zona Norte",
      cidade: "São Paulo",
    });

    const doMerito = await leadBolsao({ zona: null, projetoId: merito });
    const doNext = await leadBolsao({ zona: null, projetoId: next });
    const daCidade = await leadBolsao({ zona: null, projetoId: soCidade });
    const doAbc = await leadBolsao({ zona: null, projetoId: abc });
    const deSantana = await leadBolsao({ zona: null, projetoId: santana });

    const r = await pedir(corretor, "Grande SP");
    expect(r).toMatchObject({ ok: true, entregues: 3, zona: "Grande SP" });
    expect(await doCorretor(corretor)).toEqual([doMerito, doNext, daCidade].sort());

    // Zona Norte da capital não recebe Guarulhos (o "Norte" da região do
    // Next perde para a zona SMQ, como na vitrine).
    expect(await pedir(outro, "Norte")).toMatchObject({ ok: true, entregues: 1 });
    expect(await doCorretor(outro)).toEqual([deSantana]);

    const terceiro = await criarUsuario(c, { nome: "Terceiro Corretor", papel: "corretor" });
    expect(await pedir(terceiro, "Sul")).toMatchObject({ ok: true, entregues: 1 });
    expect(await doCorretor(terceiro)).toEqual([doAbc]);

    // O lote guarda a zona como foi pedida; o painel mostra "Grande SP".
    await comoSuperuser(c);
    const lote = await c.query(`SELECT zona FROM public.prospeccao_lotes WHERE id = $1`, [
      r.lote_id,
    ]);
    expect(lote.rows[0].zona).toBe("Grande SP");
  });

  it("a zona do próprio lead vem antes da do empreendimento", async () => {
    const guarulhos = await projeto("Merito Guarulhos", {
      zona_smq: "Grande SP",
      regiao: "Grande SP",
    });
    // O cliente disse que quer a Zona Leste, mesmo tendo vindo do anúncio de
    // Guarulhos: vale o que ele disse.
    const querLeste = await leadBolsao({ zona: "Leste", projetoId: guarulhos });

    expect(await pedir(corretor, "Grande SP")).toMatchObject({ ok: false, motivo: "zona_vazia" });
    expect(await pedir(corretor, "Leste")).toMatchObject({ ok: true, entregues: 1 });
    expect(await doCorretor(corretor)).toEqual([querLeste]);
  });
});
