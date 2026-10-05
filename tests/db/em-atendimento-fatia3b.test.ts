/**
 * REGRA DOS 65 — Fatia 3b: os relógios (migration 20261010121000).
 *
 *  1. SOMBRA registra, não move: a rodada grava o que faria e nenhum lead
 *     muda; o cron registra uma vez por dia e só a última fotografia fica.
 *  2. A VIRADA: ligar marca a data; até ela a regra segue em sombra (a trava
 *     da roleta inclusive); no dia, a rodada aplica. Só admin liga; a régua
 *     de devolução ativa barra o ligar.
 *  3. LIGADO move pela regra única: perde a vaga/excedente → Minha base;
 *     porta de cadência → Aguardando atendimento; sem toque/retorno vencido/
 *     qualificação vencida → roleta (pago), Bolsão (estoque) ou fica com
 *     alerta (próprio); retorno além de 30 dias → perda "retorno futuro";
 *     fundo só alerta. Cada movimento deixa evento, log e aviso.
 *  4. Alertas 60/65 ao gestor, um por corretor por dia.
 *  5. Desfazer por rodada devolve dono e status a quem ainda está como a
 *     rodada deixou.
 *  6. Acesso: anon/corretor não rodam; cron (sem JWT) e admin rodam.
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
let admin: UsuarioTeste;
let gestor: UsuarioTeste;
let ana: UsuarioTeste;
let tetoAntes: unknown;
let cfgAntes: unknown;
let bolsaoAntes: unknown;
const TETO = 3;

async function comoAnon() {
  await c.query(`RESET ROLE`);
  await c.query(`SELECT set_config('request.jwt.claims', '{"role":"anon"}', false)`);
  await c.query(`SET ROLE anon`);
}

async function cfg(mudar: Record<string, unknown>) {
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.gestao_config SET valor = valor || $1::jsonb WHERE chave = 'em_atendimento'`,
    [JSON.stringify(mudar)],
  );
}

async function config(): Promise<Record<string, unknown>> {
  await comoSuperuser(c);
  return (await c.query(`SELECT public.em_atendimento_config() AS c`)).rows[0].c;
}

type Opts = {
  status?: string;
  origem?: string;
  horasSemToque?: number;
  emCadencia?: boolean;
  criadoHaHoras?: number;
  tarefasEmHoras?: number[];
  dono?: UsuarioTeste;
};

/** Mesmo fixture da suíte da Fatia 1: relógio e cadência controlados. */
async function lead(opts: Opts = {}): Promise<string> {
  const dono = opts.dono ?? ana;
  const id = await criarLead(c, {
    corretorId: dono.id,
    status: opts.status ?? "em_atendimento",
    origem: opts.origem ?? "importacao",
  });
  await comoSuperuser(c);
  for (const h of opts.tarefasEmHoras ?? []) {
    await c.query(
      `INSERT INTO public.tarefas
         (lead_id, corretor_id, titulo, tipo, status, prioridade, data_vencimento, origem_automatica)
       VALUES ($1, $2, 'Retornar', 'follow_up', 'pendente', 'media',
               now() + make_interval(hours => $3::int), false)`,
      [id, dono.id, h],
    );
  }
  const horas = opts.horasSemToque ?? 1;
  await c.query(
    `UPDATE public.leads
        SET cadencia_etapa   = CASE WHEN $2 THEN cadencia_etapa ELSE NULL END,
            ultimo_contato   = now() - make_interval(hours => $3::int),
            ultima_interacao = now(),
            created_at       = now() - make_interval(hours => GREATEST($3::int, COALESCE($4::int, 0)))
      WHERE id = $1`,
    [id, opts.emCadencia ?? false, horas, opts.criadoHaHoras ?? null],
  );
  return id;
}

type Rodada = {
  execucao_id: string;
  modo: string;
  acao: string;
  destino: string | null;
  avaliados: number;
  aplicados: number;
};

async function processar(modo: string | null = null, comoQuem?: UsuarioTeste): Promise<Rodada[]> {
  if (comoQuem) await comoUsuario(c, comoQuem.id);
  else await comoSuperuser(c);
  try {
    return (await c.query(`SELECT * FROM public.em_atendimento_processar($1, NULL)`, [modo]))
      .rows as Rodada[];
  } finally {
    await comoSuperuser(c);
  }
}

