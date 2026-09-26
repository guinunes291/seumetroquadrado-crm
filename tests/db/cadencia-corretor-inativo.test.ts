/**
 * CADÊNCIA — corretor inativo (migration 20260926120000).
 *
 * Medido em produção em 22/09/2026: 5 leads em D1/D2/D3 de perfis INATIVOS,
 * admitidos pela Fase 0, que nunca perguntou se o dono estava ativo. Ninguém
 * os trabalha; o prazo vence e o painel registra falha de quem já saiu.
 *
 * O que está em jogo:
 *  1. A Fase 0 não manda para a cadência lead de dono inativo — mas os outros
 *     destinos (encerrar, reativação) continuam, porque não dependem do dono.
 *  2. `cadencia_iniciar` recusa dono inativo.
 *  3. `cadencia_devolver_inativos` devolve à roleta pelo caminho da cadência,
 *     respeita o modo sombra, e loga como `inativo` — NUNCA como `vencidos`,
 *     que é o job que o painel conta como falha do corretor.
 *  4. O motor de vencidos limpa os inativos antes de cobrar prazo.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarLead,
  criarUsuario,
  errCode,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let ativo: UsuarioTeste;
let saiu: UsuarioTeste;

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
});

afterAll(async () => {
  await comoSuperuser(c);
  await c.query(`UPDATE public.cadencia_config SET modo = 'sombra' WHERE id = 1`);
  await limparDados(c);
  await c.end();
});

beforeEach(async () => {
  await limparDados(c);
  await comoSuperuser(c);
  await c.query(`UPDATE public.cadencia_config SET modo = 'ativo' WHERE id = 1`);
  ativo = await criarUsuario(c, { nome: "Corretor Ativo", papel: "corretor" });
  saiu = await criarUsuario(c, { nome: "Corretor Que Saiu", papel: "corretor" });
});

async function desativar(u: UsuarioTeste) {
  await comoSuperuser(c);
  await c.query(`UPDATE public.profiles SET ativo = false WHERE id = $1`, [u.id]);
}

/** Estoque fora da cadência, parado há `dias`. */
async function estoque(dono: UsuarioTeste, dias = 10): Promise<string> {
  const id = await criarLead(c, { corretorId: dono.id, status: "aguardando_atendimento" });
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.leads
        SET cadencia_etapa = NULL, cadencia_prazo_ts = NULL, cadencia_inicio_ts = NULL,
            ultimo_contato = NULL, ultima_interacao = now() - make_interval(days => $2::int)
      WHERE id = $1`,
    [id, dias],
  );
  return id;
}

async function lead(id: string) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT corretor_id, status::text AS status, cadencia_etapa FROM public.leads WHERE id = $1`,
    [id],
  );
  return r.rows[0] as { corretor_id: string | null; status: string; cadencia_etapa: string | null };
}

