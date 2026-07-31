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
  opts: {
    compareceu: boolean;
    etapa: string;
    followupDias?: number;
    interesse?: string | null;
    objecao?: string | null;
    reagendarDias?: number | null;
  },
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
       $4,
       $5,
       $6,
       CASE WHEN $7::text IS NULL THEN NULL
            ELSE now() + ($7 || ' days')::interval END
     ) AS execucao`,
    [
      agendamentoId,
      opts.etapa,
      String(opts.followupDias ?? 2),
      opts.compareceu,
      opts.interesse ?? (opts.compareceu ? "alto" : null),
      opts.objecao ?? null,
      opts.reagendarDias === undefined || opts.reagendarDias === null
        ? null
        : String(opts.reagendarDias),
    ],
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

describe("resultado estruturado", () => {
  it("grava interesse e objeção, e leva os dois para a timeline", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    const ag = await agendamentoDeVisita(lead);

    await concluir(ag, {
      compareceu: true,
      etapa: "visita_realizada",
      interesse: "medio",
      objecao: "preco_parcela",
    });

    const e = await c.query(
      `SELECT interesse, objecao_principal FROM public.visita_execucoes WHERE agendamento_id = $1`,
      [ag],
    );
    expect(e.rows[0]).toEqual({ interesse: "medio", objecao_principal: "preco_parcela" });

    const i = await c.query(
      `SELECT metadata->>'interesse' AS interesse, metadata->>'objecao_principal' AS objecao
         FROM public.interacoes WHERE lead_id = $1 AND tipo = 'visita'`,
      [lead],
    );
    expect(i.rows[0]).toEqual({ interesse: "medio", objecao: "preco_parcela" });
  });

  it("recusa valor fora da lista — front e banco não podem divergir", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    const ag = await agendamentoDeVisita(lead);
    // 23514 = check constraint
    expect(
      await errCode(
        concluir(ag, { compareceu: true, etapa: "visita_realizada", interesse: "empolgadissimo" }),
      ),
    ).toBe("23514");
  });

  it("quem não compareceu não tem leitura de interesse", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    const ag = await agendamentoDeVisita(lead);
    expect(
      await errCode(
        concluir(ag, { compareceu: false, etapa: "aguardando_retorno", interesse: "alto" }),
      ),
    ).toBe("22023");
  });

  it("objeção cruza com motivo de perda: a chave é a mesma", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    const ag = await agendamentoDeVisita(lead);
    await concluir(ag, {
      compareceu: true,
      etapa: "visita_realizada",
      interesse: "baixo",
      objecao: "preco_parcela",
    });
    // 'preco_parcela' também é categoria válida de motivo_perda — é o que
    // permite perguntar "quantos que reclamaram de preço na visita viraram
    // perda por preço?" sem tradução manual.
    const r = await c.query(
      `SELECT count(*)::int AS n FROM public.visita_execucoes
        WHERE objecao_principal = 'preco_parcela'`,
    );
    expect(r.rows[0].n).toBe(1);
  });
});

describe("reagendamento", () => {
  it("no-show com data nova cria o próximo agendamento na mesma transação", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    const ag = await agendamentoDeVisita(lead);

    await concluir(ag, { compareceu: false, etapa: "aguardando_retorno", reagendarDias: 3 });

    const ags = await c.query(
      `SELECT status::text, data_inicio > now() AS futuro
         FROM public.agendamentos WHERE lead_id = $1 ORDER BY data_inicio`,
      [lead],
    );
    expect(ags.rows).toHaveLength(2);
    expect(ags.rows[0].status).toBe("nao_compareceu"); // a que falhou
    expect(ags.rows[1].status).toBe("agendado"); // a nova
    expect(ags.rows[1].futuro).toBe(true);
  });

  it("preserva a duração e o local da visita original", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    await comoSuperuser(c);
    const r = await c.query(
      `INSERT INTO public.agendamentos
         (lead_id, corretor_id, titulo, tipo, status, data_inicio, data_fim, local)
       VALUES ($1, $2, 'Visita', 'visita', 'confirmado',
               now() - interval '1 day', now() - interval '1 day' + interval '90 minutes',
               'Estande Rua X, 100')
       RETURNING id`,
      [lead, corretor.id],
    );

    await concluir(r.rows[0].id, {
      compareceu: false,
      etapa: "aguardando_retorno",
      reagendarDias: 2,
    });

    const nova = await c.query(
      `SELECT local, EXTRACT(EPOCH FROM (data_fim - data_inicio))/60 AS minutos
         FROM public.agendamentos WHERE lead_id = $1 AND status = 'agendado'`,
      [lead],
    );
    expect(nova.rows[0].local).toBe("Estande Rua X, 100");
    expect(Number(nova.rows[0].minutos)).toBe(90);
  });

  it("recusa reagendamento no passado", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    const ag = await agendamentoDeVisita(lead);
    expect(
      await errCode(
        concluir(ag, { compareceu: false, etapa: "aguardando_retorno", reagendarDias: -2 }),
      ),
    ).toBe("22023");
  });

  it("reconcluir não cria um segundo reagendamento", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    const ag = await agendamentoDeVisita(lead);
    await concluir(ag, { compareceu: false, etapa: "aguardando_retorno", reagendarDias: 3 });
    await concluir(ag, { compareceu: false, etapa: "aguardando_retorno", reagendarDias: 3 });

    const n = await c.query(
      `SELECT count(*)::int AS n FROM public.agendamentos WHERE lead_id = $1`,
      [lead],
    );
    expect(n.rows[0].n).toBe(2);
  });
});
