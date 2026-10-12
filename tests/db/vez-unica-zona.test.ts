/**
 * A vez é uma só: o mesmo corretor não é o 1º da fila em mais de uma zona
 * (migration 20261017120000, chave distribuicao_settings.vez_unica_por_zona).
 *
 * Pedido do dono (11/10/2026): "o mesmo corretor não pode ficar em primeiro
 * em mais de uma Zona, exemplo, Igor Nigro está em primeiro na roleta Sul e
 * Leste". Vale para os Agendados do SDR e para as roletas de zona.
 *
 * A regra: as zonas são olhadas da mais movimentada (leads entregues na zona
 * nos 30 dias anteriores ao começo desta semana, pelos motores que gravam o
 * contexto da decisão — janela congelada: a ordem não muda dentro da semana)
 * para a menos, com a ordem canônica no empate; zona a zona,
 * o 1º é o primeiro da fila que ainda não é o 1º de uma zona anterior. Quem
 * já é o 1º de uma zona anterior sai da fila das outras ("vez no Sul"). Se a
 * regra pulasse todo mundo, a fila fica como estava: a vez nunca segura o
 * lead. A prova é sempre a mesma: a fila prevista bate com quem o motor
 * entrega.
 *
 * Desde as roletas por filial (20261018120000, decisões do dono de
 * 12/10/2026) a unidade da regra depende da família: nos Agendados do SDR
 * continua a ZONA (a visita tem zona); nas roletas de filial é a ROLETA (a
 * fila da Belém é a mesma para a Leste e a Grande SP), e "vez em" diz a
 * filial ("vez na Barra Funda"). A cobertura do rodízio entre as filiais da
 * Leste está em roletas-por-filial.test.ts; aqui as provas de filial usam
 * Sul (Barra Funda) e Centro (Liberdade), zonas de uma filial só.
 *
 * Elenco: Igor (Sul e Leste → Barra Funda, Liberdade e Belém), Ana (Sul →
 * Barra Funda), Gra (Leste → Liberdade e Belém) — todos na roleta do SDR e
 * nas roletas das próprias filiais, com check-in e telefone.
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
  type UsuarioTeste,
} from "./helpers";

type Pessoa = {
  posicao?: number;
  corretor_id: string;
  nome: string;
  motivos?: string[];
  vez_em?: string;
};
type FilaRoleta = {
  slug: string;
  papel: string;
  vez_unica?: boolean;
  fila: Pessoa[];
  fora: Pessoa[];
};
type Filas = { zona: string | null; roletas: FilaRoleta[] };
type MinhaPosicao = {
  slug: string;
  zona: string | null;
  posicao: number | null;
  total: number;
  apto: boolean;
  motivos: string[];
  vez_em: string | null;
};

const c = novoClient();
const settingsAntes = new Map<string, unknown>();

let sdr: UsuarioTeste;
let igor: UsuarioTeste;
let ana: UsuarioTeste;
let gra: UsuarioTeste;

const DIA = 24 * 60 * 60 * 1000;
let horario = 0;
const proximoHorario = () =>
  new Date(Date.now() + 3 * DIA + ++horario * 3 * 60 * 60 * 1000).toISOString();
let tel = 0;
const novoTelefone = () => `1197${String(3000000 + ++tel).slice(-7)}`;

async function setSetting(chave: string, valor: unknown) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.distribuicao_settings (chave, valor) VALUES ($1, $2::jsonb)
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
    [chave, JSON.stringify(valor)],
  );
}

async function checkin(u: UsuarioTeste) {
  await comoUsuario(c, u.id);
  await c.query(`SELECT public.presenca_checkin('loja', 'barra-funda')`);
  await comoSuperuser(c);
}

async function filas(zona: string): Promise<Filas> {
  await comoUsuario(c, sdr.id);
  try {
    return (await c.query(`SELECT public.roletas_filas_zona_v1($1) AS r`, [zona])).rows[0]
      .r as Filas;
  } finally {
    await comoSuperuser(c);
  }
}

async function minhas(u: UsuarioTeste): Promise<MinhaPosicao[]> {
  await comoUsuario(c, u.id);
  try {
    return (await c.query(`SELECT public.minhas_posicoes_roletas_v1() AS r`)).rows[0]
      .r as MinhaPosicao[];
  } finally {
    await comoSuperuser(c);
  }
}

function roleta(f: Filas, slug: string): FilaRoleta {
  const r = f.roletas.find((x) => x.slug === slug);
  if (!r) throw new Error(`roleta ${slug} fora da resposta`);
  return r;
}
const ids = (xs: Pessoa[]) => xs.map((x) => x.corretor_id);

async function roletaId(slug: string): Promise<string> {
  await comoSuperuser(c);
  return (await c.query(`SELECT id FROM public.roletas WHERE slug = $1`, [slug])).rows[0]
    .id as string;
}

/** Entra (ou volta) na roleta com o cursor zerado; incluído há N horas. */
async function participar(slug: string, u: UsuarioTeste, incluidoHaHoras: number) {
  const rid = await roletaId(slug);
  await c.query(
    `INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo, tier, ultimo_lead_em, incluido_em, wrr_current)
     VALUES ($1, $2, true, 'B', NULL, now() - make_interval(hours => $3::int), 0)
     ON CONFLICT (roleta_id, corretor_id) DO UPDATE
       SET ativo = true, ultimo_lead_em = NULL, incluido_em = EXCLUDED.incluido_em, wrr_current = 0`,
    [rid, u.id, incluidoHaHoras],
  );
}

