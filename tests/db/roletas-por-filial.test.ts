/**
 * Roletas por filial — três times, as zonas no lead (migration
 * 20261018120000, drizzle 0079).
 *
 * Decisões do dono (12/10/2026): Barra Funda = Oeste, Norte e Sul;
 * Liberdade = Centro e Leste; Belém = Leste e Grande SP — a Leste é atendida
 * pelas duas lojas e o lead da Leste ALTERNA entre elas; time fixo pela
 * gestão; um corretor pode estar em duas filiais (a vez única continua, por
 * filial); o check-in vale em qualquer filial.
 *
 * O que se prova aqui:
 *   1. o mapa e a roleta da vez de cada zona;
 *   2. o lead da Leste alterna entre Liberdade e Belém, pula a filial sem
 *      ninguém apto (para ESTE lead: quem já o teve não conta) e respeita o
 *      pino do lead (memória do repasse);
 *   3. a reserva do SDR tenta as filiais na ordem do rodízio;
 *   4. a união dos times preserva cursor, pausa, limite e faixa;
 *   5. a vez única por roleta de filial, no motor e na tela;
 *   6. as duas portas mostram todas as roletas da zona, com "da vez";
 *   7. a região é escolhida por filial inteira.
 *
 * Elenco (com telefone e check-in): Lia (Liberdade, via Centro), Bela
 * (Belém, via Grande SP), Léo (Leste: Liberdade E Belém), Bia (Barra
 * Funda, via Oeste).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarLead,
  criarUsuario,
  darRegiao,
  errCode,
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
  da_vez?: boolean;
  filial?: { slug: string; nome: string };
  zonas?: string[];
  vez_unica?: boolean;
  fila: Pessoa[];
  fora: Pessoa[];
  reserva?: { slug: string; fila: Pessoa[] };
};
type Filas = { zona: string | null; zonas: string[]; roletas: FilaRoleta[] };
type MinhaPosicao = {
  slug: string;
  papel: string;
  zona: string | null;
  filial?: string;
  zonas?: string[];
  posicao: number | null;
  total: number;
  apto: boolean;
  motivos: string[];
  vez_em: string | null;
};

const c = novoClient();
const settingsAntes = new Map<string, unknown>();
const roletasCriadas: string[] = [];

let admin: UsuarioTeste;
let sdr: UsuarioTeste;
let lia: UsuarioTeste;
let bela: UsuarioTeste;
let leo: UsuarioTeste;
let bia: UsuarioTeste;

const DIA = 24 * 60 * 60 * 1000;
let horario = 0;
const proximoHorario = () =>
  new Date(Date.now() + 3 * DIA + ++horario * 3 * 60 * 60 * 1000).toISOString();
let tel = 0;
const novoTelefone = () => `1198${String(4000000 + ++tel).slice(-7)}`;

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

async function presente(u: UsuarioTeste, sim: boolean) {
  await comoSuperuser(c);
  await c.query(`UPDATE public.profiles SET presente = $2 WHERE id = $1`, [u.id, sim]);
}

async function filas(zona: string | null): Promise<Filas> {
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

async function roletasDaZona(zona: string) {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT roleta_slug, pronta, da_vez, ordem FROM public._roletas_da_zona($1) ORDER BY ordem`,
      [zona],
    )
  ).rows as { roleta_slug: string; pronta: boolean; da_vez: boolean; ordem: number }[];
}

async function zerarCursores() {
  await comoSuperuser(c);
  await c.query(`UPDATE public.zonas_roletas SET ultimo_lead_em = NULL`);
  await c.query(
    `UPDATE public.roleta_participantes rp SET ultimo_lead_em = NULL, wrr_current = 0
       FROM public.roletas r WHERE r.id = rp.roleta_id AND r.tipo IN ('zona', 'sdr')`,
  );
}

/** Lead da zona pelo motor: quem recebeu e por qual roleta. */
async function leadDaZona(
  zona: string,
  extra: { pino?: string | null; tentaram?: string[] } = {},
): Promise<{ corretor_id: string | null; roleta_slug: string | null; lead_id: string }> {
  const id = await criarLead(c, { telefone: novoTelefone() });
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.leads SET zona = $2, roleta_slug = $3, corretores_que_tentaram = $4::uuid[] WHERE id = $1`,
    [id, zona, extra.pino ?? null, extra.tentaram ?? []],
  );
  if (extra.pino) {
    // O pino chega ao motor como o repasse por SLA o passa: _roleta_slug.
    await c.query(
      `SELECT public._distribuir_lead_v3($1::uuid, 'redistribuicao', $2, NULL, NULL, 'teste', '{}'::jsonb, true)`,
      [id, extra.pino],
    );
  } else {
    await c.query(`SELECT public.triar_e_distribuir_lead($1::uuid, 'teste')`, [id]);
  }
  const r = (await c.query(`SELECT corretor_id, roleta_slug FROM public.leads WHERE id = $1`, [id]))
    .rows[0] as { corretor_id: string | null; roleta_slug: string | null };
  return { ...r, lead_id: id };
}

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
  ).rows[0]?.contexto as Record<string, unknown>;
}

async function visitaDoSdr(
  zona: string,
): Promise<{ corretor_id: string; regra: string; roleta: string }> {
  await comoUsuario(c, sdr.id);
  try {
    return (
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
    ).rows[0].res as { corretor_id: string; regra: string; roleta: string };
  } finally {
    await comoSuperuser(c);
  }
}

/** Leads recentes entregues por uma roleta (ordem da vez única por filial). */
async function movimentar(roletaSlug: string, n: number) {
  await comoSuperuser(c);
  for (let i = 0; i < n; i++) {
    const id = await criarLead(c, { telefone: novoTelefone() });
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.distribution_log
         (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado, created_at)
       VALUES ($1, $2, 'automatica', 'teste filial', $3, 'rodizio_menos_recente', 'sucesso',
               now() - interval '8 days')`,
      [id, bia.id, roletaSlug],
    );
  }
}

