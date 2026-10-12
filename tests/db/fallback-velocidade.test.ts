/**
 * Fallback por velocidade, o check-in que ele exige e a localização que barra
 * — migration 20261019120000 (drizzle 0080).
 *
 * O que entrou direto em produção em 12/10/2026 (e o dono confirmou: "sim"):
 * roleta sem ninguém apto → o lead vai para o corretor mais rápido entre os
 * ativos no CRM nos últimos 30 min (fallback_velocidade_ranking,
 * _fallback_velocidade, processar_distribuicao_automatica,
 * corretor_velocidade + recalcular_velocidade_contato de hora em hora).
 *
 * Decisões do dono (12/10/2026) que o ranking passa a aplicar:
 *   D4 — quem escolheu uma filial e foi barrado pelo GPS fica FORA do
 *        fallback no dia; o "Em casa" sincero (mesmo recusado pelas vendas)
 *        pode receber.
 *   D5 — só com check-in de HOJE AINDA ABERTO: na filial liberado (GPS ou
 *        "Confirmar no plantão"), liberado pela gestão (interruptor) ou "Em
 *        casa" (liberado ou recusado pelas vendas). Sem check-in hoje,
 *        encerrado, de ontem ou desligado pela gestão = fora.
 *   Destrave do barrado: só um check-in POSTERIOR na loja que valeu (GPS ou
 *   gestão) ou o interruptor da gestão. "Em casa" depois não devolve o
 *   fallback, mesmo liberado com o mínimo 0.
 *   E o diagnóstico do GPS: presenca_checkin guarda por que a localização não
 *   veio (falha_localizacao), sem quebrar quem chama sem o parâmetro novo.
 *
 * Elenco (todos ativos no CRM, com telefone, na Roleta Liberdade — Centro —,
 * salvo dito; o score de velocidade mostra que quem fica fora não é por ser
 * lento):
 *   Rita Rápida     — filial Liberdade, o GPS confirmou            score 80  DENTRO
 *   Cássia Casa     — "Em casa", recusada pelas vendas (mínimo 3)  score 50  DENTRO
 *   Caio Casa       — "Em casa" liberado (mínimo 0 na hora)        score 45  DENTRO
 *   Yago Ontem      — barrado ONTEM; hoje "Em casa" recusado       score 40  DENTRO
 *   Lucas Sem       — nenhum check-in hoje                         score 85  fora
 *   Enzo Encerrou   — GPS confirmou, depois "Encerrar presença"    score 88  fora
 *   Olga Ontem      — check-in de ontem ainda aberto               score 87  fora
 *   Ian Interruptor — "Em casa" recusado; a gestão desliga         score 86  fora
 *   Gabi GPS        — filial a 5 km (fora_da_filial)               score 96  fora → GPS confirma
 *   Nina Sem GPS    — filial sem localização (sem_localizacao)     score 90  fora → gestão confirma
 *   Kátia Liberada  — sem localização; a gestão liga o interruptor score 92  fora → dentro
 *   Gustavo Casa    — barrado, depois "Em casa" LIBERADO (mín. 0)  score 93  fora
 *   Hugo Casa       — barrado, depois "Em casa" recusado           score 84  fora
 *   Rui Recaída     — GPS confirmou, depois barrado, depois casa   score 83  fora
 *   Paula Pausa     — GPS confirmou, mas pausada na roleta         score 98  fora
 *   Ivo Inativo     — "Em casa" recusado, sem ação no CRM          score 99  fora
 *   Bia Barra       — o time da Barra Funda (Oeste), sem check-in e sem ação
 *   Fábio Falha     — só o diagnóstico do GPS (fora de qualquer roleta)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  falha_localizacao?: string | null;
};
type Geo = { lat: number; lng: number };

const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261019120000_presenca_exigida_fallback_velocidade.sql",
);

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
const u: Record<string, UsuarioTeste> = {};
let liberdade: Geo;
let barraFunda: Geo;
let dentroLiberdade: Geo;
let longeLiberdade: Geo;

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

/** O check-in do próprio corretor (como a tela chama, sem o diagnóstico). */
async function checkin(
  x: UsuarioTeste,
  modo: "loja" | "casa",
  filial: string | null = null,
  geo: Geo | null = null,
): Promise<Checkin> {
  await comoUsuario(c, x.id);
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

/** "Em casa" com o mínimo de vendas da hora (0 = libera; 3 = recusa quem tem 0). */
async function casaComMinimo(x: UsuarioTeste, minimo: number): Promise<Checkin> {
  await setSetting("presenca_casa_min_vendas_mes_anterior", minimo);
  try {
    return await checkin(x, "casa");
  } finally {
    await setSetting("presenca_casa_min_vendas_mes_anterior", 3);
  }
}

/** "Confirmar no plantão": a gestão faz o check-in pelo corretor numa filial. */
async function confirmarNoPlantao(x: UsuarioTeste, filial: string): Promise<Checkin> {
  await comoUsuario(c, gestor.id);
  try {
    const r = await c.query(
      `SELECT public.presenca_checkin('loja', $1, NULL, NULL, NULL, $2) AS s`,
      [filial, x.id],
    );
    return r.rows[0].s.checkin as Checkin;
  } finally {
    await comoSuperuser(c);
  }
}

/** O interruptor de presença da Central (marcar_presenca_admin). */
async function interruptor(x: UsuarioTeste, ligado: boolean) {
  await comoUsuario(c, gestor.id);
  try {
    await c.query(`SELECT public.marcar_presenca_admin($1, $2)`, [x.id, ligado]);
  } finally {
    await comoSuperuser(c);
  }
}

/** "Encerrar presença" do próprio corretor (marcar_presenca(false)). */
async function encerrar(x: UsuarioTeste) {
  await comoUsuario(c, x.id);
  try {
    await c.query(`SELECT public.marcar_presenca(false)`);
  } finally {
    await comoSuperuser(c);
  }
}

/** Um check-in gravado ONTEM (como se fosse o de ontem, aberto ou encerrado). */
async function checkinDeOntem(
  x: UsuarioTeste,
  v: { apto: boolean; motivo: string | null; localizacao: string; encerrado: boolean },
) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.presenca_checkins
       (corretor_id, dia, modo, filial_id, apto_roleta, motivo, localizacao, origem,
        registrado_por, created_at, encerrado_em)
     SELECT $1, (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1, 'loja', f.id, $2, $3, $4,
            'corretor', $1, now() - interval '1 day',
            CASE WHEN $5 THEN now() - interval '20 hours' END
       FROM public.filiais f WHERE f.slug = 'liberdade'`,
    [x.id, v.apto, v.motivo, v.localizacao, v.encerrado],
  );
}

/** Uma ação do corretor no CRM agora (o que o audit_log registra). */
async function agiuNoCrm(x: UsuarioTeste) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_novos)
     VALUES ('leads', gen_random_uuid(), 'UPDATE', $1, '{"teste": "fallback"}'::jsonb)`,
    [x.id],
  );
}

