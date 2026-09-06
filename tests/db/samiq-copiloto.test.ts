/**
 * SAMIQ COPILOTO — Onda S1 (migration 20260906100000_samiq_copiloto_s1.sql).
 *
 * Cobre no Postgres real o que o contrato de texto não prova:
 *   - samiq_reservar_execucao devolve tools_enabled/max_tool_steps/custo_mes_pct
 *     e aplica os tetos MENSAIS por papel (corretor × gestão × equipe);
 *   - samiq_finalizar_execucao grava tool_calls/tool_errors/fallback e segue
 *     aceitando a assinatura curta dos chamadores antigos;
 *   - samiq_gravar_turno cria/continua a conversa, liga a execução, renova a
 *     expiração e NUNCA escreve na conversa de outro usuário;
 *   - RLS da memória: cada usuário lê/apaga só a sua; browser não insere;
 *   - samiq_avaliar_execucao: só o dono, só execução concluída, upsert;
 *   - samiq_metricas_periodo: corretor barrado, gestor vê a equipe, admin tudo.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import {
  comoSuperuser,
  comoUsuario,
  criarEquipe,
  criarLead,
  criarUsuario,
  errCode,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let equipeA: string;
let equipeB: string;
let gestorA: UsuarioTeste;
let corretorA: UsuarioTeste;
let corretorB: UsuarioTeste;
let admin: UsuarioTeste;
let leadA: string;

type Reserva = {
  allowed: boolean;
  denial_reason: string | null;
  execution_id: string | null;
  prompt_version: string | null;
  system_prompt: string | null;
  tools_enabled: boolean | null;
  max_tool_steps: number | null;
  custo_mes_pct: number | null;
};

async function reservar(
  client: Client,
  userId: string,
  action = "pergunta_livre",
): Promise<Reserva> {
  await comoSuperuser(client);
  const r = await client.query(
    `SELECT * FROM public.samiq_reservar_execucao($1, $2, 10000, NULL)`,
    [userId, action],
  );
  return r.rows[0] as Reserva;
}

async function finalizar(
  client: Client,
  userId: string,
  executionId: string,
  extras?: { toolCalls: number; toolErrors: number; fallback: boolean },
): Promise<boolean> {
  await comoSuperuser(client);
  const r = extras
    ? await client.query(
        `SELECT public.samiq_finalizar_execucao($1, $2, 'completed', 1200, 300, 900, NULL, $3, $4, $5) AS ok`,
        [userId, executionId, extras.toolCalls, extras.toolErrors, extras.fallback],
      )
    : await client.query(
        `SELECT public.samiq_finalizar_execucao($1, $2, 'completed', 1000, 200, 800) AS ok`,
        [userId, executionId],
      );
  return r.rows[0].ok as boolean;
}

async function semTetos(client: Client): Promise<void> {
  await comoSuperuser(client);
  await client.query(
    `UPDATE public.samiq_politica
        SET max_cost_corretor_micros_mes = NULL,
            max_cost_gestor_micros_mes = NULL,
            max_cost_equipe_micros_mes = NULL
      WHERE id = 1`,
  );
  await client.query(
    `UPDATE public.samiq_prompt_versions
        SET input_cost_micros_per_million = NULL, output_cost_micros_per_million = NULL
      WHERE active = true`,
  );
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await c.query(`DELETE FROM public.samiq_execucoes`);
  await semTetos(c);
  equipeA = await criarEquipe(c);
  equipeB = await criarEquipe(c);
  gestorA = await criarUsuario(c, { papel: "gestor", equipeId: equipeA });
  await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gestorA.id, equipeA]);
  corretorA = await criarUsuario(c, { papel: "corretor", equipeId: equipeA });
  corretorB = await criarUsuario(c, { papel: "corretor", equipeId: equipeB });
  admin = await criarUsuario(c, { papel: "admin", equipeId: null });
  leadA = await criarLead(c, { corretorId: corretorA.id, nome: "Maria da Silva" });
});

afterAll(async () => {
  await semTetos(c);
  await c.end();
});

describe("reserva com ferramentas de leitura", () => {
  it("devolve a v3 com tools_enabled, o teto de passos da política e sem % de custo quando não há teto", async () => {
    const r = await reservar(c, corretorA.id);
    expect(r.allowed).toBe(true);
    expect(r.prompt_version).toBe("samiq-2026-09-v3");
    expect(r.tools_enabled).toBe(true);
    expect(r.max_tool_steps).toBe(6);
    expect(r.custo_mes_pct).toBeNull();
    expect(r.system_prompt).toContain("Não consegui");
    expect(r.system_prompt).toContain("NÃO tem ferramentas de escrita");
  });

  it("ação sem prompt versionado continua rejeitada (22023)", async () => {
    await comoSuperuser(c);
    expect(
      await errCode(
        c.query(
          `SELECT * FROM public.samiq_reservar_execucao($1, 'registrar_contato', 10000, NULL)`,
          [corretorA.id],
        ),
      ),
    ).toBe("22023");
  });
});

describe("finalização com métricas de ferramenta (D17)", () => {
  it("grava tool_calls, tool_errors e fallback na execução", async () => {
    const r = await reservar(c, corretorA.id);
    expect(
      await finalizar(c, corretorA.id, r.execution_id!, {
        toolCalls: 3,
        toolErrors: 1,
        fallback: true,
      }),
    ).toBe(true);
    const row = await c.query(
      `SELECT status, tool_calls, tool_errors, fallback, input_tokens FROM public.samiq_execucoes WHERE id = $1`,
      [r.execution_id],
    );
    expect(row.rows[0]).toMatchObject({
      status: "completed",
      tool_calls: 3,
      tool_errors: 1,
      fallback: true,
      input_tokens: 1200,
    });
  });

  it("a assinatura curta (match/resumo/mensagem) continua válida e zera as métricas de ferramenta", async () => {
    const r = await reservar(c, corretorA.id, "resumo_lead");
    expect(await finalizar(c, corretorA.id, r.execution_id!)).toBe(true);
    const row = await c.query(
      `SELECT tool_calls, tool_errors, fallback FROM public.samiq_execucoes WHERE id = $1`,
      [r.execution_id],
    );
    expect(row.rows[0]).toEqual({ tool_calls: 0, tool_errors: 0, fallback: false });
  });

  it("métrica de ferramenta fora da faixa é rejeitada (22023)", async () => {
    const r = await reservar(c, corretorA.id);
    await comoSuperuser(c);
    expect(
      await errCode(
        c.query(
          `SELECT public.samiq_finalizar_execucao($1, $2, 'completed', 10, 10, 10, NULL, 101, 0, false)`,
          [corretorA.id, r.execution_id],
        ),
      ),
    ).toBe("22023");
  });
});

describe("memória: samiq_gravar_turno", () => {
  let conversaId: string;
  let execucaoId: string;

  it("cria a conversa no primeiro turno, com título da pergunta, e liga a execução", async () => {
    const r = await reservar(c, corretorA.id);
    execucaoId = r.execution_id!;
    await finalizar(c, corretorA.id, execucaoId, { toolCalls: 1, toolErrors: 0, fallback: false });
    const out = await c.query(
      `SELECT public.samiq_gravar_turno($1, NULL, $2, $3, $4, ARRAY['minha_agenda'], $5) AS id`,
      [corretorA.id, leadA, "  quem tem   visita amanhã?  ", "Ana às 10h.", execucaoId],
    );
    conversaId = out.rows[0].id as string;
    expect(conversaId).toMatch(/^[0-9a-f-]{36}$/);

    const conv = await c.query(
      `SELECT user_id, lead_id, titulo, expira_em > now() + interval '89 days' AS retencao_ok
         FROM public.samiq_conversas WHERE id = $1`,
      [conversaId],
    );
    expect(conv.rows[0]).toMatchObject({
      user_id: corretorA.id,
      lead_id: leadA,
      titulo: "quem tem visita amanhã?",
      retencao_ok: true,
    });

    const msgs = await c.query(
      `SELECT papel, conteudo, ferramentas, execution_id
         FROM public.samiq_conversa_mensagens WHERE conversa_id = $1 ORDER BY criado_em, papel DESC`,
      [conversaId],
    );
    expect(msgs.rows).toEqual([
      { papel: "user", conteudo: "quem tem   visita amanhã?", ferramentas: [], execution_id: null },
      {
        papel: "assistant",
        conteudo: "Ana às 10h.",
        ferramentas: ["minha_agenda"],
        execution_id: execucaoId,
      },
    ]);

    const exec = await c.query(`SELECT conversa_id FROM public.samiq_execucoes WHERE id = $1`, [
      execucaoId,
    ]);
    expect(exec.rows[0].conversa_id).toBe(conversaId);
  });

  it("o turno seguinte continua a mesma conversa e renova a expiração", async () => {
    await c.query(
      `UPDATE public.samiq_conversas SET expira_em = now() + interval '1 day', atualizado_em = now() - interval '1 hour'
        WHERE id = $1`,
      [conversaId],
    );
    const out = await c.query(
      `SELECT public.samiq_gravar_turno($1, $2, NULL, 'e depois?', 'Bruno às 14h.', '{}', NULL) AS id`,
      [corretorA.id, conversaId],
    );
    expect(out.rows[0].id).toBe(conversaId);
    const conv = await c.query(
      `SELECT lead_id, expira_em > now() + interval '89 days' AS renovada,
              atualizado_em > now() - interval '1 minute' AS tocada,
              (SELECT count(*)::int FROM public.samiq_conversa_mensagens WHERE conversa_id = $1) AS n
         FROM public.samiq_conversas WHERE id = $1`,
      [conversaId],
    );
    // lead_id fica o anterior quando o turno novo não traz lead.
    expect(conv.rows[0]).toEqual({ lead_id: leadA, renovada: true, tocada: true, n: 4 });
  });

  it("id de conversa de OUTRO usuário não é reaproveitado: abre uma conversa própria", async () => {
    const out = await c.query(
      `SELECT public.samiq_gravar_turno($1, $2, NULL, 'oi', 'olá', '{}', NULL) AS id`,
      [corretorB.id, conversaId],
    );
    expect(out.rows[0].id).not.toBe(conversaId);
    const dona = await c.query(`SELECT user_id FROM public.samiq_conversas WHERE id = $1`, [
      out.rows[0].id,
    ]);
    expect(dona.rows[0].user_id).toBe(corretorB.id);
    const n = await c.query(
      `SELECT count(*)::int AS n FROM public.samiq_conversa_mensagens WHERE conversa_id = $1`,
      [conversaId],
    );
    expect(n.rows[0].n).toBe(4);
  });

  it("turno vazio é rejeitado (22023)", async () => {
    expect(
      await errCode(
        c.query(`SELECT public.samiq_gravar_turno($1, NULL, NULL, '   ', 'x', '{}', NULL)`, [
          corretorA.id,
        ]),
      ),
    ).toBe("22023");
  });

  describe("RLS da memória", () => {
    it("o dono lê a conversa e as mensagens; outro corretor não vê nada", async () => {
      await comoUsuario(c, corretorA.id);
      const minhas = await c.query(`SELECT id FROM public.samiq_conversas`);
      expect(minhas.rows.map((r) => r.id)).toContain(conversaId);
      const msgs = await c.query(
        `SELECT count(*)::int AS n FROM public.samiq_conversa_mensagens WHERE conversa_id = $1`,
        [conversaId],
      );
      expect(msgs.rows[0].n).toBe(4);

      await comoUsuario(c, corretorB.id);
      const alheias = await c.query(`SELECT id FROM public.samiq_conversas WHERE id = $1`, [
        conversaId,
      ]);
      expect(alheias.rowCount).toBe(0);
      const msgsB = await c.query(
        `SELECT count(*)::int AS n FROM public.samiq_conversa_mensagens WHERE conversa_id = $1`,
        [conversaId],
      );
      expect(msgsB.rows[0].n).toBe(0);
      await comoSuperuser(c);
    });

    it("o browser não insere na memória (42501) — só o servidor grava", async () => {
      await comoUsuario(c, corretorA.id);
      expect(
        await errCode(
          c.query(`INSERT INTO public.samiq_conversas (user_id, titulo) VALUES ($1, 'forjada')`, [
            corretorA.id,
          ]),
        ),
      ).toBe("42501");
      await comoSuperuser(c);
    });

    it("apagar: outro usuário afeta 0 linhas; o dono apaga e as mensagens vão junto", async () => {
      await comoUsuario(c, corretorB.id);
      const alheio = await c.query(`DELETE FROM public.samiq_conversas WHERE id = $1`, [
        conversaId,
      ]);
      expect(alheio.rowCount).toBe(0);

      await comoUsuario(c, corretorA.id);
      const proprio = await c.query(`DELETE FROM public.samiq_conversas WHERE id = $1`, [
        conversaId,
      ]);
      expect(proprio.rowCount).toBe(1);

      await comoSuperuser(c);
      const restantes = await c.query(
        `SELECT count(*)::int AS n FROM public.samiq_conversa_mensagens WHERE conversa_id = $1`,
        [conversaId],
      );
      expect(restantes.rows[0].n).toBe(0);
      // A execução sobrevive à conversa (ON DELETE SET NULL): telemetria não some.
      const exec = await c.query(`SELECT conversa_id FROM public.samiq_execucoes WHERE id = $1`, [
        execucaoId,
      ]);
      expect(exec.rows[0].conversa_id).toBeNull();
    });
  });
});

describe("avaliação 👍/👎 (samiq_avaliar_execucao)", () => {
  let execucaoId: string;

  beforeAll(async () => {
    const r = await reservar(c, corretorA.id);
    execucaoId = r.execution_id!;
    await finalizar(c, corretorA.id, execucaoId, { toolCalls: 0, toolErrors: 0, fallback: false });
  });

  it("o dono avalia a própria execução concluída; trocar de ideia sobrescreve", async () => {
    await comoUsuario(c, corretorA.id);
    const up = await c.query(`SELECT public.samiq_avaliar_execucao($1, 1, NULL) AS ok`, [
      execucaoId,
    ]);
    expect(up.rows[0].ok).toBe(true);
    const motivoLongo = "x".repeat(400);
    const down = await c.query(`SELECT public.samiq_avaliar_execucao($1, -1, $2) AS ok`, [
      execucaoId,
      motivoLongo,
    ]);
    expect(down.rows[0].ok).toBe(true);
    const mine = await c.query(
      `SELECT nota, length(motivo) AS tam FROM public.samiq_avaliacoes WHERE execution_id = $1`,
      [execucaoId],
    );
    expect(mine.rows[0]).toEqual({ nota: -1, tam: 300 });
    await comoSuperuser(c);
    const total = await c.query(
      `SELECT count(*)::int AS n FROM public.samiq_avaliacoes WHERE execution_id = $1`,
      [execucaoId],
    );
    expect(total.rows[0].n).toBe(1);
  });

  it("outro usuário não avalia execução alheia (false) e não a enxerga", async () => {
    await comoUsuario(c, corretorB.id);
    const r = await c.query(`SELECT public.samiq_avaliar_execucao($1, 1, NULL) AS ok`, [
      execucaoId,
    ]);
    expect(r.rows[0].ok).toBe(false);
    const ve = await c.query(`SELECT 1 FROM public.samiq_avaliacoes WHERE execution_id = $1`, [
      execucaoId,
    ]);
    expect(ve.rowCount).toBe(0);
    await comoSuperuser(c);
  });

  it("execução ainda reservada não pode ser avaliada; nota fora de {-1, 1} é 22023", async () => {
    const r = await reservar(c, corretorA.id);
    await comoUsuario(c, corretorA.id);
    const pend = await c.query(`SELECT public.samiq_avaliar_execucao($1, 1, NULL) AS ok`, [
      r.execution_id,
    ]);
    expect(pend.rows[0].ok).toBe(false);
    expect(
      await errCode(c.query(`SELECT public.samiq_avaliar_execucao($1, 0, NULL)`, [execucaoId])),
    ).toBe("22023");
    await comoSuperuser(c);
  });
});

describe("painel de qualidade (samiq_metricas_periodo)", () => {
  it("corretor é barrado (42501); período invertido é 22023", async () => {
    await comoUsuario(c, corretorA.id);
    expect(
      await errCode(
        c.query(`SELECT public.samiq_metricas_periodo(current_date - 30, current_date)`),
      ),
    ).toBe("42501");
    await comoUsuario(c, admin.id);
    expect(
      await errCode(
        c.query(`SELECT public.samiq_metricas_periodo(current_date, current_date - 1)`),
      ),
    ).toBe("22023");
    await comoSuperuser(c);
  });

  it("gestor vê a própria equipe; admin vê a operação inteira", async () => {
    // Uma execução do corretor B (outra equipe) para separar os escopos.
    const rb = await reservar(c, corretorB.id);
    await finalizar(c, corretorB.id, rb.execution_id!, {
      toolCalls: 0,
      toolErrors: 0,
      fallback: true,
    });

    await comoSuperuser(c);
    const esperadoA = (
      await c.query(`SELECT count(*)::int AS n FROM public.samiq_execucoes WHERE user_id = $1`, [
        corretorA.id,
      ])
    ).rows[0].n as number;
    const esperadoTotal = (await c.query(`SELECT count(*)::int AS n FROM public.samiq_execucoes`))
      .rows[0].n as number;

    await comoUsuario(c, gestorA.id);
    const g = await c.query(
      `SELECT public.samiq_metricas_periodo(current_date - 1, current_date + 1) AS m`,
    );
    const mg = g.rows[0].m as Record<string, unknown>;
    expect(mg.escopo).toBe("equipe");
    expect(mg.execucoes).toBe(esperadoA);
    expect(mg.avaliacoes_negativas).toBe(1);
    expect(Array.isArray(mg.por_dia)).toBe(true);

    await comoUsuario(c, admin.id);
    const a = await c.query(
      `SELECT public.samiq_metricas_periodo(current_date - 1, current_date + 1) AS m`,
    );
    const ma = a.rows[0].m as Record<string, unknown>;
    expect(ma.escopo).toBe("operacao");
    expect(ma.execucoes).toBe(esperadoTotal);
    expect(ma.fallbacks).toBeGreaterThanOrEqual(2);
    expect(ma.usuarios_ativos).toBe(2);
    await comoSuperuser(c);
  });
});

describe("teto mensal de custo por papel (D18)", () => {
  let corretorC: UsuarioTeste;

  beforeAll(async () => {
    corretorC = await criarUsuario(c, { papel: "corretor", equipeId: equipeA });
    await comoSuperuser(c);
    // 1 micro por token: reserva = 10.000 de entrada + 2.000 de saída (teto da v3) = 12.000.
    await c.query(
      `UPDATE public.samiq_prompt_versions
          SET input_cost_micros_per_million = 1000000, output_cost_micros_per_million = 1000000
        WHERE active = true`,
    );
    await c.query(
      `UPDATE public.samiq_politica
          SET max_cost_corretor_micros_mes = 20000, max_cost_gestor_micros_mes = NULL,
              max_cost_equipe_micros_mes = NULL
        WHERE id = 1`,
    );
  });

  afterAll(async () => {
    await semTetos(c);
  });

  it("a primeira reserva passa e informa o % do teto; a segunda estoura o mês do corretor", async () => {
    const primeira = await reservar(c, corretorC.id);
    expect(primeira.allowed).toBe(true);
    expect(primeira.custo_mes_pct).toBe(60);

    const segunda = await reservar(c, corretorC.id);
    expect(segunda.allowed).toBe(false);
    expect(segunda.denial_reason).toBe("user_cost_budget_month");
    expect(segunda.custo_mes_pct).toBe(100);
  });

  it("o teto do gestor é separado (NULL = sem teto) e o teto da equipe soma todos", async () => {
    const g = await reservar(c, gestorA.id);
    expect(g.allowed).toBe(true);
    expect(g.custo_mes_pct).toBeNull();

    await comoSuperuser(c);
    await c.query(
      `UPDATE public.samiq_politica SET max_cost_equipe_micros_mes = 30000 WHERE id = 1`,
    );
    // Equipe A já carrega 12.000 (C) + 12.000 (gestor) = 24.000; mais 12.000 estoura.
    const outra = await reservar(c, corretorA.id);
    expect(outra.allowed).toBe(false);
    expect(outra.denial_reason).toBe("team_cost_budget_month");
  });
});