async function zonasDoPerfil(u: UsuarioTeste): Promise<string[]> {
  await comoSuperuser(c);
  const z = (
    await c.query(`SELECT coalesce(zonas, '{}') AS z FROM public.profiles WHERE id = $1`, [u.id])
  ).rows[0].z as string[];
  return [...z].sort();
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

  admin = await criarUsuario(c, { nome: "Ada Admin", papel: "admin" });
  sdr = await criarUsuario(c, { nome: "Sara SDR", papel: "sdr" });
  lia = await criarUsuario(c, { nome: "Lia Liberdade" });
  bela = await criarUsuario(c, { nome: "Bela Belem" });
  leo = await criarUsuario(c, { nome: "Leo Leste" });
  bia = await criarUsuario(c, { nome: "Bia Barra" });

  await comoSuperuser(c);
  for (const [i, u] of [lia, bela, leo, bia].entries()) {
    await c.query(`UPDATE public.profiles SET telefone = $2, ativo = true WHERE id = $1`, [
      u.id,
      `119777700${String(i).padStart(2, "0")}`,
    ]);
  }
  // darRegiao insere na(s) roleta(s) das zonas: Centro → Liberdade; Grande SP
  // → Belém; Leste → Liberdade E Belém; Oeste → Barra Funda.
  await darRegiao(c, lia.id, ["Centro"]);
  await darRegiao(c, bela.id, ["Grande SP"]);
  await darRegiao(c, leo.id, ["Leste"]);
  await darRegiao(c, bia.id, ["Oeste"]);
  for (const u of [lia, bela, leo, bia]) await checkin(u);
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
  await c.query(`DELETE FROM public.roleta_participantes`);
  await c.query(`UPDATE public.zonas_roletas SET ultimo_lead_em = NULL`);
  if (roletasCriadas.length > 0) {
    await c.query(`DELETE FROM public.roletas WHERE slug = ANY($1::text[])`, [roletasCriadas]);
  }
  await c.end();
});

