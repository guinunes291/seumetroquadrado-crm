/**
 * CADÊNCIA — Fatia 4: painel do gestor, fila da reativação e Fase 0 pela tela
 * (migration 20260924120000).
 *
 * Todos os dados aqui são CONSTRUÍDOS. Nenhum teste lê produção: um painel
 * conferido contra a base viva passa a verde no dia em que a base muda, e o
 * indicador que ele deveria proteger é justamente o que ninguém reconferiria.
 *
 * O teste que mais importa é `encerrado no processo não vira perda`: é a
 * única coisa nesta fatia que muda comportamento humano. Se cadência cumprida
 * sem retorno aparecesse como perda do corretor, ele voltaria a segurar lead
 * para não perder — o comportamento que a cadência inteira existe para acabar.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarLead,
  criarUsuario,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let admin: UsuarioTeste;
let corretor: UsuarioTeste;
let outro: UsuarioTeste;

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
});

afterAll(async () => {
  await comoSuperuser(c);
  await limparDados(c);
  await c.end();
});

beforeEach(async () => {
  await limparDados(c);
  await comoSuperuser(c);
  admin = await criarUsuario(c, { papel: "admin" });
  corretor = await criarUsuario(c, { papel: "corretor" });
  outro = await criarUsuario(c, { papel: "corretor" });
});

/** Lead em cadência, com etapa e prazo postos à mão (o motor não é o alvo). */
async function leadEmCadencia(opts: {
  corretorId: string;
  etapa: "D1" | "D2" | "D3";
  prazoDias: number;
  inicioHorasAtras?: number;
  projeto?: string;
}): Promise<string> {
  const id = await criarLead(c, { status: "em_atendimento" });
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.leads
        SET corretor_id = $1,
            cadencia_etapa = $2,
            cadencia_ciclo = 1,
            cadencia_inicio_ts = now() - make_interval(hours => $3::int),
            cadencia_prazo_ts = ((now() AT TIME ZONE 'America/Sao_Paulo')::date
                                  + make_interval(days => $4::int) + interval '18 hours')
                                AT TIME ZONE 'America/Sao_Paulo',
            projeto_nome = COALESCE($5, projeto_nome)
      WHERE id = $6`,
    [
      opts.corretorId,
      opts.etapa,
      opts.inicioHorasAtras ?? 24,
      opts.prazoDias,
      opts.projeto ?? null,
      id,
    ],
  );
  return id;
}

async function tentativa(leadId: string, corretorId: string, etapa: string, minutosApos: number) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.cadencia_tentativas (lead_id, corretor_id, etapa, canal, resultado, ts, ciclo)
     SELECT $1, $2, $3, 'ligacao', 'nao_atendeu',
            l.cadencia_inicio_ts + make_interval(mins => $4::int), 1
       FROM public.leads l WHERE l.id = $1`,
    [leadId, corretorId, etapa, minutosApos],
  );
}

