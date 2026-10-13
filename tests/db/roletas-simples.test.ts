/**
 * Roletas simples — só quatro: Campanha (Facebook Ads), Filial, SDR e
 * Marquinhos (migration 20261022120000, drizzle 0083).
 *
 * Decisões do dono (13/10/2026): Plantão, Landing e Base saem (desligadas,
 * nunca apagadas); o lead SEM zona entra no rodízio entre as filiais; a
 * campanha é sempre da equipe (de qualquer zona e filial) e perde a filial
 * dona; a origem só aponta para a Marquinhos ou para as filiais; a cota
 * padrão sobe para 20.
 *
 * O que se prova aqui:
 *   1. o estado da virada (roletas desligadas e intactas, campanhas, mapa de
 *      origens, cron, cota);
 *   2. o rodízio do lead sem zona: alterna BF → Liberdade → Belém, pula a
 *      filial sem apto PARA ESTE LEAD, espera com o motivo que o fallback do
 *      cron conhece, respeita o pino do repasse;
 *   3. concorrência: dois leads ao mesmo tempo vão para filiais diferentes;
 *      vários na mesma transação (o lote do cron) também alternam;
 *   4. pedido de roleta desligada é ignorado; atribuição direta nunca grava
 *      roleta NULL no log;
 *   5. Marquinhos com lead sem zona; vazia ou fora do horário → filiais;
 *   6. campanhas: equipe fixa forçada, sem filial, equipe sem apto → filial
 *      da zona ou rodízio; repasse sem zona → rodízio;
 *   7. as recusas das RPCs (origem → Plantão, religar o Plantão) e o painel.
 *
 * Elenco (com telefone e check-in): Bia (Barra Funda, via Oeste), Lia
 * (Liberdade, via Centro), Bela (Belém, via Grande SP).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

const c = novoClient();
const settingsAntes = new Map<string, unknown>();
const roletasCriadas: string[] = [];

let admin: UsuarioTeste;
let bia: UsuarioTeste;
let lia: UsuarioTeste;
let bela: UsuarioTeste;

let tel = 0;
const novoTelefone = () => `1197${String(5000000 + ++tel).slice(-7)}`;

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

async function zerarCursores() {
  await comoSuperuser(c);
  await c.query(`UPDATE public.rodizio_sem_zona SET ultimo_lead_em = NULL`);
  await c.query(`UPDATE public.zonas_roletas SET ultimo_lead_em = NULL`);
  await c.query(`UPDATE public.roleta_participantes SET ultimo_lead_em = NULL, wrr_current = 0`);
}

type Entrega = { lead_id: string; corretor_id: string | null; roleta_slug: string | null };

async function leadSemZona(
  opts: { origem?: string; tentaram?: string[]; pino?: string | null } = {},
): Promise<Entrega> {
  const id = await criarLead(c, { telefone: novoTelefone(), origem: opts.origem ?? "site" });
  await comoSuperuser(c);
  await c.query(`UPDATE public.leads SET corretores_que_tentaram = $2::uuid[] WHERE id = $1`, [
    id,
    opts.tentaram ?? [],
  ]);
  if (opts.pino) {
    // O pino chega ao motor como o repasse por SLA o passa: _roleta_slug.
    await c.query(
      `SELECT public._distribuir_lead_v3($1::uuid, 'redistribuicao', $2, NULL, NULL, 'teste', '{}'::jsonb, true)`,
      [id, opts.pino],
    );
  } else {
    await c.query(`SELECT public.triar_e_distribuir_lead($1::uuid, 'teste')`, [id]);
  }
  const r = (await c.query(`SELECT corretor_id, roleta_slug FROM public.leads WHERE id = $1`, [id]))
    .rows[0] as { corretor_id: string | null; roleta_slug: string | null };
  return { ...r, lead_id: id };
}

async function ultimoLog(leadId: string) {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT dl.roleta_slug, dl.resultado, dl.regra_aplicada, dl.motivo, x.contexto
         FROM public.distribution_log dl
         LEFT JOIN public.distribuicao_log_contexto x ON x.log_id = dl.id
        WHERE dl.lead_id = $1
        ORDER BY dl.created_at DESC, dl.id DESC LIMIT 1`,
      [leadId],
    )
  ).rows[0] as {
    roleta_slug: string | null;
    resultado: string;
    regra_aplicada: string | null;
    motivo: string;
    contexto: Record<string, unknown>;
  };
}

async function excecaoAberta(leadId: string) {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT motivo, roleta_slug FROM public.distribuicao_excecoes
        WHERE lead_id = $1 AND status IN ('pendente','em_analise')`,
      [leadId],
    )
  ).rows[0] as { motivo: string; roleta_slug: string | null } | undefined;
}

async function criarCampanha(nome: string, equipe: UsuarioTeste[]): Promise<string> {
  await comoUsuario(c, admin.id);
  const r = (
    await c.query(
      `SELECT public.criar_roleta_campanha($1, NULL, NULL, false, 'barra-funda') AS r`,
      [nome],
    )
  ).rows[0].r as { roleta: { slug: string } };
  await comoSuperuser(c);
  const slug = r.roleta.slug;
  roletasCriadas.push(slug);
  for (const u of equipe) {
    await c.query(
      `INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo)
       SELECT r.id, $2, true FROM public.roletas r WHERE r.slug = $1`,
      [slug, u.id],
    );
  }
  return slug;
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await comoSuperuser(c);
  for (const chave of [
    "zona_estrita",
    "modelo_v2_ativo",
    "percentual_minimo_trabalhado",
    "vez_unica_por_zona",
    "limite_diario_default",
    "marquinhos_antes_da_zona",
  ]) {
    const r = await c.query(`SELECT valor FROM public.distribuicao_settings WHERE chave = $1`, [
      chave,
    ]);
    settingsAntes.set(chave, r.rows[0]?.valor);
  }
  await setSetting("zona_estrita", true);
  await setSetting("modelo_v2_ativo", false);
  await setSetting("percentual_minimo_trabalhado", 0);
  await setSetting("vez_unica_por_zona", false);
  await setSetting("marquinhos_antes_da_zona", true);
  // A cota não é o assunto aqui (a virada para 20 é conferida no 1º teste).
  await setSetting("limite_diario_default", 1000);

  admin = await criarUsuario(c, { nome: "Ada Admin", papel: "admin" });
  bia = await criarUsuario(c, { nome: "Bia Barra" });
  lia = await criarUsuario(c, { nome: "Lia Liberdade" });
  bela = await criarUsuario(c, { nome: "Bela Belem" });

  await comoSuperuser(c);
  for (const [i, u] of [bia, lia, bela].entries()) {
    await c.query(`UPDATE public.profiles SET telefone = $2, ativo = true WHERE id = $1`, [
      u.id,
      `119666600${String(i).padStart(2, "0")}`,
    ]);
  }
  await darRegiao(c, bia.id, ["Oeste"]);
  await darRegiao(c, lia.id, ["Centro"]);
  await darRegiao(c, bela.id, ["Grande SP"]);
  for (const u of [bia, lia, bela]) await checkin(u);
});

beforeEach(async () => {
  for (const u of [bia, lia, bela]) await presente(u, true);
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
  await c.query(
    `UPDATE public.roletas SET horario_inicio = NULL, horario_fim = NULL WHERE slug = 'marquinhos'`,
  );
  await zerarCursores();
  if (roletasCriadas.length > 0) {
    await c.query(`DELETE FROM public.roletas WHERE slug = ANY($1::text[])`, [roletasCriadas]);
  }
  await c.end();
});

describe("a virada", () => {
  it("Plantão, Landing e Base desligadas e intactas; campanhas de equipe fixa e sem filial", async () => {
    await comoSuperuser(c);
    const sist = (
      await c.query(
        `SELECT slug, ativo FROM public.roletas WHERE slug IN ('plantao','landing','base','marquinhos') ORDER BY slug`,
      )
    ).rows;
    expect(sist).toEqual([
      { slug: "base", ativo: false },
      { slug: "landing", ativo: false },
      { slug: "marquinhos", ativo: true },
      { slug: "plantao", ativo: false },
    ]);
    const campanhasErradas = (
      await c.query(
        `SELECT count(*)::int AS n FROM public.roletas
          WHERE tipo = 'campanha' AND (NOT equipe_fixa OR filial_id IS NOT NULL)`,
      )
    ).rows[0].n;
    expect(campanhasErradas).toBe(0);
  });

  it("origens só na Marquinhos ou nas filiais; cron do estoque pelas filiais; cota padrão 20; rollback no audit_log", async () => {
    await comoSuperuser(c);
    const origens = (
      await c.query(
        `SELECT origem::text, roleta_slug FROM public.distribuicao_config WHERE roleta_slug IS NOT NULL`,
      )
    ).rows;
    expect(origens).toEqual([{ origem: "chatbot", roleta_slug: "marquinhos" }]);
    const jobs = (
      await c.query(
        `SELECT jobname, command FROM cron.job WHERE jobname LIKE 'distribuir-estoque%' ORDER BY 1`,
      )
    ).rows;
    expect(jobs).toEqual([
      {
        jobname: "distribuir-estoque-filiais",
        command: "SELECT public.distribuir_estoque_filiais(30);",
      },
    ]);
    // Este arquivo trocou a cota; a virada é conferida pelo registro dela.
    const cota = (
      await c.query(
        `SELECT valores_antigos->'valor' AS antes, valores_novos->'valor' AS depois
           FROM public.audit_log
          WHERE tabela = 'distribuicao_settings' AND valores_novos->>'_migracao' = '0083'
            AND valores_novos->>'chave' = 'limite_diario_default'`,
      )
    ).rows;
    expect(cota).toEqual([{ antes: 10, depois: 20 }]);
    const plantao = (
      await c.query(
        `SELECT valores_antigos->>'ativo' AS antes, valores_novos->>'ativo' AS depois
           FROM public.audit_log
          WHERE tabela = 'roletas' AND valores_novos->>'_migracao' = '0083'
            AND valores_novos->>'slug' = 'plantao'`,
      )
    ).rows;
    expect(plantao).toEqual([{ antes: "true", depois: "false" }]);
  });
});

describe("o rodízio do lead sem zona", () => {
  it("alterna entre as filiais na ordem: Barra Funda, Liberdade, Belém, Barra Funda", async () => {
    const entregas = [];
    for (const origem of ["site", "outro", "facebook", "indicacao"]) {
      entregas.push(await leadSemZona({ origem }));
    }
    expect(entregas.map((e) => e.roleta_slug)).toEqual([
      "filial-barra-funda",
      "filial-liberdade",
      "filial-belem",
      "filial-barra-funda",
    ]);
    expect(entregas.map((e) => e.corretor_id)).toEqual([bia.id, lia.id, bela.id, bia.id]);
    const log = await ultimoLog(entregas[1].lead_id);
    expect(log.roleta_slug).toBe("filial-liberdade");
    expect(log.motivo).toContain("rodízio entre as filiais (lead sem zona)");
    expect(log.contexto.sem_zona_rodizio).toBe(true);
  });

  it("filial sem ninguém apto é pulada — e quem já teve o lead não conta", async () => {
    await presente(lia, false);
    const a = await leadSemZona();
    const b = await leadSemZona();
    expect([a.roleta_slug, b.roleta_slug]).toEqual(["filial-barra-funda", "filial-belem"]);
    await presente(lia, true);

    // Liberdade é a próxima, mas a única apta dela (Lia) já teve este lead.
    const d = await leadSemZona({ tentaram: [lia.id] });
    expect(d.roleta_slug).not.toBe("filial-liberdade");
    expect(d.corretor_id).not.toBe(lia.id);
  });

  it("nenhuma filial pronta: espera na primeira com time, com o motivo que o fallback do cron conhece", async () => {
    for (const u of [bia, lia, bela]) await presente(u, false);
    const e = await leadSemZona();
    expect(e.corretor_id).toBeNull();
    const exc = await excecaoAberta(e.lead_id);
    expect(exc?.motivo).toBe("sem_corretor_elegivel");
    expect(exc?.roleta_slug).toBe("filial-barra-funda");
    const log = await ultimoLog(e.lead_id);
    expect(log.motivo).toContain("Lead sem zona: nenhuma filial com corretor apto agora");
  });

  it("o pino de filial (repasse) vale se ela estiver pronta; senão o rodízio decide", async () => {
    const fica = await leadSemZona({ pino: "filial-belem", tentaram: [bia.id] });
    expect(fica.roleta_slug).toBe("filial-belem");
    expect(fica.corretor_id).toBe(bela.id);

    await zerarCursores();
    const sai = await leadSemZona({ pino: "filial-belem", tentaram: [bela.id] });
    expect(sai.corretor_id).not.toBeNull();
    expect(sai.roleta_slug).not.toBe("filial-belem");
  });

  it("vários leads na MESMA transação (o lote do cron) também alternam", async () => {
    // Cinco: com now() (o mesmo para a transação inteira) os três primeiros
    // ainda saem certos (cursores NULL); do 4º em diante as filiais empatam e
    // a primeira da ordem ganhava sempre — BF, Lib, Belém, BF, BF.
    const ids: string[] = [];
    for (let i = 0; i < 5; i++)
      ids.push(await criarLead(c, { telefone: novoTelefone(), origem: "site" }));
    await comoSuperuser(c);
    await c.query("BEGIN");
    try {
      for (const id of ids) {
        await c.query(`SELECT public.triar_e_distribuir_lead($1::uuid, 'teste')`, [id]);
      }
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
    const slugs = (
      await c.query(`SELECT id, roleta_slug FROM public.leads WHERE id = ANY($1::uuid[])`, [ids])
    ).rows as { id: string; roleta_slug: string }[];
    const porId = new Map(slugs.map((r) => [r.id, r.roleta_slug]));
    expect(ids.map((id) => porId.get(id))).toEqual([
      "filial-barra-funda",
      "filial-liberdade",
      "filial-belem",
      "filial-barra-funda",
      "filial-liberdade",
    ]);
  });

  it("dois leads ao mesmo tempo vão para filiais diferentes, sem um esperar o outro", async () => {
    const a = await criarLead(c, { telefone: novoTelefone(), origem: "site" });
    const b = await criarLead(c, { telefone: novoTelefone(), origem: "site" });
    const c1 = novoClient();
    const c2 = novoClient();
    await c1.connect();
    await c2.connect();
    try {
      await c1.query("BEGIN");
      await c1.query(`SELECT public.triar_e_distribuir_lead($1::uuid, 'teste')`, [a]);
      await c2.query("BEGIN");
      await c2.query("SET LOCAL lock_timeout = '3s'");
      await c2.query(`SELECT public.triar_e_distribuir_lead($1::uuid, 'teste')`, [b]);
      await c2.query("COMMIT");
      await c1.query("COMMIT");
    } finally {
      await c1.end();
      await c2.end();
    }
    await comoSuperuser(c);
    const r = (
      await c.query(`SELECT roleta_slug FROM public.leads WHERE id = ANY($1::uuid[])`, [[a, b]])
    ).rows.map((x) => x.roleta_slug as string);
    expect(new Set(r).size).toBe(2);
  });
});

describe("pedidos e atribuições", () => {
  it("pedido de roleta desligada (o Plantão) é ignorado e fica no contexto", async () => {
    const id = await criarLead(c, { telefone: novoTelefone(), origem: "site" });
    await comoSuperuser(c);
    await c.query(
      `SELECT public._distribuir_lead_v3($1::uuid, 'automatica', 'plantao', NULL, NULL, 'teste', '{}'::jsonb, true)`,
      [id],
    );
    const log = await ultimoLog(id);
    expect(log.resultado).toBe("sucesso");
    expect(log.roleta_slug).toBe("filial-barra-funda");
    expect(log.contexto.roleta_pedida).toBe("plantao");
  });

  it("atribuição direta de lead sem zona: o log leva a filial do corretor, nunca NULL", async () => {
    const id = await criarLead(c, { telefone: novoTelefone(), origem: "site" });
    await comoSuperuser(c);
    await c.query(
      `SELECT public._distribuir_lead_v3($1::uuid, 'manual', NULL, $2, NULL, 'teste', '{}'::jsonb, true)`,
      [id, bela.id],
    );
    const log = await ultimoLog(id);
    expect(log.regra_aplicada).toBe("manual_direta");
    expect(log.roleta_slug).toBe("filial-belem");

    // Corretor sem filial nenhuma: a primeira do rodízio (nunca NULL).
    const solto = await criarUsuario(c, { nome: "Sol Solto" });
    const id2 = await criarLead(c, { telefone: novoTelefone(), origem: "site" });
    await comoSuperuser(c);
    await c.query(
      `SELECT public._distribuir_lead_v3($1::uuid, 'manual', NULL, $2, NULL, 'teste', '{}'::jsonb, true)`,
      [id2, solto.id],
    );
    expect((await ultimoLog(id2)).roleta_slug).toMatch(/^filial-/);
  });
});

describe("Marquinhos", () => {
  it("lead do bot sem zona vai para a Marquinhos; vazia ou fora do horário, para as filiais", async () => {
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo)
       SELECT r.id, $1, true FROM public.roletas r WHERE r.slug = 'marquinhos'
       ON CONFLICT (roleta_id, corretor_id) DO UPDATE SET ativo = true, pausado_ate = NULL`,
      [lia.id],
    );
    const bot = await leadSemZona({ origem: "chatbot" });
    expect(bot.corretor_id).toBe(lia.id);
    expect((await ultimoLog(bot.lead_id)).roleta_slug).toBe("marquinhos");

    // Fora do horário: não segura o lead (antes ficava 'adiado').
    await c.query(
      `UPDATE public.roletas SET horario_inicio = (now() AT TIME ZONE 'America/Sao_Paulo')::time + interval '2 hours',
              horario_fim = (now() AT TIME ZONE 'America/Sao_Paulo')::time + interval '3 hours',
              permitir_fora_horario = false
        WHERE slug = 'marquinhos'`,
    );
    const fora = await leadSemZona({ origem: "chatbot" });
    expect(fora.roleta_slug).toMatch(/^filial-/);
    const log = await ultimoLog(fora.lead_id);
    expect(log.contexto.origem_fallback).toBe("marquinhos");
    await c.query(
      `UPDATE public.roletas SET horario_inicio = NULL, horario_fim = NULL, permitir_fora_horario = true
        WHERE slug = 'marquinhos'`,
    );

    // Vazia: as filiais.
    await c.query(
      `UPDATE public.roleta_participantes rp SET ativo = false
         FROM public.roletas r WHERE r.id = rp.roleta_id AND r.slug = 'marquinhos'`,
    );
    const vazia = await leadSemZona({ origem: "chatbot" });
    expect(vazia.roleta_slug).toMatch(/^filial-/);
  });
});

describe("campanhas", () => {
  it("nasce de equipe fixa e sem filial, mesmo pedindo o contrário; o UPDATE direto é forçado também", async () => {
    const slug = await criarCampanha("Campanha Teste Simples", []);
    await comoSuperuser(c);
    const r = (
      await c.query(`SELECT equipe_fixa, filial_id FROM public.roletas WHERE slug = $1`, [slug])
    ).rows[0];
    expect(r).toEqual({ equipe_fixa: true, filial_id: null });
    await c.query(
      `UPDATE public.roletas SET equipe_fixa = false,
              filial_id = (SELECT id FROM public.filiais WHERE slug = 'belem')
        WHERE slug = $1`,
      [slug],
    );
    const depois = (
      await c.query(`SELECT equipe_fixa, filial_id FROM public.roletas WHERE slug = $1`, [slug])
    ).rows[0];
    expect(depois).toEqual({ equipe_fixa: true, filial_id: null });
  });

  it("a equipe recebe de qualquer zona; sem ninguém apto: a filial da zona, ou o rodízio sem zona", async () => {
    const slug = await criarCampanha("Campanha Qualquer Zona", [bia]);
    // Lead da Grande SP (Belém) vai para a Bia, da Barra Funda, pela campanha.
    const id = await criarLead(c, { telefone: novoTelefone(), origem: "facebook" });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET zona = 'Grande SP' WHERE id = $1`, [id]);
    await c.query(`SELECT public.distribuir_lead_ponderado($1::uuid, $2)`, [id, slug]);
    expect(
      (await c.query(`SELECT corretor_id FROM public.leads WHERE id = $1`, [id])).rows[0]
        .corretor_id,
    ).toBe(bia.id);

    await presente(bia, false);
    const comZona = await criarLead(c, { telefone: novoTelefone(), origem: "facebook" });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET zona = 'Centro' WHERE id = $1`, [comZona]);
    await c.query(`SELECT public.distribuir_lead_ponderado($1::uuid, $2)`, [comZona, slug]);
    expect(
      (await c.query(`SELECT corretor_id, roleta_slug FROM public.leads WHERE id = $1`, [comZona]))
        .rows[0],
    ).toEqual({ corretor_id: lia.id, roleta_slug: "filial-liberdade" });

    const semZona = await criarLead(c, { telefone: novoTelefone(), origem: "facebook" });
    await comoSuperuser(c);
    const res = (
      await c.query(`SELECT public.distribuir_lead_ponderado($1::uuid, $2) AS r`, [semZona, slug])
    ).rows[0].r as { ok: boolean };
    expect(res.ok).toBe(true);
    const lead = (
      await c.query(`SELECT corretor_id, roleta_slug FROM public.leads WHERE id = $1`, [semZona])
    ).rows[0];
    expect(lead.roleta_slug).toMatch(/^filial-/);
    expect([lia.id, bela.id]).toContain(lead.corretor_id);
    expect((await ultimoLog(semZona)).contexto.equipe_sem_apto).toBe(true);
  });

  it("repasse na campanha, lead sem zona e ninguém mais na equipe: o rodízio entre as filiais", async () => {
    const slug = await criarCampanha("Campanha Repasse", [bia]);
    const id = await criarLead(c, { telefone: novoTelefone(), origem: "facebook" });
    await comoSuperuser(c);
    await c.query(`SELECT public.distribuir_lead_ponderado($1::uuid, $2)`, [id, slug]);
    expect(
      (await c.query(`SELECT corretor_id FROM public.leads WHERE id = $1`, [id])).rows[0]
        .corretor_id,
    ).toBe(bia.id);
    // Como os chamadores fazem: o dono vai para a lista de quem já teve.
    await c.query(
      `UPDATE public.leads SET corretores_que_tentaram = array_append(COALESCE(corretores_que_tentaram, '{}'), corretor_id) WHERE id = $1`,
      [id],
    );
    await c.query(`SELECT public._repassar_lead_campanha($1::uuid, $2, 'teste')`, [id, slug]);
    const lead = (
      await c.query(`SELECT corretor_id, roleta_slug FROM public.leads WHERE id = $1`, [id])
    ).rows[0];
    expect(lead.corretor_id).not.toBe(bia.id);
    expect(lead.roleta_slug).toMatch(/^filial-/);
  });
});

describe("as RPCs da Central", () => {
  it("origem só vai para a Marquinhos ou para as filiais; o Plantão não volta pela tela", async () => {
    await comoUsuario(c, admin.id);
    expect(
      await errCode(
        c.query(
          `SELECT public.atualizar_distribuicao_config('site'::public.lead_origem, 'plantao')`,
        ),
      ),
    ).toBe("22023");
    expect(
      await errCode(
        c.query(
          `SELECT public.atualizar_distribuicao_config('site'::public.lead_origem, 'marquinhos')`,
        ),
      ),
    ).toBeNull();
    expect(
      await errCode(
        c.query(
          `SELECT public.atualizar_distribuicao_config('site'::public.lead_origem, NULL, true)`,
        ),
      ),
    ).toBeNull();
    expect(await errCode(c.query(`SELECT public.atualizar_roleta('plantao', true)`))).toBe("22023");
    await comoSuperuser(c);
  });

  it("o painel conta pessoas nas filiais (uma vez) e mantém as chaves antigas", async () => {
    // Bela também na Barra Funda: duas filiais, uma pessoa.
    await darRegiao(c, bela.id, ["Oeste", "Grande SP"]);
    await comoUsuario(c, admin.id);
    const p = (await c.query(`SELECT public.painel_distribuicao_resumo() AS p`)).rows[0]
      .p as Record<string, unknown>;
    await comoSuperuser(c);
    expect(p.aptos_filiais).toBe(3);
    expect(p.aptos_plantao).toBe(p.aptos_filiais);
    expect(p.aptos_landing).toBe(p.aptos_filiais);
    expect((p.aptos_por_filial as Record<string, number>)["filial-barra-funda"]).toBe(2);
    expect(p.sem_zona_da_vez).toMatch(/^filial-/);
  });
});