describe("o mapa", () => {
  it("seis zonas em três roletas de filial; a Leste em duas; as antigas desligadas", async () => {
    await comoSuperuser(c);
    const mapa = (
      await c.query(`SELECT zona, roleta_slug FROM public.zonas_roletas ORDER BY zona, roleta_slug`)
    ).rows as { zona: string; roleta_slug: string }[];
    expect(mapa).toEqual([
      { zona: "Centro", roleta_slug: "filial-liberdade" },
      { zona: "Grande SP", roleta_slug: "filial-belem" },
      { zona: "Leste", roleta_slug: "filial-belem" },
      { zona: "Leste", roleta_slug: "filial-liberdade" },
      { zona: "Norte", roleta_slug: "filial-barra-funda" },
      { zona: "Oeste", roleta_slug: "filial-barra-funda" },
      { zona: "Sul", roleta_slug: "filial-barra-funda" },
    ]);
    const antigas = (
      await c.query(`SELECT slug, ativo FROM public.roletas WHERE slug LIKE 'zona-%' ORDER BY slug`)
    ).rows as { slug: string; ativo: boolean }[];
    expect(antigas).toHaveLength(6);
    expect(antigas.every((r) => !r.ativo)).toBe(true);
    // A região é o espelho das roletas de filial: quem está na Belém atende
    // Leste e Grande SP; quem está na Liberdade, Centro e Leste.
    expect(await zonasDoPerfil(bela)).toEqual(["Grande SP", "Leste"]);
    expect(await zonasDoPerfil(lia)).toEqual(["Centro", "Leste"]);
    expect(await zonasDoPerfil(leo)).toEqual(["Centro", "Grande SP", "Leste"]);
    expect(await zonasDoPerfil(bia)).toEqual(["Norte", "Oeste", "Sul"]);
  });

  it("a roleta da vez de cada zona: a mais antiga sem lead da zona, pronta", async () => {
    expect((await roletasDaZona("Oeste")).map((r) => [r.roleta_slug, r.da_vez])).toEqual([
      ["filial-barra-funda", true],
    ]);
    // Leste: cursores zerados → empate → a ordem das filiais (Liberdade 2, Belém 3).
    expect((await roletasDaZona("Leste")).map((r) => [r.roleta_slug, r.pronta, r.da_vez])).toEqual([
      ["filial-liberdade", true, true],
      ["filial-belem", true, false],
    ]);
    await comoSuperuser(c);
    expect((await c.query(`SELECT public.roleta_da_zona('Leste') AS s`)).rows[0].s).toBe(
      "filial-liberdade",
    );
    expect((await c.query(`SELECT public.roleta_da_zona('Sul') AS s`)).rows[0].s).toBe(
      "filial-barra-funda",
    );
  });
});

