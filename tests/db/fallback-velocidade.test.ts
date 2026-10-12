/**
 * Fallback por velocidade e a localização que barra — migration
 * 20261019120000 (drizzle 0080).
 *
 * O que entrou direto em produção em 12/10/2026 (e o dono confirmou: "sim"):
 * roleta sem ninguém apto → o lead vai para o corretor mais rápido entre os
 * ativos no CRM nos últimos 30 min (fallback_velocidade_ranking,
 * _fallback_velocidade, processar_distribuicao_automatica,
 * corretor_velocidade + recalcular_velocidade_contato de hora em hora).
 *
 * Decisões do dono (12/10/2026): "localização deve barrar caso não esteja na
 * filial" (presenca_loja_exige_localizacao ligada) e, no fallback, "Barrado
 * pela localização fica fora" — quem escolheu uma filial e o GPS barrou não
 * recebe nem pelo fallback no dia; quem marcou "Em casa" com sinceridade,
 * mesmo recusado pelas vendas, continua no fallback.
 *
 * Elenco (todos com telefone; a Liberdade é a roleta deles):
 *   Rita Rápida  — ativa no CRM, sem check-in (só ausente)        score 80
 *   Cássia Casa  — "Em casa" com 0 vendas (recusado pelas vendas)  score 50
 *   Lucas Lento  — ativo no CRM, sem check-in                       score 20
 *   Gabi GPS     — filial a 5 km (fora_da_filial)                   score 95
 *   Nina Sem GPS — filial sem localização (sem_localizacao)         score 90
 *   Paula Pausa  — ativa no CRM, mas pausada na roleta              score 98
 *   Ivo Inativo  — sem nenhuma ação no CRM                          score 99
 *   Bia Barra    — o time da Barra Funda (Oeste), sem check-in e sem ação
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

type Linha = {
  corretor_id: string;
  nome: string;
  min_desde_ultima_acao: string;
  score: string;
  pct_15min: string;
  recebidos_14d: number;
  roleta_ok: string;
};
type Checkin = {
  modo: string;
  apto_roleta: boolean;
  motivo: string | null;
  localizacao: string | null;
};

const c = novoClient();
const settingsAntes = new Map<string, unknown>();
const CHAVES = [
  "zona_estrita",
  "modelo_v2_ativo",
  "percentual_minimo_trabalhado",
  "sdr_ativo",
  "roleta_sdr_regra_ativa",
  "vez_unica_por_zona",
  "fallback_velocidade_ativo",
  "fallback_velocidade_atividade_min",
  "velocidade_janela_dias",
  "presenca_loja_exige_localizacao",
  "presenca_casa_min_vendas_mes_anterior",
];

let gestor: UsuarioTeste;
let rita: UsuarioTeste;
let cassia: UsuarioTeste;
let lucas: UsuarioTeste;
let gabi: UsuarioTeste;
let nina: UsuarioTeste;
let paula: UsuarioTeste;
let ivo: UsuarioTeste;
let bia: UsuarioTeste;
let barraFunda: { lat: number; lng: number };

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

async function checkin(
  u: UsuarioTeste,
  modo: "loja" | "casa",
  filial: string | null = null,
  geo: { lat: number; lng: number } | null = null,
): Promise<Checkin> {
  await comoUsuario(c, u.id);
  try {
    const r = await c.query(`SELECT public.presenca_checkin($1, $2, $3, $4, 20) AS s`, [
      modo,
      filial,
      geo?.lat ?? null,
      geo?.lng ?? null,
    ]);
    return r.rows[0].s.checkin as Checkin;
  } finally {
    await comoSuperuser(c);
  }
}

/** Uma ação do corretor no CRM agora (o que o audit_log registra). */
async function agiuNoCrm(u: UsuarioTeste) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_novos)
     VALUES ('leads', gen_random_uuid(), 'UPDATE', $1, '{"teste": "fallback"}'::jsonb)`,
    [u.id],
  );
}

async function velocidade(u: UsuarioTeste, score: number) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.corretor_velocidade
       (corretor_id, recebidos, contatados, contatados_15min, pct_15min, pct_contato, score)
     VALUES ($1, 10, 10, 5, 50, 100, $2)
     ON CONFLICT (corretor_id) DO UPDATE SET score = EXCLUDED.score`,
    [u.id, score],
  );
}

async function ranking(leadId: string): Promise<Linha[]> {
  await comoSuperuser(c);
  return (await c.query(`SELECT * FROM public.fallback_velocidade_ranking($1)`, [leadId]))
    .rows as Linha[];
}
const nomes = (ls: Linha[]) => ls.map((l) => l.nome);

