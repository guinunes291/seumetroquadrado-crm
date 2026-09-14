/**
 * TELEFONIA 3C PLUS — `telefonia_agentes` (migration 20260915120000).
 *
 * O contrato testado:
 * 1. O corretor grava o PRÓPRIO token (self-service) e o trigger carimba
 *    token_atualizado_em; o app lê só as colunas liberadas.
 * 2. `api_token` é WRITE-ONLY para o app: SELECT da coluna é negado (42501)
 *    para o dono e para o admin — privilégio por coluna, não RLS. A
 *    service_role (superusuário no harness) lê.
 * 3. RLS: corretor não grava para outro (42501) nem enxerga vínculo alheio
 *    (0 linhas); gestor enxerga o status de todos mas não edita; admin edita
 *    qualquer um.
 * 4. O carimbo é do trigger: o app não consegue editá-lo; trocar o token
 *    move o carimbo, salvar só a campanha preserva.
 * 5. gestao_config: o mapeamento qualificação -> etapa ganhou
 *    followup_padrao_horas sem perder as chaves semeadas.
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

let corretor: UsuarioTeste;
let outro: UsuarioTeste;
let gestor: UsuarioTeste;
let admin: UsuarioTeste;

const TOKEN = "a".repeat(60);
const TOKEN2 = "b".repeat(60);

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  corretor = await criarUsuario(c, { nome: "Corretor 3C", papel: "corretor" });
  outro = await criarUsuario(c, { nome: "Outro corretor", papel: "corretor" });
  gestor = await criarUsuario(c, { nome: "Gestor", papel: "gestor" });
  admin = await criarUsuario(c, { nome: "Admin", papel: "admin" });
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

describe("telefonia_agentes — token write-only e RLS", () => {
  it("corretor grava o próprio token; trigger carimba token_atualizado_em e normaliza vazio", async () => {
    await comoUsuario(c, corretor.id);
    await c.query(
      `INSERT INTO public.telefonia_agentes (user_id, agent_id, campaign_id, api_token)
       VALUES ($1, ' 1042 ', '', $2)`,
      [corretor.id, TOKEN],
    );
    const r = await c.query(
      `SELECT user_id, agent_id, campaign_id, token_atualizado_em
         FROM public.telefonia_agentes WHERE user_id = $1`,
      [corretor.id],
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].agent_id).toBe("1042");
    expect(r.rows[0].campaign_id).toBeNull();
    expect(r.rows[0].token_atualizado_em).not.toBeNull();
  });

  it("o app nunca lê o token: SELECT api_token (e select *) é 42501 para o dono e para o admin", async () => {
    await comoUsuario(c, corretor.id);
    expect(
      await errCode(
        c.query(`SELECT api_token FROM public.telefonia_agentes WHERE user_id = $1`, [corretor.id]),
      ),
    ).toBe("42501");
    expect(await errCode(c.query(`SELECT * FROM public.telefonia_agentes`))).toBe("42501");
    await comoUsuario(c, admin.id);
    expect(
      await errCode(
        c.query(`SELECT api_token FROM public.telefonia_agentes WHERE user_id = $1`, [corretor.id]),
      ),
    ).toBe("42501");
  });

  it("service_role (fora do RLS) lê o token — é o que as edge functions fazem", async () => {
    await comoSuperuser(c);
    const r = await c.query(`SELECT api_token FROM public.telefonia_agentes WHERE user_id = $1`, [
      corretor.id,
    ]);
    expect(r.rows[0].api_token).toBe(TOKEN);
  });

  it("corretor não grava para outro (42501) nem enxerga vínculo alheio (0 linhas)", async () => {
    await comoUsuario(c, outro.id);
    expect(
      await errCode(
        c.query(`INSERT INTO public.telefonia_agentes (user_id, api_token) VALUES ($1, $2)`, [
          corretor.id,
          TOKEN2,
        ]),
      ),
    ).toBe("42501");
    const r = await c.query(`SELECT user_id FROM public.telefonia_agentes WHERE user_id = $1`, [
      corretor.id,
    ]);
    expect(r.rows).toHaveLength(0);
    // UPDATE em linha invisível pelo USING afeta 0 linhas, sem erro.
    const u = await c.query(
      `UPDATE public.telefonia_agentes SET campaign_id = '999' WHERE user_id = $1`,
      [corretor.id],
    );
    expect(u.rowCount).toBe(0);
  });

  it("gestor enxerga o status de todos, mas não edita; admin edita qualquer um", async () => {
    await comoUsuario(c, gestor.id);
    const r = await c.query(`SELECT user_id, agent_id FROM public.telefonia_agentes`);
    expect(r.rows.map((x) => x.user_id)).toContain(corretor.id);
    const u = await c.query(
      `UPDATE public.telefonia_agentes SET campaign_id = '318' WHERE user_id = $1`,
      [corretor.id],
    );
    expect(u.rowCount).toBe(0);

    await comoUsuario(c, admin.id);
    const ua = await c.query(
      `UPDATE public.telefonia_agentes SET campaign_id = '318' WHERE user_id = $1`,
      [corretor.id],
    );
    expect(ua.rowCount).toBe(1);
    // Admin também cadastra o vínculo de outro corretor (agente/campanha).
    await c.query(
      `INSERT INTO public.telefonia_agentes (user_id, agent_id, campaign_id) VALUES ($1, '2001', '319')`,
      [outro.id],
    );
    await comoUsuario(c, outro.id);
    const ro = await c.query(
      `SELECT campaign_id, token_atualizado_em FROM public.telefonia_agentes WHERE user_id = $1`,
      [outro.id],
    );
    expect(ro.rows[0].campaign_id).toBe("319");
    expect(ro.rows[0].token_atualizado_em).toBeNull();
  });

  it("carimbo é do trigger: o app não o edita; trocar o token move, salvar campanha preserva", async () => {
    await comoUsuario(c, corretor.id);
    expect(
      await errCode(
        c.query(
          `UPDATE public.telefonia_agentes SET token_atualizado_em = now() WHERE user_id = $1`,
          [corretor.id],
        ),
      ),
    ).toBe("42501");

    const antes = await c.query(
      `SELECT token_atualizado_em FROM public.telefonia_agentes WHERE user_id = $1`,
      [corretor.id],
    );
    const t0 = new Date(antes.rows[0].token_atualizado_em as string).getTime();

    // Só a campanha: carimbo do token intacto.
    await c.query(`UPDATE public.telefonia_agentes SET campaign_id = '320' WHERE user_id = $1`, [
      corretor.id,
    ]);
    const meio = await c.query(
      `SELECT campaign_id, token_atualizado_em FROM public.telefonia_agentes WHERE user_id = $1`,
      [corretor.id],
    );
    expect(meio.rows[0].campaign_id).toBe("320");
    expect(new Date(meio.rows[0].token_atualizado_em as string).getTime()).toBe(t0);

    // Token novo: carimbo avança (transações separadas => now() diferente).
    await c.query(`UPDATE public.telefonia_agentes SET api_token = $2 WHERE user_id = $1`, [
      corretor.id,
      TOKEN2,
    ]);
    const depois = await c.query(
      `SELECT token_atualizado_em FROM public.telefonia_agentes WHERE user_id = $1`,
      [corretor.id],
    );
    expect(new Date(depois.rows[0].token_atualizado_em as string).getTime()).toBeGreaterThan(t0);
    await comoSuperuser(c);
    const tok = await c.query(`SELECT api_token FROM public.telefonia_agentes WHERE user_id = $1`, [
      corretor.id,
    ]);
    expect(tok.rows[0].api_token).toBe(TOKEN2);

    // Token vazio limpa o token E o carimbo.
    await comoUsuario(c, corretor.id);
    await c.query(`UPDATE public.telefonia_agentes SET api_token = '' WHERE user_id = $1`, [
      corretor.id,
    ]);
    const limpo = await c.query(
      `SELECT token_atualizado_em FROM public.telefonia_agentes WHERE user_id = $1`,
      [corretor.id],
    );
    expect(limpo.rows[0].token_atualizado_em).toBeNull();
  });

  it("só admin apaga o vínculo", async () => {
    await comoUsuario(c, corretor.id);
    const d = await c.query(`DELETE FROM public.telefonia_agentes WHERE user_id = $1`, [
      corretor.id,
    ]);
    expect(d.rowCount).toBe(0);
    await comoUsuario(c, admin.id);
    const da = await c.query(`DELETE FROM public.telefonia_agentes WHERE user_id = $1`, [outro.id]);
    expect(da.rowCount).toBe(1);
  });
});

describe("gestao_config — qualificação -> etapa", () => {
  it("ganhou followup_padrao_horas sem perder o mapeamento semeado", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT valor FROM public.gestao_config WHERE chave = 'telefonia_tabulacao_status'`,
    );
    expect(r.rows).toHaveLength(1);
    const valor = r.rows[0].valor as {
      mapeamento: Record<string, string>;
      followup_padrao_horas: number;
    };
    expect(valor.followup_padrao_horas).toBe(24);
    expect(valor.mapeamento["sem interesse"]).toBe("perdido");
    expect(valor.mapeamento["pediu retorno"]).toBe("aguardando_retorno");
  });
});
