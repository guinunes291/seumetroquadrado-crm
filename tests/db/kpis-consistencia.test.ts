/**
 * CONSISTÊNCIA DOS NÚMEROS DO CRM — a mesma pergunta respondida por RPCs
 * diferentes tem que dar o mesmo número.
 *
 * Filtros REAIS de cada RPC de leitura (descobertos via pg_get_functiondef;
 * divergências corrigidas na migration 20260719130000_kpis_consistencia):
 *
 * - pipeline_snapshot_v3(_query,_corretor_id,_projeto_id) SECURITY DEFINER:
 *     deleted_at IS NULL AND na_lixeira = false. Escopo: admin/superintendente
 *     veem tudo (ve_carteira_completa); GESTOR vê a própria carteira +
 *     corretores_do_gestor (equipe) — leads SEM corretor ficam de fora;
 *     corretor vê a própria carteira (INCLUSIVE status 'novo'). Devolve todas
 *     as etapas do enum (legados 'qualificado'/'proposta_enviada' incluídos).
 *     Não devolve linha de total — o total é a soma das etapas. Não filtra
 *     período (sem timezone envolvido). É a RÉGUA DE ESCOPO das demais RPCs.
 * - pipeline_snapshot_v2: mesmos filtros; escopo via pode_acessar_lead
 *     (mesmo conjunto de leads do v3 para todo papel).
 * - leads_status_counts_v2(_na_lixeira,...) SECURITY DEFINER:
 *     deleted_at IS NULL AND na_lixeira = _na_lixeira. Escopo (20260719130000):
 *     mesma régua do pipeline_snapshot_v3 — admin/superintendente global,
 *     gestor = carteira + equipe (sem leads órfãos), corretor = a própria
 *     carteira INCLUSIVE status 'novo' (a lista bate com o kanban/RLS).
 *     Período (quando passado): created_at cru do chamador, exceto
 *     contrato_fechado que usa data_assinatura da última venda. Devolve linha
 *     '__total__'.
 * - dashboard_kpis(_di,_df,_corretor,_campo_data) SECURITY DEFINER:
 *     pipeline: deleted/lixeira fora; escopo (20260719130000) = régua do
 *     pipeline_snapshot_v3; 'em_aberto'/'sem_corretor' tratam pos_venda como
 *     TERMINAL (status NOT IN contrato_fechado/perdido/pos_venda). periodo
 *     (dashboard_atividade_periodo): leads por created_at na janela CRUA
 *     (timezone é responsabilidade do chamador); 'vendas'/'vgv' = SÓ vendas
 *     APROVADAS sem distrato (20260719130000); visitas por
 *     lead_status_transitions; 'perdidos' idem e SEM filtro de lixeira
 *     (perda é fato histórico — 20260719130000).
 * - dashboard_funil(_di,_df,_corretor,_campo_data) SECURITY DEFINER:
 *     deleted/lixeira fora; escopo = régua do v3; janela crua por created_at;
 *     'Novos' = TODOS os leads criados na janela (qualquer status); etapas
 *     cumulativas incluem 'proposta_enviada' (até 'Visitas') e 'pos_venda'
 *     (todas); 'Fechados' = contrato_fechado + pos_venda (20260719130000).
 * - dashboard_serie_diaria(...) SECURITY DEFINER: deleted/lixeira fora; escopo
 *     (20260719130000) = régua do v3; bucketiza os dias em America/Sao_Paulo.
 * - gestao_metricas(_start,_end,_campo) SECURITY INVOKER (RLS do chamador):
 *     'aderencia' = leads com deleted_at IS NULL (20260719130000), na_lixeira
 *     = false e status não-terminal; 'atividade' = interacoes com deleted_at
 *     IS NULL na janela crua.
 * - leads_sla_pendentes(_corretor) SECURITY DEFINER: deleted/lixeira fora;
 *     status IN ('novo','aguardando_atendimento'); escopo (20260719130000) =
 *     régua do v3.
 * - leads_com_sla(_corretor) SECURITY DEFINER: idem, mas todos os status
 *     não-terminais (sla_status = 'ok' fora de novo/aguardando_atendimento).
 * - metricas_periodo_v2(_inicio date,_fim date) SECURITY DEFINER: dias
 *     interpretados em America/Sao_Paulo; leads deleted/lixeira fora, escopo
 *     por pode_acessar_lead (gestor = equipe, SEM leads sem corretor — igual
 *     ao dashboard após 20260719130000); 'vendas'/'vgv' vêm de
 *     atividades_diarias, que só recebe bump na APROVAÇÃO da venda (dia =
 *     aprovado_em em SP).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarEquipe,
  criarLead,
  criarUsuario,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let equipeA: string;
let equipeB: string;
let admin: UsuarioTeste;
let gestorA: UsuarioTeste;
let corretor1: UsuarioTeste; // equipe A
let corretor2: UsuarioTeste; // equipe A
let corretor3: UsuarioTeste; // equipe B

// Leads-chave do seed
let lFronteira: string; // created_at 2026-07-18T02:30Z = 17/07 23:30 em SP
let lLixNovo: string; // na_lixeira, status novo, sem corretor
let lLixEmAt: string; // na_lixeira, em_atendimento, corretor1
let lDeleted: string; // deleted_at preenchido, em_atendimento, corretor2
let lNovoC1: string;

// Janela ampla alinhada a America/Sao_Paulo cobrindo TODO o seed
// (2026-07-01 até o "hoje" do banco) — usada para comparar as RPCs de período.
const DI_SP = "2026-07-01T00:00:00-03:00";
const METRICAS_INICIO = "2026-07-01";
let METRICAS_FIM = ""; // hoje (SP) — calculado após o seed
let DF_SP = ""; // amanhã 00:00 SP (exclusivo) — mesma janela de METRICAS

// Números esperados do seed (validados no describe "sanidade do seed"):
const ATIVOS_TOTAL = 18; // 21 leads - 2 lixeira - 1 deleted
const TIME_A_ATIVOS = 12; // corretor1 (7) + corretor2 (5)
const NAO_TERMINAIS = 13; // 18 - contrato_fechado(2) - pos_venda(1) - perdido(2)
const SLA_PENDENTES_REF = 3; // novo(2) + aguardando_atendimento(1) ativos
const VENDAS_APROVADAS = 2;
const VGV_APROVADO = 180000; // 100000 + 80000
const VENDAS_COM_PENDENTE = 3; // + pendente de 50000
const VGV_COM_PENDENTE = 230000;

let telSeq = 0;

/** INSERT direto (superusuário) com campos que criarLead não expõe. */
async function leadDireto(opts: {
  nome: string;
  corretorId?: string | null;
  status?: string;
  naLixeira?: boolean;
  deletedAt?: string | null;
  createdAt?: string | null;
  replica?: boolean; // p/ status terminais (pula trg_proteger_fechamento_insert)
}): Promise<string> {
  await comoSuperuser(c);
  if (opts.replica) await c.query(`SET session_replication_role = replica`);
  const r = await c.query(
    `INSERT INTO public.leads
       (nome, telefone, corretor_id, status, na_lixeira, deleted_at, created_at, data_movido_lixeira)
     VALUES ($1, $2, $3, $4::public.lead_status, $5, $6::timestamptz,
             COALESCE($7::timestamptz, now()),
             CASE WHEN $5 THEN now() ELSE NULL END)
     RETURNING id`,
    [
      opts.nome,
      `11988${String(100000 + ++telSeq).slice(-6)}`,
      opts.corretorId ?? null,
      opts.status ?? "novo",
      opts.naLixeira ?? false,
      opts.deletedAt ?? null,
      opts.createdAt ?? null,
    ],
  );
  if (opts.replica) await c.query(`SET session_replication_role = DEFAULT`);
  return r.rows[0].id as string;
}

