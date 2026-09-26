/**
 * CADÊNCIA — Fase 0: carga do estoque parado (migration 20260923120000).
 *
 * O que está em jogo aqui é volume: a carga real mexe em milhares de leads de
 * uma vez. Os testes cobrem a classificação (quem vai para onde e, mais
 * importante, quem NÃO vai), a idempotência, o modo sombra e o desfazer.
 *
 * O caso que merece mais atenção é `escrita_em_lote`: a medição de 11/09/2026
 * achou 12.995 leads com o relógio idêntico ao segundo, vindos de importação.
 * Se a Fase 0 lesse isso como abandono, despejaria doze mil leads na
 * reativação por causa de um carimbo. O teste correspondente constrói
 * exatamente essa situação.
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
let corretor: UsuarioTeste;
let outroCorretor: UsuarioTeste;

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
});

afterAll(async () => {
  await comoSuperuser(c);
  await c.query(`UPDATE public.cadencia_config SET modo = 'sombra' WHERE id = 1`);
  await limparDados(c);
  await c.end();
});

beforeEach(async () => {
  await limparDados(c);
  await comoSuperuser(c);
  await c.query(`UPDATE public.cadencia_config SET modo = 'ativo' WHERE id = 1`);
  admin = await criarUsuario(c, { papel: "admin" });
  corretor = await criarUsuario(c, { papel: "corretor" });
  outroCorretor = await criarUsuario(c, { papel: "corretor" });
});

/**
 * Lead de estoque: com corretor, FORA da cadência e com o relógio no passado.
 *
 * O gatilho de atribuição põe todo lead novo em Lead chegou (D0), então o estoque precisa
 * ser construído limpando `cadencia_etapa` depois — é exatamente o estado dos
 * leads que já estavam na carteira antes de a cadência existir.
 */
async function leadDeEstoque(opts: {
  diasParado: number;
  corretorId?: string;
  telefone?: string;
  optOut?: boolean;
  status?: string;
  relogioFixo?: string; // para simular importação em lote (mesmo instante)
}): Promise<string> {
  // Nunca nasce 'perdido': o trigger exige motivo já no INSERT. Quem precisa
  // de um lead perdido o transiciona abaixo, com motivo, como a app faz.
  const id = await criarLead(c, {
    status:
      opts.status === "perdido"
        ? "aguardando_atendimento"
        : (opts.status ?? "aguardando_atendimento"),
    telefone: opts.telefone,
  });
  await comoSuperuser(c);
  await c.query(`UPDATE public.leads SET corretor_id = $1 WHERE id = $2`, [
    opts.corretorId ?? corretor.id,
    id,
  ]);
  await c.query(
    `UPDATE public.leads
        SET cadencia_etapa = NULL, cadencia_prazo_ts = NULL, cadencia_inicio_ts = NULL,
            ultima_interacao = COALESCE($3::timestamptz,
                                        now() - make_interval(days => $2::int)),
            ultimo_contato   = NULL,
            opt_out = $4
      WHERE id = $1`,
    [id, opts.diasParado, opts.relogioFixo ?? null, opts.optOut ?? false],
  );
  if (opts.status === "perdido") {
    await c.query(
      `UPDATE public.leads
          SET status = 'perdido'::public.lead_status, motivo_perda_categoria = 'outro'
        WHERE id = $1`,
      [id],
    );
  }
  return id;
}

async function classificar() {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT lead_id, destino, motivo, dias_parado, escrita_lote
       FROM public.cadencia_fase0_classificar() ORDER BY dias_parado DESC`,
  );
  return r.rows as Array<{
    lead_id: string;
    destino: string;
    motivo: string;
    dias_parado: number;
    escrita_lote: boolean;
  }>;
}

async function leadRow(id: string) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT cadencia_etapa, corretor_id, corretor_anterior_id, status,
            motivo_perda_categoria, classe_lead
       FROM public.leads WHERE id = $1`,
    [id],
  );
  return r.rows[0];
}

// ---------------------------------------------------------------------------
// Classificação
// ---------------------------------------------------------------------------

