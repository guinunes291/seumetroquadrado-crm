/**
 * MATRIZ DE RLS POR PAPEL.
 *
 * Cenário: equipe A (gestor G_A, corretores C_A1 e C_A2), equipe B (gestor
 * G_B, corretor C_B), admin e superintendente. Leads: um de C_A1, um de
 * C_A2, um de C_B e um sem corretor (aguardando_atendimento, "fila").
 *
 * Regras vivas confirmadas no banco (pg_policies + pg_get_functiondef):
 * - leads_select_carteira: corretor vê os seus; gestor vê corretores_do_gestor
 *   (mesma equipe do profile OU equipes.gestor_id); admin/superintendente
 *   veem tudo (ve_carteira_completa).
 * - leads_update_carteira: USING pode_acessar_lead(uid, id) /
 *   WITH CHECK pode_atribuir_lead(uid, corretor_id).
 * - leads_insert_carteira: WITH CHECK pode_atribuir_lead(uid, corretor_id).
 * - leads_delete_admin: apenas admin OU superintendente.
 * - tarefas/agendamentos/interacoes: escopo herdado do lead vinculado.
 * - vendas/comissoes: escopo via pode_acessar_lead do lead da venda
 *   (+ beneficiario_id nas comissões).
 * - metas: SELECT USING (true) — leitura global (decisão de produto pendente).
 *
 * Semântica das asserções: linha invisível pelo USING => UPDATE/DELETE afeta
 * 0 linhas (sem erro); WITH CHECK violado => erro 42501.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarEquipe,
  criarLead,
  criarUsuario,
  errCode,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let equipeA: string;
let equipeB: string;
let gA: UsuarioTeste; // gestor da equipe A
let cA1: UsuarioTeste; // corretor 1 da equipe A
let cA2: UsuarioTeste; // corretor 2 da equipe A
let gB: UsuarioTeste; // gestor da equipe B
let cB: UsuarioTeste; // corretor da equipe B
let admin: UsuarioTeste;
let superi: UsuarioTeste;

let leadA1: string; // lead de C_A1
let leadA2: string; // lead de C_A2
let leadB: string; // lead de C_B
let leadFila: string; // sem corretor, aguardando_atendimento

let tarefaA1: string;
let tarefaB: string;
let agendA1: string;
let agendB: string;
let interA1: string;
let interB: string;
let vendaA: string;
let vendaB: string;
let comissaoA: string;
let comissaoB: string;
let metaA1: string;

async function idsVisiveis(sql: string): Promise<string[]> {
  const r = await c.query(sql);
  return r.rows.map((row) => row.id as string).sort();
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);

  equipeA = await criarEquipe(c, { nome: "Equipe A" });
  equipeB = await criarEquipe(c, { nome: "Equipe B" });

  gA = await criarUsuario(c, { nome: "Gestor A", papel: "gestor", equipeId: equipeA });
  cA1 = await criarUsuario(c, { nome: "Corretor A1", papel: "corretor", equipeId: equipeA });
  cA2 = await criarUsuario(c, { nome: "Corretor A2", papel: "corretor", equipeId: equipeA });
  gB = await criarUsuario(c, { nome: "Gestor B", papel: "gestor", equipeId: equipeB });
  cB = await criarUsuario(c, { nome: "Corretor B", papel: "corretor", equipeId: equipeB });
  admin = await criarUsuario(c, { nome: "Admin", papel: "admin" });
  superi = await criarUsuario(c, { nome: "Superintendente", papel: "superintendente" });

  // Espelha produção: o gestor também é o dono formal da equipe.
  await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gA.id, equipeA]);
  await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gB.id, equipeB]);

  leadA1 = await criarLead(c, { corretorId: cA1.id, status: "em_atendimento" });
  leadA2 = await criarLead(c, { corretorId: cA2.id, status: "em_atendimento" });
  leadB = await criarLead(c, { corretorId: cB.id, status: "em_atendimento" });
  leadFila = await criarLead(c, { corretorId: null, status: "aguardando_atendimento" });

  // Filhos vinculados aos leads (seed via superuser, fora do RLS).
  tarefaA1 = (
    await c.query(
      `INSERT INTO public.tarefas (titulo, lead_id, corretor_id, criado_por)
       VALUES ('Follow-up A1', $1, $2, $2) RETURNING id`,
      [leadA1, cA1.id],
    )
  ).rows[0].id;
  tarefaB = (
    await c.query(
      `INSERT INTO public.tarefas (titulo, lead_id, corretor_id, criado_por)
       VALUES ('Follow-up B', $1, $2, $2) RETURNING id`,
      [leadB, cB.id],
    )
  ).rows[0].id;

  agendA1 = (
    await c.query(
      `INSERT INTO public.agendamentos (lead_id, corretor_id, criado_por_id, titulo, data_inicio, data_fim)
       VALUES ($1, $2, $2, 'Visita A1', now() + interval '1 day', now() + interval '1 day 1 hour')
       RETURNING id`,
      [leadA1, cA1.id],
    )
  ).rows[0].id;
  agendB = (
    await c.query(
      `INSERT INTO public.agendamentos (lead_id, corretor_id, criado_por_id, titulo, data_inicio, data_fim)
       VALUES ($1, $2, $2, 'Visita B', now() + interval '1 day', now() + interval '1 day 1 hour')
       RETURNING id`,
      [leadB, cB.id],
    )
  ).rows[0].id;

  interA1 = (
    await c.query(
      `INSERT INTO public.interacoes (lead_id, autor_id, conteudo)
       VALUES ($1, $2, 'Nota do corretor A1') RETURNING id`,
      [leadA1, cA1.id],
    )
  ).rows[0].id;
  interB = (
    await c.query(
      `INSERT INTO public.interacoes (lead_id, autor_id, conteudo)
       VALUES ($1, $2, 'Nota do corretor B') RETURNING id`,
      [leadB, cB.id],
    )
  ).rows[0].id;

  vendaA = (
    await c.query(
      `INSERT INTO public.vendas (lead_id, corretor_id, criado_por_id, valor_venda, status_venda)
       VALUES ($1, $2, $2, 300000, 'pendente') RETURNING id`,
      [leadA1, cA1.id],
    )
  ).rows[0].id;
  vendaB = (
    await c.query(
      `INSERT INTO public.vendas (lead_id, corretor_id, criado_por_id, valor_venda, status_venda)
       VALUES ($1, $2, $2, 250000, 'pendente') RETURNING id`,
      [leadB, cB.id],
    )
  ).rows[0].id;

  comissaoA = (
    await c.query(
      `INSERT INTO public.comissoes (venda_id, lead_id, beneficiario_id, tipo, valor_comissao)
       VALUES ($1, $2, $3, 'corretor', 9000) RETURNING id`,
      [vendaA, leadA1, cA1.id],
    )
  ).rows[0].id;
  comissaoB = (
    await c.query(
      `INSERT INTO public.comissoes (venda_id, lead_id, beneficiario_id, tipo, valor_comissao)
       VALUES ($1, $2, $3, 'corretor', 7500) RETURNING id`,
      [vendaB, leadB, cB.id],
    )
  ).rows[0].id;

  metaA1 = (
    await c.query(
      `INSERT INTO public.metas (corretor_id, ano, mes, meta_vendas, criado_por)
       VALUES ($1, 2026, 7, 2, $2) RETURNING id`,
      [cA1.id, admin.id],
    )
  ).rows[0].id;
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

describe("leads · SELECT (matriz por papel)", () => {
  it("C_A1 vê apenas o próprio lead (nem o de C_A2 da mesma equipe, nem o da equipe B, nem a fila)", async () => {
    await comoUsuario(c, cA1.id);
    expect(await idsVisiveis(`SELECT id FROM public.leads`)).toEqual([leadA1].sort());
  });

  it("C_A2 vê apenas o próprio lead", async () => {
    await comoUsuario(c, cA2.id);
    expect(await idsVisiveis(`SELECT id FROM public.leads`)).toEqual([leadA2].sort());
  });

  it("G_A vê os leads da equipe A e não os da equipe B; lead sem corretor fica fora da carteira do gestor (regra atual de pode_acessar_lead exige corretor_id)", async () => {
    // Regra real confirmada: pode_acessar_lead/corretores_do_gestor escopam o
    // gestor pela equipe (profile.equipe_id OU equipes.gestor_id) e exigem
    // corretor_id NOT NULL — logo o lead da fila (aguardando_atendimento sem
    // corretor) só aparece para admin/superintendente.
    await comoUsuario(c, gA.id);
    expect(await idsVisiveis(`SELECT id FROM public.leads`)).toEqual([leadA1, leadA2].sort());
  });

  it("G_B vê apenas o lead da equipe B", async () => {
    await comoUsuario(c, gB.id);
    expect(await idsVisiveis(`SELECT id FROM public.leads`)).toEqual([leadB].sort());
  });

  it("admin vê todos os leads, inclusive o da fila sem corretor", async () => {
    await comoUsuario(c, admin.id);
    expect(await idsVisiveis(`SELECT id FROM public.leads`)).toEqual(
      [leadA1, leadA2, leadB, leadFila].sort(),
    );
  });

  it("superintendente vê todos os leads, inclusive o da fila sem corretor", async () => {
    await comoUsuario(c, superi.id);
    expect(await idsVisiveis(`SELECT id FROM public.leads`)).toEqual(
      [leadA1, leadA2, leadB, leadFila].sort(),
    );
  });
});

describe("leads · UPDATE (carteira + atribuição)", () => {
  it("C_A1 atualiza campo comum (nome) do próprio lead", async () => {
    await comoUsuario(c, cA1.id);
    const r = await c.query(`UPDATE public.leads SET nome = 'Lead A1 editado' WHERE id = $1`, [
      leadA1,
    ]);
    expect(r.rowCount).toBe(1);
  });

  it("C_A1 NÃO atualiza nome do lead de C_A2 (mesma equipe): linha invisível, 0 afetadas", async () => {
    await comoUsuario(c, cA1.id);
    const r = await c.query(`UPDATE public.leads SET nome = 'invasao' WHERE id = $1`, [leadA2]);
    expect(r.rowCount).toBe(0);
    await comoSuperuser(c);
    const nome = await c.query(`SELECT nome FROM public.leads WHERE id = $1`, [leadA2]);
    expect(nome.rows[0].nome).not.toBe("invasao");
  });

  it("C_A1 NÃO atualiza nome do lead da equipe B: 0 afetadas", async () => {
    await comoUsuario(c, cA1.id);
    const r = await c.query(`UPDATE public.leads SET nome = 'invasao' WHERE id = $1`, [leadB]);
    expect(r.rowCount).toBe(0);
  });

  it("C_A1 NÃO se auto-atribui lead de C_A2 via UPDATE corretor_id: lead alheio é invisível (0 afetadas)", async () => {
    await comoUsuario(c, cA1.id);
    const r = await c.query(`UPDATE public.leads SET corretor_id = $1 WHERE id = $2`, [
      cA1.id,
      leadA2,
    ]);
    expect(r.rowCount).toBe(0);
    await comoSuperuser(c);
    const dono = await c.query(`SELECT corretor_id FROM public.leads WHERE id = $1`, [leadA2]);
    expect(dono.rows[0].corretor_id).toBe(cA2.id);
  });

  it("C_A1 NÃO se auto-atribui lead da fila via UPDATE direto (auto-atribuição só via fluxo do sistema): 0 afetadas", async () => {
    await comoUsuario(c, cA1.id);
    const r = await c.query(`UPDATE public.leads SET corretor_id = $1 WHERE id = $2`, [
      cA1.id,
      leadFila,
    ]);
    expect(r.rowCount).toBe(0);
  });

  it("C_A1 NÃO transfere o próprio lead para outro corretor (pode_atribuir_lead barra no WITH CHECK, 42501)", async () => {
    await comoUsuario(c, cA1.id);
    expect(
      await errCode(
        c.query(`UPDATE public.leads SET corretor_id = $1 WHERE id = $2`, [cA2.id, leadA1]),
      ),
    ).toBe("42501");
  });

  it("G_A atualiza campo comum de lead da equipe A", async () => {
    await comoUsuario(c, gA.id);
    const r = await c.query(
      `UPDATE public.leads SET observacoes = 'visto pelo gestor' WHERE id = $1`,
      [leadA1],
    );
    expect(r.rowCount).toBe(1);
  });

  it("G_A NÃO atualiza lead da equipe B: 0 afetadas", async () => {
    await comoUsuario(c, gA.id);
    const r = await c.query(`UPDATE public.leads SET nome = 'invasao gestor' WHERE id = $1`, [
      leadB,
    ]);
    expect(r.rowCount).toBe(0);
  });

  it("G_A NÃO atualiza o lead da fila (sem corretor não entra na carteira do gestor): 0 afetadas", async () => {
    await comoUsuario(c, gA.id);
    const r = await c.query(`UPDATE public.leads SET nome = 'fila gestor' WHERE id = $1`, [
      leadFila,
    ]);
    expect(r.rowCount).toBe(0);
  });

  it("G_A reatribui lead dentro da própria equipe, mas não para corretor da equipe B (42501)", async () => {
    await comoSuperuser(c);
    const leadReatrib = await criarLead(c, { corretorId: cA1.id, status: "em_atendimento" });

    await comoUsuario(c, gA.id);
    const ok = await c.query(`UPDATE public.leads SET corretor_id = $1 WHERE id = $2`, [
      cA2.id,
      leadReatrib,
    ]);
    expect(ok.rowCount).toBe(1);

    expect(
      await errCode(
        c.query(`UPDATE public.leads SET corretor_id = $1 WHERE id = $2`, [cB.id, leadReatrib]),
      ),
    ).toBe("42501");

    await comoSuperuser(c);
    await c.query(`DELETE FROM public.leads WHERE id = $1`, [leadReatrib]);
  });

  it("admin atualiza lead de qualquer equipe e o da fila", async () => {
    await comoUsuario(c, admin.id);
    const rB = await c.query(`UPDATE public.leads SET observacoes = 'admin passou' WHERE id = $1`, [
      leadB,
    ]);
    const rFila = await c.query(
      `UPDATE public.leads SET observacoes = 'admin fila' WHERE id = $1`,
      [leadFila],
    );
    expect(rB.rowCount).toBe(1);
    expect(rFila.rowCount).toBe(1);
  });

  it("superintendente atualiza lead de qualquer equipe", async () => {
    await comoUsuario(c, superi.id);
    const r = await c.query(`UPDATE public.leads SET observacoes = 'super passou' WHERE id = $1`, [
      leadA2,
    ]);
    expect(r.rowCount).toBe(1);
  });
});

describe("leads · INSERT (pode_atribuir_lead)", () => {
  it("corretor insere lead para si mesmo (e o status é normalizado para aguardando_atendimento)", async () => {
    await comoUsuario(c, cA1.id);
    const r = await c.query(
      `INSERT INTO public.leads (nome, telefone, corretor_id)
       VALUES ('Lead novo do A1', '11977770001', $1) RETURNING id, status`,
      [cA1.id],
    );
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].status).toBe("aguardando_atendimento");
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.leads WHERE id = $1`, [r.rows[0].id]);
  });

  it("corretor NÃO insere lead atribuído a outro corretor (42501)", async () => {
    await comoUsuario(c, cA1.id);
    expect(
      await errCode(
        c.query(
          `INSERT INTO public.leads (nome, telefone, corretor_id)
           VALUES ('Invasao insert', '11977770002', $1)`,
          [cA2.id],
        ),
      ),
    ).toBe("42501");
  });

  it("corretor NÃO insere lead sem corretor (fila é alimentada pelo sistema/admin): 42501", async () => {
    await comoUsuario(c, cA1.id);
    expect(
      await errCode(
        c.query(
          `INSERT INTO public.leads (nome, telefone, corretor_id)
           VALUES ('Fila via corretor', '11977770003', NULL)`,
        ),
      ),
    ).toBe("42501");
  });

  it("gestor insere lead para corretor da própria equipe, mas não para corretor de outra equipe (42501)", async () => {
    await comoUsuario(c, gA.id);
    const ok = await c.query(
      `INSERT INTO public.leads (nome, telefone, corretor_id)
       VALUES ('Lead do gestor A', '11977770004', $1) RETURNING id`,
      [cA1.id],
    );
    expect(ok.rowCount).toBe(1);

    expect(
      await errCode(
        c.query(
          `INSERT INTO public.leads (nome, telefone, corretor_id)
           VALUES ('Gestor invadindo B', '11977770005', $1)`,
          [cB.id],
        ),
      ),
    ).toBe("42501");

    await comoSuperuser(c);
    await c.query(`DELETE FROM public.leads WHERE id = $1`, [ok.rows[0].id]);
  });

  it("admin insere lead sem corretor (entrada da fila)", async () => {
    await comoUsuario(c, admin.id);
    const r = await c.query(
      `INSERT INTO public.leads (nome, telefone, corretor_id, status)
       VALUES ('Fila via admin', '11977770006', NULL, 'aguardando_atendimento') RETURNING id`,
    );
    expect(r.rowCount).toBe(1);
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.leads WHERE id = $1`, [r.rows[0].id]);
  });
});

describe("tarefas · seguem o escopo do lead vinculado", () => {
  it("C_A1 vê a tarefa do próprio lead e não a do lead da equipe B", async () => {
    await comoUsuario(c, cA1.id);
    expect(await idsVisiveis(`SELECT id FROM public.tarefas`)).toEqual([tarefaA1].sort());
  });

  it("G_A vê a tarefa do lead da equipe A e não a da equipe B", async () => {
    await comoUsuario(c, gA.id);
    expect(await idsVisiveis(`SELECT id FROM public.tarefas`)).toEqual([tarefaA1].sort());
  });

  it("G_B vê apenas a tarefa do lead da equipe B", async () => {
    await comoUsuario(c, gB.id);
    expect(await idsVisiveis(`SELECT id FROM public.tarefas`)).toEqual([tarefaB].sort());
  });

  it("admin e superintendente veem todas as tarefas", async () => {
    await comoUsuario(c, admin.id);
    expect(await idsVisiveis(`SELECT id FROM public.tarefas`)).toEqual([tarefaA1, tarefaB].sort());
    await comoUsuario(c, superi.id);
    expect(await idsVisiveis(`SELECT id FROM public.tarefas`)).toEqual([tarefaA1, tarefaB].sort());
  });

  it("C_A1 NÃO atualiza tarefa do lead da equipe B (0 afetadas); G_A atualiza tarefa da equipe A", async () => {
    await comoUsuario(c, cA1.id);
    const negado = await c.query(`UPDATE public.tarefas SET titulo = 'invasao' WHERE id = $1`, [
      tarefaB,
    ]);
    expect(negado.rowCount).toBe(0);

    await comoUsuario(c, gA.id);
    const ok = await c.query(
      `UPDATE public.tarefas SET descricao = 'revisada pelo gestor' WHERE id = $1`,
      [tarefaA1],
    );
    expect(ok.rowCount).toBe(1);
  });

  it("C_A1 insere tarefa no próprio lead, mas não em lead da equipe B (42501)", async () => {
    await comoUsuario(c, cA1.id);
    const ok = await c.query(
      `INSERT INTO public.tarefas (titulo, lead_id, corretor_id, criado_por)
       VALUES ('Nova tarefa A1', $1, $2, $2) RETURNING id`,
      [leadA1, cA1.id],
    );
    expect(ok.rowCount).toBe(1);

    expect(
      await errCode(
        c.query(
          `INSERT INTO public.tarefas (titulo, lead_id, corretor_id, criado_por)
           VALUES ('Tarefa invasora', $1, $2, $2)`,
          [leadB, cA1.id],
        ),
      ),
    ).toBe("42501");

    await comoSuperuser(c);
    await c.query(`DELETE FROM public.tarefas WHERE id = $1`, [ok.rows[0].id]);
  });
});

describe("agendamentos · seguem o escopo do lead vinculado", () => {
  it("C_A1 vê o agendamento do próprio lead e não o do lead da equipe B", async () => {
    await comoUsuario(c, cA1.id);
    expect(await idsVisiveis(`SELECT id FROM public.agendamentos`)).toEqual([agendA1].sort());
  });

  it("G_A vê o agendamento da equipe A e não o da B; admin vê ambos", async () => {
    await comoUsuario(c, gA.id);
    expect(await idsVisiveis(`SELECT id FROM public.agendamentos`)).toEqual([agendA1].sort());
    await comoUsuario(c, admin.id);
    expect(await idsVisiveis(`SELECT id FROM public.agendamentos`)).toEqual(
      [agendA1, agendB].sort(),
    );
  });

  it("C_A1 NÃO atualiza agendamento do lead da equipe B: 0 afetadas", async () => {
    await comoUsuario(c, cA1.id);
    const r = await c.query(`UPDATE public.agendamentos SET titulo = 'invasao' WHERE id = $1`, [
      agendB,
    ]);
    expect(r.rowCount).toBe(0);
  });

  it("C_A1 insere agendamento no próprio lead; em lead da equipe B é barrado (42501); spoof de criado_por_id também (42501)", async () => {
    await comoUsuario(c, cA1.id);
    const ok = await c.query(
      `INSERT INTO public.agendamentos (lead_id, corretor_id, criado_por_id, titulo, data_inicio, data_fim)
       VALUES ($1, $2, $2, 'Nova visita A1', now() + interval '2 days', now() + interval '2 days 1 hour')
       RETURNING id`,
      [leadA1, cA1.id],
    );
    expect(ok.rowCount).toBe(1);

    expect(
      await errCode(
        c.query(
          `INSERT INTO public.agendamentos (lead_id, corretor_id, criado_por_id, titulo, data_inicio, data_fim)
           VALUES ($1, $2, $3, 'Visita invasora', now() + interval '2 days', now() + interval '2 days 1 hour')`,
          [leadB, cB.id, cA1.id],
        ),
      ),
    ).toBe("42501");

    // criado_por_id precisa ser o próprio autenticado.
    expect(
      await errCode(
        c.query(
          `INSERT INTO public.agendamentos (lead_id, corretor_id, criado_por_id, titulo, data_inicio, data_fim)
           VALUES ($1, $2, $3, 'Spoof de autor', now() + interval '2 days', now() + interval '2 days 1 hour')`,
          [leadA1, cA1.id, cA2.id],
        ),
      ),
    ).toBe("42501");

    await comoSuperuser(c);
    await c.query(`DELETE FROM public.agendamentos WHERE id = $1`, [ok.rows[0].id]);
  });
});

describe("interacoes · seguem o escopo do lead vinculado", () => {
  it("C_A1 vê a interação do próprio lead e não a do lead da equipe B", async () => {
    await comoUsuario(c, cA1.id);
    expect(await idsVisiveis(`SELECT id FROM public.interacoes`)).toEqual([interA1].sort());
  });

  it("G_A vê a interação do lead da equipe A e não a da B; superintendente vê ambas", async () => {
    await comoUsuario(c, gA.id);
    expect(await idsVisiveis(`SELECT id FROM public.interacoes`)).toEqual([interA1].sort());
    await comoUsuario(c, superi.id);
    expect(await idsVisiveis(`SELECT id FROM public.interacoes`)).toEqual([interA1, interB].sort());
  });

  it("C_A1 insere interação no próprio lead; em lead da equipe B é barrado (42501); autor spoofado também (42501)", async () => {
    await comoUsuario(c, cA1.id);
    const ok = await c.query(
      `INSERT INTO public.interacoes (lead_id, autor_id, conteudo)
       VALUES ($1, $2, 'Nova nota A1') RETURNING id`,
      [leadA1, cA1.id],
    );
    expect(ok.rowCount).toBe(1);

    expect(
      await errCode(
        c.query(
          `INSERT INTO public.interacoes (lead_id, autor_id, conteudo)
           VALUES ($1, $2, 'Nota invasora')`,
          [leadB, cA1.id],
        ),
      ),
    ).toBe("42501");

    expect(
      await errCode(
        c.query(
          `INSERT INTO public.interacoes (lead_id, autor_id, conteudo)
           VALUES ($1, $2, 'Autor falso')`,
          [leadA1, cA2.id],
        ),
      ),
    ).toBe("42501");

    await comoSuperuser(c);
    await c.query(`DELETE FROM public.interacoes WHERE id = $1`, [ok.rows[0].id]);
  });

  it("C_A1 NÃO atualiza interação de lead alheio (0 afetadas); gestor também não edita interação de terceiro (edição restrita a autor/admin/superintendente)", async () => {
    await comoUsuario(c, cA1.id);
    const negado = await c.query(
      `UPDATE public.interacoes SET conteudo = 'invasao' WHERE id = $1`,
      [interB],
    );
    expect(negado.rowCount).toBe(0);

    // Regra atual: UPDATE exige autor_id = auth.uid() OU admin/superintendente;
    // gestor da equipe lê mas não edita interação criada pelo corretor.
    await comoUsuario(c, gA.id);
    const gestorNegado = await c.query(
      `UPDATE public.interacoes SET conteudo = 'editada pelo gestor' WHERE id = $1`,
      [interA1],
    );
    expect(gestorNegado.rowCount).toBe(0);
  });
});

describe("vendas · escopo via lead da venda", () => {
  it("C_A1 vê apenas a própria venda; C_B apenas a dele", async () => {
    await comoUsuario(c, cA1.id);
    expect(await idsVisiveis(`SELECT id FROM public.vendas`)).toEqual([vendaA].sort());
    await comoUsuario(c, cB.id);
    expect(await idsVisiveis(`SELECT id FROM public.vendas`)).toEqual([vendaB].sort());
  });

  it("G_A vê a venda da equipe A e não a da B; admin e superintendente veem ambas", async () => {
    await comoUsuario(c, gA.id);
    expect(await idsVisiveis(`SELECT id FROM public.vendas`)).toEqual([vendaA].sort());
    await comoUsuario(c, admin.id);
    expect(await idsVisiveis(`SELECT id FROM public.vendas`)).toEqual([vendaA, vendaB].sort());
    await comoUsuario(c, superi.id);
    expect(await idsVisiveis(`SELECT id FROM public.vendas`)).toEqual([vendaA, vendaB].sort());
  });

  it("C_A1 atualiza observações da própria venda pendente; venda da equipe B fica intocável (0 afetadas)", async () => {
    await comoUsuario(c, cA1.id);
    const ok = await c.query(
      `UPDATE public.vendas SET observacoes = 'ajuste do corretor' WHERE id = $1`,
      [vendaA],
    );
    expect(ok.rowCount).toBe(1);

    const negado = await c.query(`UPDATE public.vendas SET observacoes = 'invasao' WHERE id = $1`, [
      vendaB,
    ]);
    expect(negado.rowCount).toBe(0);
  });
});

describe("comissoes · beneficiário ou carteira do lead", () => {
  it("C_A1 vê apenas a própria comissão; C_B apenas a dele", async () => {
    await comoUsuario(c, cA1.id);
    expect(await idsVisiveis(`SELECT id FROM public.comissoes`)).toEqual([comissaoA].sort());
    await comoUsuario(c, cB.id);
    expect(await idsVisiveis(`SELECT id FROM public.comissoes`)).toEqual([comissaoB].sort());
  });

  it("G_A vê a comissão da venda da equipe A e não a da B; admin vê todas", async () => {
    await comoUsuario(c, gA.id);
    expect(await idsVisiveis(`SELECT id FROM public.comissoes`)).toEqual([comissaoA].sort());
    await comoUsuario(c, admin.id);
    expect(await idsVisiveis(`SELECT id FROM public.comissoes`)).toEqual(
      [comissaoA, comissaoB].sort(),
    );
  });

  it("corretor NÃO atualiza a própria comissão (0 afetadas); gestor da equipe atualiza campo permitido", async () => {
    await comoUsuario(c, cA1.id);
    const negado = await c.query(
      `UPDATE public.comissoes SET observacoes = 'corretor mexendo' WHERE id = $1`,
      [comissaoA],
    );
    expect(negado.rowCount).toBe(0);

    // Gestor pode atualizar campos não-financeiros (valores são travados pelo
    // trigger validar_mutacao_comissao / ledger).
    await comoUsuario(c, gA.id);
    const ok = await c.query(
      `UPDATE public.comissoes SET observacoes = 'conferida pelo gestor' WHERE id = $1`,
      [comissaoA],
    );
    expect(ok.rowCount).toBe(1);

    const foraDaEquipe = await c.query(
      `UPDATE public.comissoes SET observacoes = 'gestor invadindo' WHERE id = $1`,
      [comissaoB],
    );
    expect(foraDaEquipe.rowCount).toBe(0);
  });
});

describe("metas · comportamento atual documentado", () => {
  it("SELECT é global — qualquer corretor autenticado lê metas de todos (decisão de produto pendente)", async () => {
    // Policy viva: "Autenticados leem metas" USING (true). Comportamento ATUAL
    // assertado de propósito: C_B (equipe B) lê a meta de C_A1 (equipe A).
    // decisão de produto pendente — se metas forem sensíveis (remuneração/
    // performance), o escopo deveria seguir a carteira como nas demais tabelas.
    await comoUsuario(c, cB.id);
    const r = await c.query(`SELECT id, corretor_id FROM public.metas WHERE id = $1`, [metaA1]);
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].corretor_id).toBe(cA1.id);
  });

  it("corretor não cria nem edita metas (INSERT 42501; UPDATE 0 afetadas)", async () => {
    await comoUsuario(c, cA1.id);
    expect(
      await errCode(
        c.query(
          `INSERT INTO public.metas (corretor_id, ano, mes, meta_vendas) VALUES ($1, 2026, 8, 5)`,
          [cA1.id],
        ),
      ),
    ).toBe("42501");

    const upd = await c.query(`UPDATE public.metas SET meta_vendas = 99 WHERE id = $1`, [metaA1]);
    expect(upd.rowCount).toBe(0);
  });

  it("metas: gestor edita só a PRÓPRIA equipe — gestor de OUTRA equipe é bloqueado (escopo por equipe, 20260720180000)", async () => {
    // Migration 20260720180000: a escrita de metas passou a ser recortada por
    // equipe (public.pode_gerir_meta). G_B (equipe B) NÃO edita a meta de C_A1
    // (equipe A); G_A (mesma equipe de C_A1) edita normalmente.
    await comoUsuario(c, gB.id);
    const alheio = await c.query(`UPDATE public.metas SET meta_vendas = 3 WHERE id = $1`, [metaA1]);
    expect(alheio.rowCount).toBe(0);

    await comoUsuario(c, gA.id);
    const proprio = await c.query(`UPDATE public.metas SET meta_vendas = 3 WHERE id = $1`, [metaA1]);
    expect(proprio.rowCount).toBe(1);

    await comoSuperuser(c);
    await c.query(`UPDATE public.metas SET meta_vendas = 2 WHERE id = $1`, [metaA1]);
  });

  it("superintendente NÃO cria nem edita metas (fora da policy de escrita — comportamento atual documentado)", async () => {
    // Curioso: superintendente vê tudo no restante do CRM, mas a policy de
    // escrita de metas lista apenas admin/gestor. Comportamento ATUAL.
    await comoUsuario(c, superi.id);
    expect(
      await errCode(
        c.query(
          `INSERT INTO public.metas (corretor_id, ano, mes, meta_vendas) VALUES ($1, 2026, 9, 4)`,
          [cA1.id],
        ),
      ),
    ).toBe("42501");
    const upd = await c.query(`UPDATE public.metas SET meta_vendas = 7 WHERE id = $1`, [metaA1]);
    expect(upd.rowCount).toBe(0);
  });
});

describe("leads · DELETE (somente admin/superintendente)", () => {
  it("corretor não deleta o próprio lead e gestor não deleta lead da equipe (0 afetadas)", async () => {
    await comoUsuario(c, cA1.id);
    const corretorTenta = await c.query(`DELETE FROM public.leads WHERE id = $1`, [leadA1]);
    expect(corretorTenta.rowCount).toBe(0);

    await comoUsuario(c, gA.id);
    const gestorTenta = await c.query(`DELETE FROM public.leads WHERE id = $1`, [leadA1]);
    expect(gestorTenta.rowCount).toBe(0);

    await comoSuperuser(c);
    const aindaExiste = await c.query(`SELECT 1 FROM public.leads WHERE id = $1`, [leadA1]);
    expect(aindaExiste.rowCount).toBe(1);
  });

  it("admin deleta lead; superintendente também", async () => {
    await comoSuperuser(c);
    const descartavel1 = await criarLead(c, { corretorId: cA1.id });
    const descartavel2 = await criarLead(c, { corretorId: cB.id });

    await comoUsuario(c, admin.id);
    const delAdmin = await c.query(`DELETE FROM public.leads WHERE id = $1`, [descartavel1]);
    expect(delAdmin.rowCount).toBe(1);

    await comoUsuario(c, superi.id);
    const delSuper = await c.query(`DELETE FROM public.leads WHERE id = $1`, [descartavel2]);
    expect(delSuper.rowCount).toBe(1);
  });
});