/** Fluxo real: corretor registra venda pendente no próprio lead. */
async function registrarVenda(
  corretor: UsuarioTeste,
  leadId: string,
  valor: number,
  dataAssinatura: string,
): Promise<string> {
  await comoUsuario(c, corretor.id);
  const r = await c.query(
    `INSERT INTO public.vendas
       (lead_id, corretor_id, criado_por_id, valor_venda, data_assinatura,
        percentual_corretor, percentual_gerente, percentual_superintendente, status_venda)
     VALUES ($1, $2, $2, $3, $4::date, 1, 1, 0, 'pendente'::public.status_venda)
     RETURNING id`,
    [leadId, corretor.id, valor, dataAssinatura],
  );
  await comoSuperuser(c);
  return r.rows[0].id as string;
}

/** Fluxo real: gestor aprova a venda (lead vira contrato_fechado via trigger). */
async function aprovarVenda(vendaId: string): Promise<void> {
  await comoUsuario(c, gestorA.id);
  await c.query(`SELECT public.aprovar_venda($1, 'aprovada'::public.status_venda, NULL)`, [
    vendaId,
  ]);
  await comoSuperuser(c);
}

/** Contagem de referência (visão superusuário, filtro SQL explícito). */
async function refCount(where: string): Promise<number> {
  await comoSuperuser(c);
  const r = await c.query(`SELECT count(*)::int AS n FROM public.leads WHERE ${where}`);
  return r.rows[0].n as number;
}

const ATIVO = `deleted_at IS NULL AND na_lixeira = false`;
const TERMINAIS = `('contrato_fechado','pos_venda','perdido')`;

/** pipeline_snapshot_v2/v3 como o usuário atual → Map etapa→quantidade. */
async function pipelineMap(
  userId: string,
  fn: "pipeline_snapshot_v2" | "pipeline_snapshot_v3" = "pipeline_snapshot_v3",
): Promise<Map<string, number>> {
  await comoUsuario(c, userId);
  const r = await c.query(
    `SELECT etapa::text AS etapa, quantidade::int AS quantidade FROM public.${fn}(NULL, NULL, NULL)`,
  );
  await comoSuperuser(c);
  return new Map(r.rows.map((row) => [row.etapa as string, row.quantidade as number]));
}

/** leads_status_counts_v2 como o usuário atual → Map status→quantidade (inclui '__total__'). */
async function countsMap(userId: string, naLixeira = false): Promise<Map<string, number>> {
  await comoUsuario(c, userId);
  const r = await c.query(
    `SELECT status, quantidade::int AS quantidade
     FROM public.leads_status_counts_v2(_na_lixeira => $1)`,
    [naLixeira],
  );
  await comoSuperuser(c);
  return new Map(r.rows.map((row) => [row.status as string, row.quantidade as number]));
}

