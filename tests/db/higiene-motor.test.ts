/**
 * MOTOR DE HIGIENE (Fatia 2b) — modo SOMBRA.
 *
 * O sistema está em produção e fazendo dinheiro. A promessa desta fatia é
 * estreita e verificável: o motor roda todo dia, registra o que FARIA, e não
 * move nenhum lead. Cada teste aqui trava uma dessas promessas:
 *
 *  1. sombra não escreve em leads nem em alertas — só no log;
 *  2. todo candidato entra no log, com motivo do pulo (0 aplicados por
 *     "motor quebrado" e por "modo sombra" precisam ser distinguíveis);
 *  3. escrita em lote é medida sobre a base INTEIRA, não só sobre os vivos —
 *     senão uma importação cujos leads já viraram perdidos volta a parecer
 *     abandono real;
 *  4. aguardando_atendimento e perda em análise de crédito são impossíveis
 *     por CHECK, não por disciplina;
 *  5. o desfazer é idempotente e reverte o que foi aplicado.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarUsuario,
  errCode,
  limparDados,
  novoClient,
} from "./helpers";

const c = novoClient();
let conectado = false;

async function conectar() {
  if (!conectado) {
    await c.connect();
    conectado = true;
  }
}

let admin: { id: string };

/** Roda o motor com a identidade do admin (é assim que a gestão chama). */
async function processar(): Promise<{
  execucao_id: string;
  avaliados: number;
  aplicados: number;
  pulados: number;
  erros: number;
}> {
  await comoSuperuser(c);
  await c.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: admin.id, role: "authenticated" }),
  ]);
  const r = await c.query(`SELECT * FROM public.higiene_processar()`);
  const row = r.rows[0];
  return {
    execucao_id: row.execucao_id as string,
    avaliados: Number(row.avaliados),
    aplicados: Number(row.aplicados),
    pulados: Number(row.pulados),
    erros: Number(row.erros),
  };
}

