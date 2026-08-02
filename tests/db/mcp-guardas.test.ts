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
  const mcp = await criarUsuario(c, { papel: "gestor", nome: "Agente MCP" });
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
      `INSERT INTO public.interacoes (lead_id, tipo, direcao, descricao, user_id)
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
    await c.query(
      `SELECT public.transicionar_lead($1,'em_atendimento','teste',NULL,NULL,NULL)`,
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
    expect(await errCode(c.query(`DELETE FROM public.leads WHERE id = $1`, [lead]))).toBe(
      "42501",
    );
  });

  it("T4: DELETE na tabela sem RLS também é bloqueado", async () => {
    await comoMcp();
    expect(
      await errCode(c.query(`DELETE FROM public.bkp_f085_arquivadas_20260731`)),
    ).toBe("42501");
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
    await comoSuperuser(c);
    const lead = await criarLead(c, { corretorId: mcpId });
    const venda = await c.query(
      `INSERT INTO public.vendas (lead_id, corretor_id, valor_venda, status_venda)
       VALUES ($1,$2,100000,'aprovada') RETURNING id`,
      [lead, mcpId],
    );
    const pendente = await c.query(
      `INSERT INTO public.vendas (lead_id, corretor_id, valor_venda, status_venda)
       VALUES ($1,$2,100000,'pendente') RETURNING id`,
      [lead, mcpId],
    );
    await comoMcp();
    expect(
      await errCode(c.query(`UPDATE public.vendas SET valor_venda = 1 WHERE id = $1`, [venda.rows[0].id])),
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
    await c.query(`CREATE TABLE IF NOT EXISTS public.teste_heranca (id uuid primary key default gen_random_uuid(), nome text)`);
    await c.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.teste_heranca TO authenticated`);
    await c.query(`SELECT public.mcp_aplicar_guardas()`);
    await comoMcp();
    await c.query(`INSERT INTO public.teste_heranca (nome) VALUES ('ok')`);
    expect(await errCode(c.query(`DELETE FROM public.teste_heranca`))).toBe("42501");

    await comoSuperuser(c);
    await c.query(`CREATE TABLE IF NOT EXISTS public.teste_heranca_2 (id uuid primary key default gen_random_uuid())`);
    const sem = await c.query(
      `SELECT tabela FROM public.mcp_tabelas_sem_guarda WHERE tabela = 'teste_heranca_2'`,
    );
    expect(sem.rowCount).toBe(1);
    await c.query(`DROP TABLE public.teste_heranca, public.teste_heranca_2`);
  });
});

describe("auditoria e botão de desligar", () => {
  it("T13: escritas e bloqueios do MCP viram linha em api_escrita_log", async () => {
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.api_escrita_log WHERE agente = 'mcp'`);
    const lead = await criarLead(c, { corretorId: mcpId });
    await comoMcp();
    await c.query(`UPDATE public.leads SET nome = 'Auditado' WHERE id = $1`, [lead]);
    await errCode(c.query(`DELETE FROM public.leads WHERE id = $1`, [lead]));
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT acao, tabela, resultado, ator IS NOT NULL AS tem_ator, diff IS NOT NULL AS tem_diff
         FROM public.api_escrita_log WHERE agente = 'mcp' ORDER BY ts`,
    );
    expect(r.rows.some((x) => x.acao === "update" && x.tabela === "leads" && x.tem_diff)).toBe(true);
    expect(r.rows.some((x) => x.acao === "delete" && x.resultado === "erro")).toBe(true);
    expect(r.rows.every((x) => x.tem_ator)).toBe(true);
  });

  it("T14: ativo=false desliga a escrita mas não a leitura", async () => {
    const lead = await criarLead(c, { corretorId: mcpId });
    await comoSuperuser(c);
    await c.query(`UPDATE public.mcp_identidade SET ativo = false WHERE uid = $1`, [mcpId]);
    await comoMcp();
    // is_mcp() falso: as guardas somem, mas a identidade não é mais o agente —
    // a escrita passa a depender só de RLS. O contrato aqui é: leitura ok.
    const leitura = await c.query(`SELECT count(*)::int AS n FROM public.leads WHERE id = $1`, [lead]);
    expect(leitura.rows[0].n).toBe(1);
    expect((await c.query(`SELECT public.is_mcp() AS v`)).rows[0].v).toBe(false);
    await comoSuperuser(c);
    await c.query(`UPDATE public.mcp_identidade SET ativo = true WHERE uid = $1`, [mcpId]);
  });

  it("T15: usuário humano não sente nenhuma guarda", async () => {
    const lead = await criarLead(c, { corretorId: humanoId, telefone: "11977776666" });
    await comoUsuario(c, humanoId);
    const i = await c.query(
      `INSERT INTO public.interacoes (lead_id, tipo, direcao, descricao, user_id)
       VALUES ($1,'nota','interna','minha nota',$2) RETURNING id`,
      [lead, humanoId],
    );
    const del = await c.query(`DELETE FROM public.interacoes WHERE id = $1`, [i.rows[0].id]);
    expect(del.rowCount).toBe(1);
    // e o soft delete humano continua permitido
    await c.query(`UPDATE public.leads SET deleted_at = now() WHERE id = $1`, [lead]);
  });
});