async function sair(slug: string, u: UsuarioTeste) {
  const rid = await roletaId(slug);
  await c.query(
    `UPDATE public.roleta_participantes SET ativo = false WHERE roleta_id = $1 AND corretor_id = $2`,
    [rid, u.id],
  );
}

/** Zera os cursores de todo mundo nas roletas da prova (e o rodízio entre filiais). */
async function zerarCursores() {
  await participar("agendados-sdr", igor, 5);
  await participar("agendados-sdr", ana, 4);
  await participar("agendados-sdr", gra, 3);
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.roleta_participantes rp SET ultimo_lead_em = NULL, wrr_current = 0
       FROM public.roletas r WHERE r.id = rp.roleta_id AND r.tipo = 'zona'`,
  );
  await c.query(`UPDATE public.zonas_roletas SET ultimo_lead_em = NULL`);
}

type Entrega = { corretor_id: string; regra: string; lead_id?: string };

/** Visita passada pelo SDR na zona: devolve quem recebeu. */
async function visitaDoSdr(zona: string): Promise<Entrega> {
  await comoUsuario(c, sdr.id);
  try {
    const res = (
      await c.query(`SELECT public.sdr_passar_cliente($1::jsonb) AS res`, [
        JSON.stringify({
          modo: "visita",
          nome: `Cliente ${zona} ${++horario}`,
          telefone: novoTelefone(),
          renda: "3.200",
          tipo_renda: "CLT",
          fgts: "sim",
          decisor: "Sozinho",
          restricao_cpf: "nao",
          zona,
          local: "Estande Penha",
          inicio: proximoHorario(),
        }),
      ])
    ).rows[0].res as Entrega;
    return res;
  } finally {
    await comoSuperuser(c);
  }
}

/** Lead da zona ainda sem dono; `tentaram`: quem já teve o lead (redistribuição). */
async function novoLeadDaZona(zona: string, tentaram: string[] = []): Promise<string> {
  const id = await criarLead(c, { telefone: novoTelefone() });
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.leads SET zona = $2, corretores_que_tentaram = $3::uuid[] WHERE id = $1`,
    [id, zona, tentaram],
  );
  return id;
}

/** Lead da zona pela roleta da zona (_distribuir_lead_v3): quem recebeu. */
async function leadDaZona(
  zona: string,
  tentaram: string[] = [],
): Promise<{ corretor_id: string | null; lead_id: string }> {
  const id = await novoLeadDaZona(zona, tentaram);
  await c.query(`SELECT public.triar_e_distribuir_lead($1::uuid, 'teste')`, [id]);
  const dono = (await c.query(`SELECT corretor_id FROM public.leads WHERE id = $1`, [id])).rows[0]
    .corretor_id as string | null;
  return { corretor_id: dono, lead_id: id };
}