async function lead(opts: {
  nome: string;
  status: string;
  diasParado: number;
  corretorId?: string | null;
  instanteFixo?: string | null;
  naLixeira?: boolean;
  sdrId?: string | null;
}): Promise<string> {
  await comoSuperuser(c);
  const r = await c.query(
    `INSERT INTO public.leads
       (nome, telefone, status, corretor_id, sdr_id, na_lixeira, ultima_interacao, created_at)
     VALUES ($1, $2, $3::public.lead_status, $4, $5, $6, $7, now() - interval '200 days')
     RETURNING id`,
    [
      opts.nome,
      `11${String(Math.abs(hash(opts.nome)) % 1_000_000_000).padStart(9, "0")}`,
      opts.status,
      opts.corretorId ?? null,
      opts.sdrId ?? null,
      opts.naLixeira ?? false,
      opts.instanteFixo ?? new Date(Date.now() - opts.diasParado * 86_400_000).toISOString(),
    ],
  );
  return r.rows[0].id as string;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

beforeEach(async () => {
  await conectar();
  await limparDados(c);
  await comoSuperuser(c);
  // limparDados() não conhece as tabelas de higiene: sem este reset, o teste
  // que muda o modo ou desativa uma fase vaza para os seguintes.
  await c.query(
    `UPDATE public.higiene_config
        SET dias_parado_min = 5, lote_min_leads = 50, modo = 'sombra',
            teto_perdidos_dia = 200, lote_max = 500`,
  );
  await c.query(
    `UPDATE public.higiene_regra_fase
        SET ativa = true, acao_automatica = 'alertar', dias_perda = NULL`,
  );
  await c.query(`TRUNCATE public.higiene_execucao_log RESTART IDENTITY`);
  admin = await criarUsuario(c, { papel: "admin", nome: "Admin Higiene" });
});

afterAll(async () => {
  if (conectado) await c.end();
});

describe("modo sombra", () => {
  it("avalia, registra e não aplica nada", async () => {
    const corretor = await criarUsuario(c, { papel: "corretor" });
    await lead({
      nome: "parado credito",
      status: "analise_credito",
      diasParado: 30,
      corretorId: corretor.id,
    });

    const r = await processar();
    expect(r.avaliados).toBe(1);
    expect(r.aplicados).toBe(0);
    expect(r.pulados).toBe(1);
    expect(r.erros).toBe(0);

    await comoSuperuser(c);
    const log = await c.query(
      `SELECT motivo_pulo, acao_regra, aplicado, cfg_modo, cfg_lote_min_leads
         FROM public.higiene_execucao_log WHERE execucao_id = $1`,
      [r.execucao_id],
    );
    expect(log.rows[0].motivo_pulo).toBe("modo_sombra");
    expect(log.rows[0].acao_regra).toBe("alertar");
    expect(log.rows[0].aplicado).toBe(false);
    // A config vai CARIMBADA: sem isto, um UPDATE em lote_min_leads muda o
    // comportamento do motor sem deixar rastro no histórico.
    expect(log.rows[0].cfg_modo).toBe("sombra");
    expect(Number(log.rows[0].cfg_lote_min_leads)).toBe(50);
  });

  it("não toca em leads nem cria alertas", async () => {
    const corretor = await criarUsuario(c, { papel: "corretor" });
    const id = await lead({
      nome: "intocado",
      status: "aguardando_retorno",
      diasParado: 60,
      corretorId: corretor.id,
    });
    await comoSuperuser(c);
    const antes = await c.query(
      `SELECT status::text, corretor_id, ultima_interacao FROM public.leads WHERE id = $1`,
      [id],
    );

    // Linha de base: a distribuição já cria alerta ao vincular corretor.
    // O que o teste trava é que o MOTOR não acrescenta nenhum.
    const alAntes = await c.query(`SELECT count(*)::int AS n FROM public.alertas`);

    await processar();

    await comoSuperuser(c);
    const depois = await c.query(
      `SELECT status::text, corretor_id, ultima_interacao FROM public.leads WHERE id = $1`,
      [id],
    );
    expect(depois.rows[0]).toEqual(antes.rows[0]);
    const al = await c.query(`SELECT count(*)::int AS n FROM public.alertas`);
    expect(al.rows[0].n).toBe(alAntes.rows[0].n);
  });

  it("não lista lead dentro do prazo da fase", async () => {
    const corretor = await criarUsuario(c, { papel: "corretor" });
    await lead({
      nome: "recente",
      status: "aguardando_retorno",
      diasParado: 2,
      corretorId: corretor.id,
    });
    const r = await processar();
    expect(r.avaliados).toBe(0);
  });

  it("respeita dias_perda próprio da fase antes do prazo global", async () => {
    const corretor = await criarUsuario(c, { papel: "corretor" });
    await lead({
      nome: "retorno 10d",
      status: "aguardando_retorno",
      diasParado: 10,
      corretorId: corretor.id,
    });
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.higiene_regra_fase SET dias_perda = 30 WHERE status = 'aguardando_retorno'`,
    );
    expect((await processar()).avaliados).toBe(0);

    await comoSuperuser(c);
    await c.query(
      `UPDATE public.higiene_regra_fase SET dias_perda = 7 WHERE status = 'aguardando_retorno'`,
    );
    expect((await processar()).avaliados).toBe(1);
  });
});

describe("travas de segurança", () => {
  it("aguardando_atendimento não pode entrar na régua (é da SLA de 15 min)", async () => {
    await comoSuperuser(c);
    const code = await errCode(
      c.query(
        `INSERT INTO public.higiene_regra_fase (status, peso, acao_sugerida)
         VALUES ('aguardando_atendimento', 10, 'x')`,
      ),
    );
    expect(code).toBe("23514");
  });

  it("análise de crédito nunca ganha prazo de perda", async () => {
    await comoSuperuser(c);
    const code = await errCode(
      c.query(
        `UPDATE public.higiene_regra_fase SET dias_perda = 10 WHERE status = 'analise_credito'`,
      ),
    );
    expect(code).toBe("23514");
  });

  it("corretor comum não roda o motor", async () => {
    const corretor = await criarUsuario(c, { papel: "corretor" });
    await comoUsuario(c, corretor.id);
    const code = await errCode(c.query(`SELECT public.higiene_processar()`));
    expect(code).toBe("42501");
    await comoSuperuser(c);
  });
});

describe("escrita em lote", () => {
  it("é medida sobre a base inteira, não só sobre os vivos", async () => {
    // 50 leads com o MESMO instante ao segundo. Dois deles vão para a lixeira:
    // a janela da v_higiene_base passa a ver 48 (abaixo do limiar) mas a
    // importação continua sendo uma importação — o motor precisa enxergá-la.
    const corretor = await criarUsuario(c, { papel: "corretor" });
    const instante = new Date(Date.now() - 40 * 86_400_000).toISOString();
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.leads (nome, telefone, status, corretor_id, ultima_interacao, created_at)
       SELECT 'imp-'||g, '119333'||lpad(g::text,5,'0'),
              'aguardando_retorno'::public.lead_status, $2, $1::timestamptz,
              now() - interval '200 days'
         FROM generate_series(1,50) g`,
      [instante, corretor.id],
    );
    await c.query(`UPDATE public.leads SET na_lixeira = true WHERE nome IN ('imp-1','imp-2')`);

    const base = await c.query(
      `SELECT count(*)::int AS n FROM public.v_higiene_base WHERE escrita_em_lote`,
    );
    expect(base.rows[0].n).toBe(0);

    await comoSuperuser(c);
    await c.query(`UPDATE public.higiene_config SET modo = 'ativo'`);
    const r = await processar();
    expect(r.avaliados).toBe(48);
    expect(r.aplicados).toBe(0);

    await comoSuperuser(c);
    const log = await c.query(
      `SELECT DISTINCT motivo_pulo, escrita_lote_global
         FROM public.higiene_execucao_log WHERE execucao_id = $1`,
      [r.execucao_id],
    );
    expect(log.rows).toEqual([{ motivo_pulo: "escrita_em_lote", escrita_lote_global: true }]);
  });
});

