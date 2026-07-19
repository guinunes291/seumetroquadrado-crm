/**
 * Dedup de leads por telefone.
 *
 * Cobre o índice único parcial `uq_leads_projeto_telefone_ativo`
 * (migration 20260710122000), a normalização `telefone_digits()`,
 * as RPCs de busca (`buscar_lead_duplicado`, `buscar_lead_por_telefone`,
 * `buscar_lead_ativo_por_telefone_global`) e a RPC `mesclar_leads`.
 *
 * Comportamento real descoberto no banco migrado:
 *   - índice: ON leads (projeto_id, telefone_digits(telefone))
 *       WHERE deleted_at IS NULL AND projeto_id IS NOT NULL
 *         AND length(telefone_digits(telefone)) >= 8
 *   - telefone_digits() só remove não-dígitos (NÃO normaliza E.164/+55).
 *   - mesclar_leads(_lead_destino uuid, _lead_origem uuid) RETURNS boolean:
 *       exige caller admin/superintendente/gestor com acesso aos dois leads,
 *       move interacoes/tarefas/agendamentos e soft-deleta a origem.
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
} from "./helpers";

const c = novoClient();

let seqLocal = 0;

/**
 * `criarProjeto` de helpers.ts insere só `nome`, mas `projetos.slug` é
 * NOT NULL sem default nem trigger — o factory falha com 23502 no schema
 * atual. Criamos o projeto direto (superuser) com slug preenchido.
 */
async function criarProjetoComSlug(): Promise<string> {
  await comoSuperuser(c);
  const n = ++seqLocal;
  const r = await c.query(
    `INSERT INTO public.projetos (nome, slug) VALUES ($1, $2) RETURNING id`,
    [`Projeto Dedup ${n}`, `projeto-dedup-${n}-${Date.now()}`],
  );
  return r.rows[0].id as string;
}

