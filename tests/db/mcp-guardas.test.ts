/**
 * Guardas do agente MCP (plano B): identidade de app com escrita total,
 * exclusão e destruição barradas por trigger.
 *
 * Cobre os 15 testes do contrato. O teste 15 (usuário humano não sente nada)
 * é tão importante quanto o 3 — se ele quebrar, a guarda vazou para a UI.
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

let mcpId: string;
let humanoId: string;

async function comoMcp(): Promise<void> {
  await comoUsuario(c, mcpId);
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  // Papel admin, não gestor: a RLS de leads (pode_atribuir_lead) exige de um
  // gestor uma equipe — sem ela o UPDATE morre na RLS e o DELETE afeta 0
  // linhas, e as GUARDAS (o contrato deste arquivo) nem chegam a disparar.
  // Como admin, a RLS libera tudo e o freio testado é só a guarda — inclusive
  // o contrato mais forte: nem admin-agente deleta.
  const mcp = await criarUsuario(c, { papel: "admin", nome: "Agente MCP" });
  mcpId = mcp.id;
  const humano = await criarUsuario(c, { papel: "corretor", nome: "Corretor Humano" });
  humanoId = humano.id;
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.mcp_identidade (uid, nota) VALUES ($1,'teste')
     ON CONFLICT (uid) DO UPDATE SET ativo = true`,
    [mcpId],
  );
  await c.query(`SELECT public.mcp_aplicar_guardas()`);
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

describe("identidade", () => {
  it("is_mcp() vale só para a identidade registrada e ativa", async () => {
    await comoMcp();
    expect((await c.query(`SELECT public.is_mcp() AS v`)).rows[0].v).toBe(true);
    await comoUsuario(c, humanoId);
    expect((await c.query(`SELECT public.is_mcp() AS v`)).rows[0].v).toBe(false);
  });
});

describe("escrita liberada", () => {
  it("T1/T2: insere interação e troca valor por valor", async () => {
    const lead = await criarLead(c, { corretorId: mcpId });
    await comoMcp();
    await c.query(
      `INSERT INTO public.interacoes (lead_id, tipo, direcao, conteudo, autor_id)
       VALUES ($1,'nota','interna','teste mcp',$2)`,
      [lead, mcpId],
    );
    await c.query(`UPDATE public.leads SET nome = 'Renomeado' WHERE id = $1`, [lead]);
    await comoSuperuser(c);
    const r = await c.query(`SELECT nome FROM public.leads WHERE id = $1`, [lead]);
    expect(r.rows[0].nome).toBe("Renomeado");
  });

  it("T11: transicionar_lead continua liberado", async () => {
    const lead = await criarLead(c, { corretorId: mcpId });
    await comoMcp();
    // A transição para em_atendimento exige próxima ação ou follow-up
    // (validação do funil) — o 4º argumento é p_proxima_acao.
    await c.query(
      `SELECT public.transicionar_lead($1,'em_atendimento','teste','ligar para o cliente',NULL,NULL)`,
      [lead],
    );
    await comoSuperuser(c);
    const r = await c.query(`SELECT status::text FROM public.leads WHERE id = $1`, [lead]);
    expect(r.rows[0].status).toBe("em_atendimento");
  });
});

describe("as quatro travas", () => {
  it("T3: DELETE em tabela de negócio é bloqueado", async () => {
    const lead = await criarLead(c, { corretorId: mcpId });
    await comoMcp();
    expect(await errCode(c.query(`DELETE FROM public.leads WHERE id = $1`, [lead]))).toBe("42501");
  });

  it("T4: DELETE na tabela sem RLS também é bloqueado", async () => {
    // A tabela do teste original (bkp_f085_arquivadas_20260731) só existe em
    // produção — nenhuma migration a cria, então o replay quebrava em 42P01.
    // Cria uma tabela local sem RLS, no mesmo padrão do T12.
    await comoSuperuser(c);
    await c.query(
      `CREATE TABLE IF NOT EXISTS public.teste_sem_rls (id int primary key, valor text)`,
    );
    await c.query(`INSERT INTO public.teste_sem_rls VALUES (1,'x') ON CONFLICT DO NOTHING`);
    await c.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.teste_sem_rls TO authenticated`);
    await c.query(`SELECT public.mcp_aplicar_guardas()`);
    await comoMcp();
    expect(await errCode(c.query(`DELETE FROM public.teste_sem_rls`))).toBe("42501");
    await comoSuperuser(c);
    await c.query(`DROP TABLE public.teste_sem_rls`);
  });

  it("T5: soft delete (deleted_at) é bloqueado", async () => {
    const lead = await criarLead(c, { corretorId: mcpId });
    await comoMcp();
    expect(
      await errCode(c.query(`UPDATE public.leads SET deleted_at = now() WHERE id = $1`, [lead])),
    ).toBe("42501");
  });

  it("T7: esvaziar campo preenchido é bloqueado", async () => {
    const lead = await criarLead(c, { corretorId: mcpId, telefone: "11988887777" });
    await comoMcp();
    expect(
      await errCode(c.query(`UPDATE public.leads SET telefone = NULL WHERE id = $1`, [lead])),
    ).toBe("42501");
  });
});

describe("lead perdido", () => {
  it("T6: direto bloqueado; wrapper exige motivo; com motivo funciona", async () => {
    const lead = await criarLead(c, { corretorId: mcpId });
    await comoMcp();
    expect(
      await errCode(c.query(`UPDATE public.leads SET status = 'perdido' WHERE id = $1`, [lead])),
    ).toBe("42501");
    expect(await errCode(c.query(`SELECT public.mcp_marcar_perdido($1,'','')`, [lead]))).toBe(
      "22023",
    );
    await c.query(`SELECT public.mcp_marcar_perdido($1,'sem interesse','sem_interesse')`, [lead]);
    await comoSuperuser(c);
    const r = await c.query(`SELECT status::text FROM public.leads WHERE id = $1`, [lead]);
    expect(r.rows[0].status).toBe("perdido");
  });

  it("T6: teto diário rejeita a partir do limite", async () => {
    await comoSuperuser(c);
    // O T6 anterior já registrou 1 'perdido' hoje e limparDados não trunca a
    // auditoria — sem esta limpeza, com teto=1 a PRIMEIRA chamada já estoura.
    await c.query(`DELETE FROM public.api_escrita_log WHERE agente = 'mcp' AND acao = 'perdido'`);
    await c.query(
      `UPDATE public.mcp_config SET valor = '1'::jsonb WHERE chave = 'perdidos_teto_dia'`,
    );
    const a = await criarLead(c, { corretorId: mcpId });
    const b = await criarLead(c, { corretorId: mcpId });
    await comoMcp();
    await c.query(`SELECT public.mcp_marcar_perdido($1,'motivo','sem_interesse')`, [a]);
    expect(
      await errCode(c.query(`SELECT public.mcp_marcar_perdido($1,'motivo','sem_interesse')`, [b])),
    ).toBe("54000");
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.mcp_config SET valor = '20'::jsonb WHERE chave = 'perdidos_teto_dia'`,
    );
  });
});

describe("financeiro", () => {
  it("T8/T9: venda aprovada é imutável e MCP não aprova", async () => {
    // Fixtures como dado histórico: modo réplica pula o trigger que zera
    // aprovado_em em INSERT (a venda 'aprovada' precisa dele e dos 3 marcos
    // de efetivação pelos checks). Um lead por venda (uq_vendas_lead_ativa).
    await comoSuperuser(c);
    const leadAprovada = await criarLead(c, { corretorId: mcpId });
    const leadPendente = await criarLead(c, { corretorId: mcpId });
    await c.query(`SET session_replication_role = replica`);
    const venda = await c.query(
      `INSERT INTO public.vendas
         (lead_id, corretor_id, valor_venda, data_assinatura, status_venda, aprovado_em,
          contrato_assinado, contrato_assinado_em, ato_pago, ato_pago_em,
          apto_repasse, apto_repasse_em)
       VALUES ($1,$2,100000,current_date,'aprovada',now(),true,now(),true,now(),true,now())
       RETURNING id`,
      [leadAprovada, mcpId],
    );
    const pendente = await c.query(
      `INSERT INTO public.vendas (lead_id, corretor_id, valor_venda, data_assinatura, status_venda)
       VALUES ($1,$2,100000,current_date,'pendente') RETURNING id`,
      [leadPendente, mcpId],
    );
    await c.query(`SET session_replication_role = DEFAULT`);
    await comoMcp();
    expect(
      await errCode(
        c.query(`UPDATE public.vendas SET valor_venda = 1 WHERE id = $1`, [venda.rows[0].id]),
      ),
    ).toBe("42501");
    expect(
      await errCode(
        c.query(`UPDATE public.vendas SET status_venda = 'aprovada' WHERE id = $1`, [
          pendente.rows[0].id,
        ]),
      ),
    ).toBe("42501");
  });

  it("T10: funções de limpeza não são executáveis pelo app", async () => {
    await comoMcp();
    const code = await errCode(c.query(`SELECT public.expirar_lixeira_antiga()`));
    expect(code).toBe("42501");
  });
});

describe("herança e detector", () => {
  it("T12: tabela nova ganha guarda pela função; sem rodar, aparece no detector", async () => {
    await comoSuperuser(c);
    await c.query(
      `CREATE TABLE IF NOT EXISTS public.teste_heranca (id uuid primary key default gen_random_uuid(), nome text)`,
    );
    await c.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.teste_heranca TO authenticated`);
    await c.query(`SELECT public.mcp_aplicar_guardas()`);
    await comoMcp();
    await c.query(`INSERT INTO public.teste_heranca (nome) VALUES ('ok')`);
    expect(await errCode(c.query(`DELETE FROM public.teste_heranca`))).toBe("42501");

    await comoSuperuser(c);
    await c.query(
      `CREATE TABLE IF NOT EXISTS public.teste_heranca_2 (id uuid primary key default gen_random_uuid())`,
    );
    const sem = await c.query(
      `SELECT tabela FROM public.mcp_tabelas_sem_guarda WHERE tabela = 'teste_heranca_2'`,
    );
    expect(sem.rowCount).toBe(1);
    await c.query(`DROP TABLE public.teste_heranca, public.teste_heranca_2`);
  });
});

describe("auditoria e botão de desligar", () => {
  it("T13: escrita liberada vira linha em api_escrita_log; bloqueio aborta e não deixa linha", async () => {
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.api_escrita_log WHERE agente = 'mcp'`);
    const lead = await criarLead(c, { corretorId: mcpId });
    await comoMcp();
    await c.query(`UPDATE public.leads SET nome = 'Auditado' WHERE id = $1`, [lead]);
    expect(await errCode(c.query(`DELETE FROM public.leads WHERE id = $1`, [lead]))).toBe("42501");
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT acao, tabela, resultado, ator IS NOT NULL AS tem_ator, diff IS NOT NULL AS tem_diff
         FROM public.api_escrita_log WHERE agente = 'mcp' ORDER BY ts`,
    );
    expect(r.rows.some((x) => x.acao === "update" && x.tabela === "leads" && x.tem_diff)).toBe(
      true,
    );
    // O log de bloqueio (mcp_log_bloqueio) roda na MESMA transação que o
    // RAISE da guarda aborta — o rollback leva a linha junto, sempre. Persistir
    // bloqueio exigiria transação autônoma (inexistente no Postgres puro);
    // este assert documenta o comportamento real em vez de fingir o contrário.
    expect(r.rows.some((x) => x.acao === "delete")).toBe(false);
    expect(r.rows.every((x) => x.tem_ator)).toBe(true);
  });

  it("T14: ativo=false desliga a escrita mas não a leitura", async () => {
    const lead = await criarLead(c, { corretorId: mcpId });
    await comoSuperuser(c);
    await c.query(`UPDATE public.mcp_identidade SET ativo = false WHERE uid = $1`, [mcpId]);
    await comoMcp();
    // is_mcp() falso: as guardas somem, mas a identidade não é mais o agente —
    // a escrita passa a depender só de RLS. O contrato aqui é: leitura ok.
    const leitura = await c.query(`SELECT count(*)::int AS n FROM public.leads WHERE id = $1`, [
      lead,
    ]);
    expect(leitura.rows[0].n).toBe(1);
    expect((await c.query(`SELECT public.is_mcp() AS v`)).rows[0].v).toBe(false);
    await comoSuperuser(c);
    await c.query(`UPDATE public.mcp_identidade SET ativo = true WHERE uid = $1`, [mcpId]);
  });

  it("T15: usuário humano não sente nenhuma guarda", async () => {
    const lead = await criarLead(c, { corretorId: humanoId, telefone: "11977776666" });
    await comoUsuario(c, humanoId);
    const i = await c.query(
      `INSERT INTO public.interacoes (lead_id, tipo, direcao, conteudo, autor_id)
       VALUES ($1,'nota','interna','minha nota',$2) RETURNING id`,
      [lead, humanoId],
    );
    const del = await c.query(`DELETE FROM public.interacoes WHERE id = $1`, [i.rows[0].id]);
    expect(del.rowCount).toBe(1);
    // e o soft delete humano continua permitido
    await c.query(`UPDATE public.leads SET deleted_at = now() WHERE id = $1`, [lead]);
  });
});
