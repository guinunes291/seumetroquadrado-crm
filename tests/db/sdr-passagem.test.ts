/**
 * Pré-venda — a passagem do discador para o CRM (migration 20261014120000).
 *
 * Decisões do dono em 10/10/2026 (o SDR passa o dia no discador e só entra no
 * CRM para agendar ou recolher documentação):
 *  1. `sdr_passar_cliente`: cadastro com dedup + qualificação obrigatória +
 *     visita numa transação; faltou campo → SMQP1 e nada gravado; sem
 *     corretor apto → nada gravado (nem o cadastro);
 *  2. modo documentação: o lead fica na base do SDR, sem corretor;
 *  3. corretor de origem: o SDR puxa sem bloqueio, mas o corretor que falou
 *     com o cliente nos últimos 7 dias recebe a visita de volta (mesmo fora
 *     da roleta), com as guardas de sempre (agenda livre no horário); a marca
 *     é usada uma vez; o SDR não a escreve direto;
 *  4. `sdr_registrar_confirmacao`: confirmou / remarcar / não atendeu, com a
 *     tarefa D-1/D-0 fechada, o status da visita e o aviso ao corretor;
 *  5. `sdr_painel`: as colunas depois da passagem e a roleta só em número.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarLead,
  criarUsuario,
  darRegiao,
  errCode,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();
let admin: UsuarioTeste;
let sdr: UsuarioTeste;
let sdr2: UsuarioTeste;
let ana: UsuarioTeste; // na roleta agendados-sdr
let bruno: UsuarioTeste; // dono de leads que o SDR puxa (fora da roleta do SDR)
let roletaId: string;

// Atende tudo menos "Grande SP": uma passagem para lá não tem corretor apto.
const ZONAS_DO_TIME = ["Norte", "Sul", "Leste", "Oeste", "Centro"] as const;

const DIA = 24 * 60 * 60 * 1000;
// Cada visita num horário próprio (a roleta pula conflito de agenda).
let horario = 0;
const proximoHorario = () =>
  new Date(Date.now() + 3 * DIA + ++horario * 3 * 60 * 60 * 1000).toISOString();

let tel = 0;
const novoTelefone = () => `1197${String(1000000 + ++tel).slice(-7)}`;

function payload(extra: Record<string, unknown> = {}) {
  return {
    modo: "visita",
    nome: "Joana Prado",
    telefone: novoTelefone(),
    renda: "3.200",
    tipo_renda: "CLT",
    fgts: "sim",
    decisor: "Com o marido",
    restricao_cpf: "nao",
    resumo: "Mora de aluguel na Penha, quer 2 dorms perto do metrô.",
    zona: "Leste",
    local: "Estande Vila Matilde, Rua A, 100",
    inicio: proximoHorario(),
    ...extra,
  };
}

async function passar(user: UsuarioTeste, p: Record<string, unknown>) {
  await comoUsuario(c, user.id);
  try {
    return (
      await c.query(`SELECT public.sdr_passar_cliente($1::jsonb) AS res`, [JSON.stringify(p)])
    ).rows[0].res as Record<string, unknown>;
  } finally {
    await comoSuperuser(c);
  }
}

async function confirmar(
  user: UsuarioTeste,
  agendamentoId: string,
  resultado: string,
  novoInicio: string | null = null,
) {
  await comoUsuario(c, user.id);
  try {
    return (
      await c.query(
        `SELECT public.sdr_registrar_confirmacao($1, $2, $3::timestamptz, NULL) AS res`,
        [agendamentoId, resultado, novoInicio],
      )
    ).rows[0].res as Record<string, unknown>;
  } finally {
    await comoSuperuser(c);
  }
}

async function painel(user: UsuarioTeste, alvo: string | null = null) {
  await comoUsuario(c, user.id);
  try {
    return (await c.query(`SELECT public.sdr_painel($1) AS res`, [alvo])).rows[0].res as Record<
      string,
      unknown
    >;
  } finally {
    await comoSuperuser(c);
  }
}

async function lead(id: string) {
  await comoSuperuser(c);
  return (await c.query(`SELECT * FROM public.leads WHERE id = $1`, [id])).rows[0];
}

async function leadPorTelefone(telefone: string) {
  await comoSuperuser(c);
  const suf = telefone.replace(/\D/g, "").slice(-9);
  return (
    await c.query(
      `SELECT id FROM public.leads
        WHERE right(public.telefone_digits(COALESCE(telefone_e164, telefone)), 9) = $1`,
      [suf],
    )
  ).rows;
}

/** Lead do Bruno, em atendimento, com um contato dele `diasAtras` dias atrás. */
async function leadDoBruno(telefone: string, diasAtras: number) {
  const id = await criarLead(c, { corretorId: bruno.id, status: "em_atendimento", telefone });
  await c.query(
    `INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, ocorreu_em)
     VALUES ($1, $2, 'whatsapp', 'saida', 'Simulação', 'Mandei a simulação',
             now() - make_interval(days => $3))`,
    [id, bruno.id, diasAtras],
  );
  return id;
}