type Decisao = { ok: boolean; corretor_id?: string | null; motivo?: string; regra?: string };

/**
 * Dois leads da mesma zona entregues ao mesmo tempo, em duas conexões: A
 * entrega l1 e segura a transação; B entrega l2 enquanto isso. Diz se B ficou
 * esperando o COMMIT de A (o rodízio serializado) ou terminou antes.
 */
async function corrida(l1: string, l2: string) {
  const a = novoClient();
  const b = novoClient();
  await a.connect();
  await b.connect();
  try {
    await a.query("BEGIN");
    const ra = (
      await a.query(`SELECT public.triar_e_distribuir_lead($1::uuid, 'teste') AS r`, [l1])
    ).rows[0].r as Decisao;
    const pb = b.query(`SELECT public.triar_e_distribuir_lead($1::uuid, 'teste') AS r`, [l2]);
    const bAntesDoCommit = await Promise.race([
      pb.then(() => "terminou"),
      new Promise<string>((r) => setTimeout(() => r("esperando"), 400)),
    ]);
    await a.query("COMMIT");
    const rb = (await pb).rows[0].r as Decisao;
    return { ra, rb, bAntesDoCommit };
  } finally {
    await a.end();
    await b.end();
  }
}

/** As zonas na ordem em que a vez única do SDR as olha (unidade = zona). */
async function ordemDasZonas(): Promise<string[]> {
  await comoSuperuser(c);
  return (
    await c.query(`SELECT unidade FROM public._vez_unica_unidades('sdr') ORDER BY ordem`)
  ).rows.map((r) => r.unidade as string);
}

/** O contexto da última decisão de sucesso de um lead. */
async function contexto(leadId: string): Promise<Record<string, unknown>> {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT x.contexto FROM public.distribuicao_log_contexto x
         JOIN public.distribution_log dl ON dl.id = x.log_id
        WHERE dl.lead_id = $1 AND dl.resultado = 'sucesso'
        ORDER BY dl.created_at DESC LIMIT 1`,
      [leadId],
    )
  ).rows[0].contexto as Record<string, unknown>;
}

/**
 * Leads entregues na zona na semana passada (8 dias atrás: dentro dos 30 dias
 * anteriores ao começo desta semana), para ela ficar a mais movimentada. É o
 * volume TOTAL que ordena as zonas, e a janela é congelada por semana: as
 * entregas que a própria prova faz (desta semana) não contam. Cada cenário
 * seeda o movimento que quer. Conta para a ordem do SDR (zona do contexto);
 * pela roleta do SDR, não mexe na ordem das filiais.
 */
async function movimentar(zona: string, n: number) {
  await comoSuperuser(c);
  for (let i = 0; i < n; i++) {
    const id = await criarLead(c, { telefone: novoTelefone() });
    await comoSuperuser(c);
    const r = await c.query(
      `INSERT INTO public.distribution_log
         (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado, created_at)
       VALUES ($1, $2, 'automatica', 'teste vez única', 'agendados-sdr', 'roleta_sdr', 'sucesso',
               now() - interval '8 days')
       RETURNING id`,
      [id, ana.id],
    );
    await c.query(
      `INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES ($1, $2::jsonb)`,
      [r.rows[0].id, JSON.stringify({ zona, teste: "vez única" })],
    );
  }
}

/**
 * Leads entregues pela roleta de filial na semana passada: a ordem das
 * filiais é por roleta (sem contexto de zona, não mexe na ordem do SDR).
 */
async function movimentarFilial(slug: string, n: number) {
  await comoSuperuser(c);
  for (let i = 0; i < n; i++) {
    const id = await criarLead(c, { telefone: novoTelefone() });
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.distribution_log
         (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado, created_at)
       VALUES ($1, $2, 'automatica', 'teste vez única', $3, 'rodizio_menos_recente', 'sucesso',
               now() - interval '8 days')`,
      [id, ana.id, slug],
    );
  }
}