/** INSERT direto em leads (superuser), sem os defaults do factory. */
function inserirLead(opts: {
  nome?: string;
  telefone: string | null;
  projetoId?: string | null;
}): Promise<unknown> {
  return c.query(
    `INSERT INTO public.leads (nome, telefone, projeto_id) VALUES ($1, $2, $3)`,
    [opts.nome ?? `Lead direto ${++seqLocal}`, opts.telefone, opts.projetoId ?? null],
  );
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

describe("índice único uq_leads_projeto_telefone_ativo", () => {
  it("existe no banco migrado (replay limpo cria via DO-block da 20260710122000)", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'leads'
         AND indexname = 'uq_leads_projeto_telefone_ativo'`,
    );
    expect(r.rowCount).toBe(1);
    const def = r.rows[0].indexdef as string;
    // Expressão real: (projeto_id, telefone_digits(telefone)) parcial.
    expect(def).toContain("UNIQUE");
    expect(def).toContain("projeto_id");
    expect(def).toContain("telefone_digits(telefone)");
    expect(def).toContain("deleted_at IS NULL");
    expect(def).toContain("projeto_id IS NOT NULL");
    expect(def).toContain("length(telefone_digits(telefone)) >= 8");
  });

  it("telefone_digits() normaliza removendo só não-dígitos (sem E.164)", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT public.telefone_digits('(11) 99999-0001') AS fmt,
              public.telefone_digits('11 99999 0001')  AS espacos,
              public.telefone_digits('+55 11 99999-0001') AS e164,
              public.telefone_digits(NULL) AS nulo`,
    );
    expect(r.rows[0].fmt).toBe("11999990001");
    expect(r.rows[0].espacos).toBe("11999990001");
    // O "+55" NÃO é removido — vira dígitos "5511...", diferente do local.
    expect(r.rows[0].e164).toBe("5511999990001");
    expect(r.rows[0].nulo).toBe("");
  });

  it("segundo lead com mesmo (projeto, telefone) é rejeitado com 23505", async () => {
    const projetoId = await criarProjetoComSlug();
    await criarLead(c, { telefone: "11999990010", projetoId });
    expect(
      await errCode(inserirLead({ telefone: "11999990010", projetoId })),
    ).toBe("23505");
  });

  it("variações de formatação que normalizam para os mesmos dígitos colidem", async () => {
    const projetoId = await criarProjetoComSlug();
    await criarLead(c, { telefone: "(11) 99999-0011", projetoId });
    expect(
      await errCode(inserirLead({ telefone: "11 99999 0011", projetoId })),
    ).toBe("23505");
    expect(
      await errCode(inserirLead({ telefone: "11-99999-0011", projetoId })),
    ).toBe("23505");
  });

  // BUG descoberto: a normalização do índice é só remoção de não-dígitos
  // (telefone_digits), não E.164 — "+55 11 99999-0012" vira "5511999990012"
  // e "11999990012" vira "11999990012": o MESMO telefone real no MESMO
  // projeto entra duas vezes quando uma origem manda com +55 (WhatsApp/
  // webhook) e a outra sem (digitação manual). O banco tem a função
  // _telefone_e164_br e a coluna telefone_e164 exatamente para unificar
  // isso, mas o índice (e as RPCs de dedup) não a usam.
  it.fails("variantes E.164 do mesmo telefone (+55 vs local) também colidem", async () => {
    const projetoId = await criarProjetoComSlug();
    await criarLead(c, { telefone: "11999990012", projetoId });
    expect(
      await errCode(inserirLead({ telefone: "+55 11 99999-0012", projetoId })),
    ).toBe("23505");
  });

  it("mesmo telefone em projetos diferentes NÃO colide (dedup é por projeto)", async () => {
    const projetoA = await criarProjetoComSlug();
    const projetoB = await criarProjetoComSlug();
    await criarLead(c, { telefone: "11999990013", projetoId: projetoA });
    expect(
      await errCode(inserirLead({ telefone: "11999990013", projetoId: projetoB })),
    ).toBeNull();
  });

  it("telefone curto (<8 dígitos) fica fora do índice parcial e não colide", async () => {
    const projetoId = await criarProjetoComSlug();
    await criarLead(c, { telefone: "1234567", projetoId }); // 7 dígitos
    expect(await errCode(inserirLead({ telefone: "1234567", projetoId }))).toBeNull();
    // string vazia idem (0 dígitos)
    expect(await errCode(inserirLead({ telefone: "", projetoId }))).toBeNull();
    expect(await errCode(inserirLead({ telefone: "", projetoId }))).toBeNull();
  });

  it("telefone NULL é estruturalmente impossível (coluna NOT NULL — 23502)", async () => {
    // "telefone nulo não colide" na prática: nem entra — leads.telefone é
    // NOT NULL. O caso nulo do índice parcial é inalcançável por INSERT.
    const projetoId = await criarProjetoComSlug();
    expect(await errCode(inserirLead({ telefone: null, projetoId }))).toBe("23502");
  });

  it("lead soft-deletado (deleted_at preenchido) libera o telefone no projeto", async () => {
    const projetoId = await criarProjetoComSlug();
    const antigo = await criarLead(c, { telefone: "11999990014", projetoId });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET deleted_at = now() WHERE id = $1`, [antigo]);
    expect(
      await errCode(inserirLead({ telefone: "11999990014", projetoId })),
    ).toBeNull();
  });

  it("lead na lixeira (na_lixeira=true, sem deleted_at) AINDA bloqueia duplicata", async () => {
    // Comportamento real: o predicado do índice olha só deleted_at, não
    // na_lixeira. Nota de auditoria: isso conflita com a intenção documentada
    // em buscar_lead_por_telefone ("lead na lixeira NÃO conta como duplicata
    // — cliente retornante gera lead NOVO"): o retorno de um cliente com lead
    // na lixeira do MESMO projeto é barrado com 23505 no INSERT.
    const projetoId = await criarProjetoComSlug();
    const naLixeira = await criarLead(c, { telefone: "11999990015", projetoId });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET na_lixeira = true WHERE id = $1`, [naLixeira]);
    expect(
      await errCode(inserirLead({ telefone: "11999990015", projetoId })),
    ).toBe("23505");
  });

  // BUG descoberto: leads sem projeto não têm constraint de dedup — o índice
  // é parcial com "projeto_id IS NOT NULL", então dois leads com projeto_id
  // NULL e o MESMO telefone são aceitos (a corrida do intake continua aberta
  // para lead sem projeto). Correção por migration prevista nesta auditoria;
  // quando entrar, este caso passa a valer.
  it.fails("dois leads SEM projeto com o mesmo telefone: o segundo é rejeitado", async () => {
    await criarLead(c, { telefone: "11999990016", projetoId: null });
    expect(
      await errCode(inserirLead({ telefone: "11999990016", projetoId: null })),
    ).toBe("23505");
  });
});