async function leadNaZona(zona: string): Promise<string> {
  const id = await criarLead(c, { telefone: novoTelefone() });
  await comoSuperuser(c);
  await c.query(`UPDATE public.leads SET zona = $2 WHERE id = $1`, [id, zona]);
  return id;
}

/** Tira o lead do caminho do cron (os testes de ranking não querem entrega). */
async function arquivar(leadId: string) {
  await comoSuperuser(c);
  await c.query(`UPDATE public.leads SET deleted_at = now() WHERE id = $1`, [leadId]);
}

async function motivosNaLiberdade(u: UsuarioTeste): Promise<string[]> {
  await comoSuperuser(c);
  return (
    await c.query(`SELECT motivos FROM public._elegibilidade_roleta('filial-liberdade', $1)`, [
      u.id,
    ])
  ).rows[0].motivos as string[];
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await comoSuperuser(c);
  for (const chave of CHAVES) {
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
  await setSetting("vez_unica_por_zona", false);
  await setSetting("fallback_velocidade_ativo", true);
  await setSetting("fallback_velocidade_atividade_min", 30);
  await setSetting("velocidade_janela_dias", 14);
  await setSetting("presenca_casa_min_vendas_mes_anterior", 3);
  // A decisão do dono (12/10): a localização barra. limparDados() desliga
  // para os fixtures dos outros arquivos; aqui ela vale.
  await setSetting("presenca_loja_exige_localizacao", true);

  gestor = await criarUsuario(c, { nome: "Gil Gestor", papel: "gestor" });
  rita = await criarUsuario(c, { nome: "Rita Rápida" });
  cassia = await criarUsuario(c, { nome: "Cássia Casa" });
  lucas = await criarUsuario(c, { nome: "Lucas Lento" });
  gabi = await criarUsuario(c, { nome: "Gabi GPS" });
  nina = await criarUsuario(c, { nome: "Nina Sem GPS" });
  paula = await criarUsuario(c, { nome: "Paula Pausa" });
  ivo = await criarUsuario(c, { nome: "Ivo Inativo" });
  bia = await criarUsuario(c, { nome: "Bia Barra" });

  const equipe = [rita, cassia, lucas, gabi, nina, paula, ivo, bia];
  await comoSuperuser(c);
  for (const u of equipe) {
    await c.query(`UPDATE public.profiles SET telefone = $2, ativo = true WHERE id = $1`, [
      u.id,
      novoTelefone(),
    ]);
  }
  // Centro → roleta da Liberdade; Oeste → roleta da Barra Funda.
  for (const u of [rita, cassia, lucas, gabi, nina, paula, ivo])
    await darRegiao(c, u.id, ["Centro"]);
  await darRegiao(c, bia.id, ["Oeste"]);
  await c.query(
    `UPDATE public.roleta_participantes rp SET pausado_ate = now() + interval '1 day',
            motivo_pausa = 'teste'
       FROM public.roletas r
      WHERE r.id = rp.roleta_id AND r.slug = 'filial-liberdade' AND rp.corretor_id = $1`,
    [paula.id],
  );

  const f = (
    await c.query(`SELECT latitude, longitude FROM public.filiais WHERE slug = 'barra-funda'`)
  ).rows[0] as { latitude: number; longitude: number };
  barraFunda = { lat: f.latitude, lng: f.longitude };

  for (const [u, s] of [
    [rita, 80],
    [cassia, 50],
    [lucas, 20],
    [gabi, 95],
    [nina, 90],
    [paula, 98],
    [ivo, 99],
  ] as const) {
    await velocidade(u, s);
  }
  for (const u of [rita, cassia, lucas, gabi, nina, paula]) await agiuNoCrm(u);
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
  await limparDados(c);
  await c.end();
});

describe("o check-in com a localização exigida (decisão do dono, 12/10)", () => {
  it("filial a 5 km: registra, mas não libera (fora_da_filial)", async () => {
    // ~0,045° de latitude ≈ 5 km ao sul da loja.
    const ck = await checkin(gabi, "loja", "barra-funda", {
      lat: barraFunda.lat - 0.045,
      lng: barraFunda.lng,
    });
    expect(ck).toMatchObject({
      modo: "loja",
      apto_roleta: false,
      motivo: "fora_da_filial",
      localizacao: "fora_do_raio",
    });
  });

  it("filial sem localização: não libera (sem_localizacao)", async () => {
    const ck = await checkin(nina, "loja", "barra-funda");
    expect(ck).toMatchObject({ apto_roleta: false, motivo: "sem_localizacao" });
  });

  it("'Em casa' sem a meta do mês anterior: não libera (casa_abaixo_minimo_vendas)", async () => {
    const ck = await checkin(cassia, "casa");
    expect(ck).toMatchObject({
      modo: "casa",
      apto_roleta: false,
      motivo: "casa_abaixo_minimo_vendas",
    });
  });

  it("para a roleta, os três estão só ausentes — é o ranking que separa", async () => {
    for (const u of [gabi, nina, cassia, rita]) {
      expect(await motivosNaLiberdade(u)).toEqual(["ausente_hoje"]);
    }
    expect(await motivosNaLiberdade(paula)).toEqual(expect.arrayContaining(["pausado"]));
  });
});