async function velocidade(x: UsuarioTeste, score: number) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.corretor_velocidade
       (corretor_id, recebidos, contatados, contatados_15min, pct_15min, pct_contato, score)
     VALUES ($1, 10, 10, 5, 50, 100, $2)
     ON CONFLICT (corretor_id) DO UPDATE SET score = EXCLUDED.score`,
    [x.id, score],
  );
}

async function ranking(leadId: string): Promise<Linha[]> {
  await comoSuperuser(c);
  return (await c.query(`SELECT * FROM public.fallback_velocidade_ranking($1)`, [leadId]))
    .rows as Linha[];
}
const nomes = (ls: Linha[]) => ls.map((l) => l.nome);
const ids = async (leadId: string) => (await ranking(leadId)).map((l) => l.corretor_id);

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

async function naLiberdade(x: UsuarioTeste): Promise<{ apto: boolean; motivos: string[] }> {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT apto, motivos FROM public._elegibilidade_roleta('filial-liberdade', $1)`,
      [x.id],
    )
  ).rows[0];
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
  const elenco: [string, string, number | null][] = [
    ["rita", "Rita Rápida", 80],
    ["cassia", "Cássia Casa", 50],
    ["caio", "Caio Casa", 45],
    ["yago", "Yago Ontem", 40],
    ["lucas", "Lucas Sem", 85],
    ["enzo", "Enzo Encerrou", 88],
    ["olga", "Olga Ontem", 87],
    ["ian", "Ian Interruptor", 86],
    ["gabi", "Gabi GPS", 96],
    ["nina", "Nina Sem GPS", 90],
    ["katia", "Kátia Liberada", 92],
    ["gustavo", "Gustavo Casa", 93],
    ["hugo", "Hugo Casa", 84],
    ["rui", "Rui Recaída", 83],
    ["paula", "Paula Pausa", 98],
    ["ivo", "Ivo Inativo", 99],
    ["bia", "Bia Barra", null],
    ["fabio", "Fábio Falha", null],
  ];
  for (const [k, nome] of elenco) u[k] = await criarUsuario(c, { nome });

  await comoSuperuser(c);
  for (const [k] of elenco) {
    await c.query(`UPDATE public.profiles SET telefone = $2, ativo = true WHERE id = $1`, [
      u[k].id,
      novoTelefone(),
    ]);
  }
  // Centro → Roleta Liberdade; Oeste → Roleta Barra Funda. Fábio fica fora de
  // qualquer roleta (só o diagnóstico do GPS).
  for (const [k] of elenco) {
    if (k === "bia" || k === "fabio") continue;
    await darRegiao(c, u[k].id, ["Centro"]);
  }
  await darRegiao(c, u.bia.id, ["Oeste"]);
  await c.query(
    `UPDATE public.roleta_participantes rp SET pausado_ate = now() + interval '1 day',
            motivo_pausa = 'teste'
       FROM public.roletas r
      WHERE r.id = rp.roleta_id AND r.slug = 'filial-liberdade' AND rp.corretor_id = $1`,
    [u.paula.id],
  );
  // A barrada também está nos Agendados do SDR (decisão de 09/10: sem presença).
  await c.query(
    `INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo)
     SELECT id, $1, true FROM public.roletas WHERE slug = 'agendados-sdr'
     ON CONFLICT (roleta_id, corretor_id) DO UPDATE SET ativo = true`,
    [u.gabi.id],
  );

  const filial = async (slug: string): Promise<Geo> => {
    const f = (
      await c.query(`SELECT latitude, longitude FROM public.filiais WHERE slug = $1`, [slug])
    ).rows[0] as { latitude: number; longitude: number };
    return { lat: f.latitude, lng: f.longitude };
  };
  liberdade = await filial("liberdade");
  barraFunda = await filial("barra-funda");
  // ~55 m da loja (dentro do raio de 300 m) e ~5 km ao sul (fora).
  dentroLiberdade = { lat: liberdade.lat + 0.0005, lng: liberdade.lng };
  longeLiberdade = { lat: liberdade.lat - 0.045, lng: liberdade.lng };

  for (const [k, , s] of elenco) if (s !== null) await velocidade(u[k], s);
  for (const [k] of elenco) {
    if (k === "ivo" || k === "bia" || k === "fabio") continue;
    await agiuNoCrm(u[k]);
  }

  // Os check-ins de hoje (a ordem importa: o destrave olha o "depois").
  await checkin(u.rita, "loja", "liberdade", dentroLiberdade);
  await checkin(u.cassia, "casa");
  await casaComMinimo(u.caio, 0);
  await checkinDeOntem(u.yago, {
    apto: false,
    motivo: "fora_da_filial",
    localizacao: "fora_do_raio",
    encerrado: true,
  });
  await checkin(u.yago, "casa");
  await checkin(u.enzo, "loja", "liberdade", dentroLiberdade);
  await encerrar(u.enzo);
  await checkinDeOntem(u.olga, {
    apto: true,
    motivo: null,
    localizacao: "confirmada",
    encerrado: false,
  });
  // Ian faz o check-in no próprio teste do interruptor.
  await checkin(u.gabi, "loja", "barra-funda", {
    lat: barraFunda.lat - 0.045,
    lng: barraFunda.lng,
  });
  await checkin(u.nina, "loja", "barra-funda");
  await checkin(u.katia, "loja", "liberdade");
  await checkin(u.gustavo, "loja", "liberdade", longeLiberdade);
  await casaComMinimo(u.gustavo, 0);
  await checkin(u.hugo, "loja", "liberdade");
  await checkin(u.hugo, "casa");
  await checkin(u.rui, "loja", "liberdade", dentroLiberdade);
  await checkin(u.rui, "loja", "liberdade");
  await checkin(u.rui, "casa");
  await checkin(u.paula, "loja", "liberdade", dentroLiberdade);
  await checkin(u.ivo, "casa");
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
  it("o que cada check-in de hoje gravou", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT p.nome, c.modo, c.apto_roleta, c.motivo, c.localizacao, c.encerrado_em IS NULL AS aberto
         FROM public.presenca_checkins c JOIN public.profiles p ON p.id = c.corretor_id
        WHERE c.dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date
        ORDER BY c.created_at`,
    );
    const ultimo = new Map<string, Record<string, unknown>>();
    for (const row of r.rows) ultimo.set(row.nome, row);
    expect(ultimo.get("Rita Rápida")).toMatchObject({
      apto_roleta: true,
      localizacao: "confirmada",
    });
    expect(ultimo.get("Cássia Casa")).toMatchObject({
      modo: "casa",
      apto_roleta: false,
      motivo: "casa_abaixo_minimo_vendas",
    });
    expect(ultimo.get("Caio Casa")).toMatchObject({ modo: "casa", apto_roleta: true });
    expect(ultimo.get("Enzo Encerrou")).toMatchObject({ apto_roleta: true, aberto: false });
    expect(ultimo.get("Gabi GPS")).toMatchObject({
      modo: "loja",
      apto_roleta: false,
      motivo: "fora_da_filial",
      localizacao: "fora_do_raio",
    });
    expect(ultimo.get("Nina Sem GPS")).toMatchObject({
      apto_roleta: false,
      motivo: "sem_localizacao",
    });
    // Barrado e depois "Em casa" com o mínimo 0: a ROLETA libera (regra da
    // presença); o fallback é que não (abaixo).
    expect(ultimo.get("Gustavo Casa")).toMatchObject({ modo: "casa", apto_roleta: true });
    expect(ultimo.has("Lucas Sem")).toBe(false);
    expect(ultimo.has("Olga Ontem")).toBe(false);
  });

  it("para a roleta, quem não liberou está só ausente — é o ranking que separa", async () => {
    for (const k of ["gabi", "nina", "cassia", "lucas", "olga", "enzo", "hugo", "rui"]) {
      expect((await naLiberdade(u[k])).motivos).toEqual(["ausente_hoje"]);
    }
    expect(await naLiberdade(u.gustavo)).toMatchObject({ apto: true, motivos: [] });
    expect((await naLiberdade(u.paula)).motivos).toEqual(expect.arrayContaining(["pausado"]));
  });

  it("barrado continua apto nos Agendados do SDR (decisão de 09/10: sem presença)", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT apto, presente FROM public._elegibilidade_roleta_sdr(
         'agendados-sdr', now() + interval '1 day', now() + interval '1 day 1 hour')
        WHERE corretor_id = $1`,
      [u.gabi.id],
    );
    expect(r.rows).toEqual([{ apto: true, presente: false }]);
  });
});