describe("classificação do estoque", () => {
  it("separa encerrar, reativacao e cadencia pelas regras do documento", async () => {
    const suspeito = await leadDeEstoque({ diasParado: 10, telefone: "11999999999" });
    const optout = await leadDeEstoque({ diasParado: 10, optOut: true });
    const frio = await leadDeEstoque({ diasParado: 45 });
    const morno = await leadDeEstoque({ diasParado: 20 });
    const quente = await leadDeEstoque({ diasParado: 2 });

    const porLead = new Map((await classificar()).map((r) => [r.lead_id, r]));
    expect(porLead.get(suspeito)?.destino).toBe("encerrar");
    expect(porLead.get(suspeito)?.motivo).toBe("numero_invalido");
    expect(porLead.get(optout)?.destino).toBe("encerrar");
    expect(porLead.get(optout)?.motivo).toBe("opt_out");
    expect(porLead.get(frio)?.destino).toBe("reativacao");
    expect(porLead.get(morno)?.destino).toBe("cadencia");
    expect(porLead.get(quente)?.destino).toBe("cadencia");
  });

  it("IMPORTAÇÃO EM LOTE não vira reativação, mesmo parada há mais de 30 dias", async () => {
    await comoSuperuser(c);
    const minimo = (await c.query(`SELECT lote_min_leads FROM public.higiene_config WHERE id`))
      .rows[0].lote_min_leads as number;

    // Um lote de importação: todos com o MESMO instante, ao segundo, e frios.
    const instante = `now() - interval '60 days'`;
    const fixo = (await c.query(`SELECT (${instante})::text AS t`)).rows[0].t as string;
    const doLote: string[] = [];
    for (let i = 0; i < minimo; i++) {
      doLote.push(await leadDeEstoque({ diasParado: 60, relogioFixo: fixo }));
    }
    // E um lead frio de verdade, com relógio próprio.
    const frioReal = await leadDeEstoque({ diasParado: 61 });

    const porLead = new Map((await classificar()).map((r) => [r.lead_id, r]));

    for (const id of doLote) {
      expect(porLead.get(id)?.escrita_lote).toBe(true);
      expect(porLead.get(id)?.destino).toBe("cadencia");
      expect(porLead.get(id)?.motivo).toBe("escrita_em_lote_vai_para_cadencia");
    }
    expect(porLead.get(frioReal)?.escrita_lote).toBe(false);
    expect(porLead.get(frioReal)?.destino).toBe("reativacao");
  });

  it("deixa de fora quem não é estoque de carteira", async () => {
    const semDono = await criarLead(c, { status: "aguardando_corretor", corretorId: null });
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads SET ultima_interacao = now() - interval '90 days' WHERE id = $1`,
      [semDono],
    );

    const jaNaCadencia = await criarLead(c, { status: "aguardando_corretor" });
    await c.query(`UPDATE public.leads SET corretor_id = $1 WHERE id = $2`, [
      corretor.id,
      jaNaCadencia,
    ]);

    const fundoDeFunil = await leadDeEstoque({ diasParado: 50, status: "agendado" });
    const perdido = await leadDeEstoque({ diasParado: 50, status: "perdido" });

    const ids = new Set((await classificar()).map((r) => r.lead_id));
    expect(ids.has(semDono)).toBe(false); // sem dono é do Bolsão
    expect(ids.has(jaNaCadencia)).toBe(false); // já tem destino
    expect(ids.has(fundoDeFunil)).toBe(false); // ali vale o SLA por fase
    expect(ids.has(perdido)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Carga única
// ---------------------------------------------------------------------------

describe("carga única (executar)", () => {
  it("em sombra decide o destino certo e não move ninguém", async () => {
    const frio = await leadDeEstoque({ diasParado: 45 });
    await comoSuperuser(c);
    const r = await c.query(`SELECT * FROM public.cadencia_fase0_executar('sombra')`);
    expect(r.rows.find((x) => x.destino === "reativacao")?.aplicados).toBe(0);

    const l = await leadRow(frio);
    expect(l.corretor_id).toBe(corretor.id);
    expect(l.cadencia_etapa).toBeNull();
    expect((await c.query(`SELECT count(*)::int AS n FROM public.reativacao_fila`)).rows[0].n).toBe(
      0,
    );
  });

  it("manda o estoque frio para a reativação SEM janela de descanso", async () => {
    const frio = await leadDeEstoque({ diasParado: 45 });
    await comoSuperuser(c);
    await c.query(`SELECT * FROM public.cadencia_fase0_executar('ativo')`);

    const l = await leadRow(frio);
    expect(l.cadencia_etapa).toBe("descanso");
    expect(l.status).toBe("perdido");
    expect(l.motivo_perda_categoria).toBe("sem_retorno_cadencia");
    expect(l.corretor_id).toBeNull();
    expect(l.corretor_anterior_id).toBe(corretor.id);

    const fila = await c.query(
      `SELECT origem, status, horarios_tentados, (elegivel_em <= now()) AS elegivel_agora
         FROM public.reativacao_fila WHERE lead_id = $1`,
      [frio],
    );
    expect(fila.rows[0].origem).toBe("estoque_30d");
    // Sem descanso: o silêncio de 45 dias já foi o descanso.
    expect(fila.rows[0].elegivel_agora).toBe(true);
    // Sem ficha: este lead nunca passou pela cadência, e um objeto zerado
    // faria o SDR achar que 7 tentativas falharam.
    expect(fila.rows[0].horarios_tentados).toBeNull();
  });

  it("encerra suspeito e opt-out fora de qualquer fila", async () => {
    const suspeito = await leadDeEstoque({ diasParado: 10, telefone: "11999999999" });
    await comoSuperuser(c);
    await c.query(`SELECT * FROM public.cadencia_fase0_executar('ativo')`);

    const l = await leadRow(suspeito);
    expect(l.cadencia_etapa).toBe("encerrado");
    expect(l.motivo_perda_categoria).toBe("numero_invalido");
    expect(
      (
        await c.query(`SELECT count(*)::int AS n FROM public.reativacao_fila WHERE lead_id=$1`, [
          suspeito,
        ])
      ).rows[0].n,
    ).toBe(0);
    const b = await c.query(
      `SELECT public._bolsao_elegivel(l.*) AS ok FROM public.leads l WHERE l.id = $1`,
      [suspeito],
    );
    expect(b.rows[0].ok).toBe(false);
  });

  it("é idempotente: rodar de novo não processa o mesmo lead", async () => {
    await leadDeEstoque({ diasParado: 45 });
    await comoSuperuser(c);
    const p = await c.query(`SELECT * FROM public.cadencia_fase0_executar('ativo')`);
    expect(p.rows.reduce((s, x) => s + Number(x.aplicados), 0)).toBe(1);

    const s = await c.query(`SELECT * FROM public.cadencia_fase0_executar('ativo')`);
    expect(s.rows.reduce((sum, x) => sum + Number(x.avaliados), 0)).toBe(0);
    expect((await c.query(`SELECT count(*)::int AS n FROM public.reativacao_fila`)).rows[0].n).toBe(
      1,
    );
  });

  it("não toca em lead com venda viva", async () => {
    const lead = await leadDeEstoque({ diasParado: 90 });
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.vendas (lead_id, corretor_id, valor_venda, status_venda, data_assinatura)
       VALUES ($1, $2, 300000, 'pendente'::public.status_venda, current_date)`,
      [lead, corretor.id],
    );
    expect((await classificar()).some((r) => r.lead_id === lead)).toBe(false);
  });

  it("só admin executa", async () => {
    await comoUsuario(c, corretor.id);
    expect(await errCode(c.query(`SELECT public.cadencia_fase0_executar('ativo')`))).toBe("42501");
  });
});