describe("fallback_velocidade_ranking", () => {
  let lead: string;
  beforeAll(async () => {
    lead = await leadNaZona("Oeste");
    await arquivar(lead);
  });

  it("entra quem agiu no CRM e só não está apto por ausência, do mais rápido ao mais lento", async () => {
    const r = await ranking(lead);
    expect(nomes(r)).toEqual(["Rita Rápida", "Cássia Casa", "Lucas Lento"]);
    expect(r[0]).toMatchObject({ roleta_ok: "filial-liberdade" });
    expect(Number(r[0].score)).toBe(80);
    expect(Number(r[0].min_desde_ultima_acao)).toBeLessThan(30);
  });

  it("[PRESENÇA 12/10] fora: barrados pela localização hoje (fora_da_filial e sem_localizacao)", async () => {
    const ids = (await ranking(lead)).map((l) => l.corretor_id);
    expect(ids).not.toContain(gabi.id);
    expect(ids).not.toContain(nina.id);
  });

  it("dentro: 'Em casa' recusado pelas vendas (marcou em casa com sinceridade)", async () => {
    const ids = (await ranking(lead)).map((l) => l.corretor_id);
    expect(ids).toContain(cassia.id);
  });

  it("fora: sem ação no CRM na janela, pausado, e quem já teve o lead", async () => {
    let ids = (await ranking(lead)).map((l) => l.corretor_id);
    expect(ids).not.toContain(ivo.id);
    expect(ids).not.toContain(paula.id);
    expect(ids).not.toContain(bia.id);

    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET corretores_que_tentaram = $2::uuid[] WHERE id = $1`, [
      lead,
      [rita.id],
    ]);
    ids = (await ranking(lead)).map((l) => l.corretor_id);
    expect(ids).toEqual([cassia.id, lucas.id]);
  });

  it("a janela de atividade é a da chave: com 0 minutos, ninguém conta como ativo", async () => {
    await setSetting("fallback_velocidade_atividade_min", 0);
    try {
      expect(await ranking(lead)).toEqual([]);
    } finally {
      await setSetting("fallback_velocidade_atividade_min", 30);
    }
  });
});

describe("_fallback_velocidade", () => {
  it("desligado pela chave: não entrega e diz por quê", async () => {
    const lead = await leadNaZona("Oeste");
    await setSetting("fallback_velocidade_ativo", false);
    try {
      const r = (await c.query(`SELECT public._fallback_velocidade($1) AS r`, [lead])).rows[0].r;
      expect(r).toEqual({ ok: false, motivo: "fallback_desligado" });
      const l = (await c.query(`SELECT corretor_id FROM public.leads WHERE id = $1`, [lead]))
        .rows[0];
      expect(l.corretor_id).toBeNull();
    } finally {
      await setSetting("fallback_velocidade_ativo", true);
      await arquivar(lead);
    }
  });

  it("lead da base não é do fallback", async () => {
    const lead = await leadNaZona("Oeste");
    await c.query(`UPDATE public.leads SET classe_lead = 'base' WHERE id = $1`, [lead]);
    const r = (await c.query(`SELECT public._fallback_velocidade($1) AS r`, [lead])).rows[0].r;
    expect(r).toEqual({ ok: false, motivo: "lead_fora_do_escopo" });
    await arquivar(lead);
  });
});

describe("processar_distribuicao_automatica (o cron)", () => {
  it("filial do lead sem ninguém apto: entrega ao mais rápido ativo, com a regra 'fallback_velocidade'", async () => {
    const lead = await leadNaZona("Oeste");
    await comoSuperuser(c);
    const res = (await c.query(`SELECT public.processar_distribuicao_automatica() AS r`)).rows[0]
      .r as Record<string, number>;
    expect(res).toMatchObject({ distribuidos: 0, fallback_velocidade: 1, sem_corretor: 0 });

    const l = (await c.query(`SELECT corretor_id FROM public.leads WHERE id = $1`, [lead])).rows[0];
    expect(l.corretor_id).toBe(rita.id);

    const logs = (
      await c.query(
        `SELECT corretor_id, tipo::text, resultado, regra_aplicada, roleta_slug, motivo
           FROM public.distribution_log WHERE lead_id = $1 ORDER BY created_at, resultado`,
        [lead],
      )
    ).rows as {
      corretor_id: string | null;
      tipo: string;
      resultado: string;
      regra_aplicada: string | null;
      roleta_slug: string | null;
      motivo: string;
    }[];
    // A triagem tentou a roleta da Barra Funda (Bia, ausente) e não achou;
    // o fallback entregou à Rita.
    expect(logs.find((x) => x.resultado === "sem_corretor")).toMatchObject({
      roleta_slug: "filial-barra-funda",
    });
    const entrega = logs.find((x) => x.resultado === "sucesso");
    expect(entrega).toMatchObject({
      corretor_id: rita.id,
      tipo: "automatica",
      regra_aplicada: "fallback_velocidade",
    });
    expect(entrega?.motivo).toMatch(
      /^Fallback por velocidade: ninguém apto na roleta; foi para o mais rápido ativo no CRM \(Rita Rápida, /,
    );

    // A exceção aberta pela triagem fica resolvida pela entrega.
    const abertas = (
      await c.query(
        `SELECT count(*)::int AS n FROM public.distribuicao_excecoes
          WHERE lead_id = $1 AND status IN ('pendente', 'em_analise')`,
        [lead],
      )
    ).rows[0].n;
    expect(abertas).toBe(0);
  });

  it("lead com mais de 7 dias sem corretor não é reprocessado (fica com o Marquinhos)", async () => {
    const lead = await leadNaZona("Oeste");
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET created_at = now() - interval '8 days' WHERE id = $1`, [
      lead,
    ]);
    const res = (await c.query(`SELECT public.processar_distribuicao_automatica() AS r`)).rows[0]
      .r as Record<string, number>;
    expect(res).toMatchObject({ distribuidos: 0, fallback_velocidade: 0, sem_corretor: 0 });
    const l = (await c.query(`SELECT corretor_id FROM public.leads WHERE id = $1`, [lead])).rows[0];
    expect(l.corretor_id).toBeNull();
    await arquivar(lead);
  });

  it("fallback desligado: o lead espera (sem_corretor), como antes de 12/10", async () => {
    const lead = await leadNaZona("Oeste");
    await setSetting("fallback_velocidade_ativo", false);
    try {
      const res = (await c.query(`SELECT public.processar_distribuicao_automatica() AS r`)).rows[0]
        .r as Record<string, number>;
      expect(res).toMatchObject({ fallback_velocidade: 0, sem_corretor: 1 });
      const l = (await c.query(`SELECT corretor_id FROM public.leads WHERE id = $1`, [lead]))
        .rows[0];
      expect(l.corretor_id).toBeNull();
    } finally {
      await setSetting("fallback_velocidade_ativo", true);
      await arquivar(lead);
    }
  });
});

