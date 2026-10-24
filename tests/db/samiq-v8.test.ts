/**
 * SAMI v8: o CRM inteiro no WhatsApp (migrations 20261024120000 e 20261024120100).
 *
 * Cobre no Postgres real:
 *   - os 25 tipos e o estado 'executando' passam no CHECK; tipo inventado não;
 *   - samiq_reivindicar_proposta: só UMA execução pega a ação (CONFIRMAR duplo,
 *     retentativa do n8n), 'falhou' pode ser pega de novo, trava velha (> 5 min)
 *     se solta, ação alheia nunca;
 *   - samiq_decidir_proposta sai de 'executando', não deixa descartar no meio da
 *     execução e só abre o desfazer para o que ele sabe reverter;
 *   - samiq_contexto_turno liga ao turno as ações gravadas na hora e guarda a
 *     memória de trabalho, sem tocar conversa de outro corretor;
 *   - samiq_desfazer_proposta reverte tarefa concluída, visita confirmada (com a
 *     tarefa "Confirmar visita" reaberta), remarcação, documento, a ficha pela
 *     whitelist e o cadastro (lixeira); etapa e desfecho do funil não voltam;
 *   - samiq_anexos: o dono lê, o colega não, o browser não grava;
 *   - a cota e a versão v8.
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

let corretorA: UsuarioTeste;
let corretorB: UsuarioTeste;
let leadA: string;
let execucaoA: string;

async function reservar(userId: string): Promise<string> {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT * FROM public.samiq_reservar_execucao($1, 'pergunta_livre', 10000, NULL)`,
    [userId],
  );
  await c.query(`SELECT public.samiq_finalizar_execucao($1, $2, 'completed', 1000, 200, 800)`, [
    userId,
    r.rows[0].execution_id,
  ]);
  return r.rows[0].execution_id as string;
}

async function registrar(
  userId: string,
  execucao: string | null,
  tipo: string,
  payload: object,
): Promise<string> {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT public.samiq_registrar_propostas($1, $2, NULL, $3::jsonb) AS ids`,
    [
      userId,
      execucao,
      JSON.stringify([
        { tipo, payload: { tipo, ...payload }, lead_id: leadA, lead_nome: "Maria da Silva" },
      ]),
    ],
  );
  return (r.rows[0].ids as string[])[0];
}

async function reivindicar(userId: string, id: string): Promise<boolean> {
  await comoSuperuser(c);
  const r = await c.query(`SELECT public.samiq_reivindicar_proposta($1, $2) AS ok`, [userId, id]);
  return r.rows[0].ok as boolean;
}

async function decidir(
  userId: string,
  id: string,
  status: string,
  resultado: unknown = null,
): Promise<boolean> {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT public.samiq_decidir_proposta($1, $2, $3, NULL, $4::jsonb, NULL) AS ok`,
    [userId, id, status, resultado === null ? null : JSON.stringify(resultado)],
  );
  return r.rows[0].ok as boolean;
}

async function proposta(id: string) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT status, desfazer_ate IS NOT NULL AS desfaz, conversa_id FROM public.samiq_propostas WHERE id = $1`,
    [id],
  );
  return r.rows[0] as { status: string; desfaz: boolean; conversa_id: string | null };
}

async function desfazer(userId: string, id: string) {
  await comoSuperuser(c);
  const r = await c.query(`SELECT public.samiq_desfazer_proposta($1, $2) AS r`, [userId, id]);
  return r.rows[0].r as { desfeito: boolean; itens: string[]; mantidos: string[] };
}

/** Grava e confirma uma ação com o `resultado` que o executor teria devolvido. */
async function gravada(tipo: string, payload: object, resultado: object): Promise<string> {
  const id = await registrar(corretorA.id, execucaoA, tipo, payload);
  expect(await reivindicar(corretorA.id, id)).toBe(true);
  expect(await decidir(corretorA.id, id, "aceita", resultado)).toBe(true);
  return id;
}