async function cursores() {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT roleta_id, corretor_id, ultimo_lead_em, wrr_current
         FROM public.roleta_participantes ORDER BY roleta_id, corretor_id`,
    )
  ).rows;
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await comoSuperuser(c);
  for (const chave of [
    "zona_estrita",
    "modelo_v2_ativo",
    "percentual_minimo_trabalhado",
    "sdr_ativo",
    "roleta_sdr_regra_ativa",
    "roleta_sdr_modo_sombra",
    "vez_unica_por_zona",
  ]) {
    const r = await c.query(`SELECT valor FROM public.distribuicao_settings WHERE chave = $1`, [
      chave,
    ]);
    settingsAntes.set(chave, r.rows[0]?.valor);
  }
  await setSetting("zona_estrita", true);
  await setSetting("modelo_v2_ativo", false);
  await setSetting("percentual_minimo_trabalhado", 0);
  await setSetting("sdr_ativo", true);
  await setSetting("roleta_sdr_regra_ativa", false);
  await setSetting("vez_unica_por_zona", true);

  await criarUsuario(c, { nome: "Ada Admin", papel: "admin" });
  sdr = await criarUsuario(c, { nome: "Sara SDR", papel: "sdr" });
  igor = await criarUsuario(c, { nome: "Igor Duas Zonas" });
  ana = await criarUsuario(c, { nome: "Ana Sul" });
  gra = await criarUsuario(c, { nome: "Gra Leste" });

  await comoSuperuser(c);
  for (const [i, u] of [igor, ana, gra].entries()) {
    await c.query(`UPDATE public.profiles SET telefone = $2, ativo = true WHERE id = $1`, [
      u.id,
      `119666600${String(i).padStart(2, "0")}`,
    ]);
  }
  // A ordem de inclusão nas roletas de filial é a do rodízio: Igor primeiro.
  await darRegiao(c, igor.id, ["Sul", "Leste"]);
  await darRegiao(c, ana.id, ["Sul"]);
  await darRegiao(c, gra.id, ["Leste"]);
  for (const u of [igor, ana, gra]) await checkin(u);
  await zerarCursores();
});

afterAll(async () => {
  await comoSuperuser(c);
  for (const [chave, valor] of settingsAntes) {
    if (valor === undefined) {
      await c.query(`DELETE FROM public.distribuicao_settings WHERE chave = $1`, [chave]);
    } else {
      await c.query(`UPDATE public.distribuicao_settings SET valor = $2::jsonb WHERE chave = $1`, [
        chave,
        JSON.stringify(valor),
      ]);
    }
  }
  await c.query(`DELETE FROM public.roleta_sdr_apuracoes`);
  await c.query(`DELETE FROM public.roleta_participantes`);
  await c.end();
});

describe("Agendados do SDR", () => {
  it("a ordem das zonas não vira dentro da semana: no empate, Igor fica com o Sul e recebe a 2ª e a 6ª visita", async () => {
    // Sul = Leste em volume (semana passada). Empate: a ordem canônica, Sul
    // antes de Leste, e Igor (o mais antigo nas duas) fica com o Sul. As
    // entregas desta semana não contam: a ordem é a mesma antes de cada lead.
    // Com a janela móvel, a 1ª visita do Leste virava a ordem e a vez do Igor
    // pulava de zona a cada lead.
    await zerarCursores();
    await movimentar("Sul", 2);
    await movimentar("Leste", 2);
    const ordem = await ordemDasZonas();
    expect(ordem.slice(0, 2)).toEqual(["Sul", "Leste"]);

    const recebeu: string[] = [];
    for (const zona of ["Leste", "Sul", "Leste", "Sul", "Leste", "Sul"]) {
      expect(await ordemDasZonas()).toEqual(ordem);
      recebeu.push((await visitaDoSdr(zona)).corretor_id);
    }
    expect(recebeu).toEqual([gra.id, igor.id, gra.id, ana.id, gra.id, igor.id]);
    expect(await ordemDasZonas()).toEqual(ordem);
  });

  it("quem é o 1º em duas zonas fica com a mais movimentada; na outra a vez passa ao próximo — e o motor segue a tela", async () => {
    // O Sul é a zona mais movimentada: Igor fica com o Sul.
    await zerarCursores();
    await movimentar("Sul", 3);
    const sul = roleta(await filas("Sul"), "agendados-sdr");
    expect(sul.vez_unica).toBe(true);
    expect(ids(sul.fila)).toEqual([igor.id, ana.id]);

    const leste = roleta(await filas("Leste"), "agendados-sdr");
    expect(ids(leste.fila)).toEqual([gra.id]);
    expect(leste.fora).toEqual([
      expect.objectContaining({
        corretor_id: igor.id,
        motivos: ["vez_em_outra_zona"],
        vez_em: "Sul",
      }),
    ]);

    // O corretor vê o mesmo: 1º no Sul; no Leste, "vez no Sul".
    const m = await minhas(igor);
    expect(m.find((x) => x.slug === "agendados-sdr" && x.zona === "Sul")).toMatchObject({
      posicao: 1,
      total: 2,
      apto: true,
      vez_em: null,
    });
    expect(m.find((x) => x.slug === "agendados-sdr" && x.zona === "Leste")).toMatchObject({
      posicao: null,
      total: 1,
      apto: false,
      motivos: ["vez_em_outra_zona"],
      vez_em: "Sul",
    });

    // O motor: a visita do Leste vai para a Gra, não para o Igor (1º no Sul).
    const l = await visitaDoSdr("Leste");
    expect(l.regra).toBe("roleta_sdr");
    expect(l.corretor_id).toBe(gra.id);
    expect(await contexto(l.lead_id!)).toMatchObject({
      vez_unica: true,
      vez_unica_forcada: false,
      vez_em_outra_zona: [{ corretor_id: igor.id, vez_em: "Sul" }],
    });

    // A visita do Sul vai para o Igor.
    const s = await visitaDoSdr("Sul");
    expect(s.corretor_id).toBe(igor.id);

    // Depois de receber, o cursor anda e ninguém é o 1º em duas zonas.
    expect(ids(roleta(await filas("Sul"), "agendados-sdr").fila)).toEqual([ana.id, igor.id]);
    expect(ids(roleta(await filas("Leste"), "agendados-sdr").fila)).toEqual([gra.id, igor.id]);
    expect(roleta(await filas("Leste"), "agendados-sdr").fora).toEqual([]);
  });

  it("a zona mais movimentada decide: com visitas recentes no Leste, Igor fica com o Leste", async () => {
    await zerarCursores();
    await movimentar("Leste", 6);

    expect(ids(roleta(await filas("Leste"), "agendados-sdr").fila)).toEqual([igor.id, gra.id]);
    const sul = roleta(await filas("Sul"), "agendados-sdr");
    expect(ids(sul.fila)).toEqual([ana.id]);
    expect(sul.fora).toEqual([expect.objectContaining({ corretor_id: igor.id, vez_em: "Leste" })]);

    expect((await visitaDoSdr("Sul")).corretor_id).toBe(ana.id);
    expect((await visitaDoSdr("Leste")).corretor_id).toBe(igor.id);
  });

  it("com a regra semanal (ponderado), a vez única vale do mesmo jeito", async () => {
    await zerarCursores();
    await setSetting("roleta_sdr_regra_ativa", true);
    await setSetting("roleta_sdr_modo_sombra", false);
    await comoSuperuser(c);
    for (const [u, peso] of [
      [igor, 2],
      [ana, 1],
      [gra, 1],
    ] as const) {
      await c.query(
        `INSERT INTO public.roleta_sdr_apuracoes
           (semana_inicio, semana_fim, corretor_id, resultado, sombra, aplicado_em, peso_rodizio)
         VALUES ('2026-10-03', '2026-10-09', $1, $2, false, now(), $3)`,
        [u.id, peso === 2 ? "apto_meta" : "apto_complemento", peso],
      );
    }
    try {
      // O Leste continua a zona mais movimentada: Igor é o 1º lá.
      const leste = roleta(await filas("Leste"), "agendados-sdr");
      expect(leste.mecanica).toBe("ponderado_semana");
      expect(ids(leste.fila)[0]).toBe(igor.id);
      const sul = roleta(await filas("Sul"), "agendados-sdr");
      expect(ids(sul.fila)).toEqual([ana.id]);
      expect(ids(sul.fora)).toEqual([igor.id]);

      expect((await visitaDoSdr("Sul")).corretor_id).toBe(ana.id);
      expect((await visitaDoSdr("Leste")).corretor_id).toBe(igor.id);
    } finally {
      await setSetting("roleta_sdr_regra_ativa", false);
      await comoSuperuser(c);
      await c.query(`DELETE FROM public.roleta_sdr_apuracoes`);
    }
  });

  it("a regra nunca segura o lead: se pularia todo mundo, a fila fica como estava", async () => {
    await zerarCursores();
    // Só o Igor atende o Sul agora: ele é o 1º no Leste (mais movimentado)
    // E, forçado, no Sul.
    await sair("agendados-sdr", ana);
    try {
      expect(ids(roleta(await filas("Leste"), "agendados-sdr").fila)[0]).toBe(igor.id);
      const sul = roleta(await filas("Sul"), "agendados-sdr");
      expect(ids(sul.fila)).toEqual([igor.id]);
      expect(ids(sul.fora)).not.toContain(igor.id);
      const s = await visitaDoSdr("Sul");
      expect(s.corretor_id).toBe(igor.id);
      // Forçado: ninguém saiu — o contexto não lista o Igor como fora.
      expect(await contexto(s.lead_id!)).toMatchObject({
        vez_unica_forcada: true,
        vez_em_outra_zona: [],
      });
    } finally {
      await participar("agendados-sdr", ana, 4);
    }
  });

  it("chave desligada: cada zona com a própria fila, mesmo repetindo o 1º", async () => {
    await zerarCursores();
    await setSetting("vez_unica_por_zona", false);
    try {
      const leste = roleta(await filas("Leste"), "agendados-sdr");
      expect(leste.vez_unica).toBe(false);
      expect(ids(leste.fila)).toEqual([igor.id, gra.id]);
      expect(ids(roleta(await filas("Sul"), "agendados-sdr").fila)).toEqual([igor.id, ana.id]);
      const s = await visitaDoSdr("Sul");
      expect(s.corretor_id).toBe(igor.id);
      expect(await contexto(s.lead_id!)).toMatchObject({ vez_unica: false });
    } finally {
      await setSetting("vez_unica_por_zona", true);
    }
  });
});

describe("roletas de filial", () => {
  // Unidade = roleta de filial (decisão do dono, 12/10/2026): o Igor está na
  // Barra Funda (Sul) e na Liberdade (Centro); a vez dele fica com a filial
  // mais movimentada.
  it("o 1º de duas roletas de filial fica com a mais movimentada; na outra a vez passa — e o motor segue", async () => {
    await zerarCursores();
    // A Barra Funda é a mais movimentada: Igor fica com ela.
    await movimentarFilial("filial-barra-funda", 8);
    const bf = roleta(await filas("Sul"), "filial-barra-funda");
    expect(bf.vez_unica).toBe(true);
    expect(ids(bf.fila)).toEqual([igor.id, ana.id]);
    const lib = roleta(await filas("Centro"), "filial-liberdade");
    expect(ids(lib.fila)).toEqual([gra.id]);
    expect(lib.fora).toEqual([
      expect.objectContaining({
        corretor_id: igor.id,
        motivos: ["vez_em_outra_zona"],
        vez_em: "Barra Funda",
      }),
    ]);
    expect((await minhas(igor)).find((x) => x.slug === "filial-liberdade")).toMatchObject({
      apto: false,
      posicao: null,
      vez_em: "Barra Funda",
    });

    const l = await leadDaZona("Centro");
    expect(l.corretor_id).toBe(gra.id);
    expect(await contexto(l.lead_id)).toMatchObject({
      vez_unica: true,
      vez_em_outra_zona: [{ corretor_id: igor.id, vez_em: "Barra Funda" }],
    });
    expect((await leadDaZona("Sul")).corretor_id).toBe(igor.id);

    // Agora a Liberdade é a mais movimentada: com os cursores zerados, Igor
    // fica com a Liberdade e a Barra Funda passa para a Ana.
    await zerarCursores();
    await movimentarFilial("filial-liberdade", 12);
    expect(ids(roleta(await filas("Centro"), "filial-liberdade").fila)).toEqual([igor.id, gra.id]);
    expect(ids(roleta(await filas("Sul"), "filial-barra-funda").fila)).toEqual([ana.id]);
    expect((await leadDaZona("Sul")).corretor_id).toBe(ana.id);
  });

  it("dois leads da mesma roleta ao mesmo tempo: o rodízio espera o outro, e a vez única não deixa a fila vazia", async () => {
    // Barra Funda mais movimentada: Igor é o 1º lá; na Liberdade a fila é só
    // a Gra. Sem o lock por roleta, o SKIP LOCKED do 2º lead pulava a Gra
    // (presa pelo 1º) e, com o Igor fora pela vez, não achava ninguém: o lead
    // ficava preso por um ciclo do cron.
    await zerarCursores();
    await movimentarFilial("filial-barra-funda", 10);
    const lib = roleta(await filas("Centro"), "filial-liberdade");
    expect(ids(lib.fila)).toEqual([gra.id]);
    expect(ids(lib.fora)).toEqual([igor.id]);

    const l1 = await novoLeadDaZona("Centro");
    const l2 = await novoLeadDaZona("Centro");
    const { ra, rb, bAntesDoCommit } = await corrida(l1, l2);
    expect(bAntesDoCommit).toBe("esperando");
    expect(ra.corretor_id).toBe(gra.id);
    expect(rb).toMatchObject({ ok: true, corretor_id: gra.id });
    await comoSuperuser(c);
    const donos = await c.query(
      `SELECT corretor_id FROM public.leads WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[l1, l2]],
    );
    expect(donos.rows.map((r) => r.corretor_id)).toEqual([gra.id, gra.id]);
    const presos = await c.query(
      `SELECT count(*)::int AS n FROM public.distribuicao_excecoes WHERE lead_id = ANY($1::uuid[])`,
      [[l1, l2]],
    );
    expect(presos.rows[0].n).toBe(0);
  });

  it("redistribuição: quem já teve o lead sai antes da vez única; se sobrar só o tomado, forçado", async () => {
    await zerarCursores();
    await movimentarFilial("filial-barra-funda", 30);
    const lib = roleta(await filas("Centro"), "filial-liberdade");
    expect(ids(lib.fila)).toEqual([gra.id]);
    expect(ids(lib.fora)).toEqual([igor.id]);

    // A Gra já teve o lead: sobra só o Igor, que está com a vez na Barra
    // Funda — a regra não segura o lead: forçado, e ninguém listado como fora.
    const l = await leadDaZona("Centro", [gra.id]);
    expect(l.corretor_id).toBe(igor.id);
    expect(await contexto(l.lead_id)).toMatchObject({
      vez_unica: true,
      vez_unica_forcada: true,
      excluidos_por_tentativa: [gra.id],
      vez_em_outra_zona: [],
    });
  });

  it("Marquinhos e campanhas ficam fora da regra; ler as filas não mexe em cursor nenhum", async () => {
    await participar("marquinhos", igor, 2);
    expect(roleta(await filas("Leste"), "marquinhos").vez_unica).toBe(false);
    expect(ids(roleta(await filas("Leste"), "marquinhos").fila)).toEqual([igor.id]);
    expect(ids(roleta(await filas("Sul"), "marquinhos").fila)).toEqual([igor.id]);

    const antes = await cursores();
    await filas("Sul");
    await filas("Leste");
    await minhas(igor);
    expect(await cursores()).toEqual(antes);
  });
});