async function jobsDoLead(id: string): Promise<string[]> {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT job FROM public.cadencia_execucao_log WHERE lead_id = $1 ORDER BY created_at`,
    [id],
  );
  return r.rows.map((x) => x.job as string);
}

describe("Fase 0", () => {
  it("dono inativo não vai para a cadência; reativação e encerramento continuam valendo", async () => {
    const doAtivo = await estoque(ativo, 10);
    const doInativoRecente = await estoque(saiu, 10);
    const doInativoFrio = await estoque(saiu, 45);
    await desativar(saiu);

    await comoSuperuser(c);
    const r = await c.query(`SELECT lead_id, destino FROM public.cadencia_fase0_classificar()`);
    const destino = new Map(r.rows.map((x) => [x.lead_id as string, x.destino as string]));
    expect(destino.get(doAtivo)).toBe("cadencia");
    expect(destino.has(doInativoRecente)).toBe(false);
    // Estoque frio vai à reativação — trabalho do SDR, independe do dono.
    expect(destino.get(doInativoFrio)).toBe("reativacao");
  });

  it("a admissão não põe em Lead chegou lead de dono inativo", async () => {
    const doAtivo = await estoque(ativo);
    const doInativo = await estoque(saiu);
    await desativar(saiu);

    await comoSuperuser(c);
    const r = await c.query(`SELECT * FROM public.cadencia_fase0_admitir('ativo', 15)`);
    expect(r.rows[0].admitidos).toBe(1);
    expect((await lead(doAtivo)).cadencia_etapa).toBe("D0");
    expect((await lead(doInativo)).cadencia_etapa).toBeNull();
  });
});

describe("cadencia_iniciar", () => {
  it("recusa dono inativo, e o gatilho de atribuição não começa cadência para ele", async () => {
    await desativar(saiu);
    const id = await criarLead(c, { corretorId: saiu.id, status: "aguardando_atendimento" });
    expect((await lead(id)).cadencia_etapa).toBeNull();

    await comoSuperuser(c);
    const r = await c.query(`SELECT public.cadencia_iniciar($1) AS ok`, [id]);
    expect(r.rows[0].ok).toBe(false);
  });
});

describe("cadencia_devolver_inativos", () => {
  it("devolve à roleta pelo caminho da cadência e deixa o lead do ativo onde está", async () => {
    const doInativo = await criarLead(c, { corretorId: saiu.id, status: "aguardando_atendimento" });
    const doAtivo = await criarLead(c, { corretorId: ativo.id, status: "aguardando_atendimento" });
    expect((await lead(doInativo)).cadencia_etapa).toBe("D0");
    await desativar(saiu);

    await comoSuperuser(c);
    const r = await c.query(`SELECT * FROM public.cadencia_devolver_inativos('ativo')`);
    expect(r.rows[0]).toMatchObject({ avaliados: 1, aplicados: 1 });

    expect(await lead(doInativo)).toEqual({
      corretor_id: null,
      status: "aguardando_corretor",
      cadencia_etapa: null,
    });
    expect((await lead(doAtivo)).cadencia_etapa).toBe("D0");
    expect(await jobsDoLead(doInativo)).toEqual(["inativo"]);

    await comoSuperuser(c);
    const ev = await c.query(
      `SELECT payload->>'motivo' AS motivo FROM public.lead_eventos
        WHERE lead_id = $1 AND tipo = 'cadencia_etapa'`,
      [doInativo],
    );
    expect(ev.rows.map((x) => x.motivo)).toEqual(["corretor_inativo"]);
  });

  it("em sombra registra o que faria e não move nada", async () => {
    const id = await criarLead(c, { corretorId: saiu.id, status: "aguardando_atendimento" });
    await desativar(saiu);
    await comoSuperuser(c);
    const r = await c.query(`SELECT * FROM public.cadencia_devolver_inativos('sombra')`);
    expect(r.rows[0]).toMatchObject({ avaliados: 1, aplicados: 0 });
    expect((await lead(id)).corretor_id).toBe(saiu.id);
  });

  it("corretor não roda a devolução", async () => {
    await comoUsuario(c, ativo.id);
    const code = await errCode(c.query(`SELECT * FROM public.cadencia_devolver_inativos('ativo')`));
    await comoSuperuser(c);
    expect(code).toBe("42501");
  });
});

describe("motor de vencidos", () => {
  it("limpa o inativo antes de cobrar prazo — e não registra falha de quem saiu", async () => {
    // Prazo vencido: sem a limpeza, cairia na cobrança como `vencidos`.
    const vencido = await criarLead(c, { corretorId: saiu.id, status: "aguardando_atendimento" });
    // Prazo em dia: só a limpeza o alcança.
    const emDia = await criarLead(c, { corretorId: saiu.id, status: "aguardando_atendimento" });
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads SET cadencia_prazo_ts = now() - interval '3 days' WHERE id = $1`,
      [vencido],
    );
    await desativar(saiu);

    await c.query(`SELECT * FROM public.cadencia_vencidos('ativo')`);

    expect((await lead(vencido)).corretor_id).toBeNull();
    expect((await lead(emDia)).corretor_id).toBeNull();
    expect(await jobsDoLead(vencido)).toEqual(["inativo"]);
    expect(await jobsDoLead(emDia)).toEqual(["inativo"]);
  });
});