describe("modo ativo", () => {
  it("alerta o corretor e o desfazer remove o alerta (idempotente)", async () => {
    const corretor = await criarUsuario(c, { papel: "corretor" });
    await lead({
      nome: "alertavel",
      status: "aguardando_retorno",
      diasParado: 40,
      corretorId: corretor.id,
    });
    await comoSuperuser(c);
    await c.query(`UPDATE public.higiene_config SET modo = 'ativo'`);
    const alAntes = (await c.query(`SELECT count(*)::int AS n FROM public.alertas`)).rows[0].n;

    const r = await processar();
    expect(r.aplicados).toBe(1);
    await comoSuperuser(c);
    let al = await c.query(`SELECT count(*)::int AS n FROM public.alertas`);
    expect(al.rows[0].n).toBe(alAntes + 1);

    await c.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
      JSON.stringify({ sub: admin.id, role: "authenticated" }),
    ]);
    const d1 = await c.query(`SELECT public.higiene_desfazer_lote($1) AS n`, [r.execucao_id]);
    expect(Number(d1.rows[0].n)).toBe(1);
    const d2 = await c.query(`SELECT public.higiene_desfazer_lote($1) AS n`, [r.execucao_id]);
    expect(Number(d2.rows[0].n)).toBe(0);

    await comoSuperuser(c);
    al = await c.query(`SELECT count(*)::int AS n FROM public.alertas`);
    expect(al.rows[0].n).toBe(alAntes);
  });

  it("pula lead sem corretor e lead em ressurreição do SDR", async () => {
    const corretor = await criarUsuario(c, { papel: "corretor" });
    const sdr = await criarUsuario(c, { papel: "sdr" });
    await lead({ nome: "sem dono", status: "aguardando_retorno", diasParado: 40 });
    await lead({
      nome: "com sdr",
      status: "aguardando_retorno",
      diasParado: 40,
      corretorId: corretor.id,
      sdrId: sdr.id,
    });
    await comoSuperuser(c);
    await c.query(`UPDATE public.higiene_config SET modo = 'ativo'`);

    const r = await processar();
    expect(r.aplicados).toBe(0);
    await comoSuperuser(c);
    const log = await c.query(
      `SELECT motivo_pulo, count(*)::int AS n FROM public.higiene_execucao_log
        WHERE execucao_id = $1 GROUP BY 1 ORDER BY 1`,
      [r.execucao_id],
    );
    expect(log.rows).toEqual([
      { motivo_pulo: "ressurreicao_sdr", n: 1 },
      { motivo_pulo: "sem_corretor", n: 1 },
    ]);
  });

  it("um lead com erro não derruba o lote", async () => {
    const corretor = await criarUsuario(c, { papel: "corretor" });
    const quebrado = await lead({
      nome: "quebrado",
      status: "aguardando_retorno",
      diasParado: 40,
      corretorId: corretor.id,
    });
    await lead({
      nome: "saudavel",
      status: "aguardando_retorno",
      diasParado: 41,
      corretorId: corretor.id,
    });
    await comoSuperuser(c);
    await c.query(`UPDATE public.higiene_config SET modo = 'ativo'`);
    // Falha provocada num lead só: o alerta desse lead viola a FK de user_id.
    await c.query(`UPDATE public.leads SET corretor_id = NULL WHERE id = $1`, [quebrado]);
    await c.query(
      `CREATE OR REPLACE FUNCTION pg_temp_quebra() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN RAISE EXCEPTION 'falha proposital'; END $$`,
    );
    await c.query(`UPDATE public.leads SET corretor_id = $2 WHERE id = $1`, [
      quebrado,
      corretor.id,
    ]);
    await c.query(
      `CREATE TRIGGER trg_quebra_teste BEFORE INSERT ON public.alertas
       FOR EACH ROW WHEN (NEW.ref_id = '${quebrado}') EXECUTE FUNCTION pg_temp_quebra()`,
    );

    const r = await processar();
    await comoSuperuser(c);
    await c.query(`DROP TRIGGER trg_quebra_teste ON public.alertas`);

    expect(r.avaliados).toBe(2);
    expect(r.aplicados).toBe(1);
    expect(r.erros).toBe(1);
    const log = await c.query(
      `SELECT erro FROM public.higiene_execucao_log
        WHERE execucao_id = $1 AND lead_id = $2`,
      [r.execucao_id, quebrado],
    );
    expect(log.rows[0].erro).toContain("falha proposital");
  });
});

describe("batimento cardíaco", () => {
  it("devolve uma linha mesmo antes da primeira execução", async () => {
    await comoSuperuser(c);
    const r = await c.query(`SELECT * FROM public.v_higiene_motor_status`);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].modo).toBe("sombra");
    expect(r.rows[0].ultima_execucao).toBeNull();
    expect(Number(r.rows[0].avaliados)).toBe(0);
  });

  it("resume a última execução", async () => {
    const corretor = await criarUsuario(c, { papel: "corretor" });
    await lead({
      nome: "resumo",
      status: "aguardando_retorno",
      diasParado: 40,
      corretorId: corretor.id,
    });
    const r = await processar();
    await comoSuperuser(c);
    const v = await c.query(`SELECT * FROM public.v_higiene_motor_status`);
    expect(v.rows[0].execucao_id).toBe(r.execucao_id);
    expect(Number(v.rows[0].avaliados)).toBe(1);
    expect(Number(v.rows[0].pulados)).toBe(1);
    expect(v.rows[0].motivos_pulo).toEqual({ modo_sombra: 1 });
    expect(v.rows[0].ultima_execucao).not.toBeNull();
  });
});