describe("o lead da Leste alterna entre Liberdade e Belém", () => {
  it("rodízio entre as filiais, pelo cursor do par (zona, roleta)", async () => {
    await zerarCursores();
    // Léo está nas duas; Lia só na Liberdade; Bela só na Belém. Para a prova
    // ficar legível, Léo sai da fila (sem check-in) — volta no teste seguinte.
    await presente(leo, false);
    const seq = [];
    for (let i = 0; i < 4; i++) {
      const r = await leadDaZona("Leste");
      seq.push([r.roleta_slug, r.corretor_id]);
    }
    expect(seq).toEqual([
      ["filial-liberdade", lia.id],
      ["filial-belem", bela.id],
      ["filial-liberdade", lia.id],
      ["filial-belem", bela.id],
    ]);
    await comoSuperuser(c);
    const cursores = (
      await c.query(
        `SELECT roleta_slug, ultimo_lead_em IS NOT NULL AS andou FROM public.zonas_roletas WHERE zona = 'Leste' ORDER BY roleta_slug`,
      )
    ).rows;
    expect(cursores).toEqual([
      { roleta_slug: "filial-belem", andou: true },
      { roleta_slug: "filial-liberdade", andou: true },
    ]);
    // Lead do Centro vai para a Liberdade e não mexe no cursor da Leste.
    expect((await leadDaZona("Centro")).roleta_slug).toBe("filial-liberdade");
    await presente(leo, true);
  });

  it("a filial sem ninguém apto é pulada; quando volta, é a vez dela", async () => {
    await zerarCursores();
    await presente(leo, false);
    await presente(bela, false);
    // Só a Liberdade está pronta: os dois leads vão para ela.
    expect((await leadDaZona("Leste")).roleta_slug).toBe("filial-liberdade");
    expect((await leadDaZona("Leste")).roleta_slug).toBe("filial-liberdade");
    expect((await roletasDaZona("Leste")).map((r) => [r.roleta_slug, r.pronta])).toEqual([
      ["filial-belem", false],
      ["filial-liberdade", true],
    ]);
    // Bela volta: a Belém nunca recebeu Leste → é a da vez.
    await presente(bela, true);
    expect((await leadDaZona("Leste")).roleta_slug).toBe("filial-belem");
    await presente(leo, true);
  });

  it("ninguém apto em nenhuma filial: o lead espera na primeira, nunca troca de zona", async () => {
    await zerarCursores();
    for (const u of [lia, bela, leo]) await presente(u, false);
    const r = await leadDaZona("Leste");
    expect(r.corretor_id).toBeNull();
    await comoSuperuser(c);
    const exc = (
      await c.query(
        `SELECT motivo FROM public.distribuicao_excecoes WHERE lead_id = $1 AND status = 'pendente'`,
        [r.lead_id],
      )
    ).rows[0];
    expect(exc?.motivo).toBe("sem_corretor_na_zona");
    for (const u of [lia, bela, leo]) await presente(u, true);
  });

  it("o pino do lead (memória do repasse) é respeitado; pino antigo zona-* é ignorado", async () => {
    await zerarCursores();
    await presente(leo, false);
    // Liberdade seria a da vez; o lead pinado na Belém fica na Belém.
    const p = await leadDaZona("Leste", { pino: "filial-belem" });
    expect(p.roleta_slug).toBe("filial-belem");
    expect(p.corretor_id).toBe(bela.id);
    // Pino antigo (roleta desativada): ignorado, o rodízio decide
    // (a Belém acabou de receber → Liberdade).
    const v = await leadDaZona("Leste", { pino: "zona-leste" });
    expect(v.roleta_slug).toBe("filial-liberdade");
    expect(await contexto(v.lead_id)).toMatchObject({ roleta_pedida: "zona-leste" });
    // Pino válido numa filial sem ninguém apto: cai na outra.
    await presente(bela, false);
    const q = await leadDaZona("Leste", { pino: "filial-belem" });
    expect(q.roleta_slug).toBe("filial-liberdade");
    await presente(bela, true);
    await presente(leo, true);
  });

  it("repasse: a filial em que só quem já teve o lead está apto é pulada; sem ninguém novo, espera no pino", async () => {
    await zerarCursores();
    await presente(leo, false);
    // A Bela (única apta na Belém) estourou o SLA do lead pinado na Belém: a
    // Belém está pronta, mas não para ESTE lead — ele vai para a Liberdade
    // em vez de esperar a Belém (o pino é tentado primeiro, depois a outra).
    const p = await leadDaZona("Leste", { pino: "filial-belem", tentaram: [bela.id] });
    expect(p).toMatchObject({ roleta_slug: "filial-liberdade", corretor_id: lia.id });
    // Sem pino: a Belém é a da vez (a Liberdade acabou de receber), mas lá só
    // a Bela, que já teve o lead.
    expect((await roletasDaZona("Leste")).find((r) => r.da_vez)?.roleta_slug).toBe("filial-belem");
    const q = await leadDaZona("Leste", { tentaram: [bela.id] });
    expect(q).toMatchObject({ roleta_slug: "filial-liberdade", corretor_id: lia.id });
    // Todos os aptos já tiveram o lead: espera no pino (memória do time),
    // nunca em outra zona.
    const r = await leadDaZona("Leste", { pino: "filial-belem", tentaram: [bela.id, lia.id] });
    expect(r.corretor_id).toBeNull();
    await comoSuperuser(c);
    const exc = (
      await c.query(
        `SELECT motivo, roleta_slug FROM public.distribuicao_excecoes WHERE lead_id = $1 AND status = 'pendente'`,
        [r.lead_id],
      )
    ).rows[0];
    expect(exc).toEqual({ motivo: "sem_corretor_na_zona", roleta_slug: "filial-belem" });
    await presente(leo, true);
  });
});

