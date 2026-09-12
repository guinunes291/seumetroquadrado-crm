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
  // higiene_execucao (cabeçalho, uma linha por execução) entra aqui junto com o
  // log: limparDados() não conhece nenhuma das duas, e sem o reset o teste do
  // batimento cardíaco enxerga a execução do teste anterior.
  await c.query(`TRUNCATE public.higiene_execucao_log, public.higiene_execucao RESTART IDENTITY`);
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

/**
 * REGRESSÕES das quatro correções de 20260912120000_higiene_motor_correcoes.
 * Cada uma trava um defeito que foi REPRODUZIDO no harness antes do conserto —
 * não são testes de fachada.
 */
describe("correções da revisão (20260912120000)", () => {
  it("lead nunca tocado nunca vira perdido — a regra é rebaixada para alertar", async () => {
    // Reproduzido antes do conserto: um lead sem ultima_interacao e sem
    // ultimo_contato, fora de qualquer lote, era marcado perdido. A única
    // proteção real vinha de escrita_em_lote, que cobre 99,97% dos nunca
    // tocados por coincidência (12.714 de 12.718), não por desenho.
    const corretor = await criarUsuario(c, { papel: "corretor" });
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.leads (nome, telefone, status, corretor_id,
         ultima_interacao, ultimo_contato, created_at)
       VALUES ('virgem sem lote', '11987650001',
               'aguardando_retorno'::public.lead_status, $1,
               NULL, NULL, now() - interval '200 days')`,
      [corretor.id],
    );
    await c.query(
      `UPDATE public.higiene_config SET modo = 'ativo';
       UPDATE public.higiene_regra_fase
          SET acao_automatica = 'perdido', dias_perda = 60
        WHERE status = 'aguardando_retorno'`,
    );

    await processar();
    await comoSuperuser(c);

    const log = await c.query(
      `SELECT acao_regra, acao, nunca_tocado FROM public.higiene_execucao_log
        WHERE lead_id = (SELECT id FROM public.leads WHERE nome = 'virgem sem lote')`,
    );
    expect(log.rows[0].nunca_tocado).toBe(true);
    expect(log.rows[0].acao_regra).toBe("perdido");
    expect(log.rows[0].acao, "a regra mandou perder, a ação tinha que virar alertar").toBe(
      "alertar",
    );

    const lead0 = await c.query(
      `SELECT status::text AS status FROM public.leads WHERE nome = 'virgem sem lote'`,
    );
    expect(lead0.rows[0].status, "lead nunca tocado não pode terminar perdido").not.toBe("perdido");
  });

  it("em sombra, o motivo do pulo é o bloqueio REAL, não 'modo_sombra' para todos", async () => {
    // Antes do conserto, modo_sombra era a primeira condição da cadeia e
    // curto-circuitava tudo: 52 candidatos, 100% com motivo_pulo='modo_sombra'.
    // A sombra dizia quantos candidatos existem, nunca o que aconteceria ao
    // ligar — que é a única pergunta que ela existe para responder.
    const corretor = await criarUsuario(c, { papel: "corretor" });
    await comoSuperuser(c);
    const instante = new Date(Date.now() - 90 * 86_400_000).toISOString();
    // 50 no mesmo segundo: bloqueio substantivo (escrita em lote)
    await c.query(
      `INSERT INTO public.leads (nome, telefone, status, corretor_id, ultima_interacao, created_at)
       SELECT 'lote-'||g, '11988'||lpad(g::text,5,'0'),
              'aguardando_retorno'::public.lead_status, $2, $1::timestamptz,
              now() - interval '200 days'
         FROM generate_series(1,50) g`,
      [instante, corretor.id],
    );
    // 1 sem bloqueio nenhum: só a sombra o impede
    await c.query(
      `INSERT INTO public.leads (nome, telefone, status, corretor_id, ultima_interacao, created_at)
       VALUES ('so a sombra impede', '11988999999',
               'aguardando_retorno'::public.lead_status, $1,
               now() - interval '80 days', now() - interval '300 days')`,
      [corretor.id],
    );

    await processar();
    await comoSuperuser(c);

    const r = await c.query(
      `SELECT motivo_pulo, count(*)::int AS n FROM public.higiene_execucao_log
        GROUP BY 1 ORDER BY 2 DESC`,
    );
    const porMotivo = Object.fromEntries(r.rows.map((x) => [x.motivo_pulo, x.n]));
    expect(porMotivo["escrita_em_lote"], "os 50 de lote têm que aparecer como lote").toBe(50);
    // A contagem de modo_sombra é a resposta direta: quantos o motor moveria.
    expect(porMotivo["modo_sombra"], "só o lead sem bloqueio fica em modo_sombra").toBe(1);
  });

  it("o alerta do motor usa o mesmo tipo do alerta diário, para não duplicar", async () => {
    // gerar_alertas_leads_parados (11h) deduplica em tipo='follow_up'. Com o
    // motor inserindo 'sistema', o corretor levava dois alertas por dia do
    // mesmo lead assim que uma regra 'alertar' fosse ligada.
    const corretor = await criarUsuario(c, { papel: "corretor" });
    await comoSuperuser(c);
    await lead({
      nome: "alerta tipo",
      status: "aguardando_retorno",
      diasParado: 90,
      corretorId: corretor.id,
    });
    await c.query(`UPDATE public.higiene_config SET modo = 'ativo'`);

    await processar();
    await comoSuperuser(c);

    const a = await c.query(
      `SELECT tipo::text AS tipo, mensagem FROM public.alertas
        WHERE ref_id = (SELECT id FROM public.leads WHERE nome = 'alerta tipo')`,
    );
    // Filtra pelo alerta DO MOTOR: o lead pode ter outros alertas (ex.: o
    // gatilho de lead novo), e o que importa aqui é o tipo que o motor usa.
    const doMotor = a.rows.filter((x) => String(x.mensagem ?? "").includes("Higiene"));
    expect(doMotor.length, "o motor insere exatamente um alerta").toBe(1);
    expect(doMotor[0].tipo, "mesmo tipo do alerta diário, para deduplicar").toBe("follow_up");
  });

  it("o desfazer reverte um lead marcado PERDIDO — e é idempotente", async () => {
    // A funcao fazia `SET motivo_perda = NULL`, coluna que NAO EXISTE em
    // leads (as certas sao motivo_perdido e motivo_perda_categoria).
    // PL/pgSQL nao valida nome de coluna na criacao, entao a funcao compilava,
    // passava no CI, e so quebrava em execucao:
    //   ERROR: column "motivo_perda" of relation "leads" does not exist
    //
    // O desfazer e a rede de seguranca que justifica ligar o motor. Ele
    // funcionava no caminho 'alertar' (o unico que tinha teste) e falhava no
    // caminho 'perdido' — o unico caso em que alguem precisa dele.
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.higiene_config SET modo = 'ativo';
       UPDATE public.higiene_regra_fase
          SET acao_automatica = 'perdido', dias_perda = 60
        WHERE status = 'aguardando_retorno'`,
    );
    const id = await lead({
      nome: "desfazer perdido",
      status: "aguardando_retorno",
      diasParado: 90,
    });

    const r = await processar();
    expect(r.aplicados).toBe(1);
    await comoSuperuser(c);
    let l = await c.query(
      `SELECT status::text AS status, motivo_perda_categoria, data_perda
         FROM public.leads WHERE id = $1`,
      [id],
    );
    expect(l.rows[0].status).toBe("perdido");
    expect(l.rows[0].motivo_perda_categoria).toBe("sem_contato");

    const d1 = await c.query(`SELECT public.higiene_desfazer_lote($1) AS n`, [r.execucao_id]);
    expect(Number(d1.rows[0].n), "o desfazer tem que reverter o lead").toBe(1);

    l = await c.query(
      `SELECT status::text AS status, motivo_perda_categoria, data_perda
         FROM public.leads WHERE id = $1`,
      [id],
    );
    expect(l.rows[0].status, "volta ao status anterior").toBe("aguardando_retorno");
    expect(l.rows[0].motivo_perda_categoria).toBeNull();
    expect(l.rows[0].data_perda).toBeNull();

    const d2 = await c.query(`SELECT public.higiene_desfazer_lote($1) AS n`, [r.execucao_id]);
    expect(Number(d2.rows[0].n), "idempotente: nada a reverter na segunda vez").toBe(0);
  });

  it("corretor comum não consegue desfazer", async () => {
    // O afrouxamento do guard do desfazer (para o SQL console funcionar numa
    // emergência) não pode abrir a função para qualquer usuário logado.
    const corretor = await criarUsuario(c, { papel: "corretor" });
    await comoUsuario(c, corretor.id);
    const code = await errCode(
      c.query(`SELECT public.higiene_desfazer_lote('00000000-0000-0000-0000-000000000000')`),
    );
    expect(code).toBe("42501");
    await comoSuperuser(c);
  });

  it("o cron consegue rodar: sem contexto de request, não é barrado", async () => {
    // O guard original exigia service_role OU papel de gestão. pg_cron executa
    // SEM contexto: auth.uid() e auth.role() são ambos NULL — então o job das
    // 4h levantava 42501 toda noite e o motor NUNCA rodava. Era também o erro
    // que aparecia ao chamar a função pelo SQL editor.
    await comoSuperuser(c);
    await c.query(`SELECT set_config('request.jwt.claims', '', false)`);

    const r = await c.query(`SELECT * FROM public.higiene_processar()`);
    expect(r.rows.length, "sem contexto de request o motor tem que rodar").toBe(1);

    // E a execução conta como execução, mesmo sem candidato nenhum.
    const v = await c.query(`SELECT motor_atrasado FROM public.v_higiene_motor_status`);
    expect(v.rows[0].motor_atrasado).toBe(false);
  });

  it("corretor comum continua barrado", async () => {
    // A outra metade da correção 6: afrouxar para o cron não pode abrir a
    // função para qualquer usuário logado — ela tem GRANT para `authenticated`.
    const corretor = await criarUsuario(c, { papel: "corretor" });
    await comoUsuario(c, corretor.id);
    const code = await errCode(c.query(`SELECT public.higiene_processar()`));
    expect(code).toBe("42501");
    await comoSuperuser(c);
  });

  it("motor_atrasado é true quando nunca rodou, e a view devolve UMA linha", async () => {
    // Critério de aceite 3(a) do projeto: motor parado não pode parecer "nada
    // a fazer". A view não tinha esta coluna — a tela teria que calcular as
    // 26h no cliente, recriando a divergência que a Fatia 1 matou.
    await comoSuperuser(c);
    await c.query(`TRUNCATE public.higiene_execucao_log, public.higiene_execucao`);

    const v = await c.query(
      `SELECT modo, ultima_execucao, motor_atrasado FROM public.v_higiene_motor_status`,
    );
    expect(v.rows.length, "sem execução a view ainda tem que devolver uma linha").toBe(1);
    expect(v.rows[0].ultima_execucao).toBeNull();
    expect(v.rows[0].motor_atrasado, "motor que nunca rodou está atrasado").toBe(true);

    await processar();
    await comoSuperuser(c);
    const v2 = await c.query(`SELECT motor_atrasado FROM public.v_higiene_motor_status`);
    expect(v2.rows[0].motor_atrasado, "logo após rodar, não está atrasado").toBe(false);
  });
});