describe("fallback_velocidade_ranking: quem entra (D4 + D5)", () => {
  let lead: string;
  beforeAll(async () => {
    lead = await leadNaZona("Oeste");
    await arquivar(lead);
  });

  it("só quem tem o check-in de hoje aberto e válido, do mais rápido ao mais lento", async () => {
    const r = await ranking(lead);
    expect(nomes(r)).toEqual(["Rita Rápida", "Cássia Casa", "Caio Casa", "Yago Ontem"]);
    expect(r[0]).toMatchObject({ roleta_ok: "filial-liberdade" });
    expect(Number(r[0].score)).toBe(80);
    expect(Number(r[0].min_desde_ultima_acao)).toBeLessThan(30);
  });

  it("dentro: filial com o GPS confirmado", async () => {
    expect(await ids(lead)).toContain(u.rita.id);
  });

  it("dentro: 'Em casa' recusado pelas vendas (disse a verdade) e 'Em casa' liberado", async () => {
    const r = await ids(lead);
    expect(r).toContain(u.cassia.id);
    expect(r).toContain(u.caio.id);
  });

  it("fora: sem check-in hoje, mesmo ativo no CRM e mais rápido", async () => {
    expect(await ids(lead)).not.toContain(u.lucas.id);
  });

  it("fora: check-in encerrado ('Encerrar presença')", async () => {
    expect(await ids(lead)).not.toContain(u.enzo.id);
  });

  it("fora: check-in de ontem, mesmo ainda aberto; e o barrado de ontem não pesa hoje", async () => {
    const r = await ids(lead);
    expect(r).not.toContain(u.olga.id);
    expect(r).toContain(u.yago.id);
  });

  it("fora: barrado pela localização hoje (fora_da_filial e sem_localizacao)", async () => {
    const r = await ids(lead);
    expect(r).not.toContain(u.gabi.id);
    expect(r).not.toContain(u.nina.id);
    expect(r).not.toContain(u.katia.id);
  });

  it("fora: barrado → 'Em casa' liberado com o mínimo 0 (apto na roleta, não no fallback)", async () => {
    expect((await naLiberdade(u.gustavo)).apto).toBe(true);
    expect(await ids(lead)).not.toContain(u.gustavo.id);
  });

  it("fora: barrado → 'Em casa' recusado", async () => {
    expect(await ids(lead)).not.toContain(u.hugo.id);
  });

  it("fora: o destrave só vale DEPOIS do barrado (GPS confirmou antes, barrado depois)", async () => {
    expect(await ids(lead)).not.toContain(u.rui.id);
  });

  it("fora: sem ação no CRM na janela, pausado, e quem já teve o lead", async () => {
    let r = await ids(lead);
    expect(r).not.toContain(u.ivo.id);
    expect(r).not.toContain(u.paula.id);
    expect(r).not.toContain(u.bia.id);

    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET corretores_que_tentaram = $2::uuid[] WHERE id = $1`, [
      lead,
      [u.rita.id],
    ]);
    r = await ids(lead);
    expect(r).toEqual([u.cassia.id, u.caio.id, u.yago.id]);
  });

  it("a janela de atividade é a da chave: com 0 minutos, ninguém conta como ativo", async () => {
    await setSetting("fallback_velocidade_atividade_min", 0);
    try {
      expect(await ranking(lead)).toEqual([]);
    } finally {
      await setSetting("fallback_velocidade_atividade_min", 30);
    }
  });

  it("interruptor DESLIGADO pela gestão: o check-in fecha e o corretor sai", async () => {
    const lead2 = await leadNaZona("Oeste");
    await arquivar(lead2);
    await checkin(u.ian, "casa");
    expect(await ids(lead2)).toContain(u.ian.id);
    await interruptor(u.ian, false);
    expect(await ids(lead2)).not.toContain(u.ian.id);
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

  it("só os sem check-in válido sobrando: ninguém recebe (fica com o Marquinhos)", async () => {
    const lead = await leadNaZona("Oeste");
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET corretores_que_tentaram = $2::uuid[] WHERE id = $1`, [
      lead,
      [u.rita.id, u.cassia.id, u.caio.id, u.yago.id],
    ]);
    const r = (await c.query(`SELECT public._fallback_velocidade($1) AS r`, [lead])).rows[0].r;
    expect(r).toEqual({ ok: false, motivo: "ninguem_ativo_no_crm" });
    const l = (await c.query(`SELECT corretor_id FROM public.leads WHERE id = $1`, [lead])).rows[0];
    expect(l.corretor_id).toBeNull();
    await arquivar(lead);
  });
});