describe("a reserva do SDR", () => {
  it("visita sem ninguém do time do SDR na zona: as filiais na ordem do rodízio", async () => {
    await zerarCursores();
    await presente(leo, false);
    // Ninguém do time do SDR atende a Leste (a roleta está vazia).
    const f = await filas("Leste");
    expect(roleta(f, "agendados-sdr").fila).toEqual([]);
    expect(roleta(f, "agendados-sdr").reserva?.slug).toBe("filial-liberdade");
    const a = await visitaDoSdr("Leste");
    expect(a.regra).toBe("roleta_sdr_zona");
    expect(a.roleta).toBe("filial-liberdade");
    const b = await visitaDoSdr("Leste");
    expect(b.roleta).toBe("filial-belem");
    expect([a.corretor_id, b.corretor_id].sort()).toEqual([lia.id, bela.id].sort());
    await presente(leo, true);
  });
});

describe("a união dos times", () => {
  it("cursor mais recente, pausa em vigor, maior limite, faixa mais recente e um log por inclusão", async () => {
    await comoSuperuser(c);
    for (const slug of ["teste-antiga-a", "teste-antiga-b", "teste-destino"]) {
      await c.query(
        `INSERT INTO public.roletas (slug, nome, tipo, ativo) VALUES ($1, $1, 'campanha', true) ON CONFLICT (slug) DO NOTHING`,
        [slug],
      );
      roletasCriadas.push(slug);
    }
    const rid = async (s: string) =>
      (await c.query(`SELECT id FROM public.roletas WHERE slug = $1`, [s])).rows[0].id as string;
    const a = await rid("teste-antiga-a");
    const b = await rid("teste-antiga-b");
    await c.query(
      `INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo, ultimo_lead_em, pausado_ate, motivo_pausa, limite_diario, tier, tier_updated_at, incluido_em)
       VALUES
         ($1, $3, true,  now() - interval '5 hours', now() + interval '2 days', 'férias', 4, 'A', now() - interval '1 day', now() - interval '30 days'),
         ($2, $3, true,  now() - interval '1 hour',  NULL, NULL, 7, 'C', now(), now() - interval '10 days'),
         ($1, $4, false, now() - interval '9 hours', NULL, NULL, NULL, 'B', NULL, now() - interval '3 days'),
         ($2, $5, true,  NULL, now() - interval '1 day', 'pausa vencida', NULL, 'B', NULL, now() - interval '2 days')`,
      [a, b, lia.id, bela.id, leo.id],
    );
    const n = (
      await c.query(
        `SELECT public._filial_unir_participantes('teste-destino', ARRAY['teste-antiga-a','teste-antiga-b'], 'teste união') AS n`,
      )
    ).rows[0].n as number;
    expect(n).toBe(2); // Bela estava inativa nas duas: não entra.
    const dest = await rid("teste-destino");
    const rows = (
      await c.query(
        `SELECT corretor_id, ativo, ultimo_lead_em, pausado_ate, motivo_pausa, limite_diario, tier, wrr_current, incluido_em
           FROM public.roleta_participantes WHERE roleta_id = $1 ORDER BY corretor_id`,
        [dest],
      )
    ).rows as Record<string, unknown>[];
    const liaRow = rows.find((r) => r.corretor_id === lia.id)!;
    const leoRow = rows.find((r) => r.corretor_id === leo.id)!;
    expect(rows.map((r) => r.corretor_id).sort()).toEqual([lia.id, leo.id].sort());
    // Lia: cursor = o mais recente (1h), pausa de 2 dias em vigor, limite 7, faixa C (mais recente), incluída há 30 dias.
    expect(Date.now() - new Date(liaRow.ultimo_lead_em as string).getTime()).toBeLessThan(
      2 * 3600 * 1000,
    );
    expect(new Date(liaRow.pausado_ate as string).getTime()).toBeGreaterThan(Date.now());
    expect(liaRow.motivo_pausa).toBe("férias");
    expect(liaRow.limite_diario).toBe(7);
    expect(liaRow.tier).toBe("C");
    expect(liaRow.wrr_current).toBe(0);
    expect(Date.now() - new Date(liaRow.incluido_em as string).getTime()).toBeGreaterThan(29 * DIA);
    // Léo: pausa vencida não vem.
    expect(leoRow.pausado_ate).toBeNull();
    expect(leoRow.ultimo_lead_em).toBeNull();
    const logs = (
      await c.query(
        `SELECT acao, motivo FROM public.roleta_participantes_log WHERE roleta_id = $1`,
        [dest],
      )
    ).rows;
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.acao === "incluido" && l.motivo === "teste união")).toBe(true);
    await c.query(`DELETE FROM public.roleta_participantes WHERE roleta_id = ANY($1::uuid[])`, [
      [a, b, dest],
    ]);
  });
});

