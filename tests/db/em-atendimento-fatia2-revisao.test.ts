/**
 * REGRA DOS 65, Fatia 2 — o que a revisão adversarial encontrou
 * (migration 20261010120600; achados em docs/ops/em-atendimento-teto-65.md §7.5).
 *
 *  1. "Pediu retorno"/"Esfriou" criam a TAREFA do retorno: a data sobrevive a
 *     qualquer mexida em outras tarefas (proximo_followup é espelho delas).
 *  2. Quem entra pela troca ganha o próximo passo (como a entrada normal).
 *  3. A troca exige carteira: dois leads sem dono não são "a mesma".
 *  4. A escolha dos 65 é do dono atual; some quando o lead sai de Em
 *     atendimento ou troca de dono; lead arquivado não conta.
 *  5. A cadência ("cliente respondeu") passa pela mesma trava.
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

let admin: UsuarioTeste;
let ana: UsuarioTeste;
let bia: UsuarioTeste;
let tetoAntes: unknown;

const TETO = 3;
const DIA = 24 * 60 * 60 * 1000;
const futuro = (dias: number) => new Date(Date.now() + dias * DIA).toISOString();

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await comoSuperuser(c);
  tetoAntes = (
    await c.query(
      `SELECT valor FROM public.gestao_config WHERE chave = 'capacidade_leads_ativos_por_corretor'`,
    )
  ).rows[0]?.valor;
  await c.query(
    `UPDATE public.gestao_config SET valor = $1::jsonb
      WHERE chave = 'capacidade_leads_ativos_por_corretor'`,
    [JSON.stringify(TETO)],
  );
});

afterAll(async () => {
  await comoSuperuser(c);
  if (tetoAntes !== undefined) {
    await c.query(
      `UPDATE public.gestao_config SET valor = $1::jsonb
        WHERE chave = 'capacidade_leads_ativos_por_corretor'`,
      [JSON.stringify(tetoAntes)],
    );
  }
  await limparDados(c);
  await c.end();
});

beforeEach(async () => {
  await limparDados(c);
  admin = await criarUsuario(c, { nome: "Admin 65", papel: "admin" });
  ana = await criarUsuario(c, { nome: "Ana Corretora", papel: "corretor" });
  bia = await criarUsuario(c, { nome: "Bia Corretora", papel: "corretor" });
});

async function lead(opts: { status?: string; dono?: UsuarioTeste; emCadencia?: boolean } = {}) {
  const id = await criarLead(c, {
    corretorId: (opts.dono ?? ana).id,
    status: opts.status ?? "em_atendimento",
    origem: "outro",
  });
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.leads
        SET cadencia_etapa = CASE WHEN $2 THEN 'D1' ELSE NULL END,
            ultimo_contato = now() - interval '1 hour',
            ultima_interacao = now()
      WHERE id = $1`,
    [id, opts.emCadencia ?? false],
  );
  return id;
}

async function lotar(dono = ana) {
  const ids: string[] = [];
  for (let i = 0; i < TETO; i++) ids.push(await lead({ dono }));
  return ids;
}

async function rpc<T = Record<string, unknown>>(
  como: UsuarioTeste,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  await comoUsuario(c, como.id);
  try {
    return (await c.query(sql, params)).rows[0]?.r as T;
  } finally {
    await comoSuperuser(c);
  }
}

async function estado(id: string) {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT status::text AS status, corretor_id, proximo_followup, cadencia_etapa
         FROM public.leads WHERE id = $1`,
      [id],
    )
  ).rows[0];
}

async function tarefasAbertas(id: string) {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT titulo, data_vencimento FROM public.tarefas
        WHERE lead_id = $1 AND status IN ('pendente', 'em_andamento') AND deleted_at IS NULL
        ORDER BY data_vencimento`,
      [id],
    )
  ).rows;
}

const escolher = (id: string, como = ana, sim = true) =>
  rpc<{ ok: boolean; escolhidos: number }>(
    como,
    `SELECT public.escolher_em_atendimento($1, $2) AS r`,
    [id, sim],
  );

async function escolhidos(como = ana) {
  return (
    await rpc<{ escolhidos: number }>(como, `SELECT public.em_atendimento_contador_v1() AS r`)
  ).escolhidos;
}

// ---------------------------------------------------------------------------
// 1. O retorno vira tarefa
// ---------------------------------------------------------------------------

describe("retorno com tarefa", () => {
  it("cria a tarefa do retorno; concluir outra tarefa não apaga a data combinada", async () => {
    const id = await lead();
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.tarefas (lead_id, corretor_id, titulo, tipo, status, prioridade, data_vencimento)
       VALUES ($1, $2, 'Ligar para o cliente', 'ligacao', 'pendente', 'alta', now() + interval '2 hours')`,
      [id, ana.id],
    );

    await rpc(ana, `SELECT public.registrar_retorno_lead($1, 'pediu_retorno', $2, 'viaja') AS r`, [
      id,
      futuro(20),
    ]);
    const abertas = await tarefasAbertas(id);
    expect(abertas.map((t) => t.titulo)).toEqual([
      "Ligar para o cliente",
      "Retornar como combinado",
    ]);

    // A mexida em tarefas que, antes, apagava a data: concluir a antiga.
    await c.query(
      `UPDATE public.tarefas SET status = 'concluida' WHERE lead_id = $1 AND titulo = 'Ligar para o cliente'`,
      [id],
    );
    const s = await estado(id);
    expect(s.status).toBe("aguardando_retorno");
    expect(Math.abs(new Date(s.proximo_followup).getTime() - Date.now() - 20 * DIA)).toBeLessThan(
      60_000,
    );
    // E o classificador continua protegendo o retorno até a data.
    await comoUsuario(c, ana.id);
    const r = await c.query(
      `SELECT acao FROM public.em_atendimento_sombra_leads_v2(NULL, NULL) WHERE lead_id = $1`,
      [id],
    );
    await comoSuperuser(c);
    expect(r.rows[0].acao).toBe("retorno_protegido");
  });

  it("esfriou cria a tarefa de retomar", async () => {
    const id = await lead();
    await rpc(ana, `SELECT public.registrar_retorno_lead($1, 'esfriou', $2) AS r`, [id, futuro(7)]);
    expect((await tarefasAbertas(id)).map((t) => t.titulo)).toEqual([
      "Retomar o contato (esfriou)",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 2 e 3. A troca
// ---------------------------------------------------------------------------

describe("a troca", () => {
  it("quem entra ganha o próximo passo em 1 dia, como a entrada normal", async () => {
    const [sai] = await lotar();
    const entra = await lead({ status: "aguardando_atendimento" });
    await rpc(ana, `SELECT public.trocar_vaga_em_atendimento($1, $2, 'pediu_retorno', $3) AS r`, [
      entra,
      sai,
      futuro(5),
    ]);
    const s = await estado(entra);
    expect(s.status).toBe("em_atendimento");
    expect(Math.abs(new Date(s.proximo_followup).getTime() - Date.now() - DIA)).toBeLessThan(
      60_000,
    );
    expect((await tarefasAbertas(entra)).map((t) => t.titulo)).toEqual([
      "Dar sequência ao atendimento",
    ]);
    // Quem sai levou a tarefa do retorno.
    expect((await tarefasAbertas(sai)).map((t) => t.titulo)).toEqual(["Retornar como combinado"]);
  });

  it("devolve o que aconteceu com quem saiu", async () => {
    const [sai] = await lotar();
    const entra = await lead({ status: "aguardando_atendimento" });
    const r = await rpc<{ saida: { destino: string; categoria?: string } }>(
      ana,
      `SELECT public.trocar_vaga_em_atendimento($1, $2, 'pediu_retorno', $3) AS r`,
      [entra, sai, futuro(45)],
    );
    expect(r.saida).toMatchObject({ destino: "perdido", categoria: "retorno_futuro" });
  });

  it("dois leads sem dono não são a mesma carteira", async () => {
    // Desde a Fatia 3a lead sem corretor não fica em Em atendimento (gatilho):
    // o "sai" sem dono nem chega a existir nesse status, e a troca é recusada
    // de qualquer jeito — pela carteira ou pelo status de quem sai.
    const x = await criarLead(c, { status: "em_atendimento" });
    const y = await criarLead(c, { status: "aguardando_atendimento" });
    expect((await estado(x)).status).toBe("aguardando_atendimento");
    expect(
      await errCode(
        rpc(admin, `SELECT public.trocar_vaga_em_atendimento($1, $2, 'esfriou', $3) AS r`, [
          y,
          x,
          futuro(3),
        ]),
      ),
    ).toBe("22023");
    expect((await estado(x)).status).toBe("aguardando_atendimento");
    expect((await estado(y)).status).toBe("aguardando_atendimento");
  });
});

// ---------------------------------------------------------------------------
// 4. A escolha
// ---------------------------------------------------------------------------

describe("a escolha dos 65", () => {
  it("é do dono atual: a escolha da Ana não engole a da Bia depois da transferência", async () => {
    const id = await lead();
    expect(await escolher(id)).toMatchObject({ ok: true, escolhidos: 1 });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET corretor_id = $2 WHERE id = $1`, [id, bia.id]);
    // A transferência já apaga a escolha antiga (gatilho)...
    expect(await escolhidos(ana)).toBe(0);
    // ...mesmo com uma sobra da Ana gravada por fora (estado que a migration
    // anterior deixava), a Bia consegue escolher de verdade: a RPC troca a
    // linha de dono em vez de engolir o INSERT.
    await c.query(
      `INSERT INTO public.em_atendimento_escolhas (lead_id, corretor_id) VALUES ($1, $2)`,
      [id, ana.id],
    );
    expect(await escolher(id, bia)).toMatchObject({ ok: true, escolhidos: 1 });
    await comoSuperuser(c);
    expect(
      (
        await c.query(`SELECT corretor_id FROM public.em_atendimento_escolhas WHERE lead_id = $1`, [
          id,
        ])
      ).rows,
    ).toEqual([{ corretor_id: bia.id }]);
    await comoUsuario(c, bia.id);
    const r = await c.query(
      `SELECT escolhido FROM public.em_atendimento_sombra_leads_v2(NULL, 'em_atendimento') WHERE lead_id = $1`,
      [id],
    );
    await comoSuperuser(c);
    expect(r.rows[0].escolhido).toBe(true);
  });

  it("some quando o lead sai de Em atendimento e não revive quando ele volta", async () => {
    const id = await lead();
    await escolher(id);
    await rpc(ana, `SELECT public.registrar_retorno_lead($1, 'pediu_retorno', $2) AS r`, [
      id,
      futuro(3),
    ]);
    await comoSuperuser(c);
    expect(
      (await c.query(`SELECT 1 FROM public.em_atendimento_escolhas WHERE lead_id = $1`, [id])).rows,
    ).toHaveLength(0);
    // Volta por serviço (o cliente respondeu): não entra escolhido.
    await c.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
      JSON.stringify({ role: "service_role" }),
    ]);
    await c.query(`SET ROLE service_role`);
    await c.query(
      `SELECT public.transicionar_lead($1, 'em_atendimento'::public.lead_status, NULL, 'Cliente respondeu', NULL)`,
      [id],
    );
    await comoSuperuser(c);
    expect(await escolhidos()).toBe(0);
  });

  it("lead arquivado não conta como escolhido nem ocupa vaga de escolha", async () => {
    const vivo = await lead();
    // Escolhas "sobrando" de leads arquivados, gravadas por fora do gatilho
    // (como as que a migration anterior deixou): não podem contar.
    await comoSuperuser(c);
    for (let i = 0; i < TETO; i++) {
      const a = await lead();
      await c.query(`UPDATE public.leads SET arquivado_em = now() WHERE id = $1`, [a]);
      await c.query(
        `INSERT INTO public.em_atendimento_escolhas (lead_id, corretor_id) VALUES ($1, $2)`,
        [a, ana.id],
      );
    }
    expect(await escolhidos()).toBe(0);
    expect(await escolher(vivo)).toMatchObject({ ok: true, escolhidos: 1 });
    // E a RPC limpou as sobras.
    expect(
      (await c.query(`SELECT count(*)::int AS n FROM public.em_atendimento_escolhas`)).rows[0].n,
    ).toBe(1);
    // Arquivar o escolhido apaga a escolha na hora (gatilho).
    await c.query(`UPDATE public.leads SET arquivado_em = now() WHERE id = $1`, [vivo]);
    expect(
      (await c.query(`SELECT count(*)::int AS n FROM public.em_atendimento_escolhas`)).rows[0].n,
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. A cadência passa pela trava
// ---------------------------------------------------------------------------

describe("cadência: cliente respondeu", () => {
  it("corretor lotado recebe EA065 e nada muda; com vaga, entra com o passo", async () => {
    await lotar();
    const naCadencia = await lead({ status: "aguardando_atendimento", emCadencia: true });
    expect(
      await errCode(
        rpc(ana, `SELECT public.cadencia_marcar_respondeu($1, 'Ligar quinta 18h', $2) AS r`, [
          naCadencia,
          futuro(2),
        ]),
      ),
    ).toBe("EA065");
    const s = await estado(naCadencia);
    expect(s.status).toBe("aguardando_atendimento");
    expect(s.cadencia_etapa).toBe("D1");
    expect(await tarefasAbertas(naCadencia)).toHaveLength(0);

    // Liberou uma vaga: a mesma resposta entra.
    await comoSuperuser(c);
    const [um] = (
      await c.query(
        `SELECT id FROM public.leads WHERE corretor_id = $1 AND status = 'em_atendimento' LIMIT 1`,
        [ana.id],
      )
    ).rows;
    await rpc(ana, `SELECT public.registrar_retorno_lead($1, 'esfriou', $2) AS r`, [
      um.id,
      futuro(5),
    ]);
    const r = await rpc(
      ana,
      `SELECT public.cadencia_marcar_respondeu($1, 'Ligar quinta 18h', $2) AS r`,
      [naCadencia, futuro(2)],
    );
    expect(r).toMatchObject({ ok: true });
    expect((await estado(naCadencia)).status).toBe("em_atendimento");
  });

  it("a trava de transicionar_lead e a da cadência são a mesma função", async () => {
    await comoSuperuser(c);
    // Só uma função levanta EA065; as duas portas chamam essa função.
    const levanta = await c.query(`
      SELECT p.proname FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prosrc LIKE '%ERRCODE = ''EA065''%' ORDER BY 1`);
    expect(levanta.rows.map((x) => x.proname)).toEqual(["_em_atendimento_travar"]);
    const chamam = await c.query(`
      SELECT p.proname FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('transicionar_lead', 'cadencia_marcar_respondeu')
         AND p.prosrc LIKE '%public.\\_em\\_atendimento\\_travar(%' ORDER BY 1`);
    expect(chamam.rows.map((x) => x.proname)).toEqual([
      "cadencia_marcar_respondeu",
      "transicionar_lead",
    ]);
    // E ninguém de fora chama a trava direto.
    expect(
      (
        await c.query(
          `SELECT has_function_privilege('authenticated',
             'public._em_atendimento_travar(uuid, public.lead_status, uuid, uuid, boolean, timestamptz, text, text)', 'EXECUTE') AS r`,
        )
      ).rows[0].r,
    ).toBe(false);
  });
});
