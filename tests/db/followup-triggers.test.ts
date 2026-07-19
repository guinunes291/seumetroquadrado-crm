/**
 * TRIGGERS DE FOLLOW-UP: espelho tarefas <-> leads.proximo_followup.
 *
 * Semântica descoberta no banco (pg_get_functiondef, migration 20260708155905):
 *
 * (a) trg_tarefa_sync_followup (AFTER INSERT OR DELETE OR UPDATE OF status,
 *     data_vencimento, deleted_at, lead_id ON tarefas) chama
 *     sync_proximo_followup(lead_id), que grava em leads.proximo_followup o
 *     min(data_vencimento) das tarefas do lead com:
 *       status IN ('pendente','em_andamento')  -- "abertas"
 *       AND deleted_at IS NULL
 *       AND data_vencimento IS NOT NULL
 *     TODOS os tipos de tarefa entram no espelho (não há filtro por tipo).
 *
 * (b) trg_leads_cancelar_followups (AFTER UPDATE OF status ON leads →
 *     trg_cancelar_followups_fechamento): quando o lead muda para
 *     'contrato_fechado' | 'perdido' | 'pos_venda', cancela as tarefas abertas
 *     do lead SOMENTE dos tipos de contato ('follow_up','ligacao','whatsapp',
 *     'email'). O cancelamento re-dispara (a) e o espelho é recalculado.
 *
 * BUG descoberto no cruzamento (a) × (b): tipos fora da lista de contato
 * ('visita','documentacao','outro') não são cancelados no fechamento mas
 * CONTAM no espelho — o NULL gravado por transicionar_lead é sobrescrito pela
 * cascata e o lead fechado/perdido volta a exibir proximo_followup.
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

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
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

/** Cria tarefa como superusuário (fora do RLS) e retorna o id. */
async function criarTarefa(opts: {
  leadId: string | null;
  corretorId: string;
  tipo?: string;
  status?: string;
  vencimento?: Date | null;
  titulo?: string;
}): Promise<string> {
  await comoSuperuser(c);
  const r = await c.query(
    `INSERT INTO public.tarefas (titulo, tipo, status, lead_id, corretor_id, data_vencimento)
     VALUES ($1, $2::public.tarefa_tipo, $3::public.tarefa_status, $4, $5, $6)
     RETURNING id`,
    [
      opts.titulo ?? "Tarefa de teste",
      opts.tipo ?? "follow_up",
      opts.status ?? "pendente",
      opts.leadId,
      opts.corretorId,
      opts.vencimento ?? null,
    ],
  );
  return r.rows[0].id as string;
}

/** Lê leads.proximo_followup fora do RLS. */
async function espelho(leadId: string): Promise<Date | null> {
  await comoSuperuser(c);
  const r = await c.query(`SELECT proximo_followup FROM public.leads WHERE id = $1`, [leadId]);
  return r.rows[0].proximo_followup as Date | null;
}

async function statusTarefa(tarefaId: string): Promise<string> {
  await comoSuperuser(c);
  const r = await c.query(`SELECT status::text AS status FROM public.tarefas WHERE id = $1`, [
    tarefaId,
  ]);
  return r.rows[0].status as string;
}

// ---------------------------------------------------------------------------
// (a) Espelho leads.proximo_followup ← tarefas (trg_tarefa_sync_followup)
// ---------------------------------------------------------------------------