describe("processar_distribuicao_automatica (o cron)", () => {
  it("filial do lead sem ninguém apto: entrega ao mais rápido com check-in válido, regra 'fallback_velocidade'", async () => {
    const lead = await leadNaZona("Oeste");
    await comoSuperuser(c);
    const res = (await c.query(`SELECT public.processar_distribuicao_automatica() AS r`)).rows[0]
      .r as Record<string, number>;
    expect(res).toMatchObject({ distribuidos: 0, fallback_velocidade: 1, sem_corretor: 0 });

    const l = (await c.query(`SELECT corretor_id FROM public.leads WHERE id = $1`, [lead])).rows[0];
    // Gabi (96), Gustavo (93), Lucas (85)… são mais rápidos, mas sem check-in
    // válido hoje; a Rita é a mais rápida de quem disse onde está.
    expect(l.corretor_id).toBe(u.rita.id);

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
      corretor_id: u.rita.id,
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

describe("barrado pela localização: o destrave (só loja que valeu, ou a gestão)", () => {
  let lead: string;
  beforeAll(async () => {
    lead = await leadNaZona("Oeste");
    await arquivar(lead);
  });

  it("'Confirmar no plantão' pela gestão destrava (confirmada_gestao)", async () => {
    expect(await ids(lead)).not.toContain(u.nina.id);
    const ck = await confirmarNoPlantao(u.nina, "barra-funda");
    expect(ck).toMatchObject({ apto_roleta: true, localizacao: "confirmada_gestao" });
    expect(await ids(lead)).toContain(u.nina.id);
  });

  it("o interruptor LIGADO pela gestão destrava (liberado_gestao)", async () => {
    expect(await ids(lead)).not.toContain(u.katia.id);
    await interruptor(u.katia, true);
    expect(await ids(lead)).toContain(u.katia.id);
  });

  it("chegou na loja e o GPS confirmou: destrava também — e é a mais rápida da fila", async () => {
    expect(await ids(lead)).not.toContain(u.gabi.id);
    const ck = await checkin(u.gabi, "loja", "barra-funda", {
      lat: barraFunda.lat + 0.0005,
      lng: barraFunda.lng,
    });
    expect(ck).toMatchObject({ apto_roleta: true, localizacao: "confirmada" });
    expect((await ranking(lead))[0].corretor_id).toBe(u.gabi.id);
  });

  it("destravado e depois barrado de novo: fora outra vez", async () => {
    const ck = await checkin(u.nina, "loja", "barra-funda");
    expect(ck).toMatchObject({ apto_roleta: false, motivo: "sem_localizacao" });
    expect(await ids(lead)).not.toContain(u.nina.id);
  });
});

describe("diagnóstico do GPS (presenca_checkin._falha_localizacao)", () => {
  /** Como o PostgREST chama: argumentos nomeados, só os que vieram. */
  async function rpc(x: UsuarioTeste, args: Record<string, unknown>) {
    const nomesArgs = Object.keys(args);
    const sql = `SELECT public.presenca_checkin(${nomesArgs
      .map((k, i) => `${k} => $${i + 1}`)
      .join(", ")}) AS s`;
    await comoUsuario(c, x.id);
    try {
      return (await c.query(sql, Object.values(args))).rows[0].s;
    } finally {
      await comoSuperuser(c);
    }
  }
  async function ultimaFalha(x: UsuarioTeste): Promise<string | null> {
    await comoSuperuser(c);
    return (
      await c.query(
        `SELECT falha_localizacao FROM public.presenca_checkins
          WHERE corretor_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [x.id],
      )
    ).rows[0].falha_localizacao;
  }

  it("o front publicado (sem o parâmetro novo) continua funcionando", async () => {
    const s = await rpc(u.fabio, { _modo: "loja", _filial: "liberdade" });
    expect(s.checkin).toMatchObject({
      modo: "loja",
      localizacao: "sem_localizacao",
      apto_roleta: false,
      falha_localizacao: null,
    });
    expect(await ultimaFalha(u.fabio)).toBeNull();
  });

  it("sem localização: grava por quê, e a presença devolve a chave", async () => {
    const s = await rpc(u.fabio, {
      _modo: "loja",
      _filial: "liberdade",
      _falha_localizacao: "negada",
    });
    expect(s.checkin).toMatchObject({
      localizacao: "sem_localizacao",
      falha_localizacao: "negada",
    });
    expect(await ultimaFalha(u.fabio)).toBe("negada");

    await comoUsuario(c, u.fabio.id);
    const minha = (await c.query(`SELECT public.presenca_minha_v1() AS s`)).rows[0].s;
    expect(minha.checkin.falha_localizacao).toBe("negada");

    await comoUsuario(c, gestor.id);
    const quadro = (
      await c.query(
        `SELECT falha_localizacao, localizacao FROM public.presenca_hoje_v1() WHERE corretor_id = $1`,
        [u.fabio.id],
      )
    ).rows;
    await comoSuperuser(c);
    expect(quadro).toEqual([{ falha_localizacao: "negada", localizacao: "sem_localizacao" }]);
  });

  it("as quatro falhas da tela entram; com a localização, em casa ou pela gestão, fica NULL", async () => {
    for (const falha of ["indisponivel", "tempo", "sem_suporte"]) {
      await rpc(u.fabio, { _modo: "loja", _filial: "liberdade", _falha_localizacao: falha });
      expect(await ultimaFalha(u.fabio)).toBe(falha);
    }
    await rpc(u.fabio, {
      _modo: "loja",
      _filial: "liberdade",
      _latitude: dentroLiberdade.lat,
      _longitude: dentroLiberdade.lng,
      _precisao_m: 20,
      _falha_localizacao: "tempo",
    });
    expect(await ultimaFalha(u.fabio)).toBeNull();
    await rpc(u.fabio, { _modo: "casa", _falha_localizacao: "negada" });
    expect(await ultimaFalha(u.fabio)).toBeNull();

    await comoUsuario(c, gestor.id);
    await c.query(
      `SELECT public.presenca_checkin(_modo => 'loja', _filial => 'liberdade',
                                      _corretor_id => $1, _falha_localizacao => 'negada')`,
      [u.fabio.id],
    );
    await comoSuperuser(c);
    expect(await ultimaFalha(u.fabio)).toBeNull();
  });

  it("valor fora da lista: o check-in passa e o diagnóstico fica NULL; direto na tabela, o CHECK barra", async () => {
    const s = await rpc(u.fabio, {
      _modo: "loja",
      _filial: "liberdade",
      _falha_localizacao: "xyz",
    });
    expect(s.checkin).toMatchObject({ localizacao: "sem_localizacao", falha_localizacao: null });

    await comoSuperuser(c);
    expect(
      await errCode(
        c.query(
          `UPDATE public.presenca_checkins SET falha_localizacao = 'xyz'
            WHERE corretor_id = $1`,
          [u.fabio.id],
        ),
      ),
    ).toBe("23514");
  });

  it("uma só presenca_checkin (sem sobrecarga ambígua no PostgREST), com o EXECUTE de antes", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT p.oid::regprocedure::text AS sig,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
              has_function_privilege('anon', p.oid, 'EXECUTE') AS anon
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'presenca_checkin'`,
    );
    expect(r.rows).toEqual([
      {
        sig: "presenca_checkin(text,text,double precision,double precision,double precision,uuid,text)",
        auth: true,
        anon: false,
      },
    ]);
    const hoje = await c.query(
      `SELECT has_function_privilege('authenticated', 'public.presenca_hoje_v1()', 'EXECUTE') AS auth,
              has_function_privilege('anon', 'public.presenca_hoje_v1()', 'EXECUTE') AS anon`,
    );
    expect(hoje.rows[0]).toEqual({ auth: true, anon: false });
  });
});

describe("a guarda da migration pega o ranking sem as regras do dono", () => {
  const guarda = (() => {
    const sql = readFileSync(MIGRATION, "utf8");
    const ini = sql.indexOf("DO $guard$");
    const fim = sql.indexOf("$guard$;", ini);
    return sql.slice(ini, fim + "$guard$;".length);
  })();

  /** Troca o ranking por uma versão sem um trecho e roda a guarda (rollback). */
  async function guardaCom(sem: string, por = ""): Promise<string | null> {
    await comoSuperuser(c);
    await c.query("BEGIN");
    try {
      const def = (
        await c.query(
          `SELECT pg_get_functiondef('public.fallback_velocidade_ranking(uuid)'::regprocedure) AS d`,
        )
      ).rows[0].d as string;
      if (sem) {
        expect(def).toContain(sem);
        await c.query(def.replace(sem, por));
      }
      await c.query(guarda);
      return null;
    } catch (e) {
      return (e as Error).message;
    } finally {
      await c.query("ROLLBACK");
    }
  }

  it("com o ranking da migration, a guarda passa", async () => {
    expect(await guardaCom("")).toBeNull();
  });

  it.each([
    [
      "o filtro de dia do barrado",
      "          AND b.dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date\n",
    ],
    [
      "o filtro de dia do check-in válido",
      "          AND a.dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date\n",
    ],
    ["o check-in aberto", "          AND a.encerrado_em IS NULL\n"],
    [
      "o destrave só pela loja ou gestão",
      "\n               AND d.modo IN ('loja', 'liberado_gestao')",
    ],
    ["o 'depois' do destrave", "               AND d.created_at > b.created_at\n"],
  ])("sem %s, a guarda barra o deploy", async (_nome, trecho) => {
    expect(await guardaCom(trecho)).toMatch(/o ranking não aplica as regras de presença do dono/);
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
    const entregar = async (x: UsuarioTeste, contatoMin: number | null) => {
      const id = await criarLead(c, { corretorId: x.id, telefone: novoTelefone() });
      await comoSuperuser(c);
      await c.query(
        `INSERT INTO public.distribution_log
           (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado, created_at)
         VALUES ($1, $2, 'automatica', 'teste velocidade', 'filial-liberdade', 'rodizio', 'sucesso', $3)`,
        [id, x.id, as10],
      );
      if (contatoMin !== null) {
        await c.query(
          `INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, conteudo, ocorreu_em)
           VALUES ($1, $2, 'whatsapp', 'saida', 'oi', $3::timestamptz + make_interval(mins => $4))`,
          [id, x.id, as10, contatoMin],
        );
      }
    };
    // O que o próprio cron entregou hoje (a Rita) é das últimas 2 horas: fica
    // fora da janela.
    await entregar(u.rita, 10);
    await entregar(u.rita, null);
    await entregar(u.lucas, 40);

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
        corretor_id: u.rita.id,
        recebidos: 2,
        contatados: 1,
        contatados_15min: 1,
        pct_15min: 50,
        pct_contato: 50,
        score: 36.11,
      },
      {
        corretor_id: u.lucas.id,
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
                has_function_privilege('authenticated', 'public._dono_ativo(uuid)', 'EXECUTE') AS dono,
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
      dono: false,
      pda_anon: false,
      fb_srv: true,
    });

    await comoUsuario(c, u.rita.id);
    expect(await errCode(c.query(`SELECT * FROM public.corretor_velocidade`))).toBe("42501");
    expect(
      await errCode(c.query(`SELECT * FROM public.fallback_velocidade_ranking(gen_random_uuid())`)),
    ).toBe("42501");
    await comoSuperuser(c);
  });
});