async function novaTarefa(
  opts: { status?: string; titulo?: string; resultado?: string | null } = {},
): Promise<string> {
  await comoSuperuser(c);
  const r = await c.query(
    `INSERT INTO public.tarefas (titulo, tipo, status, prioridade, lead_id, corretor_id, criado_por, data_vencimento, resultado, data_conclusao)
     VALUES ($1, 'ligacao', $2::public.tarefa_status, 'media', $3, $4, $4, '2026-11-02T13:00:00Z', $5,
             CASE WHEN $2 = 'concluida' THEN now() ELSE NULL END)
     RETURNING id`,
    [
      opts.titulo ?? "Ligar para Maria",
      opts.status ?? "pendente",
      leadA,
      corretorA.id,
      opts.resultado ?? null,
    ],
  );
  return r.rows[0].id as string;
}

async function novaVisita(status = "agendado"): Promise<string> {
  await comoSuperuser(c);
  const r = await c.query(
    `INSERT INTO public.agendamentos (lead_id, corretor_id, criado_por_id, tipo, status, titulo, data_inicio, data_fim, timezone, lembrete_minutos)
     VALUES ($1, $2, $2, 'visita', $3::public.agendamento_status, 'Visita - Vista Verde',
             now() + interval '3 days', now() + interval '3 days 1 hour', 'America/Sao_Paulo', 30)
     RETURNING id`,
    [leadA, corretorA.id, status],
  );
  return r.rows[0].id as string;
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await c.query(`DELETE FROM public.samiq_execucoes`);
  const equipe = await criarEquipe(c);
  corretorA = await criarUsuario(c, { papel: "corretor", equipeId: equipe });
  corretorB = await criarUsuario(c, { papel: "corretor", equipeId: equipe });
  leadA = await criarLead(c, {
    corretorId: corretorA.id,
    nome: "Maria da Silva",
    status: "em_atendimento",
  });
  execucaoA = await reservar(corretorA.id);
});

afterAll(async () => {
  await comoSuperuser(c);
  await c.end();
});

describe("tipos, estados, cota e versão", () => {
  it("os tipos novos passam no CHECK; tipo inventado não", async () => {
    for (const tipo of [
      "concluir_tarefa",
      "registrar_venda",
      "fazer_checkin",
      "anexar_documento",
      "pedir_lote",
    ]) {
      expect(await registrar(corretorA.id, execucaoA, tipo, { leadId: leadA })).toMatch(
        /[0-9a-f-]{36}/,
      );
    }
    expect(
      await errCode(
        c.query(`SELECT public.samiq_registrar_propostas($1, NULL, NULL, $2::jsonb)`, [
          corretorA.id,
          JSON.stringify([{ tipo: "apagar_lead", payload: { tipo: "apagar_lead" } }]),
        ]),
      ),
    ).toBe("23514");
  });

  it("cota de 1 milhão por corretor, 15 milhões por equipe e 10 passos; v8 ativa e derivada", async () => {
    await comoSuperuser(c);
    const p = await c.query(
      `SELECT max_tokens_user_day, max_tokens_team_day, max_tool_steps FROM public.samiq_politica`,
    );
    expect(p.rows[0]).toEqual({
      max_tokens_user_day: 1000000,
      max_tokens_team_day: 15000000,
      max_tool_steps: 10,
    });
    const v = await c.query(
      `SELECT version, tools_enabled, propostas_enabled, char_length(system_prompt) <= 12000 AS cabe,
              action_prompts ? 'match_projetos' AS preserva, action_prompts->>'pergunta_livre' AS livre
         FROM public.samiq_prompt_versions WHERE active`,
    );
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0]).toMatchObject({
      version: "samiq-2026-10-v8",
      tools_enabled: true,
      propostas_enabled: true,
      cabe: true,
      preserva: true,
    });
    expect(v.rows[0].livre).toContain("confirmar_pendentes");
  });
});