/** leads_filtered_v2 (lista) como o usuário atual → linhas + total_count da RPC. */
async function listaLeads(
  userId: string,
): Promise<{ ids: string[]; corretores: Array<string | null>; total: number }> {
  await comoUsuario(c, userId);
  const r = await c.query(
    `SELECT id, corretor_id, total_count::int AS total_count
     FROM public.leads_filtered_v2(_status => 'all', _limit => 200)`,
  );
  await comoSuperuser(c);
  return {
    ids: r.rows.map((row) => row.id as string),
    corretores: r.rows.map((row) => (row.corretor_id as string | null) ?? null),
    total: r.rows.length ? (r.rows[0].total_count as number) : 0,
  };
}

function somaEtapas(m: Map<string, number>): number {
  let s = 0;
  for (const [etapa, n] of m) if (etapa !== "__total__") s += n;
  return s;
}

async function funilMap(
  userId: string,
  di: string | null,
  df: string | null,
): Promise<Map<string, number>> {
  await comoUsuario(c, userId);
  const r = await c.query(
    `SELECT etapa, quantidade::int AS quantidade
     FROM public.dashboard_funil($1::timestamptz, $2::timestamptz, NULL, 'criacao')`,
    [di, df],
  );
  await comoSuperuser(c);
  return new Map(r.rows.map((row) => [row.etapa as string, row.quantidade as number]));
}

async function kpis(userId: string, di: string | null, df: string | null) {
  await comoUsuario(c, userId);
  const r = await c.query(
    `SELECT public.dashboard_kpis($1::timestamptz, $2::timestamptz, NULL, 'criacao') AS j`,
    [di, df],
  );
  await comoSuperuser(c);
  return r.rows[0].j as {
    pipeline: Record<string, number>;
    periodo: Record<string, number>;
    prev: unknown;
  };
}