async function setSetting(chave: string, valor: unknown) {
  await comoSuperuser(c);
  await c.query(`UPDATE public.distribuicao_settings SET valor = $1::jsonb WHERE chave = $2`, [
    JSON.stringify(valor),
    chave,
  ]);
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await comoSuperuser(c);

  admin = await criarUsuario(c, { nome: "Admin Pré-venda", papel: "admin" });
  sdr = await criarUsuario(c, { nome: "Carla SDR", papel: "sdr" });
  sdr2 = await criarUsuario(c, { nome: "Diego SDR", papel: "sdr" });
  ana = await criarUsuario(c, { nome: "Ana Corretora", papel: "corretor" });
  bruno = await criarUsuario(c, { nome: "Bruno Corretor", papel: "corretor" });
  for (const [u, fone] of [
    [ana, "11999990011"],
    [bruno, "11999990012"],
  ] as const) {
    await c.query(`UPDATE public.profiles SET telefone = $2, ativo = true WHERE id = $1`, [
      u.id,
      fone,
    ]);
    await darRegiao(c, u.id, ZONAS_DO_TIME);
  }
  roletaId = (await c.query(`SELECT id FROM public.roletas WHERE slug = 'agendados-sdr'`)).rows[0]
    .id as string;
  await c.query(
    `INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo, incluido_por)
     VALUES ($1, $2, true, $3)`,
    [roletaId, ana.id, admin.id],
  );
  await setSetting("sdr_ativo", true);
});

afterAll(async () => {
  await setSetting("sdr_ativo", false);
  await comoSuperuser(c);
  await c.query(`DELETE FROM public.roleta_participantes WHERE roleta_id = $1`, [roletaId]);
  await c.end();
});