describe("trava de execução (samiq_reivindicar_proposta)", () => {
  it("só uma execução pega a ação; a segunda vê que já está sendo gravada", async () => {
    const id = await registrar(corretorA.id, execucaoA, "anotar", { leadId: leadA, nota: "x" });
    const [a, b] = await Promise.all([
      reivindicar(corretorA.id, id),
      reivindicar(corretorA.id, id),
    ]);
    expect([a, b].sort()).toEqual([false, true]);
    expect((await proposta(id)).status).toBe("executando");
    // descartar no meio da execução não atropela
    expect(await decidir(corretorA.id, id, "rejeitada")).toBe(false);
    // a decisão final sai de 'executando'
    expect(await decidir(corretorA.id, id, "aceita", { interacao_id: null })).toBe(true);
    expect(await proposta(id)).toMatchObject({ status: "aceita", desfaz: true });
    expect(await reivindicar(corretorA.id, id)).toBe(false);
  });

  it("falhou pode tentar de novo; trava velha (> 5 min) se solta; ação alheia nunca", async () => {
    const id = await registrar(corretorA.id, execucaoA, "anotar", { leadId: leadA, nota: "y" });
    expect(await reivindicar(corretorB.id, id)).toBe(false);
    expect(await reivindicar(corretorA.id, id)).toBe(true);
    expect(await decidir(corretorA.id, id, "falhou")).toBe(true);
    expect(await reivindicar(corretorA.id, id)).toBe(true);
    expect(await reivindicar(corretorA.id, id)).toBe(false);
    await c.query(
      `UPDATE public.samiq_propostas SET decidido_em = now() - interval '6 minutes' WHERE id = $1`,
      [id],
    );
    expect(await reivindicar(corretorA.id, id)).toBe(true);
  });

  it("desfazer só abre para o que se reverte (visita realizada e venda não)", async () => {
    const visita = await registrar(corretorA.id, execucaoA, "registrar_visita", {
      leadId: leadA,
      compareceu: true,
    });
    expect(await reivindicar(corretorA.id, visita)).toBe(true);
    expect(await decidir(corretorA.id, visita, "aceita", { lead_id: leadA })).toBe(true);
    expect((await proposta(visita)).desfaz).toBe(false);
    expect(
      await errCode(
        c.query(`SELECT public.samiq_desfazer_proposta($1, $2)`, [corretorA.id, visita]),
      ),
    ).toBe("22023");
    const cadastro = await registrar(corretorA.id, execucaoA, "criar_lead", {
      nome: "Paula",
      telefone: "11999998888",
    });
    expect(await reivindicar(corretorA.id, cadastro)).toBe(true);
    expect(await decidir(corretorA.id, cadastro, "aceita", {})).toBe(true);
    expect((await proposta(cadastro)).desfaz).toBe(true);
  });
});

describe("fechamento do turno (samiq_contexto_turno)", () => {
  it("liga as ações gravadas na hora à conversa e guarda a memória de trabalho", async () => {
    const exec = await reservar(corretorA.id);
    const id = await registrar(corretorA.id, exec, "anotar", { leadId: leadA, nota: "z" });
    await comoSuperuser(c);
    const conversa = (
      await c.query(
        `SELECT public.samiq_gravar_turno($1, NULL, $2, 'falei com a Maria', 'Gravei no CRM: ...', '{}', $3, 'whatsapp') AS id`,
        [corretorA.id, leadA, exec],
      )
    ).rows[0].id as string;
    const contexto = {
      pendentes: [],
      executadas: [id],
      pediu_decisao: false,
      clientes: [{ id: leadA, nome: "Maria" }],
    };
    await c.query(`SELECT public.samiq_contexto_turno($1, $2, $3, $4::jsonb)`, [
      corretorA.id,
      conversa,
      exec,
      JSON.stringify(contexto),
    ]);
    expect((await proposta(id)).conversa_id).toBe(conversa);
    const salvo = await c.query(`SELECT contexto FROM public.samiq_conversas WHERE id = $1`, [
      conversa,
    ]);
    expect(salvo.rows[0].contexto).toEqual(contexto);

    // conversa de outro corretor: nada muda
    await c.query(`SELECT public.samiq_contexto_turno($1, $2, $3, '{"x":1}'::jsonb)`, [
      corretorB.id,
      conversa,
      exec,
    ]);
    expect(
      (await c.query(`SELECT contexto FROM public.samiq_conversas WHERE id = $1`, [conversa]))
        .rows[0].contexto,
    ).toEqual(contexto);
    // lixo não entra
    expect(
      await errCode(
        c.query(`SELECT public.samiq_contexto_turno($1, $2, NULL, '[1,2]'::jsonb)`, [
          corretorA.id,
          conversa,
        ]),
      ),
    ).toBe("22023");

    // o corretor lê a própria conversa (RLS), o colega não
    await comoUsuario(c, corretorB.id);
    expect(
      (await c.query(`SELECT contexto FROM public.samiq_conversas WHERE id = $1`, [conversa]))
        .rowCount,
    ).toBe(0);
    await comoSuperuser(c);
  });
});

