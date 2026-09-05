/**
 * PONTUAÇÃO DIÁRIA × EVENTOS (migration 20260905130000_pontuacao_simetria_eventos)
 *
 * Cada contador de atividades_diarias sobe E desce pelo mesmo predicado
 * (pont_*_conta), que também alimenta a reconciliação:
 *
 *   visita ......... agendamento de visita 'realizado' e ativo, no dia da
 *                    visita — inclusive o sintético criado ao arrastar o lead
 *                    para "Visita realizada" sem visita validada;
 *   agendamento .... visita/reunião criada pelo corretor (não auto_gerado,
 *                    não criado por SDR); cancelar/apagar estorna;
 *   documentação ... 1ª entrada do lead em analise_credito no mês;
 *   ligação ........ eco do discador + "Registrar resultado" da mesma
 *                    chamada = 1; interação apagada estorna.
 *
 * Meses fechados são congelados (pont_dia_editavel: só o mês corrente e o
 * anterior mudam); a decisão de duplicata da ligação fica gravada na própria
 * linha (metadata.pontuacao_ignorada); trocar o dono move o ponto.
 *
 * E o RPC ranking_periodo_v2 deixa contas desativadas (profiles.ativo=false)
 * fora e conta "leads recebidos" pela data de distribuição.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
let sdr: UsuarioTeste;
let inativo: UsuarioTeste;

// Datas RELATIVAS ao relógio do banco (SP): a janela editável é o mês
// corrente + o anterior, então os cenários usam "hoje", "ontem" e "mês
// passado" em vez de datas fixas — o teste não envelhece.
let HOJE = ""; // YYYY-MM-DD em São Paulo
let ONTEM = "";
let MES_PASSADO_DIA10 = "";
let MES_PASSADO_DIA20 = "";
let TRES_MESES_ATRAS = ""; // dia 10 de três meses atrás — sempre congelado
const sp = (dia: string, hora: string) => `${dia}T${hora}:00-03:00`;

type Contadores = {
  ligacoes: number;
  whatsapps: number;
  agendamentos: number;
  visitas: number;
  documentacoes: number;
};

async function contadores(id: string): Promise<Contadores> {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT COALESCE(sum(ligacoes),0)::int AS ligacoes, COALESCE(sum(whatsapps),0)::int AS whatsapps,
            COALESCE(sum(agendamentos),0)::int AS agendamentos, COALESCE(sum(visitas),0)::int AS visitas,
            COALESCE(sum(documentacoes),0)::int AS documentacoes
       FROM public.atividades_diarias WHERE corretor_id = $1`,
    [id],
  );
  return r.rows[0] as Contadores;
}

async function transicionar(uid: string, leadId: string, status: string): Promise<void> {
  await comoUsuario(c, uid);
  await c.query(
    `SELECT public.transicionar_lead($1, $2::public.lead_status, 'teste', 'próxima ação de teste')`,
    [leadId, status],
  );
  await comoSuperuser(c);
}

async function interacao(opts: {
  lead: string;
  autor: string;
  tipo: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}): Promise<string> {
  await comoSuperuser(c);
  const r = await c.query(
    `INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, conteudo, metadata, created_at)
     VALUES ($1, $2, $3::public.interacao_tipo, 'saida', 'teste', $4::jsonb, COALESCE($5::timestamptz, now()))
     RETURNING id`,
    [opts.lead, opts.autor, opts.tipo, JSON.stringify(opts.metadata ?? {}), opts.createdAt ?? null],
  );
  return r.rows[0].id as string;
}

async function agendamento(opts: {
  lead: string;
  corretor: string;
  criadoPor?: string;
  tipo?: string;
  status?: string;
  auto?: boolean;
  dataInicio?: string;
}): Promise<string> {
  await comoSuperuser(c);
  const r = await c.query(
    `INSERT INTO public.agendamentos (lead_id, corretor_id, criado_por_id, titulo, tipo, status, data_inicio, data_fim, auto_gerado)
     VALUES ($1, $2, $3, 'teste', $4::public.agendamento_tipo, $5::public.agendamento_status,
             COALESCE($6::timestamptz, now() + interval '1 day'), COALESCE($6::timestamptz, now() + interval '1 day') + interval '1 hour', $7)
     RETURNING id`,
    [
      opts.lead,
      opts.corretor,
      opts.criadoPor ?? opts.corretor,
      opts.tipo ?? "visita",
      opts.status ?? "agendado",
      opts.dataInicio ?? null,
      opts.auto ?? false,
    ],
  );
  return r.rows[0].id as string;
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  admin = await criarUsuario(c, { nome: "Admin Eventos", papel: "admin" });
  corretor = await criarUsuario(c, { nome: "Corretor Eventos", papel: "corretor" });
  sdr = await criarUsuario(c, { nome: "SDR Eventos", papel: "sdr" });
  inativo = await criarUsuario(c, { nome: "Conta Teste Desativada", papel: "corretor" });
  await comoSuperuser(c);
  await c.query(`UPDATE public.profiles SET ativo = false WHERE id = $1`, [inativo.id]);
  const d = await c.query(
    `SELECT to_char(sp, 'YYYY-MM-DD') AS hoje,
            to_char(sp - 1, 'YYYY-MM-DD') AS ontem,
            to_char(date_trunc('month', sp) - interval '1 month' + interval '9 days', 'YYYY-MM-DD') AS mp10,
            to_char(date_trunc('month', sp) - interval '1 month' + interval '19 days', 'YYYY-MM-DD') AS mp20,
            to_char(date_trunc('month', sp) - interval '3 months' + interval '9 days', 'YYYY-MM-DD') AS tres
       FROM (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS sp) x`,
  );
  HOJE = d.rows[0].hoje;
  ONTEM = d.rows[0].ontem;
  MES_PASSADO_DIA10 = d.rows[0].mp10;
  MES_PASSADO_DIA20 = d.rows[0].mp20;
  TRES_MESES_ATRAS = d.rows[0].tres;
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

describe("visita: sintética pontua; apagar estorna", () => {
  it("lead arrastado para 'Visita realizada' sem visita validada gera a visita do dia", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    expect((await contadores(corretor.id)).visitas).toBe(0);
    await transicionar(corretor.id, lead, "visita_realizada");
    // O agendamento sintético nasce 'realizado' e auto_gerado…
    const ag = await c.query(
      `SELECT id, auto_gerado, status FROM public.agendamentos WHERE lead_id = $1`,
      [lead],
    );
    expect(ag.rows).toHaveLength(1);
    expect(ag.rows[0].auto_gerado).toBe(true);
    expect(ag.rows[0].status).toBe("realizado");
    // …e conta como VISITA (não como agendamento criado).
    const t = await contadores(corretor.id);
    expect(t.visitas).toBe(1);
    expect(t.agendamentos).toBe(0);

    // Apagar (soft-delete) a visita estorna; restaurar devolve.
    await c.query(`UPDATE public.agendamentos SET deleted_at = now() WHERE id = $1`, [
      ag.rows[0].id,
    ]);
    expect((await contadores(corretor.id)).visitas).toBe(0);
    await c.query(`UPDATE public.agendamentos SET deleted_at = NULL WHERE id = $1`, [
      ag.rows[0].id,
    ]);
    expect((await contadores(corretor.id)).visitas).toBe(1);
    // Hard delete também.
    await c.query(`DELETE FROM public.agendamentos WHERE id = $1`, [ag.rows[0].id]);
    expect((await contadores(corretor.id)).visitas).toBe(0);
  });

  it("visita validada pelo fluxo normal conta uma vez, no dia da visita", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "agendado" });
    const id = await agendamento({
      lead,
      corretor: corretor.id,
      dataInicio: sp(ONTEM, "14:00"),
    });
    const antes = await contadores(corretor.id);
    await comoUsuario(c, corretor.id);
    await c.query(`SELECT public.validar_visita($1, true, 'Gostou', NULL, NULL)`, [id]);
    const depois = await contadores(corretor.id);
    expect(depois.visitas).toBe(antes.visitas + 1);
    const dia = await c.query(
      `SELECT visitas FROM public.atividades_diarias WHERE corretor_id = $1 AND dia = $2::date`,
      [corretor.id, ONTEM],
    );
    expect(dia.rows[0].visitas).toBe(1);
  });
});

describe("agendamento criado: só visita/reunião do próprio corretor, com estorno", () => {
  it("follow_up/ligação/outro não pontuam; visita e reunião sim", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const antes = (await contadores(corretor.id)).agendamentos;
    await agendamento({ lead, corretor: corretor.id, tipo: "follow_up" });
    await agendamento({ lead, corretor: corretor.id, tipo: "ligacao" });
    await agendamento({ lead, corretor: corretor.id, tipo: "outro" });
    expect((await contadores(corretor.id)).agendamentos).toBe(antes);
    await agendamento({ lead, corretor: corretor.id, tipo: "reuniao" });
    expect((await contadores(corretor.id)).agendamentos).toBe(antes + 1);
  });

  it("cancelar estorna, reagendar devolve, apagar estorna", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const antes = (await contadores(corretor.id)).agendamentos;
    const id = await agendamento({ lead, corretor: corretor.id, tipo: "visita" });
    expect((await contadores(corretor.id)).agendamentos).toBe(antes + 1);
    await c.query(`UPDATE public.agendamentos SET status = 'cancelado' WHERE id = $1`, [id]);
    expect((await contadores(corretor.id)).agendamentos).toBe(antes);
    await c.query(`UPDATE public.agendamentos SET status = 'agendado' WHERE id = $1`, [id]);
    expect((await contadores(corretor.id)).agendamentos).toBe(antes + 1);
    await c.query(`UPDATE public.agendamentos SET deleted_at = now() WHERE id = $1`, [id]);
    expect((await contadores(corretor.id)).agendamentos).toBe(antes);
  });

  it("agendamento criado pelo SDR ou auto_gerado não é produção de agenda do corretor", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const antes = (await contadores(corretor.id)).agendamentos;
    await agendamento({ lead, corretor: corretor.id, criadoPor: sdr.id, tipo: "visita" });
    await agendamento({ lead, corretor: corretor.id, tipo: "visita", auto: true });
    expect((await contadores(corretor.id)).agendamentos).toBe(antes);
  });
});

describe("documentação: primeira entrada em análise no mês", () => {
  it("reentrar em analise_credito no mesmo mês não soma de novo", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const antes = (await contadores(corretor.id)).documentacoes;
    await transicionar(corretor.id, lead, "analise_credito");
    expect((await contadores(corretor.id)).documentacoes).toBe(antes + 1);
    await transicionar(corretor.id, lead, "em_atendimento");
    await transicionar(corretor.id, lead, "analise_credito");
    expect((await contadores(corretor.id)).documentacoes).toBe(antes + 1);
  });

  it("no mês seguinte o mesmo lead conta de novo (uma vez)", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const antes = (await contadores(corretor.id)).documentacoes;
    await comoSuperuser(c);
    const inserir = (quando: string) =>
      c.query(
        `INSERT INTO public.lead_status_transitions (lead_id, corretor_id, de_status, para_status, created_at)
         VALUES ($1, $2, 'em_atendimento', 'analise_credito', $3::timestamptz)`,
        [lead, corretor.id, quando],
      );
    await inserir(sp(MES_PASSADO_DIA10, "10:00"));
    await inserir(sp(MES_PASSADO_DIA20, "10:00"));
    await inserir(sp(HOJE, "10:00"));
    expect((await contadores(corretor.id)).documentacoes).toBe(antes + 2);
  });

  // Decisão por lead × mês (trigger por comando): as três situações em que o
  // trigger por linha antigo divergia da reconciliação.
  async function reconciliarDoc(): Promise<number> {
    await comoSuperuser(c);
    const r = await c.query(`SELECT public.reconciliar_atividades_diarias() AS n`);
    return r.rows[0].n as number;
  }
  const inserirTransicao = (lead: string, quando: string) =>
    c.query(
      `INSERT INTO public.lead_status_transitions (lead_id, corretor_id, de_status, para_status, created_at)
       VALUES ($1, $2, 'em_atendimento', 'analise_credito', $3::timestamptz) RETURNING id`,
      [lead, corretor.id, quando],
    );

  it("apagar o lead em definitivo (cascata) estorna a documentação do mês", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const antes = (await contadores(corretor.id)).documentacoes;
    await transicionar(corretor.id, lead, "analise_credito");
    expect((await contadores(corretor.id)).documentacoes).toBe(antes + 1);
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.leads WHERE id = $1`, [lead]);
    expect((await contadores(corretor.id)).documentacoes).toBe(antes);
    expect(await reconciliarDoc()).toBe(0);
  });

  it("transição retroativa no mesmo mês move o ponto em vez de somar", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const antes = (await contadores(corretor.id)).documentacoes;
    await comoSuperuser(c);
    await inserirTransicao(lead, sp(HOJE, "10:00"));
    // Chega depois, mas datada de dias atrás: passa a ser a 1ª do mês.
    // Ontem, se ainda for o mesmo mês; no dia 1, mais cedo no próprio dia.
    const diaAntes = ONTEM.slice(0, 7) === HOJE.slice(0, 7) ? ONTEM : HOJE;
    await inserirTransicao(lead, sp(diaAntes, "09:00"));
    expect((await contadores(corretor.id)).documentacoes).toBe(antes + 1);
    expect(await reconciliarDoc()).toBe(0);
  });

  it("apagar só a 1ª transição do mês recredita a próxima", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const antes = (await contadores(corretor.id)).documentacoes;
    await comoSuperuser(c);
    const primeira = await inserirTransicao(lead, sp(HOJE, "08:00"));
    await inserirTransicao(lead, sp(HOJE, "11:00"));
    expect((await contadores(corretor.id)).documentacoes).toBe(antes + 1);
    await c.query(`DELETE FROM public.lead_status_transitions WHERE id = $1`, [
      primeira.rows[0].id,
    ]);
    expect((await contadores(corretor.id)).documentacoes).toBe(antes + 1);
    expect(await reconciliarDoc()).toBe(0);
    await c.query(`DELETE FROM public.lead_status_transitions WHERE lead_id = $1`, [lead]);
    expect((await contadores(corretor.id)).documentacoes).toBe(antes);
    expect(await reconciliarDoc()).toBe(0);
  });
});

describe("ligação: eco do discador + registro manual = 1; apagar estorna", () => {
  it("click-to-call ecoa a ligação; o 'Registrar resultado' logo depois não duplica", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const antes = (await contadores(corretor.id)).ligacoes;
    await interacao({
      lead,
      autor: corretor.id,
      tipo: "ligacao",
      metadata: { fonte: "sonax_click2call", chamada_id: "abc" },
      createdAt: sp(ONTEM, "10:00"),
    });
    expect((await contadores(corretor.id)).ligacoes).toBe(antes + 1);
    await interacao({
      lead,
      autor: corretor.id,
      tipo: "ligacao",
      createdAt: sp(ONTEM, "10:04"),
    });
    expect((await contadores(corretor.id)).ligacoes).toBe(antes + 1);
    // Duas horas depois é outra ligação.
    const outra = await interacao({
      lead,
      autor: corretor.id,
      tipo: "ligacao",
      createdAt: sp(ONTEM, "12:30"),
    });
    expect((await contadores(corretor.id)).ligacoes).toBe(antes + 2);
    // Apagar (soft-delete) estorna.
    await c.query(`UPDATE public.interacoes SET deleted_at = now() WHERE id = $1`, [outra]);
    expect((await contadores(corretor.id)).ligacoes).toBe(antes + 1);
  });

  it("WhatsApp continua 1 por mensagem registrada", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const antes = (await contadores(corretor.id)).whatsapps;
    await interacao({ lead, autor: corretor.id, tipo: "whatsapp" });
    await interacao({ lead, autor: corretor.id, tipo: "whatsapp" });
    expect((await contadores(corretor.id)).whatsapps).toBe(antes + 2);
  });
});

describe("ranking_periodo_v2: escopo e leads recebidos", () => {
  it("conta desativada (ativo=false) fica fora do ranking mesmo com atividade", async () => {
    const lead = await criarLead(c, { corretorId: inativo.id, status: "em_atendimento" });
    await interacao({ lead, autor: inativo.id, tipo: "whatsapp" });
    expect((await contadores(inativo.id)).whatsapps).toBe(1);
    await comoUsuario(c, admin.id);
    const r = await c.query(
      `SELECT corretor_id FROM public.ranking_periodo_v2(current_date - 40, current_date + 1, 50)`,
    );
    await comoSuperuser(c);
    const ids = r.rows.map((x) => x.corretor_id as string);
    expect(ids).toContain(corretor.id);
    expect(ids).not.toContain(inativo.id);
  });

  it("lead distribuído no mês anterior não vira 'lead recebido' do mês corrente", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    await comoSuperuser(c);
    // Datas SEMPRE a partir do dia de São Paulo (HOJE): o Postgres do harness
    // roda em UTC e, entre 00:00 e 03:00 UTC do dia 1, `now()`/`current_date`
    // já estão no mês seguinte enquanto o RPC ainda lê o mês anterior em SP.
    await c.query(
      `UPDATE public.leads
          SET data_distribuicao = ($2::date::timestamp AT TIME ZONE 'America/Sao_Paulo') + interval '10 hours'
        WHERE id = $1`,
      [lead, MES_PASSADO_DIA20],
    );
    await comoUsuario(c, admin.id);
    const mesAtual = await c.query(
      `SELECT leads::int AS leads
         FROM public.ranking_periodo_v2(date_trunc('month', $2::date)::date, $2::date, 50)
        WHERE corretor_id = $1`,
      [corretor.id, HOJE],
    );
    const mesAnterior = await c.query(
      `SELECT leads::int AS leads
         FROM public.ranking_periodo_v2(
           (date_trunc('month', $2::date) - interval '1 month')::date,
           (date_trunc('month', $2::date) - interval '1 day')::date,
           50)
        WHERE corretor_id = $1`,
      [corretor.id, HOJE],
    );
    await comoSuperuser(c);
    const criadosAgora = await c.query(
      `SELECT count(*)::int AS n
         FROM public.leads
        WHERE corretor_id = $1 AND data_distribuicao IS NULL
          AND deleted_at IS NULL AND na_lixeira = false`,
      [corretor.id],
    );
    expect(mesAtual.rows[0].leads).toBe(criadosAgora.rows[0].n);
    expect(mesAnterior.rows[0].leads).toBe(1);
  });
});

describe("trigger e reconciliação concordam nos casos difíceis", () => {
  async function reconciliar(desde?: string): Promise<number> {
    await comoSuperuser(c);
    const r = desde
      ? await c.query(`SELECT public.reconciliar_atividades_diarias($1::date) AS n`, [desde])
      : await c.query(`SELECT public.reconciliar_atividades_diarias() AS n`);
    return r.rows[0].n as number;
  }

  it("apagar o eco do discador não reativa o registro manual: contador nunca fica negativo", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const antes = (await contadores(corretor.id)).ligacoes;
    const eco = await interacao({
      lead,
      autor: corretor.id,
      tipo: "ligacao",
      metadata: { fonte: "sonax_webhook", chamada_id: "xyz" },
      createdAt: sp(ONTEM, "09:00"),
    });
    const manual = await interacao({
      lead,
      autor: corretor.id,
      tipo: "ligacao",
      createdAt: sp(ONTEM, "09:10"),
    });
    expect((await contadores(corretor.id)).ligacoes).toBe(antes + 1);
    const carimbo = await c.query(`SELECT metadata FROM public.interacoes WHERE id = $1`, [manual]);
    expect(carimbo.rows[0].metadata.pontuacao_ignorada).toBe(true);
    await c.query(`UPDATE public.interacoes SET deleted_at = now() WHERE id = $1`, [eco]);
    expect((await contadores(corretor.id)).ligacoes).toBe(antes);
    await c.query(`UPDATE public.interacoes SET deleted_at = now() WHERE id = $1`, [manual]);
    expect((await contadores(corretor.id)).ligacoes).toBe(antes);
    expect(await reconciliar()).toBe(0);
  });

  it("registro manual ANTES do eco do webhook: o eco é a duplicata", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const antes = (await contadores(corretor.id)).ligacoes;
    await interacao({
      lead,
      autor: corretor.id,
      tipo: "ligacao",
      createdAt: sp(ONTEM, "11:00"),
    });
    await interacao({
      lead,
      autor: corretor.id,
      tipo: "ligacao",
      metadata: { fonte: "sonax_webhook" },
      createdAt: sp(ONTEM, "11:02"),
    });
    expect((await contadores(corretor.id)).ligacoes).toBe(antes + 1);
    expect(await reconciliar()).toBe(0);
  });

  it("reatribuir agendamento e interação a outro corretor move o ponto", async () => {
    const outro = await criarUsuario(c, { nome: "Corretor Destino", papel: "corretor" });
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const a0 = await contadores(corretor.id);
    const id = await agendamento({ lead, corretor: corretor.id, tipo: "visita" });
    const wpp = await interacao({ lead, autor: corretor.id, tipo: "whatsapp" });
    expect((await contadores(corretor.id)).agendamentos).toBe(a0.agendamentos + 1);
    await c.query(`UPDATE public.agendamentos SET corretor_id = $2 WHERE id = $1`, [id, outro.id]);
    await c.query(`UPDATE public.interacoes SET autor_id = $2 WHERE id = $1`, [wpp, outro.id]);
    const a1 = await contadores(corretor.id);
    const b1 = await contadores(outro.id);
    expect(a1.agendamentos).toBe(a0.agendamentos);
    expect(a1.whatsapps).toBe(a0.whatsapps);
    expect(b1.agendamentos).toBe(1);
    expect(b1.whatsapps).toBe(1);
    expect(await reconciliar()).toBe(0);
  });

  it("mês fechado é congelado: evento antigo não cria nem muda linha, purga não estorna", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    await comoSuperuser(c);
    // Linha "histórica" de três meses atrás, como se pontuada na época.
    await c.query(
      `INSERT INTO public.atividades_diarias (corretor_id, dia, ligacoes, visitas) VALUES ($1, $2::date, 3, 1)`,
      [corretor.id, TRES_MESES_ATRAS],
    );
    await c.query(`SELECT public.recalcular_pontuacao_atividades()`);
    const junho = async () =>
      (
        await c.query(
          `SELECT ligacoes, visitas, whatsapps FROM public.atividades_diarias WHERE corretor_id = $1 AND dia = $2::date`,
          [corretor.id, TRES_MESES_ATRAS],
        )
      ).rows[0];
    // Evento datado em junho registrado hoje: não mexe no mês fechado.
    await interacao({
      lead,
      autor: corretor.id,
      tipo: "whatsapp",
      createdAt: sp(TRES_MESES_ATRAS, "10:00"),
    });
    const ag = await agendamento({
      lead,
      corretor: corretor.id,
      tipo: "visita",
      status: "realizado",
      dataInicio: sp(TRES_MESES_ATRAS, "15:00"),
    });
    expect(await junho()).toEqual({ ligacoes: 3, visitas: 1, whatsapps: 0 });
    // Purga (DELETE em cascata do lead) também não toca o mês fechado.
    await c.query(`DELETE FROM public.agendamentos WHERE id = $1`, [ag]);
    await c.query(`DELETE FROM public.leads WHERE id = $1`, [lead]);
    expect(await junho()).toEqual({ ligacoes: 3, visitas: 1, whatsapps: 0 });
    // A reconciliação padrão (janela editável) deixa o mês fechado em paz…
    expect(await reconciliar()).toBe(0);
    expect(await junho()).toEqual({ ligacoes: 3, visitas: 1, whatsapps: 0 });
    // …e só uma reconciliação explícita desde lá recompõe pelas fontes.
    expect(await reconciliar(TRES_MESES_ATRAS)).toBeGreaterThan(0);
    expect(await junho()).toEqual({ ligacoes: 0, visitas: 0, whatsapps: 0 });
  });

  it("purga de lead recente estorna o que ele tinha no mês corrente e a reconciliação concorda", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const antes = await contadores(corretor.id);
    await interacao({ lead, autor: corretor.id, tipo: "whatsapp" });
    await agendamento({ lead, corretor: corretor.id, tipo: "reuniao" });
    const meio = await contadores(corretor.id);
    expect(meio.whatsapps).toBe(antes.whatsapps + 1);
    expect(meio.agendamentos).toBe(antes.agendamentos + 1);
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.leads WHERE id = $1`, [lead]);
    const depois = await contadores(corretor.id);
    expect(depois.whatsapps).toBe(antes.whatsapps);
    expect(depois.agendamentos).toBe(antes.agendamentos);
    expect(await reconciliar()).toBe(0);
  });

  it("apagar um usuário com interações não quebra pela FK de atividades_diarias", async () => {
    const efemero = await criarUsuario(c, { nome: "Efêmero", papel: "corretor" });
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    await interacao({ lead, autor: efemero.id, tipo: "ligacao" });
    expect((await contadores(efemero.id)).ligacoes).toBe(1);
    await comoSuperuser(c);
    await c.query(`DELETE FROM auth.users WHERE id = $1`, [efemero.id]);
    const sobrou = await c.query(
      `SELECT count(*)::int AS n FROM public.atividades_diarias WHERE corretor_id = $1`,
      [efemero.id],
    );
    expect(sobrou.rows[0].n).toBe(0);
    expect(await reconciliar()).toBe(0);
  });
});

describe("reconciliação", () => {
  it("com os triggers em dia, reconciliar não muda nada; contador adulterado volta ao certo", async () => {
    await comoSuperuser(c);
    const r1 = await c.query(`SELECT public.reconciliar_atividades_diarias() AS n`);
    expect(r1.rows[0].n).toBe(0);
    const antes = await contadores(corretor.id);
    await c.query(
      `UPDATE public.atividades_diarias SET visitas = visitas + 9, ligacoes = 0 WHERE corretor_id = $1 AND dia = $2::date`,
      [corretor.id, ONTEM],
    );
    const r2 = await c.query(`SELECT public.reconciliar_atividades_diarias() AS n`);
    expect(r2.rows[0].n).toBe(1);
    expect(await contadores(corretor.id)).toEqual(antes);
  });

  it("usuário comum não executa a reconciliação", async () => {
    await comoUsuario(c, corretor.id);
    let code = "";
    try {
      await c.query(`SELECT public.reconciliar_atividades_diarias()`);
    } catch (e) {
      code = (e as { code?: string }).code ?? "";
    }
    await comoSuperuser(c);
    expect(code).toBe("42501");
  });
});