describe("buscar_lead_duplicado(_projeto_id, _telefone)", () => {
  it("encontra o lead do projeto por dígitos, ignorando formatação", async () => {
    const projetoId = await criarProjetoComSlug();
    const lead = await criarLead(c, { telefone: "(11) 99999-0020", projetoId });
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT public.buscar_lead_duplicado($1, '11 99999 0020') AS id`,
      [projetoId],
    );
    expect(r.rows[0].id).toBe(lead);
  });

  it("não cruza projetos: mesmo telefone em outro projeto retorna NULL", async () => {
    const projetoA = await criarProjetoComSlug();
    const projetoB = await criarProjetoComSlug();
    await criarLead(c, { telefone: "11999990021", projetoId: projetoA });
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT public.buscar_lead_duplicado($1, '11999990021') AS id`,
      [projetoB],
    );
    expect(r.rows[0].id).toBeNull();
  });

  it("telefone curto (<8 dígitos) nunca é duplicata (retorna NULL)", async () => {
    const projetoId = await criarProjetoComSlug();
    await criarLead(c, { telefone: "1234567", projetoId });
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT public.buscar_lead_duplicado($1, '1234567') AS id`,
      [projetoId],
    );
    expect(r.rows[0].id).toBeNull();
  });

  it("ignora lead soft-deletado", async () => {
    const projetoId = await criarProjetoComSlug();
    const lead = await criarLead(c, { telefone: "11999990022", projetoId });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET deleted_at = now() WHERE id = $1`, [lead]);
    const r = await c.query(
      `SELECT public.buscar_lead_duplicado($1, '11999990022') AS id`,
      [projetoId],
    );
    expect(r.rows[0].id).toBeNull();
  });

  it("lead na lixeira CONTA como duplicata (coerente com o índice, diferente de buscar_lead_por_telefone)", async () => {
    const projetoId = await criarProjetoComSlug();
    const lead = await criarLead(c, { telefone: "11999990023", projetoId });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET na_lixeira = true WHERE id = $1`, [lead]);
    const r = await c.query(
      `SELECT public.buscar_lead_duplicado($1, '11999990023') AS id`,
      [projetoId],
    );
    expect(r.rows[0].id).toBe(lead);
  });

  it("não enxerga a variante +55 do mesmo telefone (mesma lacuna do índice)", async () => {
    // Comportamento real documentado: comparação é por dígitos crus, então
    // "+55 11 99999-0024" não casa com "11999990024" (ver it.fails do índice).
    const projetoId = await criarProjetoComSlug();
    await criarLead(c, { telefone: "11999990024", projetoId });
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT public.buscar_lead_duplicado($1, '+55 11 99999-0024') AS id`,
      [projetoId],
    );
    expect(r.rows[0].id).toBeNull();
  });
});

