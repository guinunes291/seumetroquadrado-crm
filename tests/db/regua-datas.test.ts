/**
 * RÉGUA CANÔNICA DE DATAS DOS RELATÓRIOS
 * (migrations 20260731120000..20260731123000)
 *
 * Cada métrica cai no dia do FATO, não no dia em que alguém registrou o fato:
 *
 *   lead ............ leads.created_at
 *   agendamento ..... agendamentos.created_at (todos os criados)
 *   visita .......... agendamentos.data_inicio dos VALIDADOS (tipo visita,
 *                     status realizado) — uma por agendamento, remarcação
 *                     conta de novo, no-show não conta como visita
 *   pasta ........... leads.pasta_montada_em (3+ documentos recebidos)
 *   análise ......... data da transição para analise_credito (1x por lead)
 *   venda / VGV ..... vendas.data_assinatura (obrigatória e, desde a
 *                     migration, sem DEFAULT CURRENT_DATE — venda gravada
 *                     sem a data falha em vez de cair no dia do cadastro)
 *
 * Os testes abaixo separam propositalmente a data do fato da data do
 * registro — é exatamente o caso que produzia número errado antes.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";
import {
  comoSuperuser,
  comoUsuario,
  criarLead,
  criarUsuario,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

let c: Client;
let admin: UsuarioTeste;
let corretor: UsuarioTeste;

/** Janela do mês de junho/2026 (o mês "fechado" que os testes conferem). */
const DI = "2026-06-01T00:00:00-03:00";
const DF = "2026-07-01T00:00:00-03:00";

async function kpis(di = DI, df = DF): Promise<Record<string, number>> {
  await comoUsuario(c, admin.id);
  const r = await c.query(
    `SELECT public.dashboard_atividade_periodo($1::timestamptz, $2::timestamptz, NULL) AS j`,
    [di, df],
  );
  await comoSuperuser(c);
  return r.rows[0].j as Record<string, number>;
}

/**
 * Venda aprovada seguindo o fluxo real: o corretor registra pendente e a
 * gestão aprova (trigger de validação zera aprovado_em em qualquer INSERT).
 * `criadoEm`/`aprovadoEm` propositalmente fora do mês da assinatura — é o
 * caso que antes jogava a venda no mês errado.
 */
async function vendaAprovada(opts: {
  leadId: string;
  valor: number;
  assinatura: string;
  criadoEm?: string;
  aprovadoEm?: string;
}): Promise<string> {
  await comoSuperuser(c);
  const r = await c.query(
    `INSERT INTO public.vendas
       (lead_id, corretor_id, valor_venda, data_assinatura, status_venda, created_at)
     VALUES ($1, $2, $3, $4::date, 'pendente', COALESCE($5::timestamptz, now()))
     RETURNING id`,
    [opts.leadId, corretor.id, opts.valor, opts.assinatura, opts.criadoEm ?? null],
  );
  const id = r.rows[0].id as string;
  await c.query(
    `UPDATE public.vendas
        SET status_venda = 'aprovada', aprovado_em = COALESCE($2::timestamptz, now())
      WHERE id = $1`,
    [id, opts.aprovadoEm ?? null],
  );
  return id;
}