describe("a vez é uma só, por filial", () => {
  it("quem é o 1º na filial mais movimentada sai da fila da outra; o motor segue a tela", async () => {
    await zerarCursores();
    // Bela recebeu há pouco: Léo (nas duas) é o 1º da Belém; na Liberdade, Lia é
    // a 1ª e Léo o 2º. Belém mais movimentada: Léo fica com a Belém.
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.roleta_participantes SET ultimo_lead_em = now() WHERE corretor_id = $1`,
      [bela.id],
    );
    await movimentar("filial-belem", 5);
    const f = await filas("Leste");
    const bel = roleta(f, "filial-belem");
    const lib = roleta(f, "filial-liberdade");
    expect(bel.vez_unica).toBe(true);
    expect(bel.filial).toEqual({ slug: "belem", nome: "Belém" });
    expect(bel.zonas).toEqual(["Grande SP", "Leste"]);
    expect(ids(bel.fila)[0]).toBe(leo.id);
    expect(ids(lib.fila)).toEqual([lia.id]);
    expect(lib.fora).toEqual([
      expect.objectContaining({
        corretor_id: leo.id,
        motivos: ["vez_em_outra_zona"],
        vez_em: "Belém",
      }),
    ]);
    // Na tela do corretor: 1º na Belém, "vez na Belém" na Liberdade.
    const m = await minhas(leo);
    expect(m.find((x) => x.slug === "filial-belem")).toMatchObject({
      zona: null,
      filial: "Belém",
      zonas: ["Grande SP", "Leste"],
      posicao: 1,
      apto: true,
    });
    expect(m.find((x) => x.slug === "filial-liberdade")).toMatchObject({
      posicao: null,
      apto: false,
      motivos: ["vez_em_outra_zona"],
      vez_em: "Belém",
    });
    // O motor: a Liberdade é a da vez (cursores zerados); entrega à Lia, não ao Léo.
    const r = await leadDaZona("Leste");
    expect(r.roleta_slug).toBe("filial-liberdade");
    expect(r.corretor_id).toBe(lia.id);
    expect(await contexto(r.lead_id)).toMatchObject({
      vez_unica: true,
      vez_em_outra_zona: [{ corretor_id: leo.id, vez_em: "Belém" }],
    });
    // Depois, a Belém é a da vez e o Léo é o 1º lá.
    const s = await leadDaZona("Leste");
    expect(s.roleta_slug).toBe("filial-belem");
    expect(s.corretor_id).toBe(leo.id);
  });
});

describe("as duas portas", () => {
  it("todas as roletas da zona, com 'da vez', filial e zonas; lead sem zona não lista filiais", async () => {
    await zerarCursores();
    const f = await filas("Leste");
    const filiais = f.roletas.filter((r) => r.papel === "zona");
    expect(filiais.map((r) => [r.slug, r.da_vez])).toEqual([
      ["filial-liberdade", true],
      ["filial-belem", false],
    ]);
    expect(f.zonas).toEqual(["Centro", "Grande SP", "Leste", "Norte", "Oeste", "Sul"]);
    const oeste = await filas("Oeste");
    expect(oeste.roletas.filter((r) => r.papel === "zona").map((r) => r.slug)).toEqual([
      "filial-barra-funda",
    ]);
    const sem = await filas(null);
    expect(sem.roletas.some((r) => r.papel === "zona")).toBe(false);
    await comoUsuario(c, sdr.id);
    expect(await errCode(c.query(`SELECT public.roletas_filas_zona_v1('Marte')`))).toBe("22023");
    await comoSuperuser(c);
  });

  it("ler as filas não mexe em cursor nenhum", async () => {
    await comoSuperuser(c);
    const antes = (
      await c.query(
        `SELECT zona, roleta_slug, ultimo_lead_em FROM public.zonas_roletas ORDER BY 1, 2`,
      )
    ).rows;
    await filas("Leste");
    await minhas(leo);
    expect(
      (
        await c.query(
          `SELECT zona, roleta_slug, ultimo_lead_em FROM public.zonas_roletas ORDER BY 1, 2`,
        )
      ).rows,
    ).toEqual(antes);
  });
});

describe("a região por filial (aba Corretores)", () => {
  it("só filial inteira; a união das zonas das filiais marcadas inclui e remove por roleta", async () => {
    await comoUsuario(c, admin.id);
    // "Só a Leste" não existe: a Leste vem com a filial inteira.
    expect(
      await errCode(
        c.query(`SELECT public.atualizar_corretor_distribuicao($1, ARRAY['Leste'])`, [bia.id]),
      ),
    ).not.toBeNull();
    // Belém inteira: entra na Belém, sai da Barra Funda.
    await c.query(`SELECT public.atualizar_corretor_distribuicao($1, ARRAY['Leste','Grande SP'])`, [
      bia.id,
    ]);
    expect(await zonasDoPerfil(bia)).toEqual(["Grande SP", "Leste"]);
    // Belém + Liberdade.
    await c.query(
      `SELECT public.atualizar_corretor_distribuicao($1, ARRAY['Leste','Grande SP','Centro'])`,
      [bia.id],
    );
    expect(await zonasDoPerfil(bia)).toEqual(["Centro", "Grande SP", "Leste"]);
    // Nenhuma: sai de todas.
    await c.query(`SELECT public.atualizar_corretor_distribuicao($1, ARRAY[]::text[])`, [bia.id]);
    expect(await zonasDoPerfil(bia)).toEqual([]);
    // De volta à Barra Funda.
    await c.query(
      `SELECT public.atualizar_corretor_distribuicao($1, ARRAY['Oeste','Norte','Sul'])`,
      [bia.id],
    );
    expect(await zonasDoPerfil(bia)).toEqual(["Norte", "Oeste", "Sul"]);
    await comoSuperuser(c);
  });
});

describe("campanhas por filial: a válvula para receber lead de outras zonas", () => {
  let cao: UsuarioTeste;
  let dan: UsuarioTeste;
  let slug: string;

  it("a campanha de equipe fixa, dona de uma filial, entrega a quem está nela de qualquer zona", async () => {
    cao = await criarUsuario(c, { nome: "Cao Campanha" });
    dan = await criarUsuario(c, { nome: "Dan Fora" });
    await comoSuperuser(c);
    for (const [i, u] of [cao, dan].entries()) {
      await c.query(`UPDATE public.profiles SET telefone = $2, ativo = true WHERE id = $1`, [
        u.id,
        `11977771${String(i).padStart(2, "0")}`,
      ]);
    }
    await darRegiao(c, cao.id, ["Oeste"]);
    await darRegiao(c, dan.id, ["Oeste"]);
    for (const u of [cao, dan]) await checkin(u);

    // A gestão cria a campanha com a filial dona e põe Bia e Cao (Barra Funda).
    await comoUsuario(c, admin.id);
    const criada = (
      await c.query(
        `SELECT public.criar_roleta_campanha('Teste Well Perdizes', NULL, NULL, true, 'barra-funda') AS r`,
      )
    ).rows[0].r as { roleta: { slug: string; filial_id: string | null } };
    slug = criada.roleta.slug;
    roletasCriadas.push(slug);
    expect(criada.roleta.filial_id).not.toBeNull();
    await c.query(`SELECT public.gerenciar_participante_roleta($1, $2, 'incluir', 'teste')`, [
      slug,
      bia.id,
    ]);
    await c.query(`SELECT public.gerenciar_participante_roleta($1, $2, 'incluir', 'teste')`, [
      slug,
      cao.id,
    ]);
    await comoSuperuser(c);

    // Lead da Leste pelo webhook da campanha: vai para a equipe, que só atende Oeste/Norte/Sul.
    const id = await criarLead(c, { telefone: novoTelefone() });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET zona = 'Leste' WHERE id = $1`, [id]);
    const r = (
      await c.query(`SELECT public.distribuir_lead_ponderado($1::uuid, $2) AS r`, [id, slug])
    ).rows[0].r as { ok: boolean; corretor_id: string };
    expect(r.ok).toBe(true);
    expect([bia.id, cao.id]).toContain(r.corretor_id);
    const lead = (
      await c.query(`SELECT corretor_id, roleta_slug, zona FROM public.leads WHERE id = $1`, [id])
    ).rows[0];
    expect(lead.roleta_slug).toBe(slug);
    expect(lead.zona).toBe("Leste");

    // Transferência da gestão: para outro da campanha, sem exceção de região;
    // para quem não está na campanha (Dan, só Oeste), a guarda continua.
    const outro = r.corretor_id === bia.id ? cao : bia;
    await comoUsuario(c, admin.id);
    await c.query(`SELECT public.transferir_leads(ARRAY[$1::uuid], $2)`, [id, outro.id]);
    expect(
      await errCode(c.query(`SELECT public.transferir_leads(ARRAY[$1::uuid], $2)`, [id, dan.id])),
    ).toBe("SMQZ1");
    await comoSuperuser(c);
    expect(
      (await c.query(`SELECT corretor_id FROM public.leads WHERE id = $1`, [id])).rows[0]
        .corretor_id,
    ).toBe(outro.id);

    // Repasse por SLA dentro da campanha: volta para o outro da equipe, de qualquer zona.
    const rep = (
      await c.query(
        `SELECT public._repassar_lead_campanha($1::uuid, $2, 'teste', '{}'::jsonb) AS r`,
        [id, slug],
      )
    ).rows[0].r as { ok: boolean; corretor_id: string };
    expect(rep.ok).toBe(true);
    expect(rep.corretor_id).toBe(r.corretor_id);

    // A guarda direta no banco: participante da campanha passa; quem não está, não.
    await c.query(`UPDATE public.leads SET corretor_id = $2 WHERE id = $1`, [id, outro.id]);
    expect(
      await errCode(
        c.query(`UPDATE public.leads SET corretor_id = $2 WHERE id = $1`, [id, dan.id]),
      ),
    ).toBe("SMQZ1");
  });

  it("a campanha aparece nas zonas da filial dona, com a equipe inteira; no corretor, uma fila só", async () => {
    const oeste = roleta(await filas("Oeste"), slug);
    expect(oeste.filial).toEqual({ slug: "barra-funda", nome: "Barra Funda" });
    expect(ids(oeste.fila).sort()).toEqual([bia.id, cao.id].sort());
    expect((await filas("Leste")).roletas.some((r) => r.slug === slug)).toBe(false);
    const m = await minhas(bia);
    const linhas = m.filter((x) => x.slug === slug);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ zona: null, apto: true, filial: "Barra Funda" });
  });

  it("a filial da campanha muda pela RPC; a roleta de filial não troca de filial", async () => {
    await comoUsuario(c, admin.id);
    const r = (
      await c.query(`SELECT public.atualizar_roleta($1, _filial_slug => 'liberdade') AS r`, [slug])
    ).rows[0].r as { roleta: { filial_id: string } };
    await comoSuperuser(c);
    const lib = (await c.query(`SELECT id FROM public.filiais WHERE slug = 'liberdade'`)).rows[0]
      .id;
    expect(r.roleta.filial_id).toBe(lib);
    await comoUsuario(c, admin.id);
    expect(
      await errCode(
        c.query(`SELECT public.atualizar_roleta('filial-belem', _filial_slug => 'liberdade')`),
      ),
    ).not.toBeNull();
    expect(
      await errCode(c.query(`SELECT public.atualizar_roleta($1, _filial_slug => 'marte')`, [slug])),
    ).not.toBeNull();
    await comoSuperuser(c);
  });
});
