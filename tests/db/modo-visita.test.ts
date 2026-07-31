/**
 * MODO VISITA — desfecho e rastro (migration 20260731140000)
 *
 * Concluir a visita valida o AGENDAMENTO, que é a fonte da métrica de visitas
 * e comparecimento desde a régua de datas. Os testes cobrem os dois desfechos
 * e o rastro que a operação precisa enxergar depois:
 *
 *   compareceu  → agendamento 'realizado', lead em visita_realizada
 *   não veio    → agendamento 'nao_compareceu', lead em aguardando_retorno
 *                 e follow-up futuro obrigatório
 *   ambos       → interação de visita na timeline do lead
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";
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

let c: Client;
let corretor: UsuarioTeste;

/** Agendamento de visita de ontem, ainda aguardando validação. */
async function agendamentoDeVisita(leadId: string): Promise<string> {
  await comoSuperuser(c);
  const r = await c.query(
    `INSERT INTO public.agendamentos
       (lead_id, corretor_id, titulo, tipo, status, data_inicio, data_fim)
     VALUES ($1, $2, 'Visita', 'visita', 'confirmado',
             now() - interval '1 day', now() - interval '1 day' + interval '1 hour')
     RETURNING id`,
    [leadId, corretor.id],
  );
  return r.rows[0].id as string;
}

async function concluir(
  agendamentoId: string,
  opts: { compareceu: boolean; etapa: string; followupDias?: number },
) {
  await comoUsuario(c, corretor.id);
  const r = await c.query(
    `SELECT public.salvar_modo_visita(
       $1,
       '{"projeto_apresentado": true}'::jsonb,
       'Cliente gostou da planta do 2 dormitórios',
       'Objeção: valor da entrada',
       true,
       $2::public.lead_status,
       'Enviar simulação atualizada',
       now() + ($3 || ' days')::interval,
       $4
     ) AS execucao`,
    [agendamentoId, opts.etapa, String(opts.followupDias ?? 2), opts.compareceu],
  );
  await comoSuperuser(c);
  return r.rows[0].execucao;
}

beforeAll(async () => {
  c = novoClient();
  await c.connect();
  await limparDados(c);
  corretor = await criarUsuario(c, { nome: "Corretor Campo", papel: "corretor" });
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

beforeEach(async () => {
  await comoSuperuser(c);
  await c.query(
    `TRUNCATE public.visita_execucoes, public.agendamentos, public.interacoes,
              public.lead_status_transitions, public.atividades_diarias
     RESTART IDENTITY CASCADE`,
  );
  await c.query(`DELETE FROM public.leads`);
});

describe("cliente compareceu", () => {
  it("valida o agendamento, move o lead e registra a visita na timeline", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    const ag = await agendamentoDeVisita(lead);

    await concluir(ag, { compareceu: true, etapa: "visita_realizada" });

    const agendamento = await c.query(
      `SELECT status::text, realizado_em IS NOT NULL AS validado FROM public.agendamentos WHERE id = $1`,
      [ag],
    );
    expect(agendamento.rows[0].status).toBe("realizado");
    expect(agendamento.rows[0].validado).toBe(true);

    const l = await c.query(`SELECT status::text FROM public.leads WHERE id = $1`, [lead]);
    expect(l.rows[0].status).toBe("visita_realizada");

    // Rastro na timeline: era o furo — a visita sumia do histórico do lead.
    // Filtra por tipo 'visita': a mudança de etapa gera sua própria interação
    // ('mudanca_status'), que é registro de outro fato.
    const i = await c.query(
      `SELECT titulo, tipo::text, metadata->>'compareceu' AS compareceu,
              metadata->>'origem' AS origem
         FROM public.interacoes WHERE lead_id = $1 AND tipo = 'visita'`,
      [lead],
    );
    expect(i.rows).toHaveLength(1);
    expect(i.rows[0].tipo).toBe("visita");
    expect(i.rows[0].titulo).toBe("Visita realizada");
    expect(i.rows[0].compareceu).toBe("true");
    expect(i.rows[0].origem).toBe("modo_visita");
  });
});

describe("cliente não compareceu", () => {
  it("marca no-show no agendamento e devolve o lead para aguardando retorno", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    const ag = await agendamentoDeVisita(lead);

    await concluir(ag, { compareceu: false, etapa: "aguardando_retorno" });

    const agendamento = await c.query(
      `SELECT status::text, realizado_em FROM public.agendamentos WHERE id = $1`,
      [ag],
    );
    expect(agendamento.rows[0].status).toBe("nao_compareceu");
    // Sem realizado_em: no-show não é visita realizada e não pode contar como tal.
    expect(agendamento.rows[0].realizado_em).toBeNull();

    const l = await c.query(`SELECT status::text FROM public.leads WHERE id = $1`, [lead]);
    expect(l.rows[0].status).toBe("aguardando_retorno");

    const i = await c.query(
      `SELECT titulo, metadata->>'compareceu' AS compareceu
         FROM public.interacoes WHERE lead_id = $1 AND tipo = 'visita'`,
      [lead],
    );
    expect(i.rows[0].titulo).toBe("Cliente não compareceu");
    expect(i.rows[0].compareceu).toBe("false");
  });

  it("não pode virar visita realizada", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    const ag = await agendamentoDeVisita(lead);
    expect(await errCode(concluir(ag, { compareceu: false, etapa: "visita_realizada" }))).toBe(
      "22023",
    );
  });

  it("exige follow-up futuro — cliente que sumiu sem próximo contato é lead perdido em câmera lenta", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    const ag = await agendamentoDeVisita(lead);
    expect(
      await errCode(
        concluir(ag, { compareceu: false, etapa: "aguardando_retorno", followupDias: -1 }),
      ),
    ).toBe("22023");
  });
});

describe("métrica", () => {
  it("visita validada conta no dia da visita; no-show não conta como visita", async () => {
    const leadOk = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    const leadNao = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    await concluir(await agendamentoDeVisita(leadOk), {
      compareceu: true,
      etapa: "visita_realizada",
    });
    await concluir(await agendamentoDeVisita(leadNao), {
      compareceu: false,
      etapa: "aguardando_retorno",
    });

    await comoUsuario(c, corretor.id);
    const r = await c.query(
      `SELECT public.dashboard_atividade_periodo(
         now() - interval '2 days', now() + interval '1 day', NULL) AS j`,
    );
    await comoSuperuser(c);
    const kpis = r.rows[0].j as Record<string, number>;
    expect(kpis.visitas).toBe(1);
    expect(kpis.no_shows).toBe(1);
    expect(kpis.visitas_agendadas).toBe(2);
  });
});

describe("idempotência", () => {
  it("concluir duas vezes não duplica interação nem remexe no lead", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    const ag = await agendamentoDeVisita(lead);
    await concluir(ag, { compareceu: true, etapa: "visita_realizada" });
    await concluir(ag, { compareceu: true, etapa: "visita_realizada" });

    const i = await c.query(
      `SELECT count(*)::int AS n FROM public.interacoes WHERE lead_id = $1 AND tipo = 'visita'`,
      [lead],
    );
    expect(i.rows[0].n).toBe(1);
  });
});