beforeAll(async () => {
  c = novoClient();
  await c.connect();
  await limparDados(c);
  admin = await criarUsuario(c, { nome: "Admin Régua", papel: "admin" });
  corretor = await criarUsuario(c, { nome: "Corretor Régua", papel: "corretor" });
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

beforeEach(async () => {
  await comoSuperuser(c);
  await c.query(`TRUNCATE public.agendamentos, public.vendas, public.documentacoes,
                          public.lead_status_transitions, public.interacoes,
                          public.venda_metricas_ledger, public.atividades_diarias
                 RESTART IDENTITY CASCADE`);
  await c.query(`DELETE FROM public.leads`);
});

describe("venda conta no mês da assinatura", () => {
  it("assinada em junho e cadastrada/aprovada em julho conta em junho", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "analise_credito" });
    await vendaAprovada({
      leadId: lead,
      valor: 250000,
      assinatura: "2026-06-20",
      criadoEm: "2026-07-14T10:00:00-03:00",
      aprovadoEm: "2026-07-15T10:00:00-03:00",
    });

    const junho = await kpis();
    expect(junho.vendas).toBe(1);
    expect(Number(junho.vgv)).toBe(250000);

    const julho = await kpis("2026-07-01T00:00:00-03:00", "2026-08-01T00:00:00-03:00");
    expect(julho.vendas).toBe(0);
    expect(Number(julho.vgv)).toBe(0);
  });

  it("venda gravada sem data de assinatura falha — não herda mais a data de hoje", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "analise_credito" });
    // Antes havia DEFAULT CURRENT_DATE: a venda entrava calada no mês errado.
    await expect(
      c.query(
        `INSERT INTO public.vendas (lead_id, corretor_id, valor_venda, status_venda)
         VALUES ($1, $2, 400000, 'pendente')`,
        [lead, corretor.id],
      ),
    ).rejects.toThrow(/data_assinatura/);
  });

  it("venda pendente ou distratada não conta", async () => {
    // Um lead por venda: só existe uma venda ativa por lead (uq_vendas_lead_ativa).
    const leadPendente = await criarLead(c, { corretorId: corretor.id, status: "analise_credito" });
    const leadDistrato = await criarLead(c, { corretorId: corretor.id, status: "analise_credito" });
    // pendente: nunca conta
    await c.query(
      `INSERT INTO public.vendas (lead_id, corretor_id, valor_venda, data_assinatura, status_venda)
       VALUES ($1, $2, 100000, '2026-06-05'::date, 'pendente')`,
      [leadPendente, corretor.id],
    );
    // aprovada e depois distratada: sai do mês da assinatura
    const distratada = await vendaAprovada({
      leadId: leadDistrato,
      valor: 100000,
      assinatura: "2026-06-06",
    });
    await c.query(`UPDATE public.vendas SET distrato = true WHERE id = $1`, [distratada]);
    expect((await kpis()).vendas).toBe(0);
  });
});