describe("barrado pela localização: quando volta", () => {
  let lead: string;
  beforeAll(async () => {
    lead = await leadNaZona("Oeste");
    await arquivar(lead);
  });

  it("trocar para 'Em casa' sem a meta, depois de barrado, não destrava", async () => {
    const ck = await checkin(gabi, "casa");
    expect(ck).toMatchObject({ apto_roleta: false, motivo: "casa_abaixo_minimo_vendas" });
    expect((await ranking(lead)).map((l) => l.corretor_id)).not.toContain(gabi.id);
  });

  it("'Confirmar no plantão' pela gestão destrava: deixou de ser barrado", async () => {
    await comoUsuario(c, gestor.id);
    const r = await c.query(
      `SELECT public.presenca_checkin('loja', 'barra-funda', NULL, NULL, NULL, $1) AS s`,
      [nina.id],
    );
    await comoSuperuser(c);
    expect(r.rows[0].s.checkin).toMatchObject({
      apto_roleta: true,
      localizacao: "confirmada_gestao",
    });
    const r2 = await ranking(lead);
    // Presente, apta na Liberdade: volta a contar — e é a mais rápida da fila.
    expect(r2[0].corretor_id).toBe(nina.id);
    expect(r2.map((l) => l.corretor_id)).not.toContain(gabi.id);
  });

  it("chegou na loja e o GPS confirmou: destrava também", async () => {
    const ck = await checkin(gabi, "loja", "barra-funda", {
      lat: barraFunda.lat + 0.0005,
      lng: barraFunda.lng,
    });
    expect(ck).toMatchObject({ apto_roleta: true, localizacao: "confirmada" });
    expect((await ranking(lead))[0].corretor_id).toBe(gabi.id);
  });
});

