/**
 * RPCs SECURITY DEFINER sem EXECUTE para anon — migration 20261009120400.
 *
 * Uma função criada sem REVOKE nasce executável por PUBLIC — inclusive `anon`,
 * o papel da chamada SEM login à API. Em SECURITY DEFINER isso vira vazamento
 * quando a função trata `auth.uid()` nulo como "sistema": a chamada anônima
 * também chega com uid nulo. Foi o caso de dashboard_atividade_periodo, que
 * entregava a qualquer anônimo os números da empresa inteira (vendas e VGV
 * incluídos).
 *
 * A última seção é a sonda permanente: chama, como anon, TODA função SECURITY
 * DEFINER que anon ainda pode executar e exige que ela recuse. Função nova que
 * precise mesmo atender anônimo entra em PUBLICAS_DE_PROPOSITO, com o motivo.
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
  pool,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();
let admin: UsuarioTeste;
let corretor: UsuarioTeste;

/** Funções SECURITY DEFINER que PODEM executar para anon, com o motivo. */
const PUBLICAS_DE_PROPOSITO: Record<string, string> = {};

async function comoAnon() {
  await c.query(`RESET ROLE`);
  await c.query(`SELECT set_config('request.jwt.claims', '{"role":"anon"}', false)`);
  await c.query(`SET ROLE anon`);
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  admin = await criarUsuario(c, { nome: "Ada Admin", papel: "admin" });
  corretor = await criarUsuario(c, { nome: "Caio Corretor", papel: "corretor" });
  await criarLead(c, { nome: "Lead do mês", corretorId: corretor.id });
});

afterAll(async () => {
  await comoSuperuser(c);
  await limparDados(c);
  await c.end();
  await pool.end();
});

describe("dashboard_atividade_periodo — os números da empresa", () => {
  const sql = `SELECT public.dashboard_atividade_periodo(now() - interval '30 days', now() + interval '1 day', NULL, 'criacao') AS r`;

  it("anônimo não executa (antes: lia leads, vendas e VGV da empresa inteira)", async () => {
    await comoAnon();
    expect(await errCode(c.query(sql))).toBe("42501");
  });

  it("admin logado e o contexto de serviço (sem JWT) seguem lendo", async () => {
    await comoUsuario(c, admin.id);
    expect((await c.query(sql)).rows[0].r).toHaveProperty("leads_novos", 1);
    await comoSuperuser(c);
    expect((await c.query(sql)).rows[0].r).toHaveProperty("leads_novos", 1);
  });
});

describe("permissões", () => {
  it("anon sem EXECUTE; authenticated mantém o que as telas e funções INVOKER usam", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT f,
              has_function_privilege('anon', f, 'EXECUTE') AS anon,
              has_function_privilege('authenticated', f, 'EXECUTE') AS auth
         FROM unnest(ARRAY[
           'public.dashboard_atividade_periodo(timestamptz,timestamptz,uuid,text)',
           'public.regua_devolucao_candidatos_v1()',
           'public.produtividade_corretores()',
           'public.mcp_log_bloqueio(text,text,text)',
           'public.copa_ranking(uuid)',
           'public.create_oferta_ativa(text,text,jsonb,uuid)',
           'public.rel_conversao_por_corretor(timestamptz,timestamptz)',
           'public.is_mcp()',
           'public.zona_do_bairro(text)'
         ]) AS f`,
    );
    for (const x of r.rows) {
      expect(x.anon, x.f).toBe(false);
      expect(x.auth, x.f).toBe(true);
    }
  });

  it("mcp_aplicar_guardas (DDL como dono) é só de manutenção", async () => {
    await comoUsuario(c, corretor.id);
    expect(await errCode(c.query(`SELECT * FROM public.mcp_aplicar_guardas()`))).toBe("42501");
  });
});

describe("sonda: nenhuma SECURITY DEFINER executa para anon", () => {
  it("toda função que anon ainda pode chamar recusa a chamada anônima", async () => {
    await comoSuperuser(c);
    const alvos = (
      await c.query(
        `SELECT p.oid::regproc::text AS nome, p.oid::regprocedure::text AS assinatura,
                (SELECT string_agg('NULL::' || format_type(t, NULL), ', ' ORDER BY ord)
                   FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY AS a(t, ord)) AS args
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'
            AND has_function_privilege('anon', p.oid, 'EXECUTE')
            AND p.prorettype <> 'trigger'::regtype
          ORDER BY 2`,
      )
    ).rows as { nome: string; assinatura: string; args: string | null }[];

    const executaram: string[] = [];
    await c.query(`BEGIN`);
    try {
      await comoAnon();
      for (const a of alvos) {
        if (PUBLICAS_DE_PROPOSITO[a.assinatura]) continue;
        await c.query(`SAVEPOINT sonda`);
        try {
          await c.query(`SELECT count(*) FROM ${a.nome}(${a.args ?? ""}) AS t`);
          executaram.push(a.assinatura);
        } catch {
          // recusou (ou falhou antes de devolver dado) — é o esperado
        }
        await c.query(`ROLLBACK TO SAVEPOINT sonda`);
      }
    } finally {
      await c.query(`ROLLBACK`);
      await comoSuperuser(c);
    }
    expect(executaram).toEqual([]);
  });
});