describe("passagem do discador (sdr_passar_cliente)", () => {
  it("cria o lead na base do SDR, grava a qualificação e agenda pela roleta", async () => {
    const p = payload();
    const res = await passar(sdr, p);
    expect(res).toMatchObject({ ok: true, modo: "visita", novo: true, puxado: false });
    expect(res.corretor_id).toBe(ana.id);

    const l = await lead(res.lead_id as string);
    expect(l).toMatchObject({
      sdr_id: sdr.id,
      corretor_id: ana.id,
      status: "agendado",
      renda_informada: "3.200",
      tipo_renda: "CLT",
      tem_fgts: true,
      usa_fgts: true,
      decisor: "Com o marido",
      restricao_cpf: "nao",
      sdr_interesse_confirmado: true,
      zona: "Leste",
    });
    expect(Number(l.renda_estimada)).toBe(3200);
    expect(l.resumo_qualificacao).toContain("2 dorms");
    expect(l.sdr_entregue_em).not.toBeNull();

    const ag = (
      await c.query(
        `SELECT corretor_id, local, status::text AS status FROM public.agendamentos WHERE lead_id = $1`,
        [l.id],
      )
    ).rows;
    expect(ag).toEqual([
      { corretor_id: ana.id, local: "Estande Vila Matilde, Rua A, 100", status: "agendado" },
    ]);
    const tarefas = (
      await c.query(
        `SELECT corretor_id FROM public.tarefas WHERE lead_id = $1 AND titulo LIKE 'Confirmar visita de %'`,
        [l.id],
      )
    ).rows;
    expect(tarefas.length).toBe(2);
    expect(tarefas.every((t) => t.corretor_id === sdr.id)).toBe(true);
    const lig = (
      await c.query(
        `SELECT tipo::text AS tipo, autor_id, metadata->>'evento' AS evento
           FROM public.interacoes WHERE lead_id = $1 AND tipo = 'ligacao'`,
        [l.id],
      )
    ).rows;
    expect(lig).toEqual([{ tipo: "ligacao", autor_id: sdr.id, evento: "sdr_passagem" }]);
  });

  it("faltando campo obrigatório: SMQP1 com a lista, e nada é gravado", async () => {
    const p = payload({ tipo_renda: "", restricao_cpf: null, local: "  " });
    await comoUsuario(c, sdr.id);
    let msg = "";
    try {
      await c.query(`SELECT public.sdr_passar_cliente($1::jsonb)`, [JSON.stringify(p)]);
    } catch (e) {
      msg = (e as { message: string }).message;
      expect((e as { code: string }).code).toBe("SMQP1");
    }
    expect(msg).toContain("tipo de renda");
    expect(msg).toContain("restrição no CPF");
    expect(msg).toContain("endereço da visita");
    expect(await leadPorTelefone(p.telefone as string)).toEqual([]);
  });

  it("sem corretor apto na zona: erro e o cadastro também volta atrás", async () => {
    const p = payload({ zona: "Grande SP" });
    expect(await errCode(passar(sdr, p))).toBe("22023");
    expect(await leadPorTelefone(p.telefone as string)).toEqual([]);
  });

  it("documentação: o lead fica na base do SDR, em atendimento e sem corretor", async () => {
    const p = payload({ modo: "documentacao", zona: null, local: null, inicio: null });
    const res = await passar(sdr, p);
    expect(res).toMatchObject({ ok: true, modo: "documentacao" });
    const l = await lead(res.lead_id as string);
    expect(l).toMatchObject({
      sdr_id: sdr.id,
      corretor_id: null,
      sdr_entregue_em: null,
      status: "em_atendimento",
      restricao_cpf: "nao",
    });
    const pn = await painel(sdr);
    expect((pn.sem_visita as Array<{ lead_id: string }>).map((x) => x.lead_id)).toContain(l.id);
  });

  it("aberta da ficha (lead_id): usa o próprio registro; o de outro SDR é recusado", async () => {
    const doc = await passar(sdr, payload({ modo: "documentacao", zona: null, local: null }));
    const id = doc.lead_id as string;
    // Telefone diferente de propósito: com lead_id, o banco não procura por ele.
    const res = await passar(sdr, payload({ lead_id: id, telefone: novoTelefone() }));
    expect(res).toMatchObject({ lead_id: id, novo: false, puxado: false });
    expect((await lead(id)).status).toBe("agendado");
    const outro = await passar(sdr2, payload({ modo: "documentacao", zona: null, local: null }));
    expect(await errCode(passar(sdr, payload({ lead_id: outro.lead_id })))).toBe("42501");
  });

  it("cliente que já foi passado a um corretor: SMQP3", async () => {
    const p = payload();
    await passar(sdr, p);
    expect(await errCode(passar(sdr, { ...p, inicio: proximoHorario() }))).toBe("SMQP3");
  });

  it("só o SDR passa cliente (corretor e admin recebem 42501)", async () => {
    expect(await errCode(passar(ana, payload()))).toBe("42501");
    expect(await errCode(passar(admin, payload()))).toBe("42501");
  });
});

describe("corretor de origem (decisão b)", () => {
  it("contato do corretor nos últimos 7 dias: o SDR puxa e a visita volta para ele", async () => {
    const telefone = novoTelefone();
    const id = await leadDoBruno(telefone, 2);
    const res = await passar(sdr, payload({ telefone }));
    expect(res).toMatchObject({ lead_id: id, puxado: true, corretor_origem_id: bruno.id });
    // O Bruno não está na roleta do SDR: recebeu como corretor de origem.
    expect(res.corretor_id).toBe(bruno.id);
    expect(res.regra).toBe("sdr_retorno_corretor_origem");
    const l = await lead(id);
    expect(l.corretor_id).toBe(bruno.id);
    expect(l.sdr_id).toBe(sdr.id);
    // Usada uma vez: a marca sai na entrega.
    expect(l.sdr_corretor_origem_id).toBeNull();
  });

  it("contato há mais de 7 dias: puxa sem marca e a visita vai pela roleta", async () => {
    const telefone = novoTelefone();
    const id = await leadDoBruno(telefone, 10);
    const res = await passar(sdr, payload({ telefone }));
    expect(res).toMatchObject({ lead_id: id, puxado: true, corretor_origem_id: null });
    expect(res.corretor_id).toBe(ana.id);
    expect(res.regra).toBe("roleta_sdr");
  });

  it("corretor de origem com agenda ocupada no horário: roleta, com o motivo no log", async () => {
    const telefone = novoTelefone();
    const id = await leadDoBruno(telefone, 1);
    const inicio = proximoHorario();
    await c.query(
      `INSERT INTO public.agendamentos (lead_id, corretor_id, titulo, tipo, status, data_inicio, data_fim)
       VALUES (NULL, $1, 'Outra visita', 'visita', 'agendado', $2::timestamptz, $2::timestamptz + interval '1 hour')`,
      [bruno.id, inicio],
    );
    const res = await passar(sdr, payload({ telefone, inicio }));
    expect(res.corretor_id).toBe(ana.id);
    const ctx = (
      await c.query(
        `SELECT lc.contexto->>'prioridade_recusa' AS recusa
           FROM public.distribution_log dl
           JOIN public.distribuicao_log_contexto lc ON lc.log_id = dl.id
          WHERE dl.lead_id = $1 AND dl.resultado = 'sucesso' AND lc.contexto->>'gatilho' = 'agendamento_sdr'`,
        [id],
      )
    ).rows;
    expect(ctx).toEqual([{ recusa: "conflito_agenda" }]);
  });

  it("a janela é configurável (sdr_origem_recente_dias)", async () => {
    await setSetting("sdr_origem_recente_dias", 15);
    try {
      const telefone = novoTelefone();
      await leadDoBruno(telefone, 10);
      const res = await passar(sdr, payload({ telefone }));
      expect(res.corretor_id).toBe(bruno.id);
    } finally {
      await setSetting("sdr_origem_recente_dias", 7);
    }
  });

  it("o SDR não escreve o corretor de origem direto", async () => {
    const res = await passar(sdr, payload({ modo: "documentacao", zona: null, local: null }));
    await comoUsuario(c, sdr.id);
    const code = await errCode(
      c.query(`UPDATE public.leads SET sdr_corretor_origem_id = $2 WHERE id = $1`, [
        res.lead_id,
        bruno.id,
      ]),
    );
    await comoSuperuser(c);
    expect(code).toBe("42501");
  });
});

