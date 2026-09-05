/**
 * PONTUAÇÃO DIÁRIA × PESOS (migration 20260905120000_pontuacao_recalculo_config)
 *
 * pontuacao_total é gravado por bump_atividade com os pesos do instante do
 * lançamento. Desde a migration acima, mudar configuracao_pontuacao recalcula
 * o histórico inteiro com a fórmula vigente — o ranking nunca mais soma
 * pontos de duas réguas diferentes, e a decomposição quantidade × peso que a
 * página de Desempenho mostra bate com o total oficial.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarUsuario,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let admin: UsuarioTeste;
let corretor: UsuarioTeste;
let pesosOriginais: Array<{ chave: string; pontos: number; ativo: boolean }> = [];

async function pesos(): Promise<Record<string, number>> {
  const r = await c.query(
    `SELECT chave, public.pontos_de(chave)::int AS pontos FROM public.configuracao_pontuacao`,
  );
  return Object.fromEntries(r.rows.map((x) => [x.chave as string, x.pontos as number]));
}

async function pontuacao(dia: string): Promise<number> {
  const r = await c.query(
    `SELECT pontuacao_total FROM public.atividades_diarias WHERE corretor_id = $1 AND dia = $2::date`,
    [corretor.id, dia],
  );
  return r.rows[0]?.pontuacao_total as number;
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  admin = await criarUsuario(c, { nome: "Admin Pesos", papel: "admin" });
  corretor = await criarUsuario(c, { nome: "Corretor Pesos", papel: "corretor" });
  await comoSuperuser(c);
  const r = await c.query(`SELECT chave, pontos, ativo FROM public.configuracao_pontuacao`);
  pesosOriginais = r.rows as typeof pesosOriginais;
});

afterAll(async () => {
  await comoSuperuser(c);
  for (const p of pesosOriginais) {
    await c.query(
      `UPDATE public.configuracao_pontuacao SET pontos = $2, ativo = $3 WHERE chave = $1`,
      [p.chave, p.pontos, p.ativo],
    );
  }
  await limparDados(c);
  await c.end();
});

describe("pontuação diária acompanha os pesos vigentes", () => {
  it("bump_atividade grava quantidade × peso vigente", async () => {
    await comoSuperuser(c);
    await c.query(
      `SELECT public.bump_atividade($1, '2026-09-01', _lig => 10, _wa => 5, _ag => 2, _vis => 1, _doc => 1, _ven => 1, _vgv => 300000)`,
      [corretor.id],
    );
    await c.query(`SELECT public.bump_atividade($1, '2026-09-02', _lig => 4, _ag => 1)`, [
      corretor.id,
    ]);
    const p = await pesos();
    expect(await pontuacao("2026-09-01")).toBe(
      10 * p.ligacao + 5 * p.whatsapp + 2 * p.agendamento + p.visita + p.documentacao + p.venda,
    );
    expect(await pontuacao("2026-09-02")).toBe(4 * p.ligacao + p.agendamento);
  });

  it("mudar um peso recalcula TODO o histórico (não só os lançamentos futuros)", async () => {
    await comoSuperuser(c);
    const antes = await pontuacao("2026-09-01");
    const p = await pesos();
    await c.query(`UPDATE public.configuracao_pontuacao SET pontos = $1 WHERE chave = 'venda'`, [
      p.venda + 500,
    ]);
    expect(await pontuacao("2026-09-01")).toBe(antes + 500);
    // O dia sem venda não muda.
    expect(await pontuacao("2026-09-02")).toBe(4 * p.ligacao + p.agendamento);
  });

  it("desativar uma atividade zera a parcela dela no histórico", async () => {
    await comoSuperuser(c);
    const antes = await pontuacao("2026-09-01");
    const p = await pesos();
    await c.query(
      `UPDATE public.configuracao_pontuacao SET ativo = false WHERE chave = 'documentacao'`,
    );
    expect(await pontuacao("2026-09-01")).toBe(antes - p.documentacao);
    await c.query(
      `UPDATE public.configuracao_pontuacao SET ativo = true WHERE chave = 'documentacao'`,
    );
    expect(await pontuacao("2026-09-01")).toBe(antes);
  });

  it("um UPDATE que troca vários pesos recalcula uma vez e devolve o total certo", async () => {
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.configuracao_pontuacao SET pontos = CASE chave WHEN 'ligacao' THEN 3 WHEN 'whatsapp' THEN 2 ELSE pontos END WHERE chave IN ('ligacao','whatsapp')`,
    );
    const p = await pesos();
    expect(p.ligacao).toBe(3);
    expect(p.whatsapp).toBe(2);
    expect(await pontuacao("2026-09-02")).toBe(4 * 3 + p.agendamento);
  });

  it("o RPC ranking_periodo_v2 devolve a pontuação recalculada", async () => {
    await comoUsuario(c, admin.id);
    const r = await c.query(
      `SELECT corretor_id, pontuacao::int AS pontuacao, posicao::int AS posicao
         FROM public.ranking_periodo_v2('2026-09-01', '2026-09-30', 50)
        WHERE corretor_id = $1`,
      [corretor.id],
    );
    await comoSuperuser(c);
    const esperado = (await pontuacao("2026-09-01")) + (await pontuacao("2026-09-02"));
    expect(r.rows[0].pontuacao).toBe(esperado);
    expect(r.rows[0].posicao).toBe(1);
  });

  it("a função de recálculo não é executável por usuário comum", async () => {
    await comoUsuario(c, corretor.id);
    let code = "";
    try {
      await c.query(`SELECT public.recalcular_pontuacao_atividades()`);
    } catch (e) {
      code = (e as { code?: string }).code ?? "";
    }
    await comoSuperuser(c);
    expect(code).toBe("42501");
  });

  it("recálculo é idempotente: sem mudança de peso, nenhuma linha é tocada", async () => {
    await comoSuperuser(c);
    const r = await c.query(`SELECT public.recalcular_pontuacao_atividades() AS n`);
    expect(r.rows[0].n).toBe(0);
  });
});