async function eventoRespondeu(leadId: string, de: "D1" | "D2" | "D3") {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
     VALUES ($1, 'cadencia_etapa', 'cliente respondeu', 'teste',
             jsonb_build_object('de_estado', $2::text, 'para_estado', 'respondeu'))`,
    [leadId, de],
  );
}

async function logMotor(opts: {
  lote: string;
  job: string;
  leadId: string;
  corretorId: string;
  motivo: string;
  aplicado?: boolean;
  modo?: string;
}) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.cadencia_execucao_log
       (lote_id, job, lead_id, corretor_id, motivo, modo, aplicado)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      opts.lote,
      opts.job,
      opts.leadId,
      opts.corretorId,
      opts.motivo,
      opts.modo ?? "ativo",
      opts.aplicado ?? true,
    ],
  );
}

async function painelCorretores() {
  await comoUsuario(c, admin.id);
  const r = await c.query(`SELECT * FROM public.cadencia_painel_corretores()`);
  return r.rows as Array<Record<string, string | number | null>>;
}

const linha = (linhas: Array<Record<string, unknown>>, id: string) =>
  linhas.find((l) => l.corretor_id === id)!;

describe("painel por corretor", () => {
  it("separa o que vence hoje do que já venceu", async () => {
    await leadEmCadencia({ corretorId: corretor.id, etapa: "D1", prazoDias: 0 });
    await leadEmCadencia({ corretorId: corretor.id, etapa: "D2", prazoDias: -2 });
    await leadEmCadencia({ corretorId: corretor.id, etapa: "D3", prazoDias: -1 });
    await leadEmCadencia({ corretorId: outro.id, etapa: "D1", prazoDias: 3 });

    const linhas = await painelCorretores();
    const meu = linha(linhas, corretor.id);
    expect(Number(meu.fazer_hoje)).toBe(1);
    expect(Number(meu.atrasados)).toBe(2);

    const dele = linha(linhas, outro.id);
    // Prazo no futuro não é "hoje" nem "atrasado" — é simplesmente nada a fazer.
    expect(Number(dele.fazer_hoje)).toBe(0);
    expect(Number(dele.atrasados)).toBe(0);
  });

  it("encerrado no processo NÃO entra em perdas do corretor", async () => {
    const cumpriu = await leadEmCadencia({ corretorId: corretor.id, etapa: "D3", prazoDias: -1 });
    const venceu = await leadEmCadencia({ corretorId: corretor.id, etapa: "D1", prazoDias: -4 });
    const lote = "11111111-1111-1111-1111-111111111111";

    await logMotor({
      lote,
      job: "encerrar",
      leadId: cumpriu,
      corretorId: corretor.id,
      motivo: "cumpriu_100",
    });
    await logMotor({
      lote,
      job: "vencidos",
      leadId: venceu,
      corretorId: corretor.id,
      motivo: "prazo_vencido",
    });

    const meu = linha(await painelCorretores(), corretor.id);
    expect(Number(meu.encerrados_no_processo)).toBe(1);
    expect(Number(meu.perdas_por_falha)).toBe(1); // só o job vencidos
    expect(Number(meu.saidas_sem_resposta)).toBe(2);
    expect(Number(meu.cumprimento_pct)).toBe(50);
  });

  it("linha em modo sombra não conta como saída", async () => {
    const lead = await leadEmCadencia({ corretorId: corretor.id, etapa: "D1", prazoDias: -3 });
    await logMotor({
      lote: "22222222-2222-2222-2222-222222222222",
      job: "vencidos",
      leadId: lead,
      corretorId: corretor.id,
      motivo: "prazo_vencido",
      modo: "sombra",
      aplicado: false,
    });

    const meu = linha(await painelCorretores(), corretor.id);
    expect(Number(meu.perdas_por_falha)).toBe(0);
    expect(Number(meu.saidas_sem_resposta)).toBe(0);
  });

  it("taxa de resposta e tempo até a primeira tentativa", async () => {
    const a = await leadEmCadencia({ corretorId: corretor.id, etapa: "D1", prazoDias: 0 });
    const b = await leadEmCadencia({ corretorId: corretor.id, etapa: "D2", prazoDias: 0 });
    await tentativa(a, corretor.id, "D1", 30);
    await tentativa(b, corretor.id, "D1", 90);
    await eventoRespondeu(a, "D1");

    const meu = linha(await painelCorretores(), corretor.id);
    expect(Number(meu.entraram_d1)).toBe(2);
    expect(Number(meu.responderam)).toBe(1);
    expect(Number(meu.taxa_resposta_pct)).toBe(50);
    // Média de 30 e 90 minutos, em minutos crus: a string hh:mm é da tela.
    expect(Number(meu.minutos_1a_tentativa)).toBe(60);
  });

  it("lead que já saiu da carteira continua contando para o dono da época", async () => {
    const lead = await leadEmCadencia({ corretorId: corretor.id, etapa: "D3", prazoDias: 0 });
    await tentativa(lead, corretor.id, "D1", 15);
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET corretor_id = NULL WHERE id = $1`, [lead]);

    const meu = linha(await painelCorretores(), corretor.id);
    // Sem o dono da primeira tentativa, o esforço sumiria do painel junto com
    // o lead — e o corretor que trabalhou apareceria como quem não trabalhou.
    expect(Number(meu.entraram_d1)).toBe(1);
  });
});