describe("visita conta no dia da visita, por agendamento validado", () => {
  it("visita de junho validada em julho conta em junho", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    const ag = await c.query(
      `INSERT INTO public.agendamentos
         (lead_id, corretor_id, titulo, tipo, status, data_inicio, data_fim, created_at)
       VALUES ($1, $2, 'Visita', 'visita', 'confirmado',
               '2026-06-18T14:00:00-03:00', '2026-06-18T15:00:00-03:00',
               '2026-06-10T09:00:00-03:00')
       RETURNING id`,
      [lead, corretor.id],
    );

    // Validação acontece "hoje" — a métrica tem que ficar em junho mesmo assim.
    await comoUsuario(c, corretor.id);
    await c.query(`SELECT public.validar_visita($1, true, 'Interesse alto', 'ok')`, [
      ag.rows[0].id,
    ]);
    await comoSuperuser(c);

    const junho = await kpis();
    expect(junho.visitas).toBe(1);
    expect(junho.agendamentos).toBe(1);

    // A validação também move o lead (guard exige próxima ação — regressão
    // real: sem ela a transição falhava calada dentro da RPC).
    const st = await c.query(`SELECT status::text FROM public.leads WHERE id = $1`, [lead]);
    expect(st.rows[0].status).toBe("visita_realizada");
  });

  it("cada agendamento vale uma visita — remarcação conta de novo", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    for (const dia of ["2026-06-05", "2026-06-12"]) {
      const ag = await c.query(
        `INSERT INTO public.agendamentos
           (lead_id, corretor_id, titulo, tipo, status, data_inicio, data_fim, created_at)
         VALUES ($1, $2, 'Visita', 'visita', 'confirmado',
                 ($3::date + time '14:00') AT TIME ZONE 'America/Sao_Paulo',
                 ($3::date + time '15:00') AT TIME ZONE 'America/Sao_Paulo',
                 '2026-06-01T09:00:00-03:00')
         RETURNING id`,
        [lead, corretor.id, dia],
      );
      await comoUsuario(c, corretor.id);
      await c.query(`SELECT public.validar_visita($1, true)`, [ag.rows[0].id]);
      await comoSuperuser(c);
    }

    const junho = await kpis();
    // O lead transiciona uma vez só, mas as DUAS visitas contam.
    expect(junho.visitas).toBe(2);
  });

  it("não compareceu não conta como visita, mas entra no comparecimento", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    const ag = await c.query(
      `INSERT INTO public.agendamentos
         (lead_id, corretor_id, titulo, tipo, status, data_inicio, data_fim, created_at)
       VALUES ($1, $2, 'Visita', 'visita', 'confirmado',
               '2026-06-18T14:00:00-03:00', '2026-06-18T15:00:00-03:00',
               '2026-06-10T09:00:00-03:00')
       RETURNING id`,
      [lead, corretor.id],
    );
    await comoUsuario(c, corretor.id);
    await c.query(`SELECT public.validar_visita($1, false)`, [ag.rows[0].id]);
    await comoSuperuser(c);

    const junho = await kpis();
    expect(junho.visitas).toBe(0);
    expect(junho.no_shows).toBe(1);
    expect(junho.visitas_agendadas).toBe(1);
  });

  it("validar duas vezes não duplica a visita", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    const ag = await c.query(
      `INSERT INTO public.agendamentos
         (lead_id, corretor_id, titulo, tipo, status, data_inicio, data_fim, created_at)
       VALUES ($1, $2, 'Visita', 'visita', 'confirmado',
               '2026-06-18T14:00:00-03:00', '2026-06-18T15:00:00-03:00',
               '2026-06-10T09:00:00-03:00')
       RETURNING id`,
      [lead, corretor.id],
    );
    await comoUsuario(c, corretor.id);
    await c.query(`SELECT public.validar_visita($1, true)`, [ag.rows[0].id]);
    await c.query(`SELECT public.validar_visita($1, true)`, [ag.rows[0].id]);
    await comoSuperuser(c);

    expect((await kpis()).visitas).toBe(1);
  });
});

describe("pasta montada a partir do 3º documento", () => {
  it("3 documentos recebidos marcam a pasta e migram o lead para análise de crédito", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    await comoUsuario(c, corretor.id);
    for (const tipo of ["cpf", "documento_identidade", "comprovante_residencia"]) {
      await c.query(
        `INSERT INTO public.documentacoes (lead_id, corretor_id, tipo, status)
         VALUES ($1, $2, $3, 'recebido')`,
        [lead, corretor.id, tipo],
      );
    }
    await comoSuperuser(c);

    const r = await c.query(
      `SELECT status::text, pasta_montada_em IS NOT NULL AS tem_pasta FROM public.leads WHERE id = $1`,
      [lead],
    );
    expect(r.rows[0].tem_pasta).toBe(true);
    expect(r.rows[0].status).toBe("analise_credito");

    // A pasta e a análise caem no período em que o 3º documento chegou.
    await c.query(
      `UPDATE public.leads SET pasta_montada_em = '2026-06-15T10:00:00-03:00' WHERE id = $1`,
      [lead],
    );
    await c.query(
      `UPDATE public.lead_status_transitions SET created_at = '2026-06-15T10:00:00-03:00'
        WHERE lead_id = $1 AND para_status = 'analise_credito'`,
      [lead],
    );
    const junho = await kpis();
    expect(junho.pastas).toBe(1);
    expect(junho.analises).toBe(1);
  });

  it("2 documentos não fecham a pasta", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    await comoUsuario(c, corretor.id);
    for (const tipo of ["cpf", "documento_identidade"]) {
      await c.query(
        `INSERT INTO public.documentacoes (lead_id, corretor_id, tipo, status)
         VALUES ($1, $2, $3, 'recebido')`,
        [lead, corretor.id, tipo],
      );
    }
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT status::text, pasta_montada_em FROM public.leads WHERE id = $1`,
      [lead],
    );
    expect(r.rows[0].pasta_montada_em).toBeNull();
    expect(r.rows[0].status).toBe("em_atendimento");
  });

  it("documento pendente/reprovado não conta para a pasta", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    await comoUsuario(c, corretor.id);
    await c.query(
      `INSERT INTO public.documentacoes (lead_id, corretor_id, tipo, status)
       VALUES ($1, $2, 'cpf', 'recebido'),
              ($1, $2, 'holerites', 'pendente'),
              ($1, $2, 'extrato_bancario', 'reprovado')`,
      [lead, corretor.id],
    );
    await comoSuperuser(c);
    const r = await c.query(`SELECT pasta_montada_em FROM public.leads WHERE id = $1`, [lead]);
    expect(r.rows[0].pasta_montada_em).toBeNull();
  });
});

describe("análise de crédito conta o lead uma vez por período", () => {
  it("entrar, voltar e entrar de novo no mesmo mês conta 1", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.lead_status_transitions
         (lead_id, corretor_id, de_status, para_status, created_at)
       VALUES ($1, $2, 'em_atendimento', 'analise_credito', '2026-06-05T10:00:00-03:00'),
              ($1, $2, 'analise_credito', 'em_atendimento', '2026-06-10T10:00:00-03:00'),
              ($1, $2, 'em_atendimento', 'analise_credito', '2026-06-20T10:00:00-03:00')`,
      [lead, corretor.id],
    );
    expect((await kpis()).analises).toBe(1);
  });
});