describe("recalcular_velocidade_contato (cron de hora em hora)", () => {
  it("conta contato em até 15 min úteis; nunca contatado é falha; score suavizado para a média", async () => {
    await comoSuperuser(c);
    // Duas entregas para a Rita e uma para o Lucas, há 3 dias às 10:00 BRT.
    const as10 = (
      await c.query(
        `SELECT ((date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') - interval '3 days'
                  + interval '10 hours') AT TIME ZONE 'America/Sao_Paulo') AS t`,
      )
    ).rows[0].t as Date;
    const entregar = async (u: UsuarioTeste, contatoMin: number | null) => {
      const id = await criarLead(c, { corretorId: u.id, telefone: novoTelefone() });
      await comoSuperuser(c);
      await c.query(
        `INSERT INTO public.distribution_log
           (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado, created_at)
         VALUES ($1, $2, 'automatica', 'teste velocidade', 'filial-liberdade', 'rodizio', 'sucesso', $3)`,
        [id, u.id, as10],
      );
      if (contatoMin !== null) {
        await c.query(
          `INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, conteudo, ocorreu_em)
           VALUES ($1, $2, 'whatsapp', 'saida', 'oi', $3::timestamptz + make_interval(mins => $4))`,
          [id, u.id, as10, contatoMin],
        );
      }
    };
    await entregar(rita, 10);
    await entregar(rita, null);
    await entregar(lucas, 40);

    const n = (await c.query(`SELECT public.recalcular_velocidade_contato() AS n`)).rows[0].n;
    expect(n).toBe(2);
    const v = (
      await c.query(
        `SELECT corretor_id, recebidos, contatados, contatados_15min,
                pct_15min::float AS pct_15min, pct_contato::float AS pct_contato, score::float AS score
           FROM public.corretor_velocidade ORDER BY score DESC`,
      )
    ).rows;
    // média do time = 1 em 15 min / 3 recebidos; k = 10.
    expect(v).toEqual([
      {
        corretor_id: rita.id,
        recebidos: 2,
        contatados: 1,
        contatados_15min: 1,
        pct_15min: 50,
        pct_contato: 50,
        score: 36.11,
      },
      {
        corretor_id: lucas.id,
        recebidos: 1,
        contatados: 1,
        contatados_15min: 0,
        pct_15min: 0,
        pct_contato: 100,
        score: 30.3,
      },
    ]);
  });

  it("está agendado de hora em hora, no minuto 7", async () => {
    await comoSuperuser(c);
    const job = (
      await c.query(
        `SELECT schedule, command FROM cron.job WHERE jobname = 'recalcular-velocidade-contato'`,
      )
    ).rows;
    expect(job).toEqual([
      { schedule: "7 * * * *", command: "SELECT public.recalcular_velocidade_contato();" },
    ]);
  });
});

describe("permissões", () => {
  it("pela API ninguém lê a velocidade nem chama as peças internas", async () => {
    await comoSuperuser(c);
    const p = (
      await c.query(
        `SELECT has_table_privilege('anon', 'public.corretor_velocidade', 'SELECT') AS anon_le,
                has_table_privilege('authenticated', 'public.corretor_velocidade', 'SELECT') AS auth_le,
                has_function_privilege('authenticated', 'public._fallback_velocidade(uuid)', 'EXECUTE') AS fb,
                has_function_privilege('authenticated', 'public.fallback_velocidade_ranking(uuid)', 'EXECUTE') AS rk,
                has_function_privilege('authenticated', 'public.recalcular_velocidade_contato()', 'EXECUTE') AS rc,
                has_function_privilege('anon', 'public.processar_distribuicao_automatica()', 'EXECUTE') AS pda_anon,
                has_function_privilege('service_role', 'public._fallback_velocidade(uuid)', 'EXECUTE') AS fb_srv`,
      )
    ).rows[0];
    expect(p).toEqual({
      anon_le: false,
      auth_le: false,
      fb: false,
      rk: false,
      rc: false,
      pda_anon: false,
      fb_srv: true,
    });

    await comoUsuario(c, rita.id);
    expect(await errCode(c.query(`SELECT * FROM public.corretor_velocidade`))).toBe("42501");
    expect(
      await errCode(c.query(`SELECT * FROM public.fallback_velocidade_ranking(gen_random_uuid())`)),
    ).toBe("42501");
    await comoSuperuser(c);
  });
});