async function estado(id: string) {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT status::text AS status, corretor_id, corretor_anterior_id, classe_lead, cadencia_etapa,
              motivo_perda_categoria, proximo_followup
         FROM public.leads WHERE id = $1`,
      [id],
    )
  ).rows[0];
}

async function movimentos(execucao?: string) {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT lead_id, acao, destino, modo, aplicado, status_antes, corretor_antes, erro, desfeito_em
         FROM public.em_atendimento_movimentos
        WHERE ($1::uuid IS NULL OR execucao_id = $1) ORDER BY created_at, acao`,
      [execucao ?? null],
    )
  ).rows;
}

async function execucoes() {
  await comoSuperuser(c);
  return (
    await c.query(`SELECT id, modo, gatilho, avaliados, aplicados, alertas, erros, resumo
                     FROM public.em_atendimento_execucoes ORDER BY iniciado_em`)
  ).rows;
}

async function alertasDe(u: UsuarioTeste) {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT titulo, ref_id FROM public.alertas WHERE user_id = $1 AND tipo = 'distribuicao' ORDER BY created_at`,
      [u.id],
    )
  ).rows as Array<{ titulo: string; ref_id: string }>;
}

async function eventos(id: string) {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT tipo, agente, payload FROM public.lead_eventos WHERE lead_id = $1 ORDER BY created_at`,
      [id],
    )
  ).rows as Array<{ tipo: string; agente: string; payload: Record<string, unknown> }>;
}

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
  bolsaoAntes = (await c.query(`SELECT valor FROM public.gestao_config WHERE chave = 'bolsao'`))
    .rows[0]?.valor;
  await c.query(
    `UPDATE public.gestao_config SET valor = $1::jsonb WHERE chave = 'capacidade_leads_ativos_por_corretor'`,
    [JSON.stringify(TETO)],
  );
});

afterAll(async () => {
  await c.query(`ROLLBACK`).catch(() => undefined);
  await comoSuperuser(c);
  if (tetoAntes !== undefined) {
    await c.query(
      `UPDATE public.gestao_config SET valor = $1::jsonb WHERE chave = 'capacidade_leads_ativos_por_corretor'`,
      [JSON.stringify(tetoAntes)],
    );
  }
  if (cfgAntes !== undefined) {
    await c.query(
      `UPDATE public.gestao_config SET valor = $1::jsonb WHERE chave = 'em_atendimento'`,
      [JSON.stringify(cfgAntes)],
    );
  }
  if (bolsaoAntes !== undefined) {
    await c.query(`UPDATE public.gestao_config SET valor = $1::jsonb WHERE chave = 'bolsao'`, [
      JSON.stringify(bolsaoAntes),
    ]);
  }
  await c.query(`DELETE FROM public.em_atendimento_execucoes`);
  await limparDados(c);
  await c.end();
});

beforeEach(async () => {
  await limparDados(c);
  await comoSuperuser(c);
  await c.query(`DELETE FROM public.em_atendimento_execucoes`);
  if (cfgAntes !== undefined) {
    await c.query(
      `UPDATE public.gestao_config SET valor = $1::jsonb WHERE chave = 'em_atendimento'`,
      [JSON.stringify(cfgAntes)],
    );
  }
  await cfg({ modo: "sombra", virada_em: null });
  admin = await criarUsuario(c, { nome: "Admin 65", papel: "admin" });
  gestor = await criarUsuario(c, { nome: "Gestor 65", papel: "gestor" });
  ana = await criarUsuario(c, { nome: "Ana Corretora", papel: "corretor" });
  await c.query(
    `UPDATE public.profiles SET ativo = true, status_conta = 'ativa', telefone = '11999990001' WHERE id = $1`,
    [ana.id],
  );
  await darRegiao(c, ana.id);
});

// ---------------------------------------------------------------------------
// 1. Sombra
// ---------------------------------------------------------------------------