describe("resposta por etapa", () => {
  it("o denominador é quem recebeu toque na etapa, não quem passou por ela", async () => {
    const tocado = await leadEmCadencia({
      corretorId: corretor.id,
      etapa: "D3",
      prazoDias: 0,
      projeto: "Residencial Aurora",
    });
    const semToque = await leadEmCadencia({
      corretorId: corretor.id,
      etapa: "D3",
      prazoDias: 0,
      projeto: "Residencial Aurora",
    });
    await tentativa(tocado, corretor.id, "D3", 10);
    await eventoRespondeu(tocado, "D3");

    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT * FROM public.cadencia_painel_etapas() WHERE etapa = 'D3'`);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].empreendimento).toBe("Residencial Aurora");
    expect(Number(r.rows[0].alcancaram)).toBe(1);
    expect(Number(r.rows[0].responderam)).toBe(1);
    expect(Number(r.rows[0].taxa_resposta_pct)).toBe(100);
    expect(semToque).toBeTruthy();
  });
});

/** Linha da base de reativação, com a janela de descanso controlada. */
async function naFilaReativacao(opts: {
  diasAteElegivel: number;
  status?: string;
  finalizadoHaDias?: number;
  statusLead?: string;
  prioridade?: number;
}): Promise<{ filaId: string; leadId: string }> {
  const leadId = await criarLead(c, { status: "aguardando_atendimento" });
  await comoSuperuser(c);
  if (opts.statusLead) {
    await c.query(`SELECT set_config('app.transicionar_lead', 'on', true)`);
    await c.query(`UPDATE public.leads SET status = $1::public.lead_status WHERE id = $2`, [
      opts.statusLead,
      leadId,
    ]);
  }
  const r = await c.query(
    `INSERT INTO public.reativacao_fila
       (lead_id, entrou_em, elegivel_em, origem, empreendimento, faixa_renda, prioridade,
        status, finalizado_em)
     VALUES ($1, now() - interval '20 days',
             now() + make_interval(days => $2::int),
             'cadencia_cumprida', 'Residencial Aurora', 'ate_4mil', $3,
             $4, CASE WHEN $5::int IS NULL THEN NULL
                      ELSE now() - make_interval(days => $5::int) END)
     RETURNING id`,
    [
      leadId,
      opts.diasAteElegivel,
      opts.prioridade ?? 1,
      opts.status ?? "aguardando",
      opts.finalizadoHaDias ?? null,
    ],
  );
  return { filaId: r.rows[0].id as string, leadId };
}

describe("reativação", () => {
  it("descanso, elegíveis, taxa e conversão", async () => {
    await naFilaReativacao({ diasAteElegivel: 10 }); // em descanso
    await naFilaReativacao({ diasAteElegivel: -1 }); // elegível hoje
    await naFilaReativacao({
      diasAteElegivel: -5,
      status: "reativado",
      finalizadoHaDias: 2,
      statusLead: "agendado",
    });
    await naFilaReativacao({ diasAteElegivel: -5, status: "sem_retorno", finalizadoHaDias: 3 });

    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT * FROM public.cadencia_painel_reativacao()`);
    const p = r.rows[0];
    expect(Number(p.em_descanso)).toBe(1);
    expect(Number(p.elegiveis_hoje)).toBe(1);
    expect(Number(p.reativados)).toBe(1);
    expect(Number(p.sem_retorno)).toBe(1);
    expect(Number(p.taxa_reativacao_pct)).toBe(50);
    expect(Number(p.convertidos)).toBe(1);
    expect(Number(p.conversao_pct)).toBe(100);
  });

  it("a fila do SDR não mostra quem está em descanso como acionável", async () => {
    const descansando = await naFilaReativacao({ diasAteElegivel: 9 });
    const pronto = await naFilaReativacao({ diasAteElegivel: -1 });

    const sdr = await criarUsuario(c, { papel: "sdr" });
    await comoUsuario(c, sdr.id);
    const r = await c.query(`SELECT public.reativacao_fila_v1(50) AS fila`);
    const fila = r.rows[0].fila as {
      acionaveis: Array<{ id: string }>;
      em_descanso: Array<{ id: string }>;
    };

    expect(fila.acionaveis.map((i) => i.id)).toEqual([pronto.filaId]);
    expect(fila.em_descanso.map((i) => i.id)).toEqual([descansando.filaId]);
    // Telefone cru é do discador (v_reativacao_discador), nunca desta tela.
    expect(JSON.stringify(fila)).not.toMatch(/telefone/);
  });

  it("corretor não age na fila de reativação", async () => {
    const { filaId } = await naFilaReativacao({ diasAteElegivel: -1 });
    await comoUsuario(c, corretor.id);
    await expect(
      c.query(`SELECT public.reativacao_marcar_sem_retorno($1)`, [filaId]),
    ).rejects.toThrow();
  });
});

