/**
 * Papel SDR (migrations 20260904100000 / 101000 / 102000) — ponta a ponta no banco.
 *
 * Cobre as decisões de produto de 2026-09-04:
 *  - carteira própria do SDR (sdr_id) e RLS: corretor não vê a base do SDR,
 *    SDR não altera posse por UPDATE direto;
 *  - qualificado exige campos + interesse confirmado (só quando é o SDR agindo);
 *  - agendar visita: roleta de agendados ANTES do agendamento, agendamento no
 *    nome do corretor, tarefas D-1/D-0 com o SDR, lead entregue mas ainda
 *    visível/editável pelo SDR;
 *  - no-show devolve ao SDR (trigger); corretor perde o lead;
 *  - reaquecer: lead parado de corretor aparece, SDR pega, corretor mantém a
 *    posse e tem prioridade na entrega;
 *  - espelho pelo admin: adicionar / remover / substituir, sempre com motivo;
 *  - entrega manual com motivo cai em Qualificação Corretor;
 *  - estoque sem dono e perdidos reciclados alimentam a base (rodízio);
 *  - flag desligada: nada disso roda.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

const c = novoClient();

let admin: UsuarioTeste;
let sdr: UsuarioTeste;
let sdr2: UsuarioTeste;
let corretorA: UsuarioTeste; // na roleta agendados-sdr
let corretorB: UsuarioTeste; // dono de lead parado (reaquecimento)
let corretorC: UsuarioTeste; // espelho extra
let roletaId: string;

async function errMsg(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { message?: string }).message ?? "erro";
  }
}

async function setFlag(ativo: boolean) {
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.distribuicao_settings SET valor = $1::jsonb WHERE chave = 'sdr_ativo'`,
    [JSON.stringify(ativo)],
  );
}

async function lead(id: string) {
  await comoSuperuser(c);
  const r = await c.query(`SELECT * FROM public.leads WHERE id = $1`, [id]);
  return r.rows[0];
}

async function veLead(user: UsuarioTeste, id: string): Promise<boolean> {
  await comoUsuario(c, user.id);
  const r = await c.query(`SELECT id FROM public.leads WHERE id = $1`, [id]);
  await comoSuperuser(c);
  return r.rowCount === 1;
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await comoSuperuser(c);

  admin = await criarUsuario(c, { nome: "Admin SDR", papel: "admin" });
  sdr = await criarUsuario(c, { nome: "Carla SDR", papel: "sdr" });
  sdr2 = await criarUsuario(c, { nome: "Diego SDR", papel: "sdr" });
  corretorA = await criarUsuario(c, { nome: "Ana Corretora", papel: "corretor" });
  corretorB = await criarUsuario(c, { nome: "Bruno Corretor", papel: "corretor" });
  corretorC = await criarUsuario(c, { nome: "Caio Corretor", papel: "corretor" });

  await c.query(`UPDATE public.profiles SET telefone = '11999990001', ativo = true WHERE id = $1`, [
    corretorA.id,
  ]);
  await c.query(`UPDATE public.profiles SET telefone = '11999990002', ativo = true WHERE id = $1`, [
    corretorB.id,
  ]);
  await c.query(`UPDATE public.profiles SET telefone = '11999990003', ativo = true WHERE id = $1`, [
    corretorC.id,
  ]);

  const r = await c.query(`SELECT id FROM public.roletas WHERE slug = 'agendados-sdr'`);
  roletaId = r.rows[0].id as string;
  // Só a Ana está na roleta de agendados.
  await c.query(
    `INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo, incluido_por)
     VALUES ($1, $2, true, $3)`,
    [roletaId, corretorA.id, admin.id],
  );

  await setFlag(true);
});

afterAll(async () => {
  await setFlag(false);
  await comoSuperuser(c);
  await c.query(`DELETE FROM public.roleta_participantes WHERE roleta_id = $1`, [roletaId]);
  await c.end();
});

describe("fundação: papel, seeds e flag", () => {
  it("enum ganhou 'sdr' e a roleta agendados-sdr existe com tipo próprio", async () => {
    await comoSuperuser(c);
    const enumR = await c.query(`SELECT enum_range(NULL::public.app_role)::text[] AS v`);
    expect(enumR.rows[0].v).toContain("sdr");
    const r = await c.query(
      `SELECT tipo, exigir_presenca, criterio_participacao FROM public.roletas WHERE slug = 'agendados-sdr'`,
    );
    expect(r.rows[0]).toMatchObject({
      tipo: "sdr",
      exigir_presenca: false,
      criterio_participacao: "manual",
    });
  });

  it("SDR puro nunca é apto em roleta comum (exige papel corretor) e a roleta sdr usa régua própria", async () => {
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo)
       SELECT id, $1, true FROM public.roletas WHERE slug = 'plantao'`,
      [sdr.id],
    );
    const comum = await c.query(
      `SELECT apto, motivos FROM public._elegibilidade_roleta('plantao') WHERE corretor_id = $1`,
      [sdr.id],
    );
    expect(comum.rows[0].apto).toBe(false);
    expect(comum.rows[0].motivos).toContain("sem_role_corretor");
    await c.query(
      `DELETE FROM public.roleta_participantes WHERE corretor_id = $1 AND roleta_id IN (SELECT id FROM public.roletas WHERE slug = 'plantao')`,
      [sdr.id],
    );

    // Ana: sem presença marcada, mesmo assim apta na roleta do SDR.
    const propria = await c.query(
      `SELECT apto, motivos FROM public.elegibilidade_roleta('agendados-sdr') WHERE corretor_id = $1`,
      [corretorA.id],
    );
    expect(propria.rows[0].apto).toBe(true);
  });

  it("teto de leads ativos é próprio do SDR (sdr_teto_leads_ativos) e nasce desligado", async () => {
    // 04/09/2026: com o disjuntor_wip global (30) a fila inteira ficou inapta —
    // a equipe toda carrega mais de 30 leads ativos e a roleta comum nunca
    // aplicou esse teto. A roleta do SDR lê a chave própria; 0 = sem teto.
    await comoSuperuser(c);
    const seed = await c.query(
      `SELECT valor FROM public.distribuicao_settings WHERE chave = 'sdr_teto_leads_ativos'`,
    );
    expect(seed.rows[0].valor).toBe(0);

    const leadWip = await criarLead(c, {
      nome: "Carteira da Ana",
      corretorId: corretorA.id,
      status: "em_atendimento",
    });
    const apta = async () => {
      const r = await c.query(
        `SELECT apto, motivos FROM public.elegibilidade_roleta('agendados-sdr') WHERE corretor_id = $1`,
        [corretorA.id],
      );
      return r.rows[0] as { apto: boolean; motivos: string[] };
    };
    // Sem teto: 1 lead ativo não pesa nada, mesmo com disjuntor_wip global = 1.
    await c.query(
      `UPDATE public.distribuicao_settings SET valor = '1'::jsonb WHERE chave = 'disjuntor_wip'`,
    );
    expect((await apta()).apto).toBe(true);
    // Teto próprio = 1: Ana (1 lead ativo) fica inapta com o motivo do disjuntor.
    await c.query(
      `UPDATE public.distribuicao_settings SET valor = '1'::jsonb WHERE chave = 'sdr_teto_leads_ativos'`,
    );
    const bloqueada = await apta();
    expect(bloqueada.apto).toBe(false);
    expect(bloqueada.motivos.some((m) => m.startsWith("disjuntor_wip_"))).toBe(true);
    // Volta ao padrão e tira o lead da conta.
    await c.query(
      `UPDATE public.distribuicao_settings SET valor = '0'::jsonb WHERE chave = 'sdr_teto_leads_ativos'`,
    );
    await c.query(
      `UPDATE public.distribuicao_settings SET valor = '30'::jsonb WHERE chave = 'disjuntor_wip'`,
    );
    await c.query(`UPDATE public.leads SET na_lixeira = true WHERE id = $1`, [leadWip]);
    expect((await apta()).apto).toBe(true);
  });
});

describe("carteira própria e RLS", () => {
  let leadId: string;

  it("lead criado pelo SDR nasce na base dele (sdr_id = ele, sem corretor, aguardando atendimento)", async () => {
    await comoUsuario(c, sdr.id);
    const r = await c.query(
      `INSERT INTO public.leads (nome, telefone, origem, status)
       VALUES ('Cliente Base', '11988880001', 'outro', 'novo') RETURNING id`,
    );
    leadId = r.rows[0].id as string;
    const l = await lead(leadId);
    expect(l.sdr_id).toBe(sdr.id);
    expect(l.corretor_id).toBeNull();
    expect(l.status).toBe("aguardando_atendimento");
    expect(l.classe_lead).toBe("base");
  });

  it("corretor e outro SDR não veem a base; SDR dono e admin veem", async () => {
    expect(await veLead(corretorA, leadId)).toBe(false);
    expect(await veLead(sdr2, leadId)).toBe(false);
    expect(await veLead(sdr, leadId)).toBe(true);
    expect(await veLead(admin, leadId)).toBe(true);
  });

  it("SDR edita dados, mas não altera a posse por UPDATE direto (42501)", async () => {
    await comoUsuario(c, sdr.id);
    await c.query(`UPDATE public.leads SET renda_informada = 'R$ 4.000' WHERE id = $1`, [leadId]);
    expect(
      await errCode(
        c.query(`UPDATE public.leads SET corretor_id = $2 WHERE id = $1`, [leadId, corretorA.id]),
      ),
    ).toBe("42501");
    expect(
      await errCode(
        c.query(`UPDATE public.leads SET sdr_id = $2 WHERE id = $1`, [leadId, sdr2.id]),
      ),
    ).toBe("42501");
    await comoSuperuser(c);
  });

  it("qualificado exige interesse confirmado + renda + tipo de renda + decisor", async () => {
    await comoUsuario(c, sdr.id);
    await c.query(
      `SELECT public.transicionar_lead($1, 'em_atendimento', NULL, 'Ligar e qualificar')`,
      [leadId],
    );
    const msg = await errMsg(
      c.query(`SELECT public.transicionar_lead($1, 'qualificado', NULL, 'Agendar visita')`, [
        leadId,
      ]),
    );
    expect(msg).toMatch(/Interesse confirmado/);

    await c.query(
      `UPDATE public.leads SET sdr_interesse_confirmado = true, tipo_renda = 'CLT', decisor = 'Casal'
        WHERE id = $1`,
      [leadId],
    );
    await c.query(`SELECT public.transicionar_lead($1, 'qualificado', NULL, 'Agendar visita')`, [
      leadId,
    ]);
    expect((await lead(leadId)).status).toBe("qualificado");
  });

  it("agendar visita: roleta antes, agendamento no nome da corretora, tarefas D-1/D-0 com o SDR", async () => {
    await comoUsuario(c, sdr.id);
    const inicio = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    inicio.setHours(10, 0, 0, 0);
    const r = await c.query(
      `SELECT public.agendar_visita_sdr($1, $2::timestamptz, NULL, NULL, 'Estande Vibra', NULL, NULL) AS res`,
      [leadId, inicio.toISOString()],
    );
    const res = r.rows[0].res as Record<string, unknown>;
    expect(res.ok).toBe(true);
    expect(res.corretor_id).toBe(corretorA.id);
    expect(res.regra).toBe("roleta_sdr");

    const l = await lead(leadId);
    expect(l.corretor_id).toBe(corretorA.id);
    expect(l.sdr_id).toBe(sdr.id);
    expect(l.sdr_entregue_em).not.toBeNull();
    expect(l.status).toBe("agendado");
    expect(l.roleta_slug).toBe("agendados-sdr");

    const ag = await c.query(
      `SELECT corretor_id, criado_por_id, status, tipo, local FROM public.agendamentos WHERE id = $1`,
      [res.agendamento_id],
    );
    expect(ag.rows[0]).toMatchObject({
      corretor_id: corretorA.id,
      criado_por_id: sdr.id,
      status: "agendado",
      tipo: "visita",
      local: "Estande Vibra",
    });

    const tarefas = await c.query(
      `SELECT corretor_id, titulo FROM public.tarefas WHERE lead_id = $1 AND status = 'pendente' ORDER BY data_vencimento`,
      [leadId],
    );
    expect(tarefas.rows.length).toBe(2);
    expect(tarefas.rows.every((t) => t.corretor_id === sdr.id)).toBe(true);
    expect(tarefas.rows[0].titulo).toMatch(/D-1/);

    const log = await c.query(
      `SELECT regra_aplicada, resultado, corretor_id FROM public.distribution_log WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [leadId],
    );
    expect(log.rows[0]).toMatchObject({
      regra_aplicada: "roleta_sdr",
      resultado: "sucesso",
      corretor_id: corretorA.id,
    });

    // Espelho: os dois veem; o SDR continua editando.
    expect(await veLead(corretorA, leadId)).toBe(true);
    expect(await veLead(sdr, leadId)).toBe(true);
    await comoUsuario(c, sdr.id);
    await c.query(`UPDATE public.leads SET observacoes = 'confirmado por WhatsApp' WHERE id = $1`, [
      leadId,
    ]);
    // …e a corretora vê a tarefa de confirmação (mesmo lead) mas ela é do SDR.
    await comoUsuario(c, corretorA.id);
    const tA = await c.query(`SELECT count(*)::int AS n FROM public.tarefas WHERE lead_id = $1`, [
      leadId,
    ]);
    expect(tA.rows[0].n).toBe(2);
    await comoSuperuser(c);
  });

  it("lead já entregue não é agendado de novo pelo SDR", async () => {
    await comoUsuario(c, sdr.id);
    const msg = await errMsg(
      c.query(
        `SELECT public.agendar_visita_sdr($1, now() + interval '2 days', NULL, NULL, 'Estande')`,
        [leadId],
      ),
    );
    expect(msg).toMatch(/já entregue/);
    await comoSuperuser(c);
  });

  it("no-show: validar_visita(false) pela corretora devolve o lead ao SDR", async () => {
    await comoSuperuser(c);
    const ag = await c.query(
      `SELECT id FROM public.agendamentos WHERE lead_id = $1 AND status = 'agendado'`,
      [leadId],
    );
    await comoUsuario(c, corretorA.id);
    await c.query(`SELECT public.validar_visita($1, false, 'não atendeu', NULL, NULL)`, [
      ag.rows[0].id,
    ]);

    const l = await lead(leadId);
    expect(l.corretor_id).toBeNull();
    expect(l.corretor_anterior_id).toBe(corretorA.id);
    expect(l.sdr_id).toBe(sdr.id);
    expect(l.sdr_entregue_em).toBeNull();
    expect(l.sdr_devolvido_em).not.toBeNull();
    expect(l.status).toBe("em_atendimento");
    expect(l.corretores_que_tentaram).toContain(corretorA.id);

    // Corretora perdeu o acesso; SDR ganhou tarefa de reaquecer.
    expect(await veLead(corretorA, leadId)).toBe(false);
    await comoSuperuser(c);
    const t = await c.query(
      `SELECT titulo FROM public.tarefas WHERE lead_id = $1 AND corretor_id = $2 AND status = 'pendente'`,
      [leadId, sdr.id],
    );
    expect(t.rows.some((r) => /Reaquecer/.test(r.titulo as string))).toBe(true);
    const log = await c.query(
      `SELECT regra_aplicada FROM public.distribution_log WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [leadId],
    );
    expect(log.rows[0].regra_aplicada).toBe("sdr_devolucao:no_show");
  });

  it("entrega manual com motivo: lead em atendimento cai em Qualificação Corretor com a corretora", async () => {
    await comoUsuario(c, sdr.id);
    expect(await errCode(c.query(`SELECT public.entregar_lead_sdr($1, 'x')`, [leadId]))).toBe(
      "22023",
    );
    const r = await c.query(
      `SELECT public.entregar_lead_sdr($1, 'Cliente com documentos, só visita em 3 semanas') AS res`,
      [leadId],
    );
    expect((r.rows[0].res as Record<string, unknown>).ok).toBe(true);
    const l = await lead(leadId);
    expect(l.corretor_id).toBe(corretorA.id);
    expect(l.status).toBe("qualificacao_corretor");
    expect(l.sdr_entregue_em).not.toBeNull();
  });
});

describe("reaquecer lead parado de corretor", () => {
  let leadB: string;

  it("lead do Bruno parado há 10 dias aparece para o SDR; um recente não", async () => {
    await comoSuperuser(c);
    leadB = await criarLead(c, {
      nome: "Parado do Bruno",
      corretorId: corretorB.id,
      status: "em_atendimento",
    });
    const recente = await criarLead(c, {
      nome: "Recente do Bruno",
      corretorId: corretorB.id,
      status: "em_atendimento",
    });
    await c.query(
      `UPDATE public.leads SET ultima_atividade_em = now() - interval '10 days' WHERE id = $1`,
      [leadB],
    );

    await comoUsuario(c, sdr.id);
    const r = await c.query(
      `SELECT id, corretor_nome, dias_parado FROM public.sdr_leads_reaquecer(50)`,
    );
    const ids = r.rows.map((x) => x.id);
    expect(ids).toContain(leadB);
    expect(ids).not.toContain(recente);
    expect(r.rows.find((x) => x.id === leadB)?.corretor_nome).toBe("Bruno Corretor");
    await comoSuperuser(c);

    // RLS: o SDR já enxerga o lead parado (aba Reaquecer) mas não o recente.
    expect(await veLead(sdr, leadB)).toBe(true);
    expect(await veLead(sdr, recente)).toBe(false);
  });

  it("pegar: SDR vira dono de pré-venda, Bruno mantém a posse; outro SDR não pega o mesmo", async () => {
    await comoUsuario(c, sdr.id);
    await c.query(`SELECT public.sdr_pegar_lead($1)`, [leadB]);
    const l = await lead(leadB);
    expect(l.sdr_id).toBe(sdr.id);
    expect(l.corretor_id).toBe(corretorB.id);

    await comoUsuario(c, sdr2.id);
    expect(await errCode(c.query(`SELECT public.sdr_pegar_lead($1)`, [leadB]))).toBe("22023");
    expect(await veLead(sdr2, leadB)).toBe(false);
    expect(await veLead(corretorB, leadB)).toBe(true);
  });

  it("ao agendar, o Bruno (dono original, ativo, agenda livre) tem prioridade — sem roleta", async () => {
    await comoUsuario(c, sdr.id);
    const r = await c.query(
      `SELECT public.agendar_visita_sdr($1, now() + interval '4 days', NULL, NULL, 'Estande') AS res`,
      [leadB],
    );
    const res = r.rows[0].res as Record<string, unknown>;
    expect(res.ok).toBe(true);
    expect(res.corretor_id).toBe(corretorB.id);
    expect(res.regra).toBe("sdr_prioridade_corretor_original");
    const l = await lead(leadB);
    expect(l.corretor_id).toBe(corretorB.id);
    expect(l.sdr_entregue_em).not.toBeNull();
    expect(l.status).toBe("agendado");
  });

  it("com conflito de agenda do dono original, cai na roleta de agendados", async () => {
    await comoSuperuser(c);
    const leadB2 = await criarLead(c, {
      nome: "Parado 2 do Bruno",
      corretorId: corretorB.id,
      status: "em_atendimento",
    });
    await c.query(
      `UPDATE public.leads SET ultima_atividade_em = now() - interval '10 days' WHERE id = $1`,
      [leadB2],
    );
    await comoUsuario(c, sdr.id);
    await c.query(`SELECT public.sdr_pegar_lead($1)`, [leadB2]);
    // Mesmo horário da visita anterior do Bruno.
    const ag = await c.query(
      `SELECT data_inicio FROM public.agendamentos WHERE lead_id = $1 AND status = 'agendado'`,
      [leadB],
    );
    const r = await c.query(
      `SELECT public.agendar_visita_sdr($1, $2::timestamptz, NULL, NULL, 'Estande') AS res`,
      [leadB2, ag.rows[0].data_inicio],
    );
    const res = r.rows[0].res as Record<string, unknown>;
    expect(res.ok).toBe(true);
    expect(res.regra).toBe("roleta_sdr");
    expect(res.corretor_id).toBe(corretorA.id);
    await comoSuperuser(c);
  });

  it("carteira antiga: lead em que a própria SDR é corretor_id vai para a roleta, nunca de volta para ela", async () => {
    // Caso Vanessa (2026-09-04): virou SDR, mas segue como corretor_id de leads
    // agendados/base da carteira antiga. Sem a guarda `corretor_sem_papel`, a
    // prioridade do "dono original" entregaria o lead para o próprio SDR.
    await comoSuperuser(c);
    const legado = await criarLead(c, {
      nome: "Legado da Carla",
      corretorId: sdr.id,
      status: "em_atendimento",
    });
    await c.query(
      `UPDATE public.leads SET ultima_atividade_em = now() - interval '10 days' WHERE id = $1`,
      [legado],
    );

    await comoUsuario(c, sdr.id);
    // Aparece no Reaquecer como qualquer lead parado de corretor…
    const r0 = await c.query(`SELECT id FROM public.sdr_leads_reaquecer(50)`);
    expect(r0.rows.map((x) => x.id)).toContain(legado);
    await c.query(`SELECT public.sdr_pegar_lead($1)`, [legado]);
    // …mas na visita a prioridade é recusada (corretor_sem_papel) e cai na roleta.
    const r = await c.query(
      `SELECT public.agendar_visita_sdr($1, now() + interval '6 days', NULL, NULL, 'Estande') AS res`,
      [legado],
    );
    const res = r.rows[0].res as Record<string, unknown>;
    expect(res.ok).toBe(true);
    expect(res.regra).toBe("roleta_sdr");
    expect(res.corretor_id).toBe(corretorA.id);
    expect(res.corretor_id).not.toBe(sdr.id);

    await comoSuperuser(c);
    const ctx = await c.query(
      `SELECT lc.contexto->>'prioridade_recusa' AS recusa
         FROM public.distribution_log dl
         JOIN public.distribuicao_log_contexto lc ON lc.log_id = dl.id
        WHERE dl.lead_id = $1 AND dl.resultado = 'sucesso'
        ORDER BY dl.created_at DESC
        LIMIT 1`,
      [legado],
    );
    expect(ctx.rows[0]?.recusa).toBe("corretor_sem_papel");
    const l = await lead(legado);
    expect(l.corretor_id).toBe(corretorA.id);
    expect(l.corretor_anterior_id).toBe(sdr.id);
    expect(l.sdr_id).toBe(sdr.id);
    expect(l.sdr_entregue_em).not.toBeNull();
    expect(l.status).toBe("agendado");
  });
});

describe("visita fora da RPC passa pela roleta (trigger em agendamentos)", () => {
  async function insereVisita(
    leadId: string,
    corretorId: string,
    criadoPor: string,
    horas: number,
  ) {
    const r = await c.query(
      `INSERT INTO public.agendamentos
         (lead_id, corretor_id, criado_por_id, tipo, status, titulo, local, data_inicio, data_fim)
       VALUES ($1, $2, $3, 'visita', 'agendado', 'Visita', 'Estande',
               now() + make_interval(hours => $4), now() + make_interval(hours => $4) + interval '1 hour')
       RETURNING id, corretor_id`,
      [leadId, corretorId, criadoPor, horas],
    );
    return r.rows[0] as { id: string; corretor_id: string };
  }
  async function entregasSucesso(leadId: string) {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT count(*)::int AS n FROM public.distribution_log WHERE lead_id = $1 AND resultado = 'sucesso' AND corretor_id IS NOT NULL`,
      [leadId],
    );
    return r.rows[0].n as number;
  }

  it("lead da base do SDR: visita pelo modal comum nasce no nome da corretora da roleta, D-1/D-0 com o SDR", async () => {
    await comoSuperuser(c);
    const leadBase = await criarLead(c, { nome: "Base via modal", status: "em_atendimento" });
    await c.query(`UPDATE public.leads SET sdr_id = $1, corretor_id = NULL WHERE id = $2`, [
      sdr.id,
      leadBase,
    ]);
    await comoUsuario(c, sdr.id);
    const ag = await insereVisita(leadBase, sdr.id, sdr.id, 8 * 24);
    expect(ag.corretor_id).toBe(corretorA.id);
    const l = await lead(leadBase);
    expect(l.corretor_id).toBe(corretorA.id);
    expect(l.sdr_id).toBe(sdr.id);
    expect(l.sdr_entregue_em).not.toBeNull();
    const t = await c.query(
      `SELECT count(*)::int AS n FROM public.tarefas
        WHERE lead_id = $1 AND corretor_id = $2 AND status = 'pendente' AND titulo LIKE 'Confirmar visita de %'`,
      [leadBase, sdr.id],
    );
    expect(t.rows[0].n).toBeGreaterThanOrEqual(1);
    expect(await entregasSucesso(leadBase)).toBe(1);

    // Remarcação depois de entregue: fica com a Ana, sem nova roleta.
    await comoUsuario(c, corretorA.id);
    const ag2 = await insereVisita(leadBase, corretorA.id, corretorA.id, 8 * 24 + 12);
    expect(ag2.corretor_id).toBe(corretorA.id);
    expect(await entregasSucesso(leadBase)).toBe(1);
  });

  it("carteira antiga: visita no nome do SDR entra na base dele e vai para a roleta", async () => {
    await comoSuperuser(c);
    const legado = await criarLead(c, {
      nome: "Legado com visita",
      corretorId: sdr.id,
      status: "em_atendimento",
    });
    await comoUsuario(c, sdr.id);
    const ag = await insereVisita(legado, sdr.id, sdr.id, 9 * 24);
    expect(ag.corretor_id).toBe(corretorA.id);
    const l = await lead(legado);
    expect(l.sdr_id).toBe(sdr.id);
    expect(l.corretor_id).toBe(corretorA.id);
    expect(l.corretor_anterior_id).toBe(sdr.id);
    expect(l.sdr_entregue_em).not.toBeNull();
    const ev = await c.query(
      `SELECT regra_aplicada FROM public.distribution_log WHERE lead_id = $1 ORDER BY created_at`,
      [legado],
    );
    expect(ev.rows.map((x) => x.regra_aplicada)).toEqual(["sdr_carteira_antiga", "roleta_sdr"]);
  });

  it("lead comum de corretor: a visita fica com ele, nada muda", async () => {
    await comoSuperuser(c);
    const comum = await criarLead(c, {
      nome: "Comum do Bruno",
      corretorId: corretorB.id,
      status: "em_atendimento",
    });
    await comoUsuario(c, corretorB.id);
    const ag = await insereVisita(comum, corretorB.id, corretorB.id, 10 * 24);
    expect(ag.corretor_id).toBe(corretorB.id);
    const l = await lead(comum);
    expect(l.sdr_id).toBeNull();
    expect(l.corretor_id).toBe(corretorB.id);
  });

  it("cadastro pelo SDR que bate em lead existente: parado ou da própria carteira entra na base; recente de corretor não", async () => {
    await comoSuperuser(c);
    const paradoBruno = await criarLead(c, {
      nome: "Parado Bruno dedup",
      telefone: "11977770001",
      corretorId: corretorB.id,
      status: "em_atendimento",
    });
    await c.query(
      `UPDATE public.leads SET ultima_atividade_em = now() - interval '10 days' WHERE id = $1`,
      [paradoBruno],
    );
    const recenteBruno = await criarLead(c, {
      nome: "Recente Bruno dedup",
      telefone: "11977770002",
      corretorId: corretorB.id,
      status: "em_atendimento",
    });
    const meuLegado = await criarLead(c, {
      nome: "Meu legado dedup",
      telefone: "11977770003",
      corretorId: sdr.id,
      status: "novo",
    });

    await comoUsuario(c, sdr.id);
    const dedup = async (telefone: string) => {
      const r = await c.query(`SELECT public.criar_lead_dedup($1::jsonb) AS res`, [
        JSON.stringify({ nome: "Cadastro SDR", telefone }),
      ]);
      return r.rows[0].res as { duplicado: boolean; lead_id: string; sdr_pegou: boolean };
    };
    const r1 = await dedup("(11) 97777-0001");
    expect(r1.duplicado).toBe(true);
    expect(r1.lead_id).toBe(paradoBruno);
    expect(r1.sdr_pegou).toBe(true);
    const r2 = await dedup("(11) 97777-0002");
    expect(r2.duplicado).toBe(true);
    expect(r2.sdr_pegou).toBe(false);
    const r3 = await dedup("(11) 97777-0003");
    expect(r3.sdr_pegou).toBe(true);

    expect((await lead(paradoBruno)).sdr_id).toBe(sdr.id);
    expect((await lead(paradoBruno)).corretor_id).toBe(corretorB.id);
    expect((await lead(recenteBruno)).sdr_id).toBeNull();
    const meu = await lead(meuLegado);
    expect(meu.sdr_id).toBe(sdr.id);
    expect(meu.status).toBe("aguardando_atendimento");
  });

  it("pegar: lead da própria carteira antiga entra na base mesmo sem estar parado", async () => {
    await comoSuperuser(c);
    const fresco = await criarLead(c, {
      nome: "Meu legado fresco",
      corretorId: sdr.id,
      status: "aguardando_retorno",
    });
    await comoUsuario(c, sdr.id);
    await c.query(`SELECT public.sdr_pegar_lead($1)`, [fresco]);
    const l = await lead(fresco);
    expect(l.sdr_id).toBe(sdr.id);
    expect(l.corretor_id).toBe(sdr.id);
  });

  it("reparo: visita que ficou no nome do SDR (flag desligada na hora) passa pela roleta depois", async () => {
    await setFlag(false);
    await comoSuperuser(c);
    const pendente = await criarLead(c, { nome: "Pendente de reparo", status: "em_atendimento" });
    await c.query(`UPDATE public.leads SET sdr_id = $1, corretor_id = NULL WHERE id = $2`, [
      sdr.id,
      pendente,
    ]);
    await comoUsuario(c, sdr.id);
    const ag = await insereVisita(pendente, sdr.id, sdr.id, 11 * 24);
    expect(ag.corretor_id).toBe(sdr.id);
    await setFlag(true);

    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT * FROM public.sdr_reentregar_visitas_pendentes()`);
    const linha = r.rows.find((x) => x.agendamento_id === ag.id);
    expect(linha?.erro).toBeNull();
    expect(linha?.corretor_id).toBe(corretorA.id);
    await comoSuperuser(c);
    const a = await c.query(`SELECT corretor_id FROM public.agendamentos WHERE id = $1`, [ag.id]);
    expect(a.rows[0].corretor_id).toBe(corretorA.id);
    const l = await lead(pendente);
    expect(l.corretor_id).toBe(corretorA.id);
    expect(l.sdr_entregue_em).not.toBeNull();
  });
});

describe("aviso ao corretor sai do banco; endereço obrigatório", () => {
  const INSERE = `INSERT INTO public.agendamentos
      (lead_id, corretor_id, criado_por_id, tipo, status, titulo, local, data_inicio, data_fim)
    VALUES ($1, $2, $2, 'visita', 'agendado', 'Visita', $3, $4::timestamptz, $4::timestamptz + interval '1 hour')
    RETURNING corretor_id`;

  it("agendar_visita_sdr: sem endereço falha (22023); com endereço entrega e registra o aviso", async () => {
    await comoSuperuser(c);
    const l = await criarLead(c, { nome: "Aviso RPC", status: "em_atendimento" });
    await c.query(`UPDATE public.leads SET sdr_id = $2, corretor_id = NULL WHERE id = $1`, [
      l,
      sdr.id,
    ]);
    await comoUsuario(c, sdr.id);
    expect(
      await errCode(
        c.query(`SELECT public.agendar_visita_sdr($1, now() + interval '14 days')`, [l]),
      ),
    ).toBe("22023");
    const r = await c.query(
      `SELECT public.agendar_visita_sdr($1, now() + interval '14 days', NULL, NULL, 'Rua A, 100') AS res`,
      [l],
    );
    expect((r.rows[0].res as Record<string, unknown>).ok).toBe(true);

    await comoSuperuser(c);
    const ev = await c.query(
      `SELECT payload FROM public.lead_eventos WHERE lead_id = $1 AND tipo = 'sdr_aviso_corretor'`,
      [l],
    );
    expect(ev.rowCount).toBe(1);
    const p = ev.rows[0].payload as Record<string, unknown>;
    expect(p.corretor_id).toBe(corretorA.id);
    expect(p.gatilho).toBe("agendamento_sdr");
    // Sem Vault no harness: o motivo fica registrado e a entrega não cai.
    expect(p.enviado).toBe(false);
    expect(p.motivo).toBe("sem_chave_vault");
  });

  it("modal comum: sem endereço a visita não é criada; com endereço avisa depois de inserir; lead comum não avisa", async () => {
    await comoSuperuser(c);
    const l = await criarLead(c, { nome: "Aviso trigger", status: "em_atendimento" });
    await c.query(`UPDATE public.leads SET sdr_id = $2, corretor_id = NULL WHERE id = $1`, [
      l,
      sdr.id,
    ]);
    await comoUsuario(c, sdr.id);
    const quando = new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString();
    expect(await errCode(c.query(INSERE, [l, sdr.id, null, quando]))).toBe("22023");
    const lead1 = await lead(l);
    expect(lead1.sdr_entregue_em).toBeNull();

    await comoUsuario(c, sdr.id);
    const ag = await c.query(INSERE, [l, sdr.id, "Rua B, 200", quando]);
    expect(ag.rows[0].corretor_id).toBe(corretorA.id);
    await comoSuperuser(c);
    const ev = await c.query(
      `SELECT payload FROM public.lead_eventos WHERE lead_id = $1 AND tipo = 'sdr_aviso_corretor'`,
      [l],
    );
    expect(ev.rowCount).toBe(1);
    expect((ev.rows[0].payload as Record<string, unknown>).gatilho).toBe("agendamento_visita");
    expect((ev.rows[0].payload as Record<string, unknown>).corretor_id).toBe(corretorA.id);

    // Corretor comum em lead comum: nada do SDR dispara.
    const lb = await criarLead(c, {
      nome: "Comum sem aviso",
      corretorId: corretorB.id,
      status: "em_atendimento",
    });
    await comoUsuario(c, corretorB.id);
    const quando2 = new Date(Date.now() + 16 * 24 * 3600 * 1000).toISOString();
    const agB = await c.query(INSERE, [lb, corretorB.id, null, quando2]);
    expect(agB.rows[0].corretor_id).toBe(corretorB.id);
    await comoSuperuser(c);
    const ev2 = await c.query(
      `SELECT count(*)::int AS n FROM public.lead_eventos WHERE lead_id = $1 AND tipo = 'sdr_aviso_corretor'`,
      [lb],
    );
    expect(ev2.rows[0].n).toBe(0);
  });
});

describe("espelho pelo admin", () => {
  let leadE: string;

  it("adicionar: Caio passa a ver; remover: deixa de ver; sempre com motivo", async () => {
    await comoSuperuser(c);
    leadE = await criarLead(c, {
      nome: "Lead Espelho",
      corretorId: corretorA.id,
      status: "em_atendimento",
    });
    expect(await veLead(corretorC, leadE)).toBe(false);

    await comoUsuario(c, admin.id);
    expect(
      await errCode(
        c.query(`SELECT public.alocar_espelho_lead($1, $2, 'adicionar', '')`, [
          leadE,
          corretorC.id,
        ]),
      ),
    ).toBe("22023");
    await c.query(`SELECT public.alocar_espelho_lead($1, $2, 'adicionar', 'Ana de férias')`, [
      leadE,
      corretorC.id,
    ]);
    expect(await veLead(corretorC, leadE)).toBe(true);
    expect(await veLead(corretorA, leadE)).toBe(true);

    // Só admin.
    await comoUsuario(c, corretorA.id);
    expect(
      await errCode(
        c.query(`SELECT public.alocar_espelho_lead($1, $2, 'adicionar', 'tentativa')`, [
          leadE,
          corretorB.id,
        ]),
      ),
    ).toBe("42501");

    await comoUsuario(c, admin.id);
    await c.query(`SELECT public.remover_espelho_lead($1, $2, 'Ana voltou')`, [
      leadE,
      corretorC.id,
    ]);
    expect(await veLead(corretorC, leadE)).toBe(false);
  });

  it("substituir: Caio vira dono, Ana perde o acesso, tarefas abertas migram", async () => {
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.tarefas (corretor_id, lead_id, titulo, tipo, prioridade, status, data_vencimento)
       VALUES ($1, $2, 'Ligar', 'ligacao', 'media', 'pendente', now() + interval '1 day')`,
      [corretorA.id, leadE],
    );
    await comoUsuario(c, admin.id);
    await c.query(
      `SELECT public.alocar_espelho_lead($1, $2, 'substituir', 'Ana saiu da empresa')`,
      [leadE, corretorC.id],
    );
    const l = await lead(leadE);
    expect(l.corretor_id).toBe(corretorC.id);
    expect(l.corretor_anterior_id).toBe(corretorA.id);
    expect(await veLead(corretorA, leadE)).toBe(false);
    expect(await veLead(corretorC, leadE)).toBe(true);
    await comoSuperuser(c);
    const t = await c.query(
      `SELECT corretor_id FROM public.tarefas WHERE lead_id = $1 AND titulo = 'Ligar'`,
      [leadE],
    );
    expect(t.rows[0].corretor_id).toBe(corretorC.id);
    const log = await c.query(
      `SELECT regra_aplicada, motivo FROM public.distribution_log WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [leadE],
    );
    expect(log.rows[0].regra_aplicada).toBe("espelho_substituido");
    expect(log.rows[0].motivo).toBe("Ana saiu da empresa");
  });
});

describe("alimentação da base (rodízio entre SDRs)", () => {
  it("estoque sem dono vai para os SDRs em rodízio, não para o Plantão", async () => {
    await comoSuperuser(c);
    const e1 = await criarLead(c, { nome: "Estoque 1", status: "aguardando_corretor" });
    const e2 = await criarLead(c, { nome: "Estoque 2", status: "aguardando_corretor" });
    const r = await c.query(`SELECT public.distribuir_estoque_roleta('plantao', 30) AS res`);
    const res = r.rows[0].res as Record<string, unknown>;
    expect(res.modelo).toBe("sdr");
    expect(res.distribuidos).toBe(2);
    const l1 = await lead(e1);
    const l2 = await lead(e2);
    expect([l1.sdr_id, l2.sdr_id].sort()).toEqual([sdr.id, sdr2.id].sort());
    expect(l1.status).toBe("aguardando_atendimento");
    expect(l1.corretor_id).toBeNull();
    expect(l1.classe_lead).toBe("base");
  });

  it("o cron de distribuição não rouba lead da base do SDR", async () => {
    await comoSuperuser(c);
    const antes = await c.query(
      `SELECT count(*)::int AS n FROM public.leads WHERE sdr_id IS NOT NULL AND corretor_id IS NULL AND status = 'aguardando_atendimento'`,
    );
    expect(antes.rows[0].n).toBeGreaterThan(0);
    await c.query(`SELECT public.processar_distribuicao_automatica()`);
    const depois = await c.query(
      `SELECT count(*)::int AS n FROM public.leads WHERE sdr_id IS NOT NULL AND corretor_id IS NULL AND status = 'aguardando_atendimento'`,
    );
    expect(depois.rows[0].n).toBe(antes.rows[0].n);
  });

  it("perdido há 40 dias (sem contato) é reciclado; 'já possui imóvel' e recente não", async () => {
    await comoSuperuser(c);
    const p1 = await criarLead(c, {
      nome: "Perdido velho",
      corretorId: corretorA.id,
      status: "em_atendimento",
    });
    const p2 = await criarLead(c, {
      nome: "Perdido imóvel",
      corretorId: corretorA.id,
      status: "em_atendimento",
    });
    const p3 = await criarLead(c, {
      nome: "Perdido recente",
      corretorId: corretorA.id,
      status: "em_atendimento",
    });
    await comoUsuario(c, admin.id);
    await c.query(
      `SELECT public.transicionar_lead($1, 'perdido', 'sumiu', NULL, NULL, 'sem_contato')`,
      [p1],
    );
    await c.query(
      `SELECT public.transicionar_lead($1, 'perdido', 'comprou', NULL, NULL, 'ja_possui_imovel')`,
      [p2],
    );
    await c.query(
      `SELECT public.transicionar_lead($1, 'perdido', 'sumiu', NULL, NULL, 'sem_contato')`,
      [p3],
    );
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads SET data_perda = now() - interval '40 days' WHERE id IN ($1, $2)`,
      [p1, p2],
    );

    const r = await c.query(`SELECT public.alimentar_base_sdr_perdidos() AS n`);
    expect(r.rows[0].n).toBe(1);
    const l1 = await lead(p1);
    expect(l1.sdr_id).not.toBeNull();
    expect(l1.corretor_id).toBeNull();
    expect(l1.corretor_anterior_id).toBe(corretorA.id);
    expect(l1.status).toBe("aguardando_atendimento");
    expect(l1.motivo_perda_categoria).toBeNull();
    expect((await lead(p2)).status).toBe("perdido");
    expect((await lead(p3)).status).toBe("perdido");
  });

  it("raio-x do SDR responde e a gestão consegue ler o de qualquer SDR", async () => {
    await comoUsuario(c, sdr.id);
    const r = await c.query(`SELECT public.sdr_raio_x() AS x`);
    const x = r.rows[0].x as Record<string, Record<string, unknown>>;
    expect(x.sdr_id).toBe(sdr.id);
    expect((x.agendamentos as Record<string, number>).periodo).toBeGreaterThanOrEqual(2);
    expect((x.metas as Record<string, number>).agendamentos_semana).toBe(8);

    await comoUsuario(c, corretorA.id);
    expect(await errCode(c.query(`SELECT public.sdr_raio_x($1)`, [sdr.id]))).toBe("42501");
    await comoUsuario(c, admin.id);
    const g = await c.query(`SELECT public.sdr_raio_x($1) AS x`, [sdr2.id]);
    expect((g.rows[0].x as Record<string, unknown>).sdr_id).toBe(sdr2.id);
    await comoSuperuser(c);
  });
});

describe("flag desligada", () => {
  it("nada roda: agendar, pegar e estoque voltam ao caminho vigente", async () => {
    await setFlag(false);
    await comoSuperuser(c);
    const l = await criarLead(c, { nome: "Flag off", status: "em_atendimento" });
    await c.query(`UPDATE public.leads SET sdr_id = $2 WHERE id = $1`, [l, sdr.id]);
    await comoUsuario(c, sdr.id);
    expect(
      await errCode(
        c.query(
          `SELECT public.agendar_visita_sdr($1, now() + interval '1 day', NULL, NULL, 'Estande')`,
          [l],
        ),
      ),
    ).toBe("42501");
    const reaq = await c.query(`SELECT count(*)::int AS n FROM public.sdr_leads_reaquecer(10)`);
    expect(reaq.rows[0].n).toBe(0);
    await comoSuperuser(c);
    const r = await c.query(`SELECT public.distribuir_estoque_roleta('plantao', 5) AS res`);
    expect((r.rows[0].res as Record<string, unknown>).modelo).toBeUndefined();
    await setFlag(true);
  });
});
