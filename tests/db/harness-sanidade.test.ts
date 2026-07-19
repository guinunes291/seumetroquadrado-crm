/**
 * Sanidade do harness: shims, factories e o mecanismo de identidade
 * (SET ROLE + request.jwt.claims) funcionam — pré-requisito de toda a suíte.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarLead,
  criarUsuario,
  limparDados,
  novoClient,
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

describe("harness", () => {
  it("migrations aplicadas: tabelas e RPCs centrais existem", async () => {
    const r = await c.query(`
      SELECT
        to_regclass('public.leads') IS NOT NULL AS leads,
        to_regclass('public.tarefas') IS NOT NULL AS tarefas,
        to_regclass('public.vendas') IS NOT NULL AS vendas,
        to_regproc('public.transicionar_lead') IS NOT NULL AS transicionar,
        to_regproc('public.aprovar_venda') IS NOT NULL AS aprovar,
        to_regproc('public.pode_acessar_lead') IS NOT NULL AS carteira
    `);
    expect(r.rows[0]).toEqual({
      leads: true,
      tarefas: true,
      vendas: true,
      transicionar: true,
      aprovar: true,
      carteira: true,
    });
  });

  it("auth.uid() reflete a identidade injetada e RLS liga/desliga por papel", async () => {
    const corretor = await criarUsuario(c, { papel: "corretor" });
    const outro = await criarUsuario(c, { papel: "corretor" });
    const leadDoCorretor = await criarLead(c, { corretorId: corretor.id });
    await criarLead(c, { corretorId: outro.id });

    await comoUsuario(c, corretor.id);
    const uid = await c.query(`SELECT auth.uid() AS uid`);
    expect(uid.rows[0].uid).toBe(corretor.id);

    const visiveis = await c.query(`SELECT id FROM public.leads`);
    expect(visiveis.rows.map((r) => r.id)).toEqual([leadDoCorretor]);

    await comoSuperuser(c);
    const todos = await c.query(`SELECT count(*)::int AS n FROM public.leads`);
    expect(todos.rows[0].n).toBe(2);
  });

  it("has_role e conta_atual_ativa respondem para usuário ativo", async () => {
    const gestor = await criarUsuario(c, { papel: "gestor" });
    await comoUsuario(c, gestor.id);
    const r = await c.query(
      `SELECT public.has_role(auth.uid(), 'gestor') AS eh_gestor,
              public.conta_atual_ativa() AS ativa`,
    );
    expect(r.rows[0]).toEqual({ eh_gestor: true, ativa: true });
  });
});