async function metricasPeriodo(userId: string, inicio: string, fim: string) {
  await comoUsuario(c, userId);
  const r = await c.query(`SELECT public.metricas_periodo_v2($1::date, $2::date) AS j`, [
    inicio,
    fim,
  ]);
  await comoSuperuser(c);
  return r.rows[0].j as Record<string, number>;
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);

  equipeA = await criarEquipe(c, { nome: "Equipe A KPIs" });
  equipeB = await criarEquipe(c, { nome: "Equipe B KPIs" });
  admin = await criarUsuario(c, { nome: "Admin KPIs", papel: "admin" });
  gestorA = await criarUsuario(c, { nome: "Gestor A", papel: "gestor", equipeId: equipeA });
  corretor1 = await criarUsuario(c, { nome: "Corretor 1", papel: "corretor", equipeId: equipeA });
  corretor2 = await criarUsuario(c, { nome: "Corretor 2", papel: "corretor", equipeId: equipeA });
  corretor3 = await criarUsuario(c, { nome: "Corretor 3", papel: "corretor", equipeId: equipeB });
  await comoSuperuser(c);
  await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gestorA.id, equipeA]);

  // ---- ~20 leads espalhados por TODOS os status ------------------------------
  // Não-terminais via fluxo normal (INSERT com status permitido):
  lNovoC1 = await criarLead(c, { nome: "KPI novo c1", corretorId: corretor1.id, status: "novo" });
  await criarLead(c, { nome: "KPI novo sem corretor", corretorId: null, status: "novo" });
  await criarLead(c, {
    nome: "KPI aguardando atendimento c1",
    corretorId: corretor1.id,
    status: "aguardando_atendimento",
  });
  const lEmAtC2 = await criarLead(c, {
    nome: "KPI em atendimento c2",
    corretorId: corretor2.id,
    status: "em_atendimento",
  });
  const lQualC1 = await criarLead(c, {
    nome: "KPI qualificado legado c1",
    corretorId: corretor1.id,
    status: "qualificado", // status legado
  });
  await criarLead(c, { nome: "KPI agendado c2", corretorId: corretor2.id, status: "agendado" });
  await criarLead(c, {
    nome: "KPI visita c3",
    corretorId: corretor3.id,
    status: "visita_realizada",
  });
  await criarLead(c, {
    nome: "KPI proposta legado c3",
    corretorId: corretor3.id,
    status: "proposta_enviada", // status legado
  });
  const lRetC2 = await criarLead(c, {
    nome: "KPI aguardando retorno c2",
    corretorId: corretor2.id,
    status: "aguardando_retorno",
  });
  await criarLead(c, {
    nome: "KPI aguardando corretor",
    corretorId: null,
    status: "aguardando_corretor",
  });
  await criarLead(c, {
    nome: "KPI em atendimento c3",
    corretorId: corretor3.id,
    status: "em_atendimento",
  });

  // Fronteira de dia: 2026-07-18T02:30Z = 2026-07-17 23:30 em America/Sao_Paulo.
  lFronteira = await leadDireto({
    nome: "KPI fronteira de dia",
    corretorId: corretor1.id,
    status: "em_atendimento",
    createdAt: "2026-07-18T02:30:00Z",
  });

  // Lixeira e soft-delete:
  lLixNovo = await leadDireto({ nome: "KPI lixeira novo", corretorId: null, naLixeira: true });
  lLixEmAt = await leadDireto({
    nome: "KPI lixeira em atendimento",
    corretorId: corretor1.id,
    status: "em_atendimento",
    naLixeira: true,
  });
  lDeleted = await leadDireto({
    nome: "KPI soft-deletado",
    corretorId: corretor2.id,
    status: "em_atendimento",
    deletedAt: new Date().toISOString(),
  });

  // Terminais que não têm fluxo automatizável no seed (replica pula o guard):
  await leadDireto({
    nome: "KPI pos venda c1",
    corretorId: corretor1.id,
    status: "pos_venda",
    replica: true,
  });
  await leadDireto({
    nome: "KPI perdido c2",
    corretorId: corretor2.id,
    status: "perdido",
    replica: true,
  });
  await leadDireto({
    nome: "KPI perdido c3",
    corretorId: corretor3.id,
    status: "perdido",
    replica: true,
  });

  // Vendas via fluxo real (INSERT pendente pelo corretor + aprovar_venda gestor):
  const lVendaPend = await criarLead(c, {
    nome: "KPI analise credito venda pendente c1",
    corretorId: corretor1.id,
    status: "analise_credito",
  });
  await registrarVenda(corretor1, lVendaPend, 50000, "2026-07-15"); // fica pendente
  const lVendaC1 = await criarLead(c, {
    nome: "KPI venda aprovada c1",
    corretorId: corretor1.id,
    status: "analise_credito",
  });
  const v1 = await registrarVenda(corretor1, lVendaC1, 100000, "2026-07-10");
  await aprovarVenda(v1); // lead → contrato_fechado
  const lVendaC2 = await criarLead(c, {
    nome: "KPI venda aprovada c2",
    corretorId: corretor2.id,
    status: "analise_credito",
  });
  const v2 = await registrarVenda(corretor2, lVendaC2, 80000, "2026-07-12");
  await aprovarVenda(v2); // lead → contrato_fechado

  // Tarefas de follow-up vencida e futura (corretor1):
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.tarefas (titulo, tipo, status, lead_id, corretor_id, criado_por, data_vencimento)
     VALUES
       ('KPI follow-up vencido', 'follow_up', 'pendente', $1, $2, $2, now() - interval '2 days'),
       ('KPI follow-up futuro',  'follow_up', 'pendente', $3, $2, $2, now() + interval '2 days')`,
    [lQualC1, corretor1.id, lEmAtC2],
  );
  // Follow-ups direto no lead (vencido e futuro) p/ povoar os contadores derivados:
  await c.query(
    `UPDATE public.leads SET proximo_followup = now() - interval '1 day' WHERE id = $1`,
    [lRetC2],
  );
  await c.query(
    `UPDATE public.leads SET proximo_followup = now() + interval '1 day' WHERE id = $1`,
    [lEmAtC2],
  );

  // Janela SP cobrindo todo o seed (inclusive o dia dos bumps de aprovação):
  const datas = await c.query(`
    WITH d AS (
      SELECT GREATEST(
        (SELECT (max(created_at) AT TIME ZONE 'America/Sao_Paulo')::date FROM public.leads),
        (SELECT COALESCE(max(dia), '2026-07-01'::date) FROM public.atividades_diarias)
      ) AS hoje
    )
    SELECT hoje::text AS hoje, (hoje + 1)::text AS amanha FROM d
  `);
  METRICAS_FIM = datas.rows[0].hoje as string;
  DF_SP = `${datas.rows[0].amanha as string}T00:00:00-03:00`;
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

// ---------------------------------------------------------------------------
// Sanidade do seed: as referências SQL batem com o desenho do cenário
// ---------------------------------------------------------------------------

describe("sanidade do seed", () => {
  it("21 leads no total; 18 ativos; 12 no time A; 13 não-terminais; 3 em SLA", async () => {
    expect(await refCount(`true`)).toBe(21);
    expect(await refCount(ATIVO)).toBe(ATIVOS_TOTAL);
    expect(
      await refCount(
        `${ATIVO} AND corretor_id IN ('${corretor1.id}','${corretor2.id}','${gestorA.id}')`,
      ),
    ).toBe(TIME_A_ATIVOS);
    expect(await refCount(`${ATIVO} AND status::text NOT IN ${TERMINAIS}`)).toBe(NAO_TERMINAIS);
    expect(await refCount(`${ATIVO} AND status::text IN ('novo','aguardando_atendimento')`)).toBe(
      SLA_PENDENTES_REF,
    );
  });

  it("todos os 13 status do enum estão representados entre os leads ativos", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT count(DISTINCT status)::int AS n FROM public.leads WHERE ${ATIVO}`,
    );
    expect(r.rows[0].n).toBe(13);
  });

  it("vendas: 2 aprovadas (leads viraram contrato_fechado) e 1 pendente", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT status_venda::text AS s, count(*)::int AS n, sum(valor_venda)::float8 AS total
       FROM public.vendas GROUP BY 1 ORDER BY 1`,
    );
    expect(r.rows).toEqual([
      { s: "aprovada", n: 2, total: VGV_APROVADO },
      { s: "pendente", n: 1, total: 50000 },
    ]);
    expect(await refCount(`${ATIVO} AND status = 'contrato_fechado'`)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// pipeline_snapshot_v3 (e v2): soma == total e == referência
// ---------------------------------------------------------------------------

describe("pipeline_snapshot_v3: soma das etapas vs referência", () => {
  it("admin: soma das etapas == referência (ativos, todos os corretores) e cada etapa bate com o SQL de referência", async () => {
    const pipeline = await pipelineMap(admin.id);
    expect(somaEtapas(pipeline)).toBe(ATIVOS_TOTAL);

    await comoSuperuser(c);
    const ref = await c.query(
      `SELECT status::text AS status, count(*)::int AS n
       FROM public.leads WHERE ${ATIVO} GROUP BY 1`,
    );
    for (const row of ref.rows) {
      expect(pipeline.get(row.status), `etapa ${row.status}`).toBe(row.n);
    }
    // Etapas sem lead vêm zeradas (o enum inteiro é devolvido):
    const comLead = new Set(ref.rows.map((r) => r.status as string));
    for (const [etapa, n] of pipeline) {
      if (!comLead.has(etapa)) expect(n, `etapa vazia ${etapa}`).toBe(0);
    }
  });

  it("gestor: soma das etapas == referência da EQUIPE (carteira própria + corretores da equipe, sem leads órfãos)", async () => {
    const pipeline = await pipelineMap(gestorA.id);
    expect(somaEtapas(pipeline)).toBe(TIME_A_ATIVOS);
  });

  it("pipeline_snapshot_v2 e v3 contam igual por etapa (admin e gestor)", async () => {
    for (const usuario of [admin, gestorA]) {
      const v3 = await pipelineMap(usuario.id, "pipeline_snapshot_v3");
      const v2 = await pipelineMap(usuario.id, "pipeline_snapshot_v2");
      for (const [etapa, n] of v3) {
        expect(v2.get(etapa), `${usuario.papel} etapa ${etapa}`).toBe(n);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// leads_status_counts_v2 vs pipeline_snapshot_v3
// ---------------------------------------------------------------------------

describe("leads_status_counts_v2 vs pipeline_snapshot_v3", () => {
  it("leads_status_counts_v2 é internamente consistente: soma das linhas == __total__", async () => {
    for (const usuario of [admin, gestorA]) {
      const counts = await countsMap(usuario.id);
      expect(somaEtapas(counts), usuario.papel).toBe(counts.get("__total__"));
    }
  });

  it("admin: mesmos números por status nas duas RPCs e __total__ == soma do pipeline", async () => {
    const pipeline = await pipelineMap(admin.id);
    const counts = await countsMap(admin.id);
    for (const [etapa, n] of pipeline) {
      expect(counts.get(etapa) ?? 0, `status ${etapa}`).toBe(n);
    }
    expect(counts.get("__total__")).toBe(somaEtapas(pipeline));
  });

  // Corrigido na migration 20260719130000: leads_status_counts_v2 passou a
  // usar a MESMA régua de escopo do pipeline_snapshot_v3 (ve_carteira_completa
  // + corretores_do_gestor) — para gestor, o kanban e a lista respondem
  // "quantos leads tenho?" com o mesmo número (a equipe, não a visão global).
  it("gestor: __total__ da lista == soma do pipeline do MESMO gestor", async () => {
    const pipeline = await pipelineMap(gestorA.id);
    const counts = await countsMap(gestorA.id);
    expect(counts.get("__total__")).toBe(somaEtapas(pipeline));
  });

  it("gestor: equipe B e leads sem corretor ficam fora da lista E do kanban (mesma régua do RLS)", async () => {
    // A base tem 4 leads da equipe B e 2 sem corretor — nenhum deles pode
    // aparecer para o gestor da equipe A (igual RLS: lead órfão não é dele).
    const pipeline = await pipelineMap(gestorA.id);
    const counts = await countsMap(gestorA.id);
    const foraDaEquipe = await refCount(`${ATIVO} AND corretor_id = '${corretor3.id}'`);
    const semCorretor = await refCount(`${ATIVO} AND corretor_id IS NULL`);
    expect(foraDaEquipe).toBe(4);
    expect(semCorretor).toBe(2);
    expect(counts.get("__total__")).toBe(TIME_A_ATIVOS);
    expect(somaEtapas(pipeline)).toBe(TIME_A_ATIVOS);
  });

  // Corrigido na migration 20260719130000: leads_status_counts_v2 não esconde
  // mais os leads em status 'novo' da carteira do corretor — kanban, lista e
  // RLS (leads_select_carteira) mostram o mesmo conjunto.
  it("corretor: a lista mostra os MESMOS leads 'novo' que o kanban", async () => {
    const pipeline = await pipelineMap(corretor1.id);
    const counts = await countsMap(corretor1.id);
    expect(pipeline.get("novo")).toBe(1); // sanidade: o kanban mostra
    expect(counts.get("novo") ?? 0).toBe(pipeline.get("novo"));
  });

  it("corretor: RLS confirma que o lead 'novo' é visível na carteira (a lista é que o esconde)", async () => {
    await comoUsuario(c, corretor1.id);
    const r = await c.query(`SELECT id FROM public.leads WHERE id = $1`, [lNovoC1]);
    await comoSuperuser(c);
    expect(r.rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// leads_filtered_v2 (LISTA de Leads): mesmo escopo do kanban/contagens
// ---------------------------------------------------------------------------

// Regressão da migration 20260720120000: a RPC da LISTA (leads_filtered_v2)
// tinha ficado de fora da unificação de escopo de 20260719130000 — usava
// `_is_gestor OR ...`, então QUALQUER gestor via TODOS os leads da empresa,
// enquanto as contagens (leads_status_counts_v2) já eram por equipe. Agora a
// lista usa a MESMA régua (ve_carteira_completa + corretores_do_gestor).
describe("leads_filtered_v2 (lista) respeita o escopo de carteira/equipe", () => {
  it("admin: a lista traz todos os leads ativos (== pipeline/contagens)", async () => {
    const lista = await listaLeads(admin.id);
    expect(lista.ids).toHaveLength(ATIVOS_TOTAL);
    expect(lista.total).toBe(ATIVOS_TOTAL);
  });

  it("gestor: a lista traz só a EQUIPE e bate com a contagem __total__ e a soma do pipeline", async () => {
    const lista = await listaLeads(gestorA.id);
    const counts = await countsMap(gestorA.id);
    const pipeline = await pipelineMap(gestorA.id);
    expect(lista.ids).toHaveLength(TIME_A_ATIVOS);
    expect(lista.total).toBe(TIME_A_ATIVOS);
    expect(lista.total).toBe(counts.get("__total__"));
    expect(lista.total).toBe(somaEtapas(pipeline));
  });

  it("gestor: nenhum lead da equipe B nem lead sem corretor aparece na lista", async () => {
    const lista = await listaLeads(gestorA.id);
    expect(lista.corretores).not.toContain(null); // órfão não é do gestor
    expect(lista.corretores).not.toContain(corretor3.id); // equipe B
  });

  it("corretor: a lista traz só a própria carteira, INCLUSIVE o lead 'novo'", async () => {
    const lista = await listaLeads(corretor1.id);
    for (const cid of lista.corretores) expect(cid).toBe(corretor1.id);
    expect(lista.ids).toContain(lNovoC1);
  });
});

// ---------------------------------------------------------------------------
// dashboard_funil vs referência
// ---------------------------------------------------------------------------

describe("dashboard_funil vs referência (admin, sem período)", () => {
  it("'Novos' == total de leads ativos == soma do pipeline_snapshot_v3", async () => {
    const funil = await funilMap(admin.id, null, null);
    const pipeline = await pipelineMap(admin.id);
    expect(funil.get("Novos")).toBe(ATIVOS_TOTAL);
    expect(funil.get("Novos")).toBe(somaEtapas(pipeline));
  });

  // Corrigido na migration 20260719130000: 'Fechados' do funil passou a contar
  // contrato_fechado + pos_venda — negócio fechado que avançou para o
  // pós-venda não some mais da conversão final.
  it("'Fechados' conta também quem já avançou para pos_venda", async () => {
    const funil = await funilMap(admin.id, null, null);
    const refFechados = await refCount(
      `${ATIVO} AND status::text IN ('contrato_fechado','pos_venda')`,
    );
    expect(refFechados).toBe(3); // sanidade da referência
    expect(funil.get("Fechados")).toBe(refFechados);
  });

  // Corrigido na migration 20260719130000: as etapas cumulativas do funil
  // incluem o status legado 'proposta_enviada' (até 'Visitas') e 'pos_venda'
  // (todas) — nenhum lead ativo desaparece das etapas intermediárias.
  it("'Em atendimento' inclui os leads legados proposta_enviada (e pos_venda)", async () => {
    const funil = await funilMap(admin.id, null, null);
    const ref = await refCount(
      `${ATIVO} AND status::text IN
       ('aguardando_retorno','em_atendimento','qualificado','agendado',
        'visita_realizada','proposta_enviada','analise_credito','contrato_fechado','pos_venda')`,
    );
    expect(ref).toBe(12); // sanidade da referência
    expect(funil.get("Em atendimento")).toBe(ref);
  });
});

// ---------------------------------------------------------------------------
// dashboard_kpis vs referência e vs metricas_periodo_v2
// ---------------------------------------------------------------------------

describe("dashboard_kpis vs referência (admin)", () => {
  it("contagens por status do pipeline batem com pipeline_snapshot_v3", async () => {
    const k = await kpis(admin.id, null, null);
    const pipeline = await pipelineMap(admin.id);
    for (const status of [
      "novo",
      "aguardando_atendimento",
      "aguardando_retorno",
      "em_atendimento",
      "agendado",
      "visita_realizada",
      "analise_credito",
    ]) {
      expect(k.pipeline[status], `status ${status}`).toBe(pipeline.get(status));
    }
  });

  it("sem_corretor == referência (ativos não-terminais sem corretor)", async () => {
    const k = await kpis(admin.id, null, null);
    expect(k.pipeline.sem_corretor).toBe(
      await refCount(`${ATIVO} AND corretor_id IS NULL AND status::text NOT IN ${TERMINAIS}`),
    );
  });

  // Corrigido na migration 20260719130000: 'em_aberto' (e 'sem_corretor')
  // tratam pos_venda como TERMINAL — status NOT IN
  // ('contrato_fechado','perdido','pos_venda') — igual leads_com_sla e
  // gestao_metricas.
  it("'em_aberto' == leads ativos não-terminais de referência", async () => {
    const k = await kpis(admin.id, null, null);
    expect(k.pipeline.em_aberto).toBe(NAO_TERMINAIS);
  });

  it("periodo.leads_novos == metricas_periodo_v2.leads_recebidos == funil 'Novos' (mesma janela SP)", async () => {
    const k = await kpis(admin.id, DI_SP, DF_SP);
    const m = await metricasPeriodo(admin.id, METRICAS_INICIO, METRICAS_FIM);
    const funil = await funilMap(admin.id, DI_SP, DF_SP);
    expect(k.periodo.leads_novos).toBe(ATIVOS_TOTAL);
    expect(m.leads_recebidos).toBe(k.periodo.leads_novos);
    expect(funil.get("Novos")).toBe(k.periodo.leads_novos);
  });

  it("metricas_periodo_v2 conta vendas/vgv só de venda APROVADA (fonte consistente com aprovar_venda)", async () => {
    const m = await metricasPeriodo(admin.id, METRICAS_INICIO, METRICAS_FIM);
    expect(m.vendas).toBe(VENDAS_APROVADAS);
    expect(Number(m.vgv)).toBe(VGV_APROVADO);
    expect(m.fechados).toBe(2);
  });

  // Corrigido na migration 20260719130000: dashboard_atividade_periodo conta
  // como "venda" apenas status_venda='aprovada' (sem distrato) — venda
  // PENDENTE fica de fora, mesmo número do metricas_periodo_v2 em toda tela.
  it("periodo.vendas == vendas aprovadas (mesmo número do metricas_periodo_v2)", async () => {
    const k = await kpis(admin.id, DI_SP, DF_SP);
    expect(k.periodo.vendas).toBe(VENDAS_APROVADAS);
  });

  // Corrigido na migration 20260719130000: idem para o VGV — o valor da venda
  // pendente (50.000) não entra mais no VGV do dashboard.
  it("periodo.vgv == VGV aprovado (mesmo número do metricas_periodo_v2)", async () => {
    const k = await kpis(admin.id, DI_SP, DF_SP);
    expect(Number(k.periodo.vgv)).toBe(VGV_APROVADO);
  });
});

// ---------------------------------------------------------------------------
// leads_sla_pendentes vs leads_com_sla
// ---------------------------------------------------------------------------

describe("leads_sla_pendentes vs leads_com_sla (admin)", () => {
  it("mesma lista e mesmo sla_status para novo/aguardando_atendimento", async () => {
    await comoUsuario(c, admin.id);
    const pend = await c.query(
      `SELECT lead_id, status, sla_status FROM public.leads_sla_pendentes(NULL) ORDER BY lead_id`,
    );
    const fallback = await c.query(
      `SELECT lead_id, status, sla_status FROM public.leads_com_sla(NULL)
       WHERE status IN ('novo','aguardando_atendimento') ORDER BY lead_id`,
    );
    await comoSuperuser(c);
    expect(pend.rows).toEqual(fallback.rows);
    expect(pend.rows).toHaveLength(SLA_PENDENTES_REF);
  });

  it("leads_com_sla == referência de ativos não-terminais, sem lixeira/deletados/terminais", async () => {
    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT lead_id, status FROM public.leads_com_sla(NULL)`);
    await comoSuperuser(c);
    expect(r.rows).toHaveLength(NAO_TERMINAIS);
    const ids = new Set(r.rows.map((row) => row.lead_id as string));
    expect(ids.has(lLixNovo)).toBe(false);
    expect(ids.has(lLixEmAt)).toBe(false);
    expect(ids.has(lDeleted)).toBe(false);
    for (const row of r.rows) {
      expect(["contrato_fechado", "pos_venda", "perdido"]).not.toContain(row.status);
    }
  });

  it("leads_sla_pendentes não conta o lead 'novo' que está na lixeira", async () => {
    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT lead_id FROM public.leads_sla_pendentes(NULL)`);
    await comoSuperuser(c);
    expect(r.rows.map((row) => row.lead_id)).not.toContain(lLixNovo);
  });
});

// ---------------------------------------------------------------------------
// gestao_metricas.aderencia vs leads ativos de referência
// ---------------------------------------------------------------------------

describe("gestao_metricas.aderencia vs leads ativos de referência", () => {
  async function aderencia(userId: string) {
    await comoUsuario(c, userId);
    const r = await c.query(
      `SELECT public.gestao_metricas($1::timestamptz, $2::timestamptz, 'criacao')->'aderencia' AS a`,
      [DI_SP, DF_SP],
    );
    await comoSuperuser(c);
    return r.rows[0].a as { total: number; sem_corretor: number };
  }

  // Corrigido na migration 20260719130000: o bloco 'aderencia' ganhou o filtro
  // deleted_at IS NULL — lead soft-deletado não conta mais como lead ativo da
  // operação (mesmo número do leads_com_sla).
  it("aderencia.total == contagem de leads ativos não-terminais (admin)", async () => {
    const a = await aderencia(admin.id);
    expect(a.total).toBe(NAO_TERMINAIS);
  });

  it("o lead soft-deletado existe mas fica fora da aderência (== leads_com_sla)", async () => {
    const a = await aderencia(admin.id);
    const deletadosForaDaLixeira = await refCount(
      `deleted_at IS NOT NULL AND na_lixeira = false AND status::text NOT IN ${TERMINAIS}`,
    );
    expect(deletadosForaDaLixeira).toBe(1); // o cenário de soft-delete existe
    expect(a.total - NAO_TERMINAIS).toBe(0); // e não infla a aderência
    // E bate com leads_com_sla, que responde a mesma pergunta:
    await comoUsuario(c, admin.id);
    const sla = await c.query(`SELECT count(*)::int AS n FROM public.leads_com_sla(NULL)`);
    await comoSuperuser(c);
    expect(a.total).toBe(sla.rows[0].n);
  });
});

// ---------------------------------------------------------------------------
// Timezone: fronteira de dia America/Sao_Paulo
// ---------------------------------------------------------------------------

describe("timezone: lead criado 2026-07-18T02:30Z (= 17/07 23:30 em SP)", () => {
  it("metricas_periodo_v2 atribui o lead ao dia 17/07 (SP), não ao 18/07", async () => {
    const dia17 = await metricasPeriodo(admin.id, "2026-07-17", "2026-07-17");
    const dia18 = await metricasPeriodo(admin.id, "2026-07-18", "2026-07-18");
    expect(dia17.leads_recebidos).toBe(1);
    expect(dia18.leads_recebidos).toBe(0);
  });

  it("dashboard_serie_diaria bucketiza em SP: 17/07 → 1 lead, 18/07 → 0", async () => {
    await comoUsuario(c, admin.id);
    const r = await c.query(
      `SELECT dia::text AS dia, leads::int AS leads
       FROM public.dashboard_serie_diaria(
         '2026-07-16T00:00:00-03:00'::timestamptz, '2026-07-18T23:59:59-03:00'::timestamptz,
         NULL, 'criacao')`,
    );
    await comoSuperuser(c);
    const porDia = new Map(r.rows.map((row) => [row.dia as string, row.leads as number]));
    expect(porDia.get("2026-07-17")).toBe(1);
    expect(porDia.get("2026-07-18")).toBe(0);
  });

  it("dashboard_kpis com janela ALINHADA a SP concorda com metricas_periodo_v2 (dia 17 → 1 lead)", async () => {
    const k = await kpis(admin.id, "2026-07-17T00:00:00-03:00", "2026-07-18T00:00:00-03:00");
    expect(k.periodo.leads_novos).toBe(1);
    const funil = await funilMap(
      admin.id,
      "2026-07-17T00:00:00-03:00",
      "2026-07-18T00:00:00-03:00",
    );
    expect(funil.get("Novos")).toBe(1);
  });

  it("DIVERGÊNCIA documentada: com janela UTC do dia 18, dashboard_kpis conta o lead no 18/07 enquanto metricas_periodo_v2 dá 0", async () => {
    // dashboard_kpis/dashboard_funil comparam a janela CRUA do chamador com
    // created_at; quem passar a meia-noite UTC (em vez de meia-noite SP)
    // desloca o lead de fronteira para o dia seguinte. As RPCs de dia
    // (metricas_periodo_v2, dashboard_serie_diaria) fixam America/Sao_Paulo.
    // "Quantos leads entraram no dia 18?" → 1 numa tela, 0 na outra.
    const k = await kpis(admin.id, "2026-07-18T00:00:00Z", "2026-07-19T00:00:00Z");
    expect(k.periodo.leads_novos).toBe(1); // comportamento atual (janela crua)
    const m = await metricasPeriodo(admin.id, "2026-07-18", "2026-07-18");
    expect(m.leads_recebidos).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Lixeira e soft-delete fora das contagens ativas
// ---------------------------------------------------------------------------

describe("lixeira e deleted_at ficam fora das contagens ativas", () => {
  it("os totais ativos de pipeline/lista/funil/kpis excluem os 3 leads de lixeira/deletado", async () => {
    // 21 leads no banco, 18 ativos: todas as visões "ativas" do admin batem em 18.
    const pipeline = await pipelineMap(admin.id);
    const counts = await countsMap(admin.id);
    const funil = await funilMap(admin.id, null, null);
    const k = await kpis(admin.id, null, null);
    expect(somaEtapas(pipeline)).toBe(ATIVOS_TOTAL);
    expect(counts.get("__total__")).toBe(ATIVOS_TOTAL);
    expect(funil.get("Novos")).toBe(ATIVOS_TOTAL);
    // em_aberto + terminais == 18 (conferência indireta; desde a migration
    // 20260719130000 'em_aberto' exclui também pos_venda, que é terminal):
    expect(
      k.pipeline.em_aberto + (await refCount(`${ATIVO} AND status::text IN ${TERMINAIS}`)),
    ).toBe(ATIVOS_TOTAL);
  });

  it("leads_status_counts_v2(_na_lixeira => true) devolve exatamente os 2 leads da lixeira", async () => {
    const lixeira = await countsMap(admin.id, true);
    expect(lixeira.get("__total__")).toBe(2);
    expect(lixeira.get("novo")).toBe(1);
    expect(lixeira.get("em_atendimento")).toBe(1);
  });

  it("o lead soft-deletado não aparece em nenhuma contagem ativa (inclusive gestao_metricas, desde 20260719130000)", async () => {
    // Referência: com deleted_at preenchido o lead sai de pipeline, lista, funil,
    // kpis e SLA — os totais acima já provam (18, não 19). Conferência direta:
    await comoUsuario(c, admin.id);
    const sla = await c.query(`SELECT lead_id FROM public.leads_com_sla(NULL)`);
    await comoSuperuser(c);
    expect(sla.rows.map((r) => r.lead_id)).not.toContain(lDeleted);
    expect(await refCount(`${ATIVO}`)).toBe(ATIVOS_TOTAL);
  });
});
