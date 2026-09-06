/**
 * SAMIQ PROPOSTAS — Onda S2 (migration 20260907100000_samiq_copiloto_s2.sql).
 *
 * Cobre no Postgres real:
 *   - a reserva devolve propostas_enabled (v4 ativa);
 *   - samiq_registrar_propostas valida e devolve os ids na ordem;
 *   - RLS: o dono lê; outro corretor não; o browser não insere;
 *   - samiq_decidir_proposta: pendente → aceita/editada (com desfazer_ate =
 *     +24 h), rejeitada e falhou; decisão é final (falhou pode tentar de novo);
 *     mudar_etapa nunca ganha desfazer_ate;
 *   - as escritas que o executor faz COMO CORRETOR passam pelas policies
 *     (interação com metadata, tarefa, agendamento, campos do lead);
 *   - samiq_desfazer_proposta reverte tudo pelo `resultado`, respeita a
 *     janela de 24 h, recusa etapa e proposta alheia.
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

let equipe: string;
let corretorA: UsuarioTeste;
let corretorB: UsuarioTeste;
let leadA: string;
let execucaoA: string;

async function reservar(client: Client, userId: string) {
  await comoSuperuser(client);
  const r = await client.query(
    `SELECT * FROM public.samiq_reservar_execucao($1, 'pergunta_livre', 10000, NULL)`,
    [userId],
  );
  await client.query(
    `SELECT public.samiq_finalizar_execucao($1, $2, 'completed', 1000, 200, 800)`,
    [userId, r.rows[0].execution_id],
  );
  return r.rows[0] as { execution_id: string; propostas_enabled: boolean | null };
}

async function registrar(
  client: Client,
  userId: string,
  execucao: string | null,
  propostas: unknown[],
): Promise<string[]> {
  await comoSuperuser(client);
  const r = await client.query(
    `SELECT public.samiq_registrar_propostas($1, $2, NULL, $3::jsonb) AS ids`,
    [userId, execucao, JSON.stringify(propostas)],
  );
  return r.rows[0].ids as string[];
}

async function decidir(
  client: Client,
  userId: string,
  id: string,
  status: string,
  resultado: unknown = null,
  erro: string | null = null,
): Promise<boolean> {
  await comoSuperuser(client);
  const r = await client.query(
    `SELECT public.samiq_decidir_proposta($1, $2, $3, NULL, $4::jsonb, $5) AS ok`,
    [userId, id, status, resultado === null ? null : JSON.stringify(resultado), erro],
  );
  return r.rows[0].ok as boolean;
}

const anotacao = (leadId: string) => ({
  tipo: "anotar",
  payload: { tipo: "anotar", leadId, nota: "lembrar de mandar a tabela" },
  lead_id: leadId,
  lead_nome: "Maria da Silva",
});

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await c.query(`DELETE FROM public.samiq_execucoes`);
  equipe = await criarEquipe(c);
  corretorA = await criarUsuario(c, { papel: "corretor", equipeId: equipe });
  corretorB = await criarUsuario(c, { papel: "corretor", equipeId: equipe });
  leadA = await criarLead(c, {
    corretorId: corretorA.id,
    nome: "Maria da Silva",
    status: "em_atendimento",
  });
  const r = await reservar(c, corretorA.id);
  execucaoA = r.execution_id;
  expect(r.propostas_enabled).toBe(true);
});

afterAll(async () => {
  await comoSuperuser(c);
  await c.end();
});

describe("registrar propostas", () => {
  it("insere na ordem e devolve os ids; guarda lead e nome para o card", async () => {
    const ids = await registrar(c, corretorA.id, execucaoA, [
      anotacao(leadA),
      {
        tipo: "criar_tarefa",
        payload: {
          tipo: "criar_tarefa",
          leadId: leadA,
          titulo: "Ligar",
          tipoTarefa: "ligacao",
          vencimentoEm: "2026-09-12T10:00:00-03:00",
        },
        lead_id: leadA,
        lead_nome: "Maria da Silva",
      },
    ]);
    expect(ids).toHaveLength(2);
    const rows = await c.query(
      `SELECT tipo, status, lead_id, lead_nome, execution_id FROM public.samiq_propostas WHERE id = ANY($1::uuid[]) ORDER BY criado_em`,
      [ids],
    );
    expect(rows.rows).toEqual([
      {
        tipo: "anotar",
        status: "pendente",
        lead_id: leadA,
        lead_nome: "Maria da Silva",
        execution_id: execucaoA,
      },
      {
        tipo: "criar_tarefa",
        status: "pendente",
        lead_id: leadA,
        lead_nome: "Maria da Silva",
        execution_id: execucaoA,
      },
    ]);
  });

  it("rejeita tipo fora do catálogo, item sem payload e mais de 10 por execução", async () => {
    await comoSuperuser(c);
    expect(
      await errCode(
        c.query(`SELECT public.samiq_registrar_propostas($1, NULL, NULL, $2::jsonb)`, [
          corretorA.id,
          JSON.stringify([{ tipo: "apagar_lead", payload: {} }]),
        ]),
      ),
    ).toBe("23514");
    expect(
      await errCode(
        c.query(`SELECT public.samiq_registrar_propostas($1, NULL, NULL, $2::jsonb)`, [
          corretorA.id,
          JSON.stringify([{ tipo: "anotar" }]),
        ]),
      ),
    ).toBe("22023");
    expect(
      await errCode(
        c.query(`SELECT public.samiq_registrar_propostas($1, NULL, NULL, $2::jsonb)`, [
          corretorA.id,
          JSON.stringify(Array.from({ length: 11 }, () => anotacao(leadA))),
        ]),
      ),
    ).toBe("22023");
  });

  it("RLS: o dono lê as suas; o outro corretor não vê; o browser não insere", async () => {
    await comoUsuario(c, corretorA.id);
    const minhas = await c.query(`SELECT count(*)::int AS n FROM public.samiq_propostas`);
    expect(minhas.rows[0].n).toBeGreaterThanOrEqual(2);
    expect(
      await errCode(
        c.query(
          `INSERT INTO public.samiq_propostas (user_id, tipo, payload) VALUES ($1, 'anotar', '{}'::jsonb)`,
          [corretorA.id],
        ),
      ),
    ).toBe("42501");
    await comoUsuario(c, corretorB.id);
    const alheias = await c.query(`SELECT count(*)::int AS n FROM public.samiq_propostas`);
    expect(alheias.rows[0].n).toBe(0);
    await comoSuperuser(c);
  });
});

describe("decidir", () => {
  it("aceita: guarda resultado e abre a janela de 24 h; a decisão é final", async () => {
    const [id] = await registrar(c, corretorA.id, execucaoA, [anotacao(leadA)]);
    expect(await decidir(c, corretorA.id, id, "aceita", { interacao_id: null })).toBe(true);
    const row = await c.query(
      `SELECT status, resultado, decidido_em IS NOT NULL AS decidida,
              desfazer_ate BETWEEN now() + interval '23 hours' AND now() + interval '25 hours' AS janela
         FROM public.samiq_propostas WHERE id = $1`,
      [id],
    );
    expect(row.rows[0]).toEqual({
      status: "aceita",
      resultado: { interacao_id: null },
      decidida: true,
      janela: true,
    });
    expect(await decidir(c, corretorA.id, id, "rejeitada")).toBe(false);
  });

  it("rejeitada não ganha desfazer_ate; falhou guarda o erro e pode ser retomada", async () => {
    const [rej, fal] = await registrar(c, corretorA.id, execucaoA, [
      anotacao(leadA),
      anotacao(leadA),
    ]);
    expect(await decidir(c, corretorA.id, rej, "rejeitada")).toBe(true);
    expect(await decidir(c, corretorA.id, fal, "falhou", null, "x".repeat(400))).toBe(true);
    const rows = await c.query(
      `SELECT id, status, desfazer_ate, length(erro) AS tam FROM public.samiq_propostas WHERE id = ANY($1::uuid[]) ORDER BY id = $2 DESC`,
      [[rej, fal], rej],
    );
    expect(rows.rows[0]).toMatchObject({ status: "rejeitada", desfazer_ate: null, tam: null });
    expect(rows.rows[1]).toMatchObject({ status: "falhou", desfazer_ate: null, tam: 300 });
    expect(await decidir(c, corretorA.id, fal, "aceita", {})).toBe(true);
  });

  it("mudar_etapa aceita nunca ganha desfazer_ate; outro usuário não decide", async () => {
    const [id] = await registrar(c, corretorA.id, execucaoA, [
      {
        tipo: "mudar_etapa",
        payload: { tipo: "mudar_etapa", leadId: leadA, novoStatus: "qualificado" },
        lead_id: leadA,
      },
    ]);
    expect(await decidir(c, corretorB.id, id, "aceita", {})).toBe(false);
    expect(await decidir(c, corretorA.id, id, "aceita", { etapa_nova: "qualificado" })).toBe(true);
    const row = await c.query(`SELECT desfazer_ate FROM public.samiq_propostas WHERE id = $1`, [
      id,
    ]);
    expect(row.rows[0].desfazer_ate).toBeNull();
  });

  it("status desconhecido é 22023", async () => {
    const [id] = await registrar(c, corretorA.id, execucaoA, [anotacao(leadA)]);
    await comoSuperuser(c);
    expect(
      await errCode(
        c.query(`SELECT public.samiq_decidir_proposta($1, $2, 'talvez', NULL, NULL, NULL)`, [
          corretorA.id,
          id,
        ]),
      ),
    ).toBe("22023");
  });
});

describe("escrita como corretor + desfazer", () => {
  let propostaId: string;
  let interacaoId: string;
  let tarefaId: string;
  let agendamentoId: string;

  it("as escritas do executor passam pelas policies do corretor", async () => {
    await comoUsuario(c, corretorA.id);
    const meta = JSON.stringify({ origem: "samiq", proposta_id: "p" });
    const i = await c.query(
      `INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, metadata)
       VALUES ($1, $2, 'ligacao', 'saida', 'Contato — atendeu', 'achou a parcela alta', $3::jsonb)
       RETURNING id`,
      [leadA, corretorA.id, meta],
    );
    interacaoId = i.rows[0].id;
    const t = await c.query(
      `INSERT INTO public.tarefas (titulo, tipo, status, prioridade, lead_id, corretor_id, criado_por, data_vencimento, descricao)
       VALUES ('Follow-up com Maria', 'follow_up', 'pendente', 'media', $1, $2, $2, now() + interval '2 days', 'Registrado via Sami')
       RETURNING id`,
      [leadA, corretorA.id],
    );
    tarefaId = t.rows[0].id;
    const a = await c.query(
      `INSERT INTO public.agendamentos (lead_id, corretor_id, criado_por_id, tipo, status, titulo, descricao, data_inicio, data_fim, timezone, lembrete_minutos)
       VALUES ($1, $2, $2, 'visita', 'agendado', 'Visita - Vista Verde', 'Agendada via Sami', now() + interval '3 days', now() + interval '3 days 1 hour', 'America/Sao_Paulo', 30)
       RETURNING id`,
      [leadA, corretorA.id],
    );
    agendamentoId = a.rows[0].id;
    const u = await c.query(
      `UPDATE public.leads SET renda_informada = '4500', usa_fgts = true, temperatura = 'quente', objecoes = ARRAY['parcela alta']
        WHERE id = $1 RETURNING renda_informada`,
      [leadA],
    );
    expect(u.rowCount).toBe(1);
    await comoSuperuser(c);
  });

  it("desfazer reverte interação, tarefa, agendamento e o snapshot do lead; segunda vez recusa", async () => {
    [propostaId] = await registrar(c, corretorA.id, execucaoA, [
      {
        tipo: "registrar_contato",
        payload: {
          tipo: "registrar_contato",
          leadId: leadA,
          canal: "ligacao",
          resultado: "atendeu",
        },
        lead_id: leadA,
      },
    ]);
    expect(
      await decidir(c, corretorA.id, propostaId, "aceita", {
        interacao_id: interacaoId,
        tarefa_id: tarefaId,
        agendamento_id: agendamentoId,
        lead_anterior: { renda_informada: null, usa_fgts: false, temperatura: null, objecoes: [] },
      }),
    ).toBe(true);

    await comoSuperuser(c);
    const out = await c.query(`SELECT public.samiq_desfazer_proposta($1, $2) AS r`, [
      corretorA.id,
      propostaId,
    ]);
    expect(out.rows[0].r).toEqual({
      desfeito: true,
      itens: ["interacao", "tarefa", "agendamento", "lead"],
    });

    const estado = await c.query(
      `SELECT
         (SELECT deleted_at IS NOT NULL FROM public.interacoes WHERE id = $1) AS interacao_apagada,
         (SELECT deleted_at IS NOT NULL FROM public.tarefas WHERE id = $2) AS tarefa_apagada,
         (SELECT status = 'cancelado' AND deleted_at IS NOT NULL FROM public.agendamentos WHERE id = $3) AS visita_cancelada,
         (SELECT renda_informada IS NULL AND usa_fgts = false AND temperatura IS NULL AND objecoes = '{}' FROM public.leads WHERE id = $4) AS lead_restaurado,
         (SELECT status FROM public.samiq_propostas WHERE id = $5) AS status`,
      [interacaoId, tarefaId, agendamentoId, leadA, propostaId],
    );
    expect(estado.rows[0]).toEqual({
      interacao_apagada: true,
      tarefa_apagada: true,
      visita_cancelada: true,
      lead_restaurado: true,
      status: "desfeita",
    });
    expect(
      await errCode(
        c.query(`SELECT public.samiq_desfazer_proposta($1, $2)`, [corretorA.id, propostaId]),
      ),
    ).toBe("22023");
  });

  it("janela expirada, etapa e proposta alheia são recusadas", async () => {
    const [expirada, etapa] = await registrar(c, corretorA.id, execucaoA, [
      anotacao(leadA),
      {
        tipo: "mudar_etapa",
        payload: { tipo: "mudar_etapa", leadId: leadA, novoStatus: "qualificado" },
        lead_id: leadA,
      },
    ]);
    await decidir(c, corretorA.id, expirada, "aceita", {});
    await decidir(c, corretorA.id, etapa, "aceita", {});
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.samiq_propostas SET desfazer_ate = now() - interval '1 minute' WHERE id = $1`,
      [expirada],
    );
    expect(
      await errCode(
        c.query(`SELECT public.samiq_desfazer_proposta($1, $2)`, [corretorA.id, expirada]),
      ),
    ).toBe("22023");
    expect(
      await errCode(
        c.query(`SELECT public.samiq_desfazer_proposta($1, $2)`, [corretorA.id, etapa]),
      ),
    ).toBe("22023");
    const [alheia] = await registrar(c, corretorA.id, execucaoA, [anotacao(leadA)]);
    await decidir(c, corretorA.id, alheia, "aceita", {});
    expect(
      await errCode(
        c.query(`SELECT public.samiq_desfazer_proposta($1, $2)`, [corretorB.id, alheia]),
      ),
    ).toBe("P0002");
  });
});