describe("confirmação com resultado (sdr_registrar_confirmacao)", () => {
  async function visitaNova() {
    const res = await passar(sdr, payload());
    return { leadId: res.lead_id as string, agendamentoId: res.agendamento_id as string };
  }
  async function tarefas(leadId: string) {
    return (
      await c.query(
        `SELECT titulo, status::text AS status, resultado FROM public.tarefas
          WHERE lead_id = $1 AND titulo LIKE 'Confirmar visita de %' ORDER BY data_vencimento`,
        [leadId],
      )
    ).rows as Array<{ titulo: string; status: string; resultado: string | null }>;
  }
  async function alertas(userId: string, leadId: string) {
    return (
      await c.query(`SELECT titulo FROM public.alertas WHERE user_id = $1 AND link = $2`, [
        userId,
        `/leads/${leadId}`,
      ])
    ).rows.map((r) => r.titulo as string);
  }

  it("confirmou: a visita fica confirmada e a D-1 fecha com o resultado (a D-0 segue)", async () => {
    const { leadId, agendamentoId } = await visitaNova();
    const res = await confirmar(sdr, agendamentoId, "confirmou");
    expect(res).toMatchObject({ ok: true, resultado: "confirmou", agendamento_id: agendamentoId });
    const st = (
      await c.query(`SELECT status::text AS s FROM public.agendamentos WHERE id = $1`, [
        agendamentoId,
      ])
    ).rows[0].s;
    expect(st).toBe("confirmado");
    const t = await tarefas(leadId);
    expect(t.map((x) => [x.status, x.resultado])).toEqual([
      ["concluida", "Confirmou"],
      ["pendente", null],
    ]);
    expect(await alertas(ana.id, leadId)).not.toContain("Visita ainda não confirmada");
  });

  it("não atendeu: a visita segue a confirmar e o corretor é avisado", async () => {
    const { leadId, agendamentoId } = await visitaNova();
    await confirmar(sdr, agendamentoId, "nao_atendeu");
    const st = (
      await c.query(`SELECT status::text AS s FROM public.agendamentos WHERE id = $1`, [
        agendamentoId,
      ])
    ).rows[0].s;
    expect(st).toBe("agendado");
    expect(await alertas(ana.id, leadId)).toContain("Visita ainda não confirmada");
    expect((await tarefas(leadId))[0].resultado).toBe("Não atendeu");
  });

  it("remarcar: novo horário com o mesmo corretor, D-1/D-0 novas para o SDR e aviso", async () => {
    const { leadId, agendamentoId } = await visitaNova();
    expect(await errCode(confirmar(sdr, agendamentoId, "remarcar"))).toBe("22023");

    const novo = proximoHorario();
    const res = await confirmar(sdr, agendamentoId, "remarcar", novo);
    expect(res.agendamento_id).not.toBe(agendamentoId);
    const ags = (
      await c.query(
        `SELECT id, corretor_id, criado_por_id, status::text AS status
           FROM public.agendamentos WHERE lead_id = $1 ORDER BY created_at`,
        [leadId],
      )
    ).rows;
    expect(ags.map((a) => [a.status, a.corretor_id])).toEqual([
      ["remarcado", ana.id],
      ["agendado", ana.id],
    ]);
    expect(ags[1].criado_por_id).toBe(sdr.id);
    const t = await tarefas(leadId);
    expect(t.filter((x) => x.status === "pendente").length).toBe(2);
    expect(t.filter((x) => x.status === "concluida").length).toBe(2);
    expect(await alertas(ana.id, leadId)).toContain("Visita remarcada");
  });

  it("remarcar para um horário em que o corretor já tem compromisso: 22023", async () => {
    const a = await visitaNova();
    const b = await visitaNova();
    const ocupado = (
      await c.query(`SELECT data_inicio FROM public.agendamentos WHERE id = $1`, [b.agendamentoId])
    ).rows[0].data_inicio as Date;
    expect(
      await errCode(confirmar(sdr, a.agendamentoId, "remarcar", new Date(ocupado).toISOString())),
    ).toBe("22023");
  });

  it("outro SDR não registra a confirmação; o admin registra", async () => {
    const { agendamentoId } = await visitaNova();
    expect(await errCode(confirmar(sdr2, agendamentoId, "confirmou"))).toBe("42501");
    expect((await confirmar(admin, agendamentoId, "confirmou")).ok).toBe(true);
  });
});