describe("motor e Fase 0", () => {
  it("agrupa por lote com os motivos somados", async () => {
    const lead1 = await leadEmCadencia({ corretorId: corretor.id, etapa: "D1", prazoDias: -3 });
    const lead2 = await leadEmCadencia({ corretorId: corretor.id, etapa: "D2", prazoDias: -3 });
    const lote = "33333333-3333-3333-3333-333333333333";
    await logMotor({
      lote,
      job: "vencidos",
      leadId: lead1,
      corretorId: corretor.id,
      motivo: "prazo_vencido",
    });
    await logMotor({
      lote,
      job: "vencidos",
      leadId: lead2,
      corretorId: corretor.id,
      motivo: "prazo_vencido",
      aplicado: false,
    });

    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT * FROM public.cadencia_painel_motor(10)`);
    expect(r.rows).toHaveLength(1);
    expect(Number(r.rows[0].avaliados)).toBe(2);
    expect(Number(r.rows[0].aplicados)).toBe(1);
    expect(r.rows[0].motivos).toEqual({ prazo_vencido: 2 });
  });

  it("lote de admissão aparece como desfeito quando os leads saíram da cadência", async () => {
    const lead = await leadEmCadencia({ corretorId: corretor.id, etapa: "D1", prazoDias: 0 });
    const lote = "44444444-4444-4444-4444-444444444444";
    await logMotor({
      lote,
      job: "fase0",
      leadId: lead,
      corretorId: corretor.id,
      motivo: "admissao_estoque",
    });

    await comoUsuario(c, admin.id);
    let r = await c.query(`SELECT * FROM public.cadencia_painel_fase0_lotes(10)`);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].desfeito).toBe(false);

    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET cadencia_etapa = NULL WHERE id = $1`, [lead]);
    await comoUsuario(c, admin.id);
    r = await c.query(`SELECT * FROM public.cadencia_painel_fase0_lotes(10)`);
    expect(r.rows[0].desfeito).toBe(true);
  });
});

describe("escopo", () => {
  it("corretor não abre o painel", async () => {
    await comoUsuario(c, corretor.id);
    await expect(c.query(`SELECT * FROM public.cadencia_painel_corretores()`)).rejects.toThrow();
    await expect(c.query(`SELECT * FROM public.cadencia_painel_motor(5)`)).rejects.toThrow();
  });
});