describe("buscar_lead_por_telefone(_telefone)", () => {
  it("busca GLOBAL (sem projeto) e retorna o lead mais recente por created_at", async () => {
    const projetoA = await criarProjetoComSlug();
    const projetoB = await criarProjetoComSlug();
    const antigo = await criarLead(c, { telefone: "11999990030", projetoId: projetoA });
    const recente = await criarLead(c, { telefone: "11999990030", projetoId: projetoB });
    await comoSuperuser(c);
    // desambigua created_at (mesma transação/clock pode empatar)
    await c.query(
      `UPDATE public.leads SET created_at = created_at - interval '1 hour' WHERE id = $1`,
      [antigo],
    );
    const r = await c.query(
      `SELECT public.buscar_lead_por_telefone('(11) 99999-0030') AS id`,
    );
    expect(r.rows[0].id).toBe(recente);
  });

  it("telefone curto (<8 dígitos) retorna NULL", async () => {
    await criarLead(c, { telefone: "1234567" });
    await comoSuperuser(c);
    const r = await c.query(`SELECT public.buscar_lead_por_telefone('1234567') AS id`);
    expect(r.rows[0].id).toBeNull();
  });

  it("lead na lixeira NÃO conta como duplicata (cliente retornante gera lead novo)", async () => {
    const lead = await criarLead(c, { telefone: "11999990031" });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET na_lixeira = true WHERE id = $1`, [lead]);
    const r = await c.query(
      `SELECT public.buscar_lead_por_telefone('11999990031') AS id`,
    );
    expect(r.rows[0].id).toBeNull();
  });

  it("lead soft-deletado é ignorado", async () => {
    const lead = await criarLead(c, { telefone: "11999990032" });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET deleted_at = now() WHERE id = $1`, [lead]);
    const r = await c.query(
      `SELECT public.buscar_lead_por_telefone('11999990032') AS id`,
    );
    expect(r.rows[0].id).toBeNull();
  });

  it("lead PERDIDO ainda é encontrado (não filtra status)", async () => {
    const lead = await criarLead(c, { telefone: "11999990033" });
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads
       SET status = 'perdido', motivo_perda_categoria = 'outro'
       WHERE id = $1`,
      [lead],
    );
    const r = await c.query(
      `SELECT public.buscar_lead_por_telefone('11999990033') AS id`,
    );
    expect(r.rows[0].id).toBe(lead);
  });
});

describe("buscar_lead_ativo_por_telefone_global(_telefone)", () => {
  it("encontra lead ativo por dígitos, em qualquer projeto", async () => {
    const projetoId = await criarProjetoComSlug();
    const lead = await criarLead(c, { telefone: "(11) 99999-0040", projetoId });
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT public.buscar_lead_ativo_por_telefone_global('11999990040') AS id`,
    );
    expect(r.rows[0].id).toBe(lead);
  });

  it("exclui lead PERDIDO (diferença para buscar_lead_por_telefone)", async () => {
    const lead = await criarLead(c, { telefone: "11999990041" });
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads
       SET status = 'perdido', motivo_perda_categoria = 'outro'
       WHERE id = $1`,
      [lead],
    );
    const r = await c.query(
      `SELECT public.buscar_lead_ativo_por_telefone_global('11999990041') AS id`,
    );
    expect(r.rows[0].id).toBeNull();
  });

  it("exclui lixeira, soft-deletado e telefone curto", async () => {
    const naLixeira = await criarLead(c, { telefone: "11999990042" });
    const deletado = await criarLead(c, { telefone: "11999990043" });
    await criarLead(c, { telefone: "1234567" });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET na_lixeira = true WHERE id = $1`, [naLixeira]);
    await c.query(`UPDATE public.leads SET deleted_at = now() WHERE id = $1`, [deletado]);
    const r = await c.query(
      `SELECT public.buscar_lead_ativo_por_telefone_global('11999990042') AS lixeira,
              public.buscar_lead_ativo_por_telefone_global('11999990043') AS deletado,
              public.buscar_lead_ativo_por_telefone_global('1234567') AS curto`,
    );
    expect(r.rows[0].lixeira).toBeNull();
    expect(r.rows[0].deletado).toBeNull();
    expect(r.rows[0].curto).toBeNull();
  });

  it("com múltiplos ativos, retorna o de updated_at mais recente", async () => {
    const projetoA = await criarProjetoComSlug();
    const projetoB = await criarProjetoComSlug();
    const antigo = await criarLead(c, { telefone: "11999990044", projetoId: projetoA });
    const recente = await criarLead(c, { telefone: "11999990044", projetoId: projetoB });
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads SET updated_at = now() - interval '1 hour' WHERE id = $1`,
      [antigo],
    );
    await c.query(`UPDATE public.leads SET updated_at = now() WHERE id = $1`, [recente]);
    const r = await c.query(
      `SELECT public.buscar_lead_ativo_por_telefone_global('11999990044') AS id`,
    );
    expect(r.rows[0].id).toBe(recente);
  });
});

describe("mesclar_leads(_lead_destino, _lead_origem)", () => {
  it("admin mescla: interações, tarefas e agendamentos migram e a origem é soft-deletada", async () => {
    const admin = await criarUsuario(c, { papel: "admin" });
    const corretor = await criarUsuario(c, { papel: "corretor" });
    const projetoA = await criarProjetoComSlug();
    const projetoB = await criarProjetoComSlug();
    const destino = await criarLead(c, {
      telefone: "11999990050",
      projetoId: projetoA,
      corretorId: corretor.id,
    });
    const origem = await criarLead(c, {
      telefone: "11999990050",
      projetoId: projetoB,
      corretorId: corretor.id,
    });

    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.interacoes (lead_id, autor_id, conteudo)
       VALUES ($1, $2, 'nota no duplicado')`,
      [origem, corretor.id],
    );
    await c.query(
      `INSERT INTO public.tarefas (titulo, lead_id, corretor_id)
       VALUES ('ligar de volta', $1, $2)`,
      [origem, corretor.id],
    );
    await c.query(
      `INSERT INTO public.agendamentos (lead_id, corretor_id, titulo, data_inicio, data_fim)
       VALUES ($1, $2, 'visita', now() + interval '1 day', now() + interval '1 day 1 hour')`,
      [origem, corretor.id],
    );

    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT public.mesclar_leads($1, $2) AS ok`, [
      destino,
      origem,
    ]);
    expect(r.rows[0].ok).toBe(true);

    await comoSuperuser(c);
    const contagens = await c.query(
      `SELECT
         (SELECT count(*)::int FROM public.interacoes  WHERE lead_id = $1) AS interacoes_destino,
         (SELECT count(*)::int FROM public.tarefas     WHERE lead_id = $1) AS tarefas_destino,
         (SELECT count(*)::int FROM public.agendamentos WHERE lead_id = $1) AS agendamentos_destino,
         (SELECT count(*)::int FROM public.interacoes  WHERE lead_id = $2) AS interacoes_origem,
         (SELECT count(*)::int FROM public.tarefas     WHERE lead_id = $2) AS tarefas_origem,
         (SELECT count(*)::int FROM public.agendamentos WHERE lead_id = $2) AS agendamentos_origem`,
      [destino, origem],
    );
    expect(contagens.rows[0]).toEqual({
      interacoes_destino: 1,
      tarefas_destino: 1,
      agendamentos_destino: 1,
      interacoes_origem: 0,
      tarefas_origem: 0,
      agendamentos_origem: 0,
    });

    // A origem NÃO é apagada: fica soft-deletada com rastro nas observações.
    const origemRow = await c.query(
      `SELECT deleted_at, observacoes FROM public.leads WHERE id = $1`,
      [origem],
    );
    expect(origemRow.rows[0].deleted_at).not.toBeNull();
    expect(origemRow.rows[0].observacoes).toContain(`[Mesclado no lead ${destino}]`);

    // O destino segue ativo.
    const destinoRow = await c.query(
      `SELECT deleted_at FROM public.leads WHERE id = $1`,
      [destino],
    );
    expect(destinoRow.rows[0].deleted_at).toBeNull();
  });

  it("corretor comum não pode mesclar (42501), mesmo sendo dono dos dois leads", async () => {
    const corretor = await criarUsuario(c, { papel: "corretor" });
    const destino = await criarLead(c, {
      telefone: "11999990051",
      corretorId: corretor.id,
    });
    const origem = await criarLead(c, {
      telefone: "11999990052",
      corretorId: corretor.id,
    });
    await comoUsuario(c, corretor.id);
    expect(
      await errCode(c.query(`SELECT public.mesclar_leads($1, $2)`, [destino, origem])),
    ).toBe("42501");
  });

  it("sem usuário autenticado (auth.uid() NULL) é proibido (42501)", async () => {
    const destino = await criarLead(c, { telefone: "11999990053" });
    const origem = await criarLead(c, { telefone: "11999990054" });
    await comoSuperuser(c);
    expect(
      await errCode(c.query(`SELECT public.mesclar_leads($1, $2)`, [destino, origem])),
    ).toBe("42501");
  });

  it("destino igual à origem é rejeitado com 22023", async () => {
    const admin = await criarUsuario(c, { papel: "admin" });
    const lead = await criarLead(c, { telefone: "11999990055" });
    await comoUsuario(c, admin.id);
    expect(
      await errCode(c.query(`SELECT public.mesclar_leads($1, $1)`, [lead])),
    ).toBe("22023");
  });

  it("após a mesclagem, o telefone da origem libera o slot de dedup do projeto dela", async () => {
    const admin = await criarUsuario(c, { papel: "admin" });
    const projetoA = await criarProjetoComSlug();
    const projetoB = await criarProjetoComSlug();
    const destino = await criarLead(c, { telefone: "11999990056", projetoId: projetoA });
    const origem = await criarLead(c, { telefone: "11999990056", projetoId: projetoB });
    await comoUsuario(c, admin.id);
    await c.query(`SELECT public.mesclar_leads($1, $2)`, [destino, origem]);
    await comoSuperuser(c);
    // origem soft-deletada sai do índice parcial: telefone volta a ser aceito
    // no projeto B (o destino continua bloqueando o projeto A).
    expect(
      await errCode(inserirLead({ telefone: "11999990056", projetoId: projetoB })),
    ).toBeNull();
    expect(
      await errCode(inserirLead({ telefone: "11999990056", projetoId: projetoA })),
    ).toBe("23505");
  });
});