describe("painel do SDR (sdr_painel)", () => {
  it("visitas a confirmar e confirmadas, com o corretor; a roleta só em número", async () => {
    const pn = await painel(sdr);
    const aConfirmar = pn.a_confirmar as Array<Record<string, unknown>>;
    const confirmada = pn.confirmada as Array<Record<string, unknown>>;
    expect(aConfirmar.length).toBeGreaterThan(0);
    expect(confirmada.length).toBeGreaterThan(0);
    expect(aConfirmar[0]).toHaveProperty("corretor_nome");
    expect(aConfirmar[0]).toHaveProperty("telefone");
    // A roleta: só a contagem e as chaves da régua, nenhum nome ou id.
    expect(pn.roleta).toEqual({
      aptos: 1,
      regra_semanal: expect.any(Boolean),
      sombra: expect.any(Boolean),
      zona_estrita: expect.any(Boolean),
    });
    expect(JSON.stringify(pn.roleta)).not.toContain(ana.id);
    expect(JSON.stringify(pn.roleta)).not.toContain("Ana");
    expect(pn.semana).toEqual({ de: expect.any(String), ate: expect.any(String) });
    // O último cliente passado, com o que o corretor recebeu.
    expect(pn.ultima_entrega).toMatchObject({
      corretor_nome: expect.any(String),
      renda_informada: "3.200",
      tipo_renda: "CLT",
      usa_fgts: true,
      restricao_cpf: "nao",
    });
  });

  it("realizada na semana e no-show para reagendar", async () => {
    const r1 = await passar(sdr, payload());
    const r2 = await passar(sdr, payload());
    // A visita aconteceu: fica no passado (a semana da folha começa no sábado).
    await c.query(
      `UPDATE public.agendamentos
          SET data_inicio = now() - interval '1 minute', data_fim = now() + interval '59 minutes',
              status = 'realizado'
        WHERE id = $1`,
      [r1.agendamento_id],
    );
    await c.query(
      `UPDATE public.agendamentos
          SET data_inicio = now() - interval '2 hours', data_fim = now() - interval '1 hour'
        WHERE id = $1`,
      [r2.agendamento_id],
    );
    await c.query(`UPDATE public.agendamentos SET status = 'nao_compareceu' WHERE id = $1`, [
      r2.agendamento_id,
    ]);
    const pn = await painel(sdr);
    const ids = (k: string) => (pn[k] as Array<{ lead_id: string }>).map((x) => x.lead_id);
    expect(ids("realizada")).toContain(r1.lead_id);
    expect(ids("reagendar")).toContain(r2.lead_id);
    expect(ids("a_confirmar")).not.toContain(r2.lead_id);
  });

  it("outro SDR não lê o painel alheio; o admin lê; corretor não lê", async () => {
    expect(await errCode(painel(sdr2, sdr.id))).toBe("42501");
    expect(await errCode(painel(ana))).toBe("42501");
    const pn = await painel(admin, sdr.id);
    expect((pn.a_confirmar as unknown[]).length).toBeGreaterThan(0);
  });
});
