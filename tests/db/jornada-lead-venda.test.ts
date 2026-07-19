/**
 * JORNADAS COMPLETAS DO LEAD — teste de integração no nível onde mora a
 * autoridade (o banco), encadeando as RPCs reais como o app faz.
 *
 * Assinaturas/regras descobertas no banco vivo (pg_get_functiondef):
 *  - triar_e_distribuir_lead(_lead_id uuid, _gatilho text) RETURNS jsonb —
 *    gate admin/gestor quando auth.uid() não é NULL; origem 'facebook' roteia
 *    para a roleta 'plantao' (distribuicao_config), critério
 *    'automatica_presenca' (pct trabalhado ≥ 90 — carteira vazia passa).
 *  - transicionar_lead(p_lead_id, p_novo_status, p_motivo, p_proxima_acao,
 *    p_proximo_followup, p_motivo_categoria) RETURNS leads. REGRA DESCOBERTA
 *    para 'agendado' (e demais status ativos): NÃO exige follow-up futuro
 *    específico — exige "próxima ação OU follow-up", aceitando o valor JÁ
 *    persistido no lead (COALESCE com p_*). p_proximo_followup, quando
 *    passado, precisa ser futuro.
 *  - transferir_leads(_ids uuid[], _corretor uuid) RETURNS integer — gestor/
 *    admin/superintendente; renova data_distribuicao + timestamp_recebimento,
 *    zera tentativas_redistribuicao, guarda corretor_anterior_id, reassina
 *    tarefas/agendamentos abertos e loga 'transferencia_manual'.
 *  - marcar_lead_perdido_v2(_lead_id, _categoria, _detalhe) RETURNS uuid —
 *    transiciona para 'perdido' via transicionar_lead e depois tenta
 *    REDISTRIBUIR (excluindo corretores_que_tentaram); sem elegível, o lead
 *    fica perdido, corretor_id = NULL e **na_lixeira = true**.
 *  - aprovar_venda(p_venda_id, p_decisao, p_motivo) RETURNS vendas — move o
 *    lead para contrato_fechado, gera comissões + ledgers, e o trigger
 *    trg_leads_cancelar_followups cancela as tarefas de contato abertas.
 *
 * BUG descoberto (Jornada 2): o fluxo padrão de perda (marcar_lead_perdido_v2
 * sem corretor elegível para repasse) manda o lead para a lixeira
 * (na_lixeira = true) — e TODOS os medidores de perda (dashboard_kpis →
 * dashboard_atividade_periodo 'perdidos', dashboard_motivos_perda) filtram
 * na_lixeira = false. Resultado: o lead perdido pelo fluxo oficial some das
 * métricas de perda no mesmo instante em que é perdido. (dashboard_funil nem
 * possui etapa de perdidos — só Novos→Fechados.)
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

let equipeId: string;
let projetoId: string;
let gestor: UsuarioTeste;
let superintendente: UsuarioTeste;
let corretorJ1: UsuarioTeste; // dono da jornada 1 (venda)
let corretorJ2: UsuarioTeste; // dono da jornada 2 (perda)
let corretorA: UsuarioTeste; // jornada 3: origem da transferência
let corretorB: UsuarioTeste; // jornada 3: destino da transferência

const VALOR_VENDA = "500000.00";
const PCT = { corretor: "1.50", gerente: "0.50", superintendente: "0.10" };

beforeAll(async () => {
  await c.connect();
  await limparDados(c);

  equipeId = await criarEquipe(c);
  gestor = await criarUsuario(c, { nome: "Gina Gestora", papel: "gestor", equipeId });
  superintendente = await criarUsuario(c, { nome: "Super Único", papel: "superintendente" });
  corretorJ1 = await criarUsuario(c, { nome: "Vito Vendedor", papel: "corretor", equipeId });
  corretorJ2 = await criarUsuario(c, { nome: "Perla Perdedora", papel: "corretor", equipeId });
  corretorA = await criarUsuario(c, { nome: "Ana Origem", papel: "corretor", equipeId });
  corretorB = await criarUsuario(c, { nome: "Beto Destino", papel: "corretor", equipeId });

  await comoSuperuser(c);
  // Gerente das comissões = gestor_id da equipe do corretor.
  await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gestor.id, equipeId]);
  // Elegibilidade da roleta exige telefone no perfil.
  await c.query(
    `UPDATE public.profiles SET telefone = '119999000' || CASE id
        WHEN $1::uuid THEN '1' ELSE '2' END
      WHERE id IN ($1::uuid, $2::uuid)`,
    [corretorJ1.id, corretorJ2.id],
  );
  // (criarProjeto do helpers está defasado: projetos.slug é NOT NULL sem
  // default. limparDados preserva projetos entre execuções → upsert por slug.)
  const proj = await c.query(
    `INSERT INTO public.projetos (nome, slug) VALUES ('Residencial Jornada', 'residencial-jornada')
     ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome
     RETURNING id`,
  );
  projetoId = proj.rows[0].id as string;
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

// ---------------------------------------------------------------------------
// Helpers locais
// ---------------------------------------------------------------------------

function daquiDias(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

/** Chama transicionar_lead com a assinatura real (6 parâmetros posicionais). */
function transicionar(
  leadId: string,
  novoStatus: string,
  opts: {
    motivo?: string | null;
    proximaAcao?: string | null;
    followup?: Date | null;
    categoria?: string | null;
  } = {},
) {
  return c.query(
    `SELECT (t.r).id, (t.r).status::text AS status, (t.r).proxima_acao,
            (t.r).proximo_followup, (t.r).motivo_perdido, (t.r).motivo_perda_categoria
     FROM (SELECT public.transicionar_lead($1, $2::public.lead_status, $3, $4, $5, $6) AS r) t`,
    [
      leadId,
      novoStatus,
      opts.motivo ?? null,
      opts.proximaAcao ?? null,
      opts.followup ?? null,
      opts.categoria ?? null,
    ],
  );
}