describe("funil do período conta eventos, não coorte", () => {
  it("lead criado em maio que visita em junho aparece no funil de junho", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads SET created_at = '2026-05-02T10:00:00-03:00' WHERE id = $1`,
      [lead],
    );
    await c.query(
      `INSERT INTO public.agendamentos
         (lead_id, corretor_id, titulo, tipo, status, data_inicio, data_fim, created_at)
       VALUES ($1, $2, 'Visita', 'visita', 'realizado',
               '2026-06-18T14:00:00-03:00', '2026-06-18T15:00:00-03:00',
               '2026-06-01T09:00:00-03:00')`,
      [lead, corretor.id],
    );

    await comoUsuario(c, admin.id);
    const r = await c.query(
      `SELECT etapa, quantidade FROM public.dashboard_funil($1::timestamptz, $2::timestamptz, NULL)`,
      [DI, DF],
    );
    await comoSuperuser(c);
    const porEtapa = Object.fromEntries(r.rows.map((x) => [x.etapa, Number(x.quantidade)]));
    expect(porEtapa["Novos"]).toBe(0); // criado em maio
    expect(porEtapa["Visitas"]).toBe(1); // visitou em junho
  });
});

describe("série diária", () => {
  it("põe a venda no dia da assinatura e a visita no dia da visita", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "analise_credito" });
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.agendamentos
         (lead_id, corretor_id, titulo, tipo, status, data_inicio, data_fim, created_at)
       VALUES ($1, $2, 'Visita', 'visita', 'realizado',
               '2026-06-18T14:00:00-03:00', '2026-06-18T15:00:00-03:00',
               '2026-06-02T09:00:00-03:00')`,
      [lead, corretor.id],
    );
    await vendaAprovada({
      leadId: lead,
      valor: 300000,
      assinatura: "2026-06-25",
      criadoEm: "2026-07-01T10:00:00-03:00",
      aprovadoEm: "2026-07-02T10:00:00-03:00",
    });

    await comoUsuario(c, admin.id);
    const r = await c.query(
      `SELECT dia::text, visitas, vendas
         FROM public.dashboard_serie_diaria($1::timestamptz, $2::timestamptz, NULL)
        WHERE visitas > 0 OR vendas > 0`,
      [DI, DF],
    );
    await comoSuperuser(c);
    const dias = Object.fromEntries(
      r.rows.map((x) => [x.dia, { visitas: Number(x.visitas), vendas: Number(x.vendas) }]),
    );
    expect(dias["2026-06-18"]?.visitas).toBe(1);
    expect(dias["2026-06-25"]?.vendas).toBe(1);
  });
});
