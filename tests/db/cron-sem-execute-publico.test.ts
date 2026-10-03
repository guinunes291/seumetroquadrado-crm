/**
 * Cron de distribuição e jobs sem EXECUTE público —
 * migration 20261009120300.
 *
 * `processar_distribuicao_automatica()` tinha o grant padrão de PUBLIC: um
 * chamador anônimo da API rodava a rodada inteira (triagem, repasse por SLA,
 * leads parados), e um corretor autenticado disparava os repasses. Agora só o
 * pg_cron/service_role e o ADMIN (botão "Rodar distribuição") rodam; os jobs
 * que só o pg_cron chama perderam o EXECUTE de PUBLIC/anon/authenticated.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
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
});

afterAll(async () => {
  await comoSuperuser(c);
  await limparDados(c);
  await c.end();
  await pool.end();
});

describe("processar_distribuicao_automatica", () => {
  it("anônimo não executa (antes: rodada inteira sob demanda)", async () => {
    await comoAnon();
    expect(await errCode(c.query(`SELECT public.processar_distribuicao_automatica()`))).toBe(
      "42501",
    );
  });

  it("corretor autenticado é recusado na entrada (antes: disparava os repasses)", async () => {
    await comoUsuario(c, corretor.id);
    expect(await errCode(c.query(`SELECT public.processar_distribuicao_automatica()`))).toBe(
      "42501",
    );
  });

  it("admin (botão Rodar distribuição) e o cron (sem JWT) seguem rodando", async () => {
    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT public.processar_distribuicao_automatica() AS res`);
    expect(r.rows[0].res).toHaveProperty("distribuidos");

    await comoSuperuser(c);
    const cron = await c.query(`SELECT public.processar_distribuicao_automatica() AS res`);
    expect(cron.rows[0].res).toHaveProperty("redistribuidos");
  });
});

describe("jobs do pg_cron sem EXECUTE para a API", () => {
  it("anon não executa nenhum; authenticated só o que a sessão do usuário precisa", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT f,
              has_function_privilege('anon', f, 'EXECUTE') AS anon,
              has_function_privilege('authenticated', f, 'EXECUTE') AS auth,
              has_function_privilege('service_role', f, 'EXECUTE') AS service
         FROM unnest(ARRAY[
           'public.resetar_presenca_diaria()',
           'public.gerar_alertas_leads_parados()',
           'public.gerar_pushes_lembretes_visita()',
           'public.recalcular_temperatura_leads()',
           'public.conceder_conquistas(uuid)',
           'public.regua_devolucao_processar(text,integer)',
           'public.sync_proximo_followup(uuid)',
           'public._msg_fora_da_regiao(text,uuid)'
         ]) AS f`,
    );
    const m = Object.fromEntries(r.rows.map((x) => [x.f, x]));
    for (const x of r.rows) {
      expect(x.anon, x.f).toBe(false);
      expect(x.service, x.f).toBe(true);
    }
    // O trigger de tarefas chama sync_proximo_followup na sessão do usuário.
    expect(m["public.sync_proximo_followup(uuid)"].auth).toBe(true);
    expect(m["public.resetar_presenca_diaria()"].auth).toBe(false);
  });

  it("corretor não zera mais a presença de todo mundo", async () => {
    await comoUsuario(c, corretor.id);
    expect(await errCode(c.query(`SELECT public.resetar_presenca_diaria()`))).toBe("42501");
  });
});