describe("espelho leads.proximo_followup (trg_tarefa_sync_followup / sync_proximo_followup)", () => {
  let corretor: UsuarioTeste;

  beforeAll(async () => {
    corretor = await criarUsuario(c, { papel: "corretor" });
  });

  it("inserir tarefa follow-up pendente com data futura espelha a data no lead", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const venc = daquiDias(3);
    await criarTarefa({ leadId: lead, corretorId: corretor.id, vencimento: venc });

    expect((await espelho(lead))?.getTime()).toBe(venc.getTime());
  });

  it("duas tarefas abertas → espelho = a mais próxima; concluir a mais próxima avança; concluir todas limpa (NULL)", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const vencPerto = daquiDias(1);
    const vencLonge = daquiDias(5);
    const tPerto = await criarTarefa({
      leadId: lead,
      corretorId: corretor.id,
      vencimento: vencPerto,
    });
    const tLonge = await criarTarefa({
      leadId: lead,
      corretorId: corretor.id,
      vencimento: vencLonge,
    });

    // a mais próxima vence
    expect((await espelho(lead))?.getTime()).toBe(vencPerto.getTime());

    // concluir a mais próxima → espelho avança para a seguinte
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.tarefas SET status = 'concluida', data_conclusao = now() WHERE id = $1`,
      [tPerto],
    );
    expect((await espelho(lead))?.getTime()).toBe(vencLonge.getTime());

    // concluir todas → NULL
    await c.query(
      `UPDATE public.tarefas SET status = 'concluida', data_conclusao = now() WHERE id = $1`,
      [tLonge],
    );
    expect(await espelho(lead)).toBeNull();
  });

  it("cancelar a tarefa remove a data do espelho", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const t = await criarTarefa({
      leadId: lead,
      corretorId: corretor.id,
      vencimento: daquiDias(2),
    });
    expect(await espelho(lead)).not.toBeNull();

    await comoSuperuser(c);
    await c.query(`UPDATE public.tarefas SET status = 'cancelada' WHERE id = $1`, [t]);
    expect(await espelho(lead)).toBeNull();
  });

  it("soft delete (deleted_at) e DELETE físico também recalculam o espelho", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const venc1 = daquiDias(1);
    const venc2 = daquiDias(4);
    const t1 = await criarTarefa({ leadId: lead, corretorId: corretor.id, vencimento: venc1 });
    const t2 = await criarTarefa({ leadId: lead, corretorId: corretor.id, vencimento: venc2 });
    expect((await espelho(lead))?.getTime()).toBe(venc1.getTime());

    // soft delete da mais próxima → cai para a seguinte
    await comoSuperuser(c);
    await c.query(`UPDATE public.tarefas SET deleted_at = now() WHERE id = $1`, [t1]);
    expect((await espelho(lead))?.getTime()).toBe(venc2.getTime());

    // DELETE físico da restante → NULL (ramo TG_OP = 'DELETE' do trigger)
    await c.query(`DELETE FROM public.tarefas WHERE id = $1`, [t2]);
    expect(await espelho(lead)).toBeNull();
  });

  it("reagendar (UPDATE data_vencimento) faz o espelho acompanhar", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const t = await criarTarefa({
      leadId: lead,
      corretorId: corretor.id,
      vencimento: daquiDias(2),
    });

    const novoVenc = daquiDias(7);
    await comoSuperuser(c);
    await c.query(`UPDATE public.tarefas SET data_vencimento = $2 WHERE id = $1`, [t, novoVenc]);
    expect((await espelho(lead))?.getTime()).toBe(novoVenc.getTime());
  });

  it("semântica de 'aberta': em_andamento conta; sem data_vencimento fica de fora; qualquer tipo entra no espelho", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });

    // em_andamento conta como aberta
    const vencAndamento = daquiDias(2);
    const tAndamento = await criarTarefa({
      leadId: lead,
      corretorId: corretor.id,
      status: "em_andamento",
      vencimento: vencAndamento,
    });
    expect((await espelho(lead))?.getTime()).toBe(vencAndamento.getTime());

    // pendente SEM data_vencimento não altera o espelho
    await criarTarefa({ leadId: lead, corretorId: corretor.id, vencimento: null });
    expect((await espelho(lead))?.getTime()).toBe(vencAndamento.getTime());

    // o espelho NÃO filtra por tipo: uma 'visita' mais próxima passa a valer
    const vencVisita = daquiDias(1);
    await criarTarefa({
      leadId: lead,
      corretorId: corretor.id,
      tipo: "visita",
      vencimento: vencVisita,
    });
    expect((await espelho(lead))?.getTime()).toBe(vencVisita.getTime());

    // limpeza local para não interferir em outros casos deste describe
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.tarefas WHERE lead_id = $1`, [lead]);
    void tAndamento;
  });

  it("tarefa de OUTRO lead não interfere no espelho", async () => {
    const leadA = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const leadB = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const vencA = daquiDias(5);
    const vencB = daquiDias(1);
    await criarTarefa({ leadId: leadA, corretorId: corretor.id, vencimento: vencA });
    const tB = await criarTarefa({ leadId: leadB, corretorId: corretor.id, vencimento: vencB });

    // a tarefa mais próxima do lead B não "vaza" para o lead A
    expect((await espelho(leadA))?.getTime()).toBe(vencA.getTime());
    expect((await espelho(leadB))?.getTime()).toBe(vencB.getTime());

    // concluir a tarefa do lead B não mexe no lead A
    await comoSuperuser(c);
    await c.query(`UPDATE public.tarefas SET status = 'concluida' WHERE id = $1`, [tB]);
    expect((await espelho(leadA))?.getTime()).toBe(vencA.getTime());
    expect(await espelho(leadB)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (b) Fechamento/perda cancela follow-ups (trg_cancelar_followups_fechamento)
// ---------------------------------------------------------------------------

describe("fechamento/perda do lead cancela follow-ups (trg_leads_cancelar_followups)", () => {
  let corretor: UsuarioTeste;

  beforeAll(async () => {
    corretor = await criarUsuario(c, { papel: "corretor" });
  });

  it("marcar_lead_perdido_v2 pelo corretor cancela as tarefas abertas de contato e limpa proximo_followup", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const tFollow = await criarTarefa({
      leadId: lead,
      corretorId: corretor.id,
      tipo: "follow_up",
      vencimento: daquiDias(1),
    });
    const tLigacao = await criarTarefa({
      leadId: lead,
      corretorId: corretor.id,
      tipo: "ligacao",
      status: "em_andamento",
      vencimento: daquiDias(2),
    });
    const tWhats = await criarTarefa({
      leadId: lead,
      corretorId: corretor.id,
      tipo: "whatsapp",
      vencimento: daquiDias(3),
    });
    const tEmail = await criarTarefa({
      leadId: lead,
      corretorId: corretor.id,
      tipo: "email",
      vencimento: daquiDias(4),
    });
    const tConcluida = await criarTarefa({
      leadId: lead,
      corretorId: corretor.id,
      tipo: "follow_up",
      status: "concluida",
      vencimento: daquiDias(5),
    });
    expect(await espelho(lead)).not.toBeNull();

    // sem roleta ativa a redistribuição falha e o lead termina 'perdido'
    await comoUsuario(c, corretor.id);
    await c.query(`SELECT public.marcar_lead_perdido_v2($1, 'sem_perfil', 'sem interesse')`, [
      lead,
    ]);

    await comoSuperuser(c);
    const l = await c.query(
      `SELECT status::text AS status, proximo_followup FROM public.leads WHERE id = $1`,
      [lead],
    );
    expect(l.rows[0].status).toBe("perdido");
    expect(l.rows[0].proximo_followup).toBeNull();

    // todas as abertas de contato foram canceladas pelo trigger
    expect(await statusTarefa(tFollow)).toBe("cancelada");
    expect(await statusTarefa(tLigacao)).toBe("cancelada");
    expect(await statusTarefa(tWhats)).toBe("cancelada");
    expect(await statusTarefa(tEmail)).toBe("cancelada");
    // concluída não é tocada
    expect(await statusTarefa(tConcluida)).toBe("concluida");
  });

  it("semântica declarada: tipos fora da lista de contato (visita/documentacao/outro) NÃO são cancelados no fechamento", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const tVisita = await criarTarefa({
      leadId: lead,
      corretorId: corretor.id,
      tipo: "visita",
      vencimento: daquiDias(5),
    });
    const tDoc = await criarTarefa({
      leadId: lead,
      corretorId: corretor.id,
      tipo: "documentacao",
      vencimento: null,
    });

    await comoUsuario(c, corretor.id);
    await c.query(`SELECT public.marcar_lead_perdido_v2($1, 'sem_perfil', 'sem interesse')`, [
      lead,
    ]);

    // o trigger cancela só tipo IN ('follow_up','ligacao','whatsapp','email')
    expect(await statusTarefa(tVisita)).toBe("pendente");
    expect(await statusTarefa(tDoc)).toBe("pendente");
  });

  // Corrigido na migration 20260719123000: sync_proximo_followup zera o
  // espelho para lead em status terminal (contrato_fechado/pos_venda/
  // perdido) — tarefa não-contato pendente não repovoa o follow-up de lead
  // encerrado.
  it("lead perdido fica com proximo_followup NULL mesmo com tarefa 'visita' pendente remanescente", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    await criarTarefa({
      leadId: lead,
      corretorId: corretor.id,
      tipo: "follow_up",
      vencimento: daquiDias(1),
    });
    await criarTarefa({
      leadId: lead,
      corretorId: corretor.id,
      tipo: "visita",
      vencimento: daquiDias(5),
    });

    await comoUsuario(c, corretor.id);
    await c.query(`SELECT public.marcar_lead_perdido_v2($1, 'sem_perfil', 'sem interesse')`, [
      lead,
    ]);

    await comoSuperuser(c);
    const l = await c.query(
      `SELECT status::text AS status, proximo_followup FROM public.leads WHERE id = $1`,
      [lead],
    );
    expect(l.rows[0].status).toBe("perdido");
    expect(l.rows[0].proximo_followup).toBeNull();
  });

  it("reabrir tarefa não dispara cancelamento: o trigger só age na TRANSIÇÃO de status do lead", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    await comoUsuario(c, corretor.id);
    await c.query(`SELECT public.marcar_lead_perdido_v2($1, 'sem_perfil', 'sem interesse')`, [
      lead,
    ]);

    // criar tarefa aberta num lead JÁ perdido: o cancelamento não re-executa
    // (só roda no UPDATE de leads.status) — a tarefa fica pendente, mas o
    // espelho NÃO é repovoado (sync_proximo_followup ignora lead terminal
    // desde a migration 20260719123000).
    const venc = daquiDias(2);
    const t = await criarTarefa({ leadId: lead, corretorId: corretor.id, vencimento: venc });
    expect(await statusTarefa(t)).toBe("pendente");
    expect(await espelho(lead)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (c) RLS básico: carteira do corretor (matriz completa em rls-por-papel)
// ---------------------------------------------------------------------------

describe("RLS: corretor só vê/conclui tarefas dos leads da própria carteira", () => {
  it("corretor não enxerga nem conclui tarefa de lead alheio; conclui a própria e o espelho sincroniza", async () => {
    const dono = await criarUsuario(c, { papel: "corretor" });
    const intruso = await criarUsuario(c, { papel: "corretor" });
    const lead = await criarLead(c, { corretorId: dono.id, status: "em_atendimento" });
    const venc = daquiDias(2);
    const t = await criarTarefa({ leadId: lead, corretorId: dono.id, vencimento: venc });

    // intruso: SELECT não retorna a tarefa; UPDATE afeta 0 linhas
    await comoUsuario(c, intruso.id);
    const visiveis = await c.query(`SELECT id FROM public.tarefas WHERE id = $1`, [t]);
    expect(visiveis.rowCount).toBe(0);
    const upd = await c.query(
      `UPDATE public.tarefas SET status = 'concluida', data_conclusao = now() WHERE id = $1`,
      [t],
    );
    expect(upd.rowCount).toBe(0);
    expect(await statusTarefa(t)).toBe("pendente");
    expect((await espelho(lead))?.getTime()).toBe(venc.getTime());

    // dono: vê e conclui; o trigger (SECURITY DEFINER) atualiza o lead mesmo
    // sem o corretor ter UPDATE direto em leads
    await comoUsuario(c, dono.id);
    const minhas = await c.query(`SELECT id FROM public.tarefas WHERE id = $1`, [t]);
    expect(minhas.rowCount).toBe(1);
    const ok = await c.query(
      `UPDATE public.tarefas SET status = 'concluida', data_conclusao = now() WHERE id = $1`,
      [t],
    );
    expect(ok.rowCount).toBe(1);

    expect(await statusTarefa(t)).toBe("concluida");
    expect(await espelho(lead)).toBeNull();
  });
});
