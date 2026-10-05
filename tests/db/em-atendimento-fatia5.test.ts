/**
 * REGRA DOS 65 — Fatia 5: a virada segura, um motor só (migration 20261011120300).
 *
 *  1. Com a regra dos 65 ligada OU agendada, a régua de devolução do Bolsão
 *     (bolsao.modo = ativo) e a devolução por follow-up vencido
 *     (regua_followup.devolucao_ativa) não ligam — por UPDATE direto, por
 *     INSERT, pelo admin via RLS. SQLSTATE SMQ65.
 *  2. O inverso: com um motor antigo ativo, a regra não vai a `ligado` nem
 *     por UPDATE direto (a RPC já recusava).
 *  3. Só a transição para ligado é barrada: desligar, salvar a régua com a
 *     devolução desligada e as outras chaves passam.
 *  4. Em sombra, tudo continua como antes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarUsuario,
  errCode,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();
let admin: UsuarioTeste;
const antes: Record<string, unknown> = {};
const CHAVES = ["em_atendimento", "bolsao", "regua_followup"];

async function valor(chave: string): Promise<Record<string, unknown> | null> {
  await comoSuperuser(c);
  const r = await c.query(`SELECT valor FROM public.gestao_config WHERE chave = $1`, [chave]);
  return r.rows[0]?.valor ?? null;
}

async function por(chave: string, v: Record<string, unknown>) {
  await comoSuperuser(c);
  await c.query(`UPDATE public.gestao_config SET valor = $2::jsonb WHERE chave = $1`, [
    chave,
    JSON.stringify(v),
  ]);
}

/** Tenta `valor || patch` na chave; devolve o SQLSTATE (null = passou). */
async function tentar(
  chave: string,
  patch: Record<string, unknown>,
  quem?: UsuarioTeste,
): Promise<string | null> {
  if (quem) await comoUsuario(c, quem.id);
  else await comoSuperuser(c);
  try {
    return await errCode(
      c.query(`UPDATE public.gestao_config SET valor = valor || $2::jsonb WHERE chave = $1`, [
        chave,
        JSON.stringify(patch),
      ]),
    );
  } finally {
    await comoSuperuser(c);
  }
}

async function mensagem(chave: string, patch: Record<string, unknown>): Promise<string> {
  await comoSuperuser(c);
  try {
    await c.query(`UPDATE public.gestao_config SET valor = valor || $2::jsonb WHERE chave = $1`, [
      chave,
      JSON.stringify(patch),
    ]);
    return "";
  } catch (e) {
    return (e as Error).message;
  }
}

const sombra = () => por("em_atendimento", { ...(antes.em_atendimento as object), modo: "sombra" });
const agendada = () =>
  por("em_atendimento", {
    ...(antes.em_atendimento as object),
    modo: "ligado",
    virada_em: new Date(Date.now() + 7 * 86400_000).toISOString(),
  });
const ligada = () =>
  por("em_atendimento", {
    ...(antes.em_atendimento as object),
    modo: "ligado",
    virada_em: new Date(Date.now() - 86400_000).toISOString(),
  });
const motoresDesligados = async () => {
  await por("bolsao", { ...(antes.bolsao as object), modo: "sombra" });
  await por("regua_followup", { ...(antes.regua_followup as object), devolucao_ativa: false });
};

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  admin = await criarUsuario(c, { papel: "admin", nome: "Admin" });
  for (const k of CHAVES) antes[k] = (await valor(k)) ?? {};
  // Em produção `authenticated` tem UPDATE na tabela (o cartão de gestão
  // grava direto, sob a RLS de admin); o harness só tem SELECT. O grant aqui
  // reproduz o caminho da tela para provar que o gatilho a alcança.
  await c.query(`GRANT UPDATE ON public.gestao_config TO authenticated`);
  await sombra();
  await motoresDesligados();
});

afterAll(async () => {
  await comoSuperuser(c);
  for (const k of CHAVES) await por(k, antes[k] as Record<string, unknown>);
  await c.query(`REVOKE UPDATE ON public.gestao_config FROM authenticated`);
  await c.end();
});