describe("desfazer em 24 h (samiq_desfazer_proposta v8)", () => {
  it("tarefa concluída volta a pendente, com vencimento e resultado anteriores", async () => {
    const tarefa = await novaTarefa();
    await c.query(
      `UPDATE public.tarefas SET status = 'concluida', data_conclusao = now(), resultado = 'Concluída via Sami' WHERE id = $1`,
      [tarefa],
    );
    const id = await gravada(
      "concluir_tarefa",
      { tarefaId: tarefa },
      {
        tarefa_atualizada_id: tarefa,
        tarefa_anterior: {
          id: tarefa,
          status: "pendente",
          data_vencimento: "2026-11-02T13:00:00Z",
          data_conclusao: null,
          resultado: null,
        },
        lead_id: leadA,
      },
    );
    expect(await desfazer(corretorA.id, id)).toEqual({
      desfeito: true,
      itens: ["tarefa_restaurada"],
      mantidos: [],
    });
    const t = await c.query(
      `SELECT status, data_conclusao, resultado FROM public.tarefas WHERE id = $1`,
      [tarefa],
    );
    expect(t.rows[0]).toEqual({ status: "pendente", data_conclusao: null, resultado: null });
  });

  it("visita confirmada volta a agendada e a tarefa 'Confirmar visita' reabre", async () => {
    const visita = await novaVisita("confirmado");
    const confirmar = await novaTarefa({
      status: "concluida",
      titulo: "Confirmar visita da Maria",
      resultado: "Visita confirmada",
    });
    const outra = await novaTarefa({
      status: "concluida",
      titulo: "Outra coisa",
      resultado: "feita à mão",
    });
    const id = await gravada(
      "confirmar_visita",
      { agendamentoId: visita },
      {
        agendamento_anterior: { id: visita, status: "agendado", motivo_cancelamento: null },
        tarefas_reabrir: [confirmar, outra],
        lead_id: leadA,
      },
    );
    const r = await desfazer(corretorA.id, id);
    expect(r.itens).toEqual(["tarefas_reabertas", "agendamento_restaurado"]);
    expect(
      (await c.query(`SELECT status FROM public.agendamentos WHERE id = $1`, [visita])).rows[0]
        .status,
    ).toBe("agendado");
    expect(
      (await c.query(`SELECT status FROM public.tarefas WHERE id = $1`, [confirmar])).rows[0]
        .status,
    ).toBe("pendente");
    // só reabre a tarefa que a Sami fechou junto com a visita
    expect(
      (await c.query(`SELECT status FROM public.tarefas WHERE id = $1`, [outra])).rows[0].status,
    ).toBe("concluida");
  });

  it("remarcação: a nova sai da agenda e a antiga volta", async () => {
    const antiga = await novaVisita("remarcado");
    const nova = await novaVisita("agendado");
    const id = await gravada(
      "remarcar_visita",
      { agendamentoId: antiga, novoInicioEm: "2026-11-03T13:00:00Z" },
      {
        agendamento_novo_id: nova,
        agendamento_anterior: { id: antiga, status: "confirmado" },
        lead_id: leadA,
      },
    );
    expect((await desfazer(corretorA.id, id)).itens).toEqual([
      "agendamento_novo",
      "agendamento_restaurado",
    ]);
    const v = await c.query(
      `SELECT id, status, deleted_at IS NOT NULL AS apagada FROM public.agendamentos WHERE id = ANY($1::uuid[]) ORDER BY apagada`,
      [[antiga, nova]],
    );
    expect(v.rows).toEqual([
      { id: antiga, status: "confirmado", apagada: false },
      { id: nova, status: "cancelado", apagada: true },
    ]);
  });

  it("documento volta ao status anterior", async () => {
    await comoSuperuser(c);
    const doc = (
      await c.query(
        `INSERT INTO public.documentacoes (lead_id, corretor_id, tipo, status, recebido_em) VALUES ($1, $2, 'rg', 'recebido', now()) RETURNING id`,
        [leadA, corretorA.id],
      )
    ).rows[0].id as string;
    const id = await gravada(
      "atualizar_documento",
      { leadId: leadA, documento: "rg", status: "recebido" },
      {
        lead_id: leadA,
        documento_anterior: { id: doc, status: "pendente", observacoes: null, recebido_em: null },
      },
    );
    expect((await desfazer(corretorA.id, id)).itens).toEqual(["documento"]);
    const d = await c.query(`SELECT status, recebido_em FROM public.documentacoes WHERE id = $1`, [
      doc,
    ]);
    expect(d.rows[0]).toEqual({ status: "pendente", recebido_em: null });
  });

  it("ficha: restaura as colunas da whitelist com o tipo certo e ignora o resto", async () => {
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads SET fgts_valor = 15000, faixa_mcmv = 'F2', decisor = 'esposa', zona = 'Leste', temperatura = 'quente' WHERE id = $1`,
      [leadA],
    );
    const id = await gravada(
      "atualizar_qualificacao",
      { leadId: leadA, fgtsValor: 15000 },
      {
        lead_id: leadA,
        lead_anterior: {
          fgts_valor: null,
          faixa_mcmv: null,
          decisor: null,
          zona: null,
          temperatura: "morno",
          status: "perdido", // fora da whitelist: nunca restaura etapa
        },
      },
    );
    expect((await desfazer(corretorA.id, id)).itens).toEqual(["lead"]);
    const l = await c.query(
      `SELECT fgts_valor, faixa_mcmv, decisor, zona, temperatura::text AS temperatura, status::text AS status FROM public.leads WHERE id = $1`,
      [leadA],
    );
    expect(l.rows[0]).toEqual({
      fgts_valor: null,
      faixa_mcmv: null,
      decisor: null,
      zona: null,
      temperatura: "morno",
      status: "em_atendimento",
    });
  });

  it("cadastro novo vai para a lixeira", async () => {
    const novo = await criarLead(c, {
      corretorId: corretorA.id,
      nome: "Paula Lima",
      status: "aguardando_atendimento",
    });
    const id = await gravada(
      "criar_lead",
      { nome: "Paula Lima", telefone: "11999990000" },
      { lead_id: novo, lead_criado_id: novo },
    );
    expect((await desfazer(corretorA.id, id)).itens).toEqual(["lead_criado"]);
    expect(
      (await c.query(`SELECT na_lixeira FROM public.leads WHERE id = $1`, [novo])).rows[0]
        .na_lixeira,
    ).toBe(true);
  });
});

describe("desfazer não atropela o que mudou depois da Sami", () => {
  it("visita confirmada pela Sami e cancelada na tela: continua cancelada, com o motivo", async () => {
    const visita = await novaVisita("confirmado");
    const id = await gravada(
      "confirmar_visita",
      { agendamentoId: visita },
      {
        agendamento_anterior: { id: visita, status: "agendado", motivo_cancelamento: null },
        lead_id: leadA,
      },
    );
    await c.query(
      `UPDATE public.agendamentos SET status = 'cancelado', motivo_cancelamento = 'cliente desistiu' WHERE id = $1`,
      [visita],
    );
    const r = await desfazer(corretorA.id, id);
    expect(r.desfeito).toBe(true);
    expect(r.itens).not.toContain("agendamento_restaurado");
    expect(r.mantidos).toContain("agendamento_restaurado");
    const v = await c.query(
      `SELECT status::text AS status, motivo_cancelamento FROM public.agendamentos WHERE id = $1`,
      [visita],
    );
    expect(v.rows[0]).toEqual({ status: "cancelado", motivo_cancelamento: "cliente desistiu" });
  });

  it("visita criada pela Sami que já foi realizada não some da agenda", async () => {
    const visita = await novaVisita("realizado");
    const id = await gravada(
      "agendar_visita",
      { leadId: leadA, inicioEm: "2026-11-03T13:00:00Z" },
      { agendamento_id: visita, lead_id: leadA },
    );
    const r = await desfazer(corretorA.id, id);
    expect(r.mantidos).toContain("agendamento");
    const v = await c.query(
      `SELECT status::text AS status, deleted_at IS NULL AS viva FROM public.agendamentos WHERE id = $1`,
      [visita],
    );
    expect(v.rows[0]).toEqual({ status: "realizado", viva: true });
  });

  it("tarefa concluída pela Sami e reaberta e reagendada na tela: fica como o corretor deixou", async () => {
    const tarefa = await novaTarefa();
    await c.query(
      `UPDATE public.tarefas SET status = 'concluida', data_conclusao = now(), resultado = 'Concluída via Sami' WHERE id = $1`,
      [tarefa],
    );
    const depoisDaSami = (
      await c.query(
        `SELECT status::text AS status, data_vencimento FROM public.tarefas WHERE id = $1`,
        [tarefa],
      )
    ).rows[0] as { status: string; data_vencimento: Date };
    const id = await gravada(
      "concluir_tarefa",
      { tarefaId: tarefa },
      {
        tarefa_atualizada_id: tarefa,
        tarefa_anterior: {
          id: tarefa,
          status: "pendente",
          data_vencimento: "2026-11-02T13:00:00Z",
          data_conclusao: null,
          resultado: null,
        },
        tarefa_depois: {
          status: depoisDaSami.status,
          data_vencimento: depoisDaSami.data_vencimento.toISOString(),
        },
        lead_id: leadA,
      },
    );
    // o corretor reabre e joga para outro dia na tela
    await c.query(
      `UPDATE public.tarefas SET status = 'pendente', data_conclusao = NULL, resultado = NULL, data_vencimento = '2026-11-10T13:00:00Z' WHERE id = $1`,
      [tarefa],
    );
    const r = await desfazer(corretorA.id, id);
    expect(r.mantidos).toContain("tarefa_restaurada");
    const t = await c.query(`SELECT data_vencimento FROM public.tarefas WHERE id = $1`, [tarefa]);
    expect((t.rows[0].data_vencimento as Date).toISOString()).toBe("2026-11-10T13:00:00.000Z");
  });

  it("tarefa criada pela Sami e já feita vira história (não some)", async () => {
    const tarefa = await novaTarefa({ status: "concluida", resultado: "liguei" });
    const id = await gravada(
      "criar_tarefa",
      {
        leadId: leadA,
        titulo: "Ligar",
        tipoTarefa: "ligacao",
        vencimentoEm: "2026-11-02T13:00:00Z",
      },
      { tarefa_id: tarefa, lead_id: leadA },
    );
    const r = await desfazer(corretorA.id, id);
    expect(r.itens).not.toContain("tarefa");
    expect(r.mantidos).toContain("tarefa");
    expect(
      (
        await c.query(`SELECT deleted_at IS NULL AS viva FROM public.tarefas WHERE id = $1`, [
          tarefa,
        ])
      ).rows[0].viva,
    ).toBe(true);
  });

  it("ficha: campo que o corretor mudou na tela fica; o que continua como a Sami deixou volta", async () => {
    await c.query(
      `UPDATE public.leads SET renda_estimada = 3200, decisor = 'esposa' WHERE id = $1`,
      [leadA],
    );
    const id = await gravada(
      "atualizar_qualificacao",
      { leadId: leadA, rendaEstimada: 3200, decisor: "esposa" },
      {
        lead_id: leadA,
        lead_anterior: { renda_estimada: 2500, decisor: null },
        lead_depois: { renda_estimada: 3200, decisor: "esposa" },
      },
    );
    await c.query(`UPDATE public.leads SET renda_estimada = 4000 WHERE id = $1`, [leadA]);
    const r = await desfazer(corretorA.id, id);
    expect(r.itens).toContain("lead");
    expect(r.mantidos).toEqual(["ficha:renda_estimada"]);
    const l = await c.query(
      `SELECT renda_estimada::float AS renda, decisor FROM public.leads WHERE id = $1`,
      [leadA],
    );
    expect(l.rows[0]).toEqual({ renda: 4000, decisor: null });
  });

  it("documento criado que já ganhou arquivo não volta a pendente", async () => {
    const doc = (
      await c.query(
        `INSERT INTO public.documentacoes (lead_id, corretor_id, tipo, status, recebido_em, url) VALUES ($1, $2, 'holerites', 'recebido', now(), 'https://exemplo/holerite.pdf') RETURNING id`,
        [leadA, corretorA.id],
      )
    ).rows[0].id as string;
    const id = await gravada(
      "atualizar_documento",
      { leadId: leadA, documento: "holerites", status: "recebido" },
      { lead_id: leadA, documento_criado_id: doc },
    );
    const r = await desfazer(corretorA.id, id);
    expect(r.mantidos).toContain("documento");
    expect(
      (await c.query(`SELECT status FROM public.documentacoes WHERE id = $1`, [doc])).rows[0]
        .status,
    ).toBe("recebido");
  });
});

describe("fila do canal (samiq_canal_iniciar / samiq_canal_concluir)", () => {
  async function iniciar(msg: string, forcar = false, userId = corretorA.id) {
    await comoSuperuser(c);
    const r = await c.query(`SELECT public.samiq_canal_iniciar($1, $2, 100, $3) AS r`, [
      userId,
      msg,
      forcar,
    ]);
    return r.rows[0].r as { acao: string; id?: string; motivo?: string; resposta?: unknown };
  }
  async function concluir(id: string, status: string, resposta: object | null) {
    await comoSuperuser(c);
    const r = await c.query(`SELECT public.samiq_canal_concluir($1, $2, $3, $4::jsonb) AS ok`, [
      corretorA.id,
      id,
      status,
      resposta === null ? null : JSON.stringify(resposta),
    ]);
    return r.rows[0].ok as boolean;
  }

  it("retentativa recebe a resposta guardada; a mensagem seguinte espera a anterior, em ordem", async () => {
    await c.query(`DELETE FROM public.samiq_canal_mensagens`);
    const a = await iniciar("wamid.1");
    expect(a.acao).toBe("processar");
    // retentativa enquanto a original roda: espera (não processa de novo)
    expect(await iniciar("wamid.1")).toEqual({ acao: "aguardar", motivo: "mesma_mensagem" });
    // mensagens seguintes entram na fila, na ordem de chegada
    expect(await iniciar("wamid.2")).toEqual({ acao: "aguardar", motivo: "fila" });
    expect(await iniciar("wamid.3")).toEqual({ acao: "aguardar", motivo: "fila" });
    expect(await concluir(a.id!, "respondida", { ok: true, texto: "Gravei no CRM: 1) ..." })).toBe(
      true,
    );
    expect(await iniciar("wamid.1")).toEqual({
      acao: "repetida",
      resposta: { ok: true, texto: "Gravei no CRM: 1) ..." },
    });
    // a 3 chegou depois da 2: a 2 vai primeiro
    expect(await iniciar("wamid.3")).toEqual({ acao: "aguardar", motivo: "fila" });
    expect((await iniciar("wamid.2")).acao).toBe("processar");
    // espera longa demais: a 3 pode pular a fila
    expect((await iniciar("wamid.3", true)).acao).toBe("processar");
    // outro corretor não espera ninguém
    expect((await iniciar("wamid.1", false, corretorB.id)).acao).toBe("processar");
  });

  it("falhou volta para a fila; processamento travado há muito tempo é retomado", async () => {
    await c.query(`DELETE FROM public.samiq_canal_mensagens`);
    const a = await iniciar("wamid.9");
    expect(await concluir(a.id!, "falhou", null)).toBe(true);
    expect((await iniciar("wamid.9")).acao).toBe("processar");
    await c.query(
      `UPDATE public.samiq_canal_mensagens SET iniciado_em = now() - interval '10 minutes' WHERE mensagem_id = 'wamid.9'`,
    );
    expect((await iniciar("wamid.9")).acao).toBe("processar");
    // status inventado não entra
    expect(
      await errCode(
        c.query(`SELECT public.samiq_canal_concluir($1, $2, 'ok', NULL)`, [corretorA.id, a.id]),
      ),
    ).toBe("22023");
  });

  it("linha de mais de 3 dias some; o browser não lê nem grava a fila", async () => {
    await c.query(`DELETE FROM public.samiq_canal_mensagens`);
    await iniciar("wamid.velha");
    await c.query(
      `UPDATE public.samiq_canal_mensagens SET chegou_em = now() - interval '4 days', status = 'respondida' WHERE mensagem_id = 'wamid.velha'`,
    );
    await iniciar("wamid.nova");
    expect(
      (
        await c.query(
          `SELECT count(*)::int AS n FROM public.samiq_canal_mensagens WHERE mensagem_id = 'wamid.velha'`,
        )
      ).rows[0].n,
    ).toBe(0);
    await comoUsuario(c, corretorA.id);
    expect(await errCode(c.query(`SELECT * FROM public.samiq_canal_mensagens`))).toBe("42501");
    expect(
      await errCode(c.query(`SELECT public.samiq_canal_iniciar($1, 'x')`, [corretorA.id])),
    ).toBe("42501");
    await comoSuperuser(c);
  });
});

describe("memória: pendentes de dois turnos ao mesmo tempo não somem", () => {
  it("o turno que grava por último mantém no fim da lista o que o outro deixou esperando OK", async () => {
    const exec = await reservar(corretorA.id);
    await comoSuperuser(c);
    const conversa = (
      await c.query(
        `SELECT public.samiq_gravar_turno($1, NULL, $2, 'marca a Maria', 'Preciso do seu OK', '{}', $3, 'whatsapp') AS id`,
        [corretorA.id, leadA, exec],
      )
    ).rows[0].id as string;
    const p1 = await registrar(corretorA.id, exec, "agendar_visita", {
      leadId: leadA,
      inicioEm: "2026-11-03T13:00:00Z",
    });
    const p2 = await registrar(corretorA.id, exec, "marcar_perdido", {
      leadId: leadA,
      categoria: "sem_perfil",
    });
    const p3 = await registrar(corretorA.id, exec, "registrar_retorno", {
      leadId: leadA,
      retornoEm: "2026-11-20T13:00:00Z",
    });
    const gravar = (pendentes: string[]) =>
      c.query(`SELECT public.samiq_contexto_turno($1, $2, NULL, $3::jsonb)`, [
        corretorA.id,
        conversa,
        JSON.stringify({ pendentes, pediu_decisao: true }),
      ]);
    // turno 1 deixou p1 e p2; turno 2 (que rodou junto) grava só o p3
    await gravar([p1, p2]);
    await gravar([p3]);
    const lido = async () =>
      (
        (await c.query(`SELECT contexto FROM public.samiq_conversas WHERE id = $1`, [conversa]))
          .rows[0].contexto as { pendentes: string[] }
      ).pendentes;
    expect(await lido()).toEqual([p3, p1, p2]);
    // decidido não volta: o descarte do p1 tira ele da lista de vez
    expect(await decidir(corretorA.id, p1, "rejeitada")).toBe(true);
    await gravar([p3]);
    expect(await lido()).toEqual([p3, p2]);
  });
});

describe("área de espera dos arquivos (samiq_anexos)", () => {
  it("o dono lê, o colega não, o browser não grava", async () => {
    await comoSuperuser(c);
    const a = (
      await c.query(
        `INSERT INTO public.samiq_anexos (user_id, mime_type, tamanho_bytes, storage_path, mensagem_id)
         VALUES ($1, 'application/pdf', 1000, $2, 'wamid.1') RETURNING id`,
        [corretorA.id, `samiq-anexos/${corretorA.id}/x.pdf`],
      )
    ).rows[0].id as string;
    // mesma mensagem do WhatsApp duas vezes: uma linha só
    expect(
      await errCode(
        c.query(
          `INSERT INTO public.samiq_anexos (user_id, mime_type, tamanho_bytes, storage_path, mensagem_id)
           VALUES ($1, 'application/pdf', 1000, $2, 'wamid.1')`,
          [corretorA.id, `samiq-anexos/${corretorA.id}/y.pdf`],
        ),
      ),
    ).toBe("23505");
    // tipo fora da lista não entra
    expect(
      await errCode(
        c.query(
          `INSERT INTO public.samiq_anexos (user_id, mime_type, tamanho_bytes, storage_path) VALUES ($1, 'application/zip', 10, $2)`,
          [corretorA.id, `samiq-anexos/${corretorA.id}/z.zip`],
        ),
      ),
    ).toBe("23514");

    await comoUsuario(c, corretorA.id);
    expect((await c.query(`SELECT id FROM public.samiq_anexos WHERE id = $1`, [a])).rowCount).toBe(
      1,
    );
    expect(
      await errCode(
        c.query(
          `INSERT INTO public.samiq_anexos (user_id, mime_type, tamanho_bytes, storage_path) VALUES ($1, 'image/png', 10, $2)`,
          [corretorA.id, `samiq-anexos/${corretorA.id}/w.png`],
        ),
      ),
    ).toBe("42501");
    await comoUsuario(c, corretorB.id);
    expect((await c.query(`SELECT id FROM public.samiq_anexos WHERE id = $1`, [a])).rowCount).toBe(
      0,
    );
    await comoSuperuser(c);
  });
});