/** INSERT em leads exatamente como o intake faz: sem corretor, origem real. */
async function leadViaIntake(nome: string, telefone: string): Promise<string> {
  await comoSuperuser(c); // proxy do contexto de serviço (edge function/webhook)
  const r = await c.query(
    `INSERT INTO public.leads (nome, telefone, origem, projeto_id)
     VALUES ($1, $2, 'facebook'::public.lead_origem, $3)
     RETURNING id, status::text AS status, corretor_id`,
    [nome, telefone, projetoId],
  );
  expect(r.rows[0].status).toBe("novo");
  expect(r.rows[0].corretor_id).toBeNull();
  return r.rows[0].id as string;
}

/** Fotografia do lead fora do RLS. */
async function leadRow(leadId: string) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT status::text AS status, corretor_id, corretor_anterior_id, projeto_id,
            proxima_acao, proximo_followup, data_distribuicao, timestamp_recebimento,
            motivo_perdido, motivo_perda_categoria, na_lixeira, ultima_interacao,
            tentativas_redistribuicao
       FROM public.leads WHERE id = $1`,
    [leadId],
  );
  return r.rows[0];
}

async function statusTarefa(tarefaId: string): Promise<string> {
  await comoSuperuser(c);
  const r = await c.query(`SELECT status::text AS s FROM public.tarefas WHERE id = $1`, [tarefaId]);
  return r.rows[0].s as string;
}

/** Cria tarefa autenticado como o corretor dono (caminho RLS real do app). */
async function criarTarefaComoCorretor(
  corretor: UsuarioTeste,
  leadId: string,
  vencimento: Date,
  tipo = "follow_up",
): Promise<string> {
  await comoUsuario(c, corretor.id);
  const r = await c.query(
    `INSERT INTO public.tarefas (titulo, tipo, status, lead_id, corretor_id, criado_por, data_vencimento)
     VALUES ($1, $2::public.tarefa_tipo, 'pendente', $3, $4, $4, $5)
     RETURNING id`,
    [`Tarefa ${tipo}`, tipo, leadId, corretor.id, vencimento],
  );
  return r.rows[0].id as string;
}

// ---------------------------------------------------------------------------
// JORNADA 1 — do lead novo (intake) até a venda aprovada
// ---------------------------------------------------------------------------

describe("JORNADA 1 — lead do intake até contrato_fechado via aprovar_venda", () => {
  let leadId: string;
  let vendaId: string;
  let tarefaFollowup1: string; // concluída no meio da jornada
  let tarefaFollowup2: string; // cancelada pela aprovação da venda
  const vencFollowup1 = daquiDias(1);
  const followupAgendamento = daquiDias(2);

  it("1. lead entra pelo intake: status novo, sem corretor, com projeto", async () => {
    leadId = await leadViaIntake("Cliente Jornada 1", "11977770001");
    const lead = await leadRow(leadId);
    expect(lead.status).toBe("novo");
    expect(lead.corretor_id).toBeNull();
    expect(lead.projeto_id).toBe(projetoId);
  });

  it("2. gestor distribui (triar_e_distribuir_lead): corretor atribuído e distribution_log registrado", async () => {
    // Monta a roleta 'plantao' (destino da origem facebook) com só o corretor J1.
    await comoUsuario(c, gestor.id);
    await c.query(`SELECT public.gerenciar_participante_roleta('plantao', $1::uuid, 'incluir')`, [
      corretorJ1.id,
    ]);
    await comoUsuario(c, corretorJ1.id);
    await c.query(`SELECT public.marcar_presenca(true)`);

    await comoUsuario(c, gestor.id);
    const r = await c.query(
      `SELECT public.triar_e_distribuir_lead($1::uuid, 'jornada1') AS res`,
      [leadId],
    );
    const res = r.rows[0].res as Record<string, unknown>;
    expect(res.ok).toBe(true);
    expect(res.corretor_id).toBe(corretorJ1.id);
    expect(res.roleta).toBe("plantao");

    const lead = await leadRow(leadId);
    expect(lead.status).toBe("aguardando_atendimento");
    expect(lead.corretor_id).toBe(corretorJ1.id);
    expect(lead.data_distribuicao).not.toBeNull();
    expect(lead.timestamp_recebimento).not.toBeNull();

    const log = await c.query(
      `SELECT corretor_id, tipo::text AS tipo, roleta_slug, resultado, distribuido_por_id
         FROM public.distribution_log WHERE lead_id = $1`,
      [leadId],
    );
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]).toMatchObject({
      corretor_id: corretorJ1.id,
      tipo: "automatica",
      roleta_slug: "plantao",
      resultado: "sucesso",
      distribuido_por_id: gestor.id,
    });
  });

  it("3. corretor inicia atendimento: em_atendimento com próxima ação persistida", async () => {
    await comoUsuario(c, corretorJ1.id);
    const r = await transicionar(leadId, "em_atendimento", {
      proximaAcao: "Ligar e qualificar o cliente",
    });
    expect(r.rows[0].status).toBe("em_atendimento");
    expect(r.rows[0].proxima_acao).toBe("Ligar e qualificar o cliente");

    const lead = await leadRow(leadId);
    expect(lead.status).toBe("em_atendimento");
    expect(lead.proxima_acao).toBe("Ligar e qualificar o cliente");
  });

  it("4. follow-up criado como o app (INSERT em tarefas pelo corretor) espelha em leads.proximo_followup", async () => {
    tarefaFollowup1 = await criarTarefaComoCorretor(corretorJ1, leadId, vencFollowup1);
    const lead = await leadRow(leadId);
    expect((lead.proximo_followup as Date)?.getTime()).toBe(vencFollowup1.getTime());
  });

  it("5. follow-up concluído: espelho limpa (proximo_followup NULL), próxima ação intacta", async () => {
    await comoUsuario(c, corretorJ1.id);
    const upd = await c.query(
      `UPDATE public.tarefas SET status = 'concluida', data_conclusao = now() WHERE id = $1`,
      [tarefaFollowup1],
    );
    expect(upd.rowCount).toBe(1);

    const lead = await leadRow(leadId);
    expect(lead.proximo_followup).toBeNull();
    expect(lead.proxima_acao).toBe("Ligar e qualificar o cliente");
  });

  it("6. agendamento criado + transicionar_lead -> agendado (regra: próxima ação OU follow-up; follow-up futuro persiste)", async () => {
    await comoUsuario(c, corretorJ1.id);
    const ag = await c.query(
      `INSERT INTO public.agendamentos
         (lead_id, corretor_id, criado_por_id, tipo, titulo, data_inicio, data_fim)
       VALUES ($1, $2, $2, 'visita', 'Visita ao decorado', $3, $4)
       RETURNING id, status::text AS status`,
      [leadId, corretorJ1.id, daquiDias(2), new Date(daquiDias(2).getTime() + 60 * 60 * 1000)],
    );
    expect(ag.rows[0].status).toBe("agendado");

    // Regra descoberta: 'agendado' não exige follow-up futuro obrigatório —
    // exige próxima ação OU follow-up (o já persistido no lead conta).
    // Passamos um follow-up futuro explícito e afirmamos que persiste.
    const r = await transicionar(leadId, "agendado", {
      proximaAcao: "Confirmar visita D-1",
      followup: followupAgendamento,
    });
    expect(r.rows[0].status).toBe("agendado");

    const lead = await leadRow(leadId);
    expect(lead.status).toBe("agendado");
    expect(lead.proxima_acao).toBe("Confirmar visita D-1");
    expect((lead.proximo_followup as Date)?.getTime()).toBe(followupAgendamento.getTime());
  });

  it("7. visita realizada: transicionar_lead -> visita_realizada (herda ação/follow-up do lead)", async () => {
    await comoUsuario(c, corretorJ1.id);
    const r = await transicionar(leadId, "visita_realizada", {
      proximaAcao: "Enviar documentação para análise",
    });
    expect(r.rows[0].status).toBe("visita_realizada");
    expect((await leadRow(leadId)).status).toBe("visita_realizada");
  });

  it("8. análise de crédito: transicionar_lead -> analise_credito", async () => {
    await comoUsuario(c, corretorJ1.id);
    const r = await transicionar(leadId, "analise_credito", {
      proximaAcao: "Acompanhar retorno do banco",
    });
    expect(r.rows[0].status).toBe("analise_credito");
    expect((await leadRow(leadId)).status).toBe("analise_credito");
  });

  it("9. corretor registra a venda pendente (INSERT em vendas via RLS); lead segue em analise_credito", async () => {
    await comoUsuario(c, corretorJ1.id);
    const r = await c.query(
      `INSERT INTO public.vendas
         (lead_id, corretor_id, criado_por_id, valor_venda, data_assinatura,
          percentual_corretor, percentual_gerente, percentual_superintendente, status_venda)
       VALUES ($1, $2, $2, $3, current_date, $4, $5, $6, 'pendente'::public.status_venda)
       RETURNING id, status_venda::text AS status_venda`,
      [leadId, corretorJ1.id, VALOR_VENDA, PCT.corretor, PCT.gerente, PCT.superintendente],
    );
    vendaId = r.rows[0].id as string;
    expect(r.rows[0].status_venda).toBe("pendente");
    // Registrar a venda NÃO fecha o lead — só a aprovação fecha.
    expect((await leadRow(leadId)).status).toBe("analise_credito");
  });

  it("10. gestor aprova: lead fecha AUTOMATICAMENTE, comissões + ledgers gerados, follow-up pendente cancelado", async () => {
    // Follow-up pendente às vésperas da aprovação — deve ser cancelado por ela.
    tarefaFollowup2 = await criarTarefaComoCorretor(corretorJ1, leadId, daquiDias(3));
    expect((await leadRow(leadId)).proximo_followup).not.toBeNull();

    await comoUsuario(c, gestor.id);
    const r = await c.query(
      `SELECT (t.r).status_venda::text AS status_venda, (t.r).aprovado_por, (t.r).aprovado_em
       FROM (SELECT public.aprovar_venda($1, 'aprovada'::public.status_venda, NULL) AS r) t`,
      [vendaId],
    );
    expect(r.rows[0].status_venda).toBe("aprovada");
    expect(r.rows[0].aprovado_por).toBe(gestor.id);
    expect(r.rows[0].aprovado_em).not.toBeNull();

    // Lead fechou automaticamente, limpando ação e follow-up.
    const lead = await leadRow(leadId);
    expect(lead.status).toBe("contrato_fechado");
    expect(lead.proxima_acao).toBeNull();
    expect(lead.proximo_followup).toBeNull();

    // Follow-up pendente foi cancelado pelo fechamento.
    expect(await statusTarefa(tarefaFollowup2)).toBe("cancelada");
    // O concluído lá atrás não é tocado.
    expect(await statusTarefa(tarefaFollowup1)).toBe("concluida");

    // Comissões: corretor + gerente (gestor da equipe) + superintendente.
    await comoSuperuser(c);
    const comissoes = await c.query(
      `SELECT tipo, beneficiario_id, valor_comissao::text AS valor
         FROM public.comissoes WHERE venda_id = $1 ORDER BY tipo`,
      [vendaId],
    );
    expect(comissoes.rows).toHaveLength(3);
    const porTipo = Object.fromEntries(comissoes.rows.map((row) => [row.tipo as string, row]));
    expect(porTipo.corretor).toMatchObject({ beneficiario_id: corretorJ1.id, valor: "7500.00" });
    expect(porTipo.gerente).toMatchObject({ beneficiario_id: gestor.id, valor: "2500.00" });
    expect(porTipo.superintendente).toMatchObject({
      beneficiario_id: superintendente.id,
      valor: "500.00",
    });

    // Ledgers escritos (1 crédito por comissão + 1 crédito de métricas).
    const ledgers = await c.query(
      `SELECT
         (SELECT count(*)::int FROM public.comissao_ledger
           WHERE venda_id = $1 AND evento = 'credito') AS creditos,
         (SELECT count(*)::int FROM public.venda_metricas_ledger
           WHERE venda_id = $1 AND evento = 'credito') AS metricas`,
      [vendaId],
    );
    expect(ledgers.rows[0]).toEqual({ creditos: 3, metricas: 1 });

    const evento = await c.query(
      `SELECT count(*)::int AS n FROM public.lead_eventos
        WHERE lead_id = $1 AND tipo = 'venda_aprovada'`,
      [leadId],
    );
    expect(evento.rows[0].n).toBe(1);
  });

  it("11. contagens finais: trilha completa de eventos/transições e visões refletem o contrato_fechado", async () => {
    await comoSuperuser(c);

    // Trilha de transições — a jornada inteira, na ordem.
    const trans = await c.query(
      `SELECT de_status::text AS de, para_status::text AS para
         FROM public.lead_status_transitions WHERE lead_id = $1 ORDER BY created_at`,
      [leadId],
    );
    expect(trans.rows).toEqual([
      { de: "novo", para: "aguardando_atendimento" },
      { de: "aguardando_atendimento", para: "em_atendimento" },
      { de: "em_atendimento", para: "agendado" },
      { de: "agendado", para: "visita_realizada" },
      { de: "visita_realizada", para: "analise_credito" },
      { de: "analise_credito", para: "contrato_fechado" },
    ]);

    // Trilha de lead_eventos: 4 transições via RPC + 1 venda_aprovada.
    // (A atribuição inicial novo->aguardando_atendimento é do motor de
    // distribuição, que loga em distribution_log, não em lead_eventos; o
    // fechamento pela venda gera 'venda_aprovada', não 'transicao_lead'.)
    const eventos = await c.query(
      `SELECT tipo, payload->>'de_status' AS de, payload->>'para_status' AS para
         FROM public.lead_eventos WHERE lead_id = $1 ORDER BY created_at`,
      [leadId],
    );
    expect(eventos.rows).toEqual([
      { tipo: "transicao_lead", de: "aguardando_atendimento", para: "em_atendimento" },
      { tipo: "transicao_lead", de: "em_atendimento", para: "agendado" },
      { tipo: "transicao_lead", de: "agendado", para: "visita_realizada" },
      { tipo: "transicao_lead", de: "visita_realizada", para: "analise_credito" },
      { tipo: "venda_aprovada", de: null, para: null },
    ]);

    // Cada transição também vira uma interação 'mudanca_status' no histórico.
    const interacoes = await c.query(
      `SELECT count(*)::int AS n FROM public.interacoes
        WHERE lead_id = $1 AND tipo = 'mudanca_status'`,
      [leadId],
    );
    expect(interacoes.rows[0].n).toBe(6);

    // pipeline_snapshot_v3 (gestor): o único lead do sistema está em
    // contrato_fechado, com VGV = valor da venda aprovada.
    await comoUsuario(c, gestor.id);
    const pipeline = await c.query(`SELECT * FROM public.pipeline_snapshot_v3()`);
    const porEtapa = Object.fromEntries(
      pipeline.rows.map((row) => [row.etapa as string, row]),
    );
    expect(Number(porEtapa.contrato_fechado.quantidade)).toBe(1);
    expect(Number(porEtapa.contrato_fechado.vgv)).toBe(Number(VALOR_VENDA));
    expect(Number(porEtapa.contrato_fechado.followups_vencidos)).toBe(0);
    for (const [etapa, row] of Object.entries(porEtapa)) {
      if (etapa !== "contrato_fechado") {
        expect(Number((row as { quantidade: unknown }).quantidade), `etapa ${etapa}`).toBe(0);
      }
    }

    // leads_status_counts_v2 (gestor): 1 em contrato_fechado, total 1.
    const counts = await c.query(`SELECT * FROM public.leads_status_counts_v2()`);
    const porStatus = Object.fromEntries(
      counts.rows.map((row) => [row.status as string, Number(row.quantidade)]),
    );
    expect(porStatus.contrato_fechado).toBe(1);
    expect(porStatus.__total__).toBe(1);

    // dashboard_funil (gestor): funil cumulativo — o lead fechado conta em
    // TODAS as etapas do funil (Novos..Fechados). Não existe etapa de perdidos.
    const funil = await c.query(`SELECT etapa, quantidade FROM public.dashboard_funil()`);
    for (const row of funil.rows) {
      expect(Number(row.quantidade), `funil etapa ${row.etapa}`).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// JORNADA 2 — lead sem resposta: tentativas, follow-up vencido e perda
// ---------------------------------------------------------------------------

describe("JORNADA 2 — lead distribuído que não responde até marcar_lead_perdido_v2", () => {
  let leadId: string;
  let tarefaVencida: string;

  it("1. lead facebook distribuído para o corretor J2 (troca de participante na roleta plantao)", async () => {
    // J1 sai da roleta; J2 entra e marca presença — o repasse na perda (mais
    // adiante) não terá NINGUÉM elegível além de quem já tentou.
    await comoUsuario(c, gestor.id);
    await c.query(`SELECT public.gerenciar_participante_roleta('plantao', $1::uuid, 'remover')`, [
      corretorJ1.id,
    ]);
    await c.query(`SELECT public.gerenciar_participante_roleta('plantao', $1::uuid, 'incluir')`, [
      corretorJ2.id,
    ]);
    await comoUsuario(c, corretorJ2.id);
    await c.query(`SELECT public.marcar_presenca(true)`);

    leadId = await leadViaIntake("Cliente Jornada 2", "11977770002");
    await comoUsuario(c, gestor.id);
    const r = await c.query(
      `SELECT public.triar_e_distribuir_lead($1::uuid, 'jornada2') AS res`,
      [leadId],
    );
    expect(r.rows[0].res.ok).toBe(true);
    expect(r.rows[0].res.corretor_id).toBe(corretorJ2.id);

    const lead = await leadRow(leadId);
    expect(lead.status).toBe("aguardando_atendimento");
    expect(lead.corretor_id).toBe(corretorJ2.id);
  });

  it("2. tentativas de contato registradas em interacoes atualizam ultima_interacao do lead", async () => {
    await comoUsuario(c, corretorJ2.id);
    await transicionar(leadId, "em_atendimento", { proximaAcao: "Tentar contato" });

    await c.query(
      `INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, conteudo)
       VALUES ($1, $2, 'ligacao'::public.interacao_tipo, 'saida'::public.interacao_direcao, 'Ligou, caixa postal'),
              ($1, $2, 'whatsapp'::public.interacao_tipo, 'saida'::public.interacao_direcao, 'Mensagem enviada, sem resposta')`,
      [leadId, corretorJ2.id],
    );

    await comoSuperuser(c);
    const tentativas = await c.query(
      `SELECT count(*)::int AS n FROM public.interacoes
        WHERE lead_id = $1 AND tipo IN ('ligacao','whatsapp') AND autor_id = $2`,
      [leadId, corretorJ2.id],
    );
    expect(tentativas.rows[0].n).toBe(2);

    const lead = await leadRow(leadId);
    expect(lead.ultima_interacao).not.toBeNull();
    expect(Date.now() - (lead.ultima_interacao as Date).getTime()).toBeLessThan(60_000);
  });

  it("3. follow-up vencido espelha no lead e aparece em pipeline_snapshot_v3.followups_vencidos", async () => {
    const ontem = daquiDias(-1);
    tarefaVencida = await criarTarefaComoCorretor(corretorJ2, leadId, ontem);

    const lead = await leadRow(leadId);
    expect((lead.proximo_followup as Date)?.getTime()).toBe(ontem.getTime());

    await comoUsuario(c, gestor.id);
    const pipeline = await c.query(`SELECT * FROM public.pipeline_snapshot_v3()`);
    const emAtendimento = pipeline.rows.find((row) => row.etapa === "em_atendimento");
    expect(Number(emAtendimento.quantidade)).toBe(1);
    expect(Number(emAtendimento.followups_vencidos)).toBe(1);
  });

  it("4. marcar_lead_perdido_v2: perdido com motivo/categoria, tarefas de contato canceladas, follow-up limpo", async () => {
    await comoUsuario(c, corretorJ2.id);
    await c.query(
      `SELECT public.marcar_lead_perdido_v2($1, 'sem_contato', 'Cliente não respondeu após 5 tentativas')`,
      [leadId],
    );

    const lead = await leadRow(leadId);
    expect(lead.status).toBe("perdido");
    expect(lead.motivo_perdido).toBe("Cliente não respondeu após 5 tentativas");
    expect(lead.motivo_perda_categoria).toBe("sem_contato");
    expect(lead.proximo_followup).toBeNull();
    expect(lead.proxima_acao).toBeNull();
    // Comportamento observado do repasse sem elegível (J2 já tentou e é o único
    // participante): o lead sai da carteira e vai para a lixeira.
    expect(lead.corretor_id).toBeNull();
    expect(lead.na_lixeira).toBe(true);

    // Follow-up vencido (tipo de contato) cancelado pelo fechamento da perda.
    expect(await statusTarefa(tarefaVencida)).toBe("cancelada");

    // Trilha persistida da perda.
    await comoSuperuser(c);
    const trans = await c.query(
      `SELECT de_status::text AS de, para_status::text AS para, alterado_por
         FROM public.lead_status_transitions
        WHERE lead_id = $1 AND para_status = 'perdido'`,
      [leadId],
    );
    expect(trans.rows).toEqual([
      { de: "em_atendimento", para: "perdido", alterado_por: corretorJ2.id },
    ]);
    const evento = await c.query(
      `SELECT payload->>'motivo_categoria' AS categoria FROM public.lead_eventos
        WHERE lead_id = $1 AND tipo = 'transicao_lead' AND payload->>'para_status' = 'perdido'`,
      [leadId],
    );
    expect(evento.rows).toHaveLength(1);
    expect(evento.rows[0].categoria).toBe("sem_contato");

    // O desfecho "sem corretor disponível" fica auditado no distribution_log.
    const log = await c.query(
      `SELECT count(*)::int AS n FROM public.distribution_log
        WHERE lead_id = $1 AND regra_aplicada = 'lead_perdido'`,
      [leadId],
    );
    expect(log.rows[0].n).toBe(1);
  });

  // BUG descoberto: marcar_lead_perdido_v2 (fluxo padrão de perda do app) manda
  // o lead para a lixeira (na_lixeira = true) quando não há corretor elegível
  // para repasse — e os medidores de perda do dashboard (dashboard_kpis →
  // dashboard_atividade_periodo conta 'perdidos' via lead_status_transitions;
  // dashboard_motivos_perda agrupa por categoria) filtram na_lixeira = false.
  // O lead perdido pelo fluxo oficial desaparece das métricas de perda no
  // instante em que é perdido; só perdas via transicionar_lead direto contam.
  // (dashboard_funil sequer possui etapa de perdidos para conferir.)
  it.fails("5. dashboards de perda deveriam contar o lead perdido pelo fluxo padrão", async () => {
    await comoUsuario(c, gestor.id);
    const kpis = await c.query(`SELECT public.dashboard_kpis() AS k`);
    expect(Number(kpis.rows[0].k.periodo.perdidos)).toBe(1);

    const motivos = await c.query(`SELECT * FROM public.dashboard_motivos_perda()`);
    const semContato = motivos.rows.find((row) => row.motivo === "sem_contato");
    expect(semContato).toBeTruthy();
    expect(Number(semContato?.quantidade)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// JORNADA 3 — transferência manual de carteira (A -> B) com RLS dos dois lados
// ---------------------------------------------------------------------------

describe("JORNADA 3 — gestor transfere lead do corretor A para o corretor B", () => {
  let leadId: string;
  let tarefaAbertaId: string;
  let distribuicaoAntes: Date | null;

  it("1. transferir_leads: dono trocado, data_distribuicao renovada, tarefas abertas reassinadas, log registrado", async () => {
    leadId = await criarLead(c, { corretorId: corretorA.id, status: "em_atendimento" });
    tarefaAbertaId = await criarTarefaComoCorretor(corretorA, leadId, daquiDias(2));
    distribuicaoAntes = (await leadRow(leadId)).data_distribuicao as Date | null;

    await comoUsuario(c, gestor.id);
    const r = await c.query(`SELECT public.transferir_leads(ARRAY[$1::uuid], $2::uuid) AS n`, [
      leadId,
      corretorB.id,
    ]);
    expect(r.rows[0].n).toBe(1);

    const lead = await leadRow(leadId);
    expect(lead.corretor_id).toBe(corretorB.id);
    expect(lead.corretor_anterior_id).toBe(corretorA.id);
    expect(lead.status).toBe("em_atendimento"); // transferência não mexe no funil
    expect(lead.tentativas_redistribuicao).toBe(0);
    // data_distribuicao renovada para agora (antes era NULL neste fixture).
    expect(lead.data_distribuicao).not.toBeNull();
    expect(lead.data_distribuicao).not.toEqual(distribuicaoAntes);
    expect(Date.now() - (lead.data_distribuicao as Date).getTime()).toBeLessThan(60_000);
    expect(Date.now() - (lead.timestamp_recebimento as Date).getTime()).toBeLessThan(60_000);

    // Tarefa aberta acompanha a carteira nova.
    await comoSuperuser(c);
    const tarefa = await c.query(
      `SELECT corretor_id, status::text AS status FROM public.tarefas WHERE id = $1`,
      [tarefaAbertaId],
    );
    expect(tarefa.rows[0]).toEqual({ corretor_id: corretorB.id, status: "pendente" });

    const log = await c.query(
      `SELECT corretor_id, tipo::text AS tipo, regra_aplicada, resultado, distribuido_por_id
         FROM public.distribution_log WHERE lead_id = $1`,
      [leadId],
    );
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]).toEqual({
      corretor_id: corretorB.id,
      tipo: "manual",
      regra_aplicada: "transferencia_manual",
      resultado: "sucesso",
      distribuido_por_id: gestor.id,
    });
  });

  it("2. RLS: corretor A perde acesso (SELECT vazio, UPDATE 0 linhas); corretor B enxerga e edita", async () => {
    // A (antigo dono): o lead sumiu da visão e do alcance de escrita.
    await comoUsuario(c, corretorA.id);
    const veA = await c.query(`SELECT id FROM public.leads WHERE id = $1`, [leadId]);
    expect(veA.rowCount).toBe(0);
    const updA = await c.query(
      `UPDATE public.leads SET observacoes = 'tentativa do antigo dono' WHERE id = $1`,
      [leadId],
    );
    expect(updA.rowCount).toBe(0);
    // A tarefa reassinada também some da visão de A.
    const tarefaA = await c.query(`SELECT id FROM public.tarefas WHERE id = $1`, [tarefaAbertaId]);
    expect(tarefaA.rowCount).toBe(0);

    // B (novo dono): vê o lead e a tarefa, e consegue trabalhar o lead.
    await comoUsuario(c, corretorB.id);
    const veB = await c.query(
      `SELECT id, corretor_id FROM public.leads WHERE id = $1`,
      [leadId],
    );
    expect(veB.rowCount).toBe(1);
    expect(veB.rows[0].corretor_id).toBe(corretorB.id);
    const tarefaB = await c.query(`SELECT id FROM public.tarefas WHERE id = $1`, [tarefaAbertaId]);
    expect(tarefaB.rowCount).toBe(1);
    const updB = await c.query(
      `UPDATE public.leads SET observacoes = 'novo dono assumiu' WHERE id = $1 RETURNING observacoes`,
      [leadId],
    );
    expect(updB.rows[0].observacoes).toBe("novo dono assumiu");
  });
});