describe("Fatia 5: um motor só", () => {
  it("o gatilho está na tabela e a função não tem EXECUTE para authenticated", async () => {
    await comoSuperuser(c);
    const t = await c.query(
      `SELECT tgenabled FROM pg_trigger WHERE tgname = 'trg_gestao_config_um_motor'
          AND tgrelid = 'public.gestao_config'::regclass`,
    );
    expect(t.rowCount).toBe(1);
    const p = await c.query(
      `SELECT has_function_privilege('authenticated', 'public.gestao_config_um_motor()', 'EXECUTE') AS ok`,
    );
    expect(p.rows[0].ok).toBe(false);
  });

  it("em sombra, os motores antigos ligam e desligam como antes", async () => {
    await sombra();
    expect(await tentar("regua_followup", { devolucao_ativa: true })).toBeNull();
    expect(await tentar("bolsao", { modo: "ativo" })).toBeNull();
    await motoresDesligados();
  });

  it("com a regra AGENDADA, nem a régua nem o Bolsão ligam — também pelo admin via RLS", async () => {
    await agendada();
    expect(await tentar("regua_followup", { devolucao_ativa: true })).toBe("SMQ65");
    expect(await tentar("bolsao", { modo: "ativo" })).toBe("SMQ65");
    // O caminho da tela: admin, sob RLS, pelo UPDATE direto da tabela.
    expect(await tentar("regua_followup", { devolucao_ativa: true }, admin)).toBe("SMQ65");
    expect(await tentar("regua_followup", { sla_devolucao_dias: 3 }, admin)).toBeNull();
    expect(await mensagem("regua_followup", { devolucao_ativa: true })).toMatch(/regra dos 65/);
    expect((await valor("regua_followup"))?.devolucao_ativa).toBe(false);
    expect((await valor("bolsao"))?.modo).toBe("sombra");
  });

  it("com a regra LIGADA, idem; desligar e salvar com a devolução desligada passam", async () => {
    await ligada();
    expect(await tentar("regua_followup", { devolucao_ativa: true })).toBe("SMQ65");
    expect(await tentar("bolsao", { modo: "ativo" })).toBe("SMQ65");
    // Salvar a régua inteira com a devolução desligada: livre.
    expect(
      await tentar("regua_followup", { devolucao_ativa: false, sla_devolucao_dias: 4 }),
    ).toBeNull();
    expect(await tentar("bolsao", { modo: "sombra", lote_max: 400 })).toBeNull();
    // Outras chaves nem passam pelo juízo.
    expect(await tentar("pacing", { feriados: ["2026-12-25"] })).toBeNull();
  });

  it("o inverso: com um motor antigo ativo, a regra não vai a ligado nem por UPDATE direto", async () => {
    await sombra();
    await por("regua_followup", { ...(antes.regua_followup as object), devolucao_ativa: true });
    expect(await tentar("em_atendimento", { modo: "ligado" })).toBe("SMQ65");
    await comoUsuario(c, admin.id);
    expect(await errCode(c.query(`SELECT public.em_atendimento_ligar(now())`))).toBe("22023");
    await comoSuperuser(c);
    await por("regua_followup", { ...(antes.regua_followup as object), devolucao_ativa: false });
    await por("bolsao", { ...(antes.bolsao as object), modo: "ativo" });
    expect(await tentar("em_atendimento", { modo: "ligado" })).toBe("SMQ65");
    await por("bolsao", { ...(antes.bolsao as object), modo: "sombra" });
    // Sem motor antigo, liga — e a regra já ligada pode ser re-salva.
    expect(await tentar("em_atendimento", { modo: "ligado" })).toBeNull();
    expect(await tentar("em_atendimento", { modo: "ligado", teto_base: 150 })).toBeNull();
    expect((await valor("em_atendimento"))?.modo).toBe("ligado");
    await sombra();
  });

  it("a regra ligada pela RPC expõe virada_em e ligado_em na config (o aviso ao corretor lê daí)", async () => {
    await sombra();
    await comoUsuario(c, admin.id);
    const virada = new Date(Date.now() + 3 * 86400_000).toISOString();
    const r = await c.query(`SELECT public.em_atendimento_ligar($1::timestamptz) AS c`, [virada]);
    await comoSuperuser(c);
    const cfg = r.rows[0].c;
    expect(cfg.modo).toBe("ligado");
    expect(new Date(cfg.virada_em).getTime()).toBe(new Date(virada).getTime());
    expect(typeof cfg.ligado_em).toBe("string");
    await sombra();
  });

  it("INSERT da chave com o motor ligado também é barrado", async () => {
    await ligada();
    await comoSuperuser(c);
    const salvo = await valor("regua_followup");
    await c.query(`DELETE FROM public.gestao_config WHERE chave = 'regua_followup'`);
    try {
      expect(
        await errCode(
          c.query(
            `INSERT INTO public.gestao_config (chave, valor, descricao)
             VALUES ('regua_followup', $1::jsonb, 'teste')`,
            [JSON.stringify({ ...(salvo ?? {}), devolucao_ativa: true })],
          ),
        ),
      ).toBe("SMQ65");
      expect(
        await errCode(
          c.query(
            `INSERT INTO public.gestao_config (chave, valor, descricao)
             VALUES ('regua_followup', $1::jsonb, 'teste')`,
            [JSON.stringify({ ...(salvo ?? {}), devolucao_ativa: false })],
          ),
        ),
      ).toBeNull();
    } finally {
      await comoSuperuser(c);
      await c.query(`DELETE FROM public.gestao_config WHERE chave = 'regua_followup'`);
      await c.query(
        `INSERT INTO public.gestao_config (chave, valor, descricao) VALUES ('regua_followup', $1::jsonb, 'Régua de follow-up')`,
        [JSON.stringify(salvo ?? {})],
      );
      await sombra();
    }
  });
});