// ---------------------------------------------------------------------------
// Admissão em lotes
// ---------------------------------------------------------------------------

describe("admissão em lotes", () => {
  it("respeita o teto POR CORRETOR e começa pelo mais quente", async () => {
    // 4 leads de um corretor e 2 de outro; teto de 2 por chamada.
    const doPrimeiro: string[] = [];
    for (const dias of [1, 5, 12, 25]) {
      doPrimeiro.push(await leadDeEstoque({ diasParado: dias }));
    }
    for (const dias of [3, 9]) {
      await leadDeEstoque({ diasParado: dias, corretorId: outroCorretor.id });
    }

    await comoSuperuser(c);
    const r = await c.query(`SELECT * FROM public.cadencia_fase0_admitir('ativo', 2)`);
    expect(Number(r.rows[0].admitidos)).toBe(4); // 2 de cada corretor
    expect(Number(r.rows[0].corretores)).toBe(2);

    // Do primeiro corretor entraram os de 1 e 5 dias, não os de 12 e 25.
    expect((await leadRow(doPrimeiro[0])).cadencia_etapa).toBe("D0");
    expect((await leadRow(doPrimeiro[1])).cadencia_etapa).toBe("D0");
    expect((await leadRow(doPrimeiro[2])).cadencia_etapa).toBeNull();
    expect((await leadRow(doPrimeiro[3])).cadencia_etapa).toBeNull();
  });

  it("chamadas sucessivas esvaziam o estoque sem repetir lead", async () => {
    for (const dias of [1, 2, 3]) await leadDeEstoque({ diasParado: dias });
    await comoSuperuser(c);

    const a = await c.query(`SELECT * FROM public.cadencia_fase0_admitir('ativo', 2)`);
    expect(Number(a.rows[0].admitidos)).toBe(2);
    const b = await c.query(`SELECT * FROM public.cadencia_fase0_admitir('ativo', 2)`);
    expect(Number(b.rows[0].admitidos)).toBe(1);
    const d = await c.query(`SELECT * FROM public.cadencia_fase0_admitir('ativo', 2)`);
    expect(Number(d.rows[0].admitidos)).toBe(0);

    expect(
      (await c.query(`SELECT count(*)::int AS n FROM public.leads WHERE cadencia_etapa = 'D0'`))
        .rows[0].n,
    ).toBe(3);
  });

  it("em sombra loga a admissão e não põe ninguém em Lead chegou", async () => {
    const lead = await leadDeEstoque({ diasParado: 5 });
    await comoSuperuser(c);
    const r = await c.query(`SELECT * FROM public.cadencia_fase0_admitir('sombra', 15)`);
    expect(Number(r.rows[0].admitidos)).toBe(0);
    expect((await leadRow(lead)).cadencia_etapa).toBeNull();

    const log = await c.query(
      `SELECT etapa_para, motivo, aplicado FROM public.cadencia_execucao_log
        WHERE lead_id = $1 AND job = 'fase0'`,
      [lead],
    );
    expect(log.rows[0]).toMatchObject({
      etapa_para: "D0",
      motivo: "admissao_estoque",
      aplicado: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Desfazer
// ---------------------------------------------------------------------------

describe("desfazer um lote", () => {
  it("devolve o lead ao dono anterior e limpa a reativação", async () => {
    const frio = await leadDeEstoque({ diasParado: 45 });
    await comoSuperuser(c);
    const r = await c.query(`SELECT * FROM public.cadencia_fase0_executar('ativo')`);
    const lote = r.rows[0].lote_id as string;

    expect(
      (await c.query(`SELECT public.cadencia_fase0_desfazer($1) AS n`, [lote])).rows[0].n,
    ).toBe(1);

    const l = await leadRow(frio);
    expect(l.corretor_id).toBe(corretor.id);
    expect(l.status).toBe("aguardando_atendimento");
    expect(l.motivo_perda_categoria).toBeNull();
    // E volta JÁ EM LEAD CHEGOU (D0), não em limbo: devolver o corretor dispara o gatilho de
    // atribuição, que inicia a cadência. É o desfecho certo — um lead de volta
    // na carteira sem etapa e sem prazo é exatamente o estado que este projeto
    // existe para eliminar.
    expect(l.cadencia_etapa).toBe("D0");
    expect(
      (
        await c.query(`SELECT count(*)::int AS n FROM public.reativacao_fila WHERE lead_id=$1`, [
          frio,
        ])
      ).rows[0].n,
    ).toBe(0);
  });

  it("NÃO sobrescreve lead que já foi trabalhado depois da carga", async () => {
    const lead = await leadDeEstoque({ diasParado: 5 });
    await comoSuperuser(c);
    const r = await c.query(`SELECT * FROM public.cadencia_fase0_admitir('ativo', 15)`);
    const lote = r.rows[0].lote_id as string;
    expect((await leadRow(lead)).cadencia_etapa).toBe("D0");

    // O corretor trabalhou o lead: registrou uma tentativa.
    await c.query(
      `INSERT INTO public.cadencia_tentativas (lead_id, corretor_id, etapa, canal, resultado)
       VALUES ($1, $2, 'D0', 'ligacao', 'nao_atendeu')`,
      [lead, corretor.id],
    );

    expect(
      (await c.query(`SELECT public.cadencia_fase0_desfazer($1) AS n`, [lote])).rows[0].n,
    ).toBe(0);
    expect((await leadRow(lead)).cadencia_etapa).toBe("D0");
  });
});