describe("sombra registra, não move", () => {
  it("a rodada grava o que faria; nenhum lead muda; só a última fotografia fica", async () => {
    const perde = await lead({ horasSemToque: 6 * 24 });
    const sai = await lead({
      status: "aguardando_atendimento",
      origem: "facebook",
      horasSemToque: 6 * 24,
    });
    const fica = await lead({ horasSemToque: 2 });
    const antes = [await estado(perde), await estado(sai), await estado(fica)];

    const r = await processar();
    expect(r.map((x) => [x.acao, x.destino, x.avaliados, x.aplicados])).toEqual([
      ["perde_vaga", "minha_base", 1, 0],
      ["sem_toque", "roleta", 1, 0],
    ]);
    expect(r[0].modo).toBe("sombra");
    expect([await estado(perde), await estado(sai), await estado(fica)]).toEqual(antes);
    expect(await alertasDe(ana)).toEqual([]);
    expect(await alertasDe(admin)).toEqual([]);
    const ex = await execucoes();
    expect(ex).toHaveLength(1);
    expect(ex[0]).toMatchObject({ modo: "sombra", gatilho: "cron", avaliados: 2, aplicados: 0 });
    expect(ex[0].resumo).toEqual({ perde_vaga: 1, sem_toque: 1 });

    // O cron de hora em hora: dentro de 20 h não registra de novo.
    expect(await processar()).toEqual([]);
    expect(await execucoes()).toHaveLength(1);
    // Forçado (admin pelo painel): registra, e a fotografia antiga sai.
    const r2 = await processar("sombra", admin);
    expect(r2).toHaveLength(2);
    const ex2 = await execucoes();
    expect(ex2).toHaveLength(1);
    expect(ex2[0].id).toBe(r2[0].execucao_id);
    expect(ex2[0].gatilho).toBe("manual");
  });

  it("a fotografia da sombra é a mesma leitura da simulação (regra única)", async () => {
    await lead({ horasSemToque: 6 * 24 });
    await lead({ status: "agendado", horasSemToque: 11 * 24 });
    await lead({ status: "qualificacao_corretor", origem: "chatbot", criadoHaHoras: 25 });
    await processar();
    const mv = await movimentos();
    await comoUsuario(c, admin.id);
    const sim = (
      await c.query(
        `SELECT lead_id, acao, destino FROM public.em_atendimento_sombra_leads_v1($1)
          WHERE acao IN ('perde_vaga','fundo_desfecho','qualificacao_vencida') ORDER BY acao`,
        [ana.id],
      )
    ).rows;
    await comoSuperuser(c);
    expect(mv.map((m) => [m.lead_id, m.acao, m.destino]).sort()).toEqual(
      sim.map((s) => [s.lead_id, s.acao, s.destino]).sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// 2. A virada
// ---------------------------------------------------------------------------

describe("ligar, virada e desligar", () => {
  it("só admin liga; até a virada a regra segue em sombra, inclusive a trava da roleta", async () => {
    await comoUsuario(c, ana.id);
    expect(await errCode(c.query(`SELECT public.em_atendimento_ligar()`))).toBe("42501");
    await comoUsuario(c, gestor.id);
    expect(await errCode(c.query(`SELECT public.em_atendimento_ligar()`))).toBe("42501");

    await cfg({ trava_roleta: 2 });
    await lead({ horasSemToque: 1 });
    await lead({ horasSemToque: 1 });
    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT public.em_atendimento_ligar(now() + interval '2 days') AS c`);
    expect(r.rows[0].c).toMatchObject({ modo: "ligado" });
    await comoSuperuser(c);
    expect((await c.query(`SELECT public.em_atendimento_ligada() AS l`)).rows[0].l).toBe(false);
    // Ocupação 2 com trava 2: ainda recebe, porque a virada não chegou.
    expect(
      (await c.query(`SELECT public._em_atendimento_recebe_lead($1) AS r`, [ana.id])).rows[0].r,
    ).toBe(true);
    // A rodada do cron continua em sombra.
    const sombra = await processar();
    expect(sombra.every((x) => x.modo === "sombra")).toBe(true);

    // Chegou o dia.
    await cfg({ virada_em: new Date(Date.now() - 60_000).toISOString() });
    expect((await c.query(`SELECT public.em_atendimento_ligada() AS l`)).rows[0].l).toBe(true);
    expect(
      (await c.query(`SELECT public._em_atendimento_recebe_lead($1) AS r`, [ana.id])).rows[0].r,
    ).toBe(false);

    await comoUsuario(c, admin.id);
    const d = await c.query(`SELECT public.em_atendimento_desligar() AS c`);
    expect(d.rows[0].c).toMatchObject({ modo: "sombra" });
    await comoSuperuser(c);
    expect((await c.query(`SELECT public.em_atendimento_ligada() AS l`)).rows[0].l).toBe(false);
  });

  it("a régua de devolução ativa barra o ligar (dois motores, não)", async () => {
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.gestao_config SET valor = valor || '{"modo":"ativo"}'::jsonb WHERE chave = 'bolsao'`,
    );
    try {
      await comoUsuario(c, admin.id);
      const e = await c.query(`SELECT public.em_atendimento_ligar()`).then(
        () => null,
        (err: { code?: string; message: string }) => err,
      );
      expect(e?.code).toBe("22023");
      expect(e?.message).toMatch(/régua de devolução/);
    } finally {
      await comoSuperuser(c);
      await c.query(
        `UPDATE public.gestao_config SET valor = valor || '{"modo":"sombra"}'::jsonb WHERE chave = 'bolsao'`,
      );
    }
    expect((await config()).modo).toBe("sombra");
  });
});

// ---------------------------------------------------------------------------
// 3. Ligado: os movimentos
// ---------------------------------------------------------------------------

describe("ligado: Em atendimento", () => {
  beforeEach(() => cfg({ modo: "ligado", virada_em: null }));

  it("5 dias sem toque perde a vaga: Minha base, com o dono e a data do passo; evento, log e aviso", async () => {
    const id = await lead({ horasSemToque: 6 * 24, tarefasEmHoras: [48] });
    const r = await processar();
    expect(r).toEqual([
      expect.objectContaining({
        acao: "perde_vaga",
        destino: "minha_base",
        avaliados: 1,
        aplicados: 1,
      }),
    ]);
    const e = await estado(id);
    expect(e).toMatchObject({ status: "aguardando_retorno", corretor_id: ana.id });
    expect(e.proximo_followup).not.toBeNull();
    expect((await movimentos())[0]).toMatchObject({
      acao: "perde_vaga",
      aplicado: true,
      status_antes: "em_atendimento",
      corretor_antes: ana.id,
      erro: null,
    });
    const ev = (await eventos(id)).filter((x) => x.tipo === "em_atendimento_regra");
    expect(ev).toHaveLength(1);
    expect(ev[0].payload).toMatchObject({ acao: "perde_vaga", para_status: "aguardando_retorno" });
    expect((await alertasDe(ana)).map((a) => a.titulo)).toEqual([
      expect.stringMatching(/^Perdeu a vaga dos 65/),
    ]);
    // Segunda rodada no mesmo dia: nada a fazer, nenhum aviso repetido.
    const r2 = await processar();
    expect(r2.filter((x) => x.acao === "perde_vaga")).toEqual([]);
    expect(await alertasDe(ana)).toHaveLength(1);
  });

  it("acima do teto, o excedente desce; o escolhido fica", async () => {
    const ids = [];
    for (let i = 0; i < TETO + 1; i++) ids.push(await lead({ horasSemToque: 1 + i }));
    // O mais antigo no toque (último da fila) é escolhido: vai para a frente.
    await comoUsuario(c, ana.id);
    await c.query(`SELECT public.escolher_em_atendimento($1, true)`, [ids[TETO]]);
    const r = await processar();
    expect(r).toEqual([
      expect.objectContaining({ acao: "excedente", destino: "minha_base", aplicados: 1 }),
    ]);
    const desceu = (await movimentos())[0].lead_id;
    expect(desceu).toBe(ids[TETO - 1]);
    expect((await estado(desceu)).status).toBe("aguardando_retorno");
    expect((await estado(ids[TETO])).status).toBe("em_atendimento");
  });

  it("em cadência sem resposta: volta para Aguardando atendimento e segue a cadência", async () => {
    const id = await lead({ emCadencia: true, horasSemToque: 1 });
    expect((await estado(id)).cadencia_etapa).toBe("D0");
    const r = await processar();
    expect(r).toEqual([
      expect.objectContaining({
        acao: "porta_cadencia",
        destino: "aguardando_atendimento",
        aplicados: 1,
      }),
    ]);
    expect(await estado(id)).toMatchObject({
      status: "aguardando_atendimento",
      corretor_id: ana.id,
      cadencia_etapa: "D0",
    });
  });
});

describe("ligado: a escrita confere o lead de novo", () => {
  beforeEach(() => cfg({ modo: "ligado", virada_em: null }));

  it("lead que mudou de mão ou foi para a lixeira entre a classificação e a escrita não é mexido", async () => {
    const bia = await criarUsuario(c, { nome: "Bia", papel: "corretor" });
    await darRegiao(c, bia.id);
    const trocou = await lead({ horasSemToque: 6 * 24 });
    const lixo = await lead({ horasSemToque: 6 * 24 });
    await comoSuperuser(c);
    // A peça de escrita recebe o dono visto na classificação; se o lead já é
    // de outro (ou saiu de circulação), devolve false e não toca em nada.
    const r1 = await c.query(
      `SELECT public._em_atendimento_aplicar($1, $2, 'perde_vaga', 'minha_base', '6 dias sem toque', 'X', NULL) AS ok`,
      [trocou, bia.id],
    );
    expect(r1.rows[0].ok).toBe(false);
    expect(await estado(trocou)).toMatchObject({ status: "em_atendimento", corretor_id: ana.id });

    await c.query(`UPDATE public.leads SET na_lixeira = true WHERE id = $1`, [lixo]);
    const r2 = await c.query(
      `SELECT public._em_atendimento_aplicar($1, $2, 'perde_vaga', 'minha_base', '6 dias sem toque', 'X', NULL) AS ok`,
      [lixo, ana.id],
    );
    expect(r2.rows[0].ok).toBe(false);
    expect((await estado(lixo)).status).toBe("em_atendimento");
    expect(await movimentos()).toEqual([]);
  });
});

describe("ligado: Minha base", () => {
  beforeEach(() => cfg({ modo: "ligado", virada_em: null }));

  it("5 dias sem toque: pago volta à roleta, estoque vai ao Bolsão, próprio fica com alerta ao gestor", async () => {
    const h = 6 * 24;
    const pago = await lead({
      status: "aguardando_atendimento",
      origem: "facebook",
      horasSemToque: h,
    });
    const estoque = await lead({
      status: "aguardando_retorno",
      origem: "importacao",
      horasSemToque: h,
    });
    const proprio = await lead({
      status: "aguardando_atendimento",
      origem: "indicacao",
      horasSemToque: h,
    });
    const vivo = await lead({
      status: "aguardando_atendimento",
      origem: "importacao",
      horasSemToque: 4 * 24,
    });

    const r = await processar();
    expect(r.map((x) => [x.acao, x.destino, x.aplicados])).toEqual([
      ["sem_toque", "bolsao", 1],
      ["sem_toque", "fica_alerta_gestor", 1],
      ["sem_toque", "roleta", 1],
    ]);
    expect(await estado(pago)).toMatchObject({
      status: "aguardando_corretor",
      corretor_id: null,
      corretor_anterior_id: ana.id,
    });
    expect(await estado(estoque)).toMatchObject({
      status: "aguardando_atendimento",
      corretor_id: null,
      corretor_anterior_id: ana.id,
      classe_lead: "base",
    });
    expect(await estado(proprio)).toMatchObject({
      status: "aguardando_atendimento",
      corretor_id: ana.id,
    });
    expect((await estado(vivo)).corretor_id).toBe(ana.id);

    await comoSuperuser(c);
    const log = await c.query(
      `SELECT lead_id, roleta_slug, regra_aplicada FROM public.distribution_log
        WHERE lead_id IN ($1, $2) ORDER BY roleta_slug`,
      [pago, estoque],
    );
    expect(log.rows).toEqual([
      { lead_id: estoque, roleta_slug: "base", regra_aplicada: "regra_65_sem_toque" },
      { lead_id: pago, roleta_slug: "roleta", regra_aplicada: "regra_65_sem_toque" },
    ]);
    // O corretor é avisado de quem saiu; gestão (admin e gestor) do lead próprio.
    expect(
      (await alertasDe(ana)).filter((a) => /^Lead saiu da sua base/.test(a.titulo)),
    ).toHaveLength(2);
    expect((await alertasDe(admin)).map((a) => a.ref_id)).toEqual([proprio]);
    expect((await alertasDe(gestor)).map((a) => a.ref_id)).toEqual([proprio]);
    // Mesmo dia, segunda rodada: o próprio continua parado, mas sem aviso repetido.
    await processar();
    expect(await alertasDe(admin)).toHaveLength(1);
  });

  it("retorno combinado: protegido até a data + 2 dias; vencido sem toque desde a data, sai", async () => {
    const protegido = await lead({
      status: "aguardando_retorno",
      origem: "facebook",
      horasSemToque: 20 * 24,
      tarefasEmHoras: [-24],
    });
    const vencido = await lead({
      status: "aguardando_retorno",
      origem: "facebook",
      horasSemToque: 10 * 24,
      tarefasEmHoras: [-5 * 24],
    });
    const r = await processar();
    expect(r).toEqual([
      expect.objectContaining({ acao: "retorno_vencido", destino: "roleta", aplicados: 1 }),
    ]);
    expect((await estado(protegido)).corretor_id).toBe(ana.id);
    expect(await estado(vencido)).toMatchObject({
      status: "aguardando_corretor",
      corretor_id: null,
    });
  });

  it("qualificação vencida (25 h) volta à roleta; 2 h fica", async () => {
    const vencido = await lead({
      status: "qualificacao_corretor",
      origem: "chatbot",
      criadoHaHoras: 25,
    });
    const novo = await lead({
      status: "qualificacao_corretor",
      origem: "chatbot",
      criadoHaHoras: 2,
    });
    const r = await processar();
    expect(r).toEqual([
      expect.objectContaining({ acao: "qualificacao_vencida", destino: "roleta", aplicados: 1 }),
    ]);
    expect((await estado(vencido)).corretor_id).toBeNull();
    expect((await estado(novo)).corretor_id).toBe(ana.id);
  });

  it("retorno além de 30 dias vira perda 'retorno futuro' (volta pela reativação); o próprio fica com alerta", async () => {
    const longe = await lead({
      status: "aguardando_retorno",
      origem: "facebook",
      horasSemToque: 24,
      tarefasEmHoras: [40 * 24],
    });
    const proprio = await lead({
      status: "aguardando_retorno",
      origem: "captacao_corretor",
      horasSemToque: 24,
      tarefasEmHoras: [40 * 24],
    });
    const r = await processar();
    expect(r.map((x) => [x.acao, x.destino, x.aplicados])).toEqual([
      ["retorno_acima_maximo", "fica_alerta_gestor", 1],
      ["retorno_acima_maximo", "reativacao", 1],
    ]);
    expect(await estado(longe)).toMatchObject({
      status: "perdido",
      corretor_id: ana.id,
      motivo_perda_categoria: "retorno_futuro",
      proximo_followup: null,
    });
    const ev = (await eventos(longe)).filter((x) => x.tipo === "retorno_futuro");
    expect(ev).toHaveLength(1);
    expect(ev[0].payload.retorno_em).not.toBeNull();
    expect((await estado(proprio)).status).toBe("aguardando_retorno");
    expect((await alertasDe(admin)).map((a) => a.ref_id)).toEqual([proprio]);
  });
});

describe("ligado: fundo do funil e alertas 60/65", () => {
  beforeEach(() => cfg({ modo: "ligado", virada_em: null }));

  it("fundo nunca sai: 5 dias avisa o gestor, 10 dias pede o desfecho; um aviso por dia", async () => {
    const cinco = await lead({ status: "agendado", horasSemToque: 6 * 24 });
    const dez = await lead({ status: "analise_credito", horasSemToque: 11 * 24 });
    const r = await processar();
    expect(r.map((x) => [x.acao, x.destino, x.aplicados])).toEqual([
      ["fundo_desfecho", "gestor", 1],
      ["fundo_gestor", "gestor", 1],
    ]);
    expect(await estado(cinco)).toMatchObject({ status: "agendado", corretor_id: ana.id });
    expect(await estado(dez)).toMatchObject({ status: "analise_credito", corretor_id: ana.id });
    const titulos = (await alertasDe(gestor)).map((a) => a.titulo).sort();
    expect(titulos).toEqual([
      expect.stringMatching(/^Dê o desfecho: /),
      expect.stringMatching(/^Fundo do funil parado: /),
    ]);
    await processar();
    expect(await alertasDe(gestor)).toHaveLength(2);
  });

  it("gestor é avisado em 60 (trava) e em 65 (lotado), uma vez por corretor por dia", async () => {
    await cfg({ trava_roleta: 2 });
    await lead({ horasSemToque: 1 });
    await lead({ horasSemToque: 1 });
    await processar();
    expect((await alertasDe(gestor)).map((a) => a.titulo)).toEqual([
      "Regra dos 65: Ana Corretora chegou a 2/3",
    ]);
    await lead({ horasSemToque: 1 });
    await processar();
    expect((await alertasDe(gestor)).map((a) => a.titulo)).toEqual([
      "Regra dos 65: Ana Corretora chegou a 2/3",
      "Regra dos 65: Ana Corretora está lotado (3/3)",
    ]);
    await processar();
    expect(await alertasDe(gestor)).toHaveLength(2);
    // Em sombra, nenhum aviso.
    await cfg({ modo: "sombra" });
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.alertas`);
    await processar("sombra", admin);
    expect(await alertasDe(gestor)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Desfazer
// ---------------------------------------------------------------------------

describe("desfazer uma rodada", () => {
  beforeEach(() => cfg({ modo: "ligado", virada_em: null }));

  it("devolve dono e status a quem ainda está como a rodada deixou; a segunda vez não faz nada", async () => {
    const perde = await lead({ horasSemToque: 6 * 24 });
    const roleta = await lead({
      status: "aguardando_atendimento",
      origem: "facebook",
      horasSemToque: 6 * 24,
    });
    const bolsao = await lead({
      status: "aguardando_atendimento",
      origem: "importacao",
      horasSemToque: 6 * 24,
    });
    const r = await processar();
    const exec = r[0].execucao_id;
    expect((await estado(roleta)).corretor_id).toBeNull();

    // O lead que já ganhou outro dono não é mexido.
    const bia = await criarUsuario(c, { nome: "Bia", papel: "corretor" });
    await darRegiao(c, bia.id);
    await comoSuperuser(c);
    await c.query(`SELECT set_config('app.transicionar_lead', 'on', true)`);
    await c.query(`UPDATE public.leads SET corretor_id = $2 WHERE id = $1`, [bolsao, bia.id]);

    await comoUsuario(c, ana.id);
    expect(await errCode(c.query(`SELECT public.em_atendimento_desfazer($1)`, [exec]))).toBe(
      "42501",
    );
    await comoUsuario(c, admin.id);
    const n = (await c.query(`SELECT public.em_atendimento_desfazer($1) AS n`, [exec])).rows[0].n;
    expect(n).toBe(2);
    expect(await estado(perde)).toMatchObject({ status: "em_atendimento", corretor_id: ana.id });
    expect(await estado(roleta)).toMatchObject({
      status: "aguardando_atendimento",
      corretor_id: ana.id,
    });
    expect((await estado(bolsao)).corretor_id).toBe(bia.id);
    const mv = await movimentos(exec);
    expect(mv.filter((m) => m.desfeito_em !== null)).toHaveLength(2);
    await comoUsuario(c, admin.id);
    expect(
      (await c.query(`SELECT public.em_atendimento_desfazer($1) AS n`, [exec])).rows[0].n,
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Acesso e cron
// ---------------------------------------------------------------------------

describe("acesso", () => {
  it("anon e corretor não rodam; admin e o cron (sem JWT) rodam; o painel lê só a gestão", async () => {
    await comoAnon();
    expect(await errCode(c.query(`SELECT * FROM public.em_atendimento_processar()`))).toBe("42501");
    await comoUsuario(c, ana.id);
    expect(await errCode(c.query(`SELECT * FROM public.em_atendimento_processar()`))).toBe("42501");
    expect(await errCode(c.query(`SELECT * FROM public.em_atendimento_execucoes`))).toBe("42501");
    expect(
      (await c.query(`SELECT count(*)::int AS n FROM public.em_atendimento_execucoes_v1(5)`))
        .rows[0].n,
    ).toBe(0);
    await processar("sombra", admin);
    await comoUsuario(c, gestor.id);
    expect(
      (await c.query(`SELECT count(*)::int AS n FROM public.em_atendimento_execucoes_v1(5)`))
        .rows[0].n,
    ).toBe(1);
    await comoSuperuser(c);
    const r = await c.query(`
      SELECT has_function_privilege('anon', 'public.em_atendimento_processar(text,integer)', 'EXECUTE') AS anon_proc,
             has_function_privilege('service_role', 'public.em_atendimento_processar(text,integer)', 'EXECUTE') AS svc_proc,
             has_function_privilege('authenticated', 'public._em_atendimento_aplicar(uuid,uuid,text,text,text,text,timestamptz)', 'EXECUTE') AS auth_aplicar,
             has_table_privilege('authenticated', 'public.em_atendimento_movimentos', 'SELECT') AS auth_mov,
             (SELECT count(*)::int FROM cron.job WHERE jobname = 'em-atendimento-processar') AS cron`);
    expect(r.rows[0]).toEqual({
      anon_proc: false,
      svc_proc: true,
      auth_aplicar: false,
      auth_mov: false,
      cron: 1,
    });
  });
});
