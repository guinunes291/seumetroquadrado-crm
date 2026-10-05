/**
 * REGRA DOS 65 — Fatia 2: a troca, a escolha, o retorno e o contador
 * (migration 20261010120500, desenho em docs/ops/em-atendimento-teto-65.md).
 *
 * Decisões do dono (03/10/2026) que esta suíte trava:
 *
 *  1. A TROCA É OBRIGATÓRIA JÁ: com o teto cheio, o corretor só põe mais um
 *     lead em Em atendimento liberando outro no mesmo passo. Vale para o
 *     próprio corretor dono; gestão e serviço seguem livres.
 *  2. A troca é uma transação: ou sai um e entra outro, ou nada muda.
 *  3. "Pediu retorno" e "Esfriou" vão para Aguardando retorno com data até 30
 *     dias; além disso, perda `retorno_futuro` (seca, reciclável). Lead
 *     próprio nunca perde: fica com a data longa.
 *  4. A ESCOLHA põe o lead na frente da disputa, mas não protege do relógio.
 *  5. O contador X/65 conta o mesmo que a trava.
 *
 * O teto do teste é 3 (capacidade_leads_ativos_por_corretor), para não criar
 * 65 leads por caso; a regra lê o teto da mesma chave.
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
  // Um teste que falha dentro de BEGIN deixaria a conexão abortada e o teto
  // em 3 para as suítes seguintes.
  await c.query(`ROLLBACK`).catch(() => undefined);
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

type Opts = {
  status?: string;
  origem?: string;
  dono?: UsuarioTeste;
  /** Horas desde o último contato real (o relógio da regra). */
  horasSemToque?: number;
  temperatura?: string | null;
};

/** Lead fora da cadência, com o relógio de contato controlado. */
async function lead(opts: Opts = {}): Promise<string> {
  const id = await criarLead(c, {
    corretorId: (opts.dono ?? ana).id,
    status: opts.status ?? "em_atendimento",
    origem: opts.origem ?? "outro",
  });
  await comoSuperuser(c);
  const horas = opts.horasSemToque ?? 1;
  await c.query(
    `UPDATE public.leads
        SET cadencia_etapa   = NULL,
            ultimo_contato   = now() - make_interval(hours => $2::int),
            ultima_interacao = now(),
            temperatura      = $3::public.lead_temperatura,
            created_at       = now() - make_interval(hours => $2::int)
      WHERE id = $1`,
    [id, horas, opts.temperatura ?? null],
  );
  return id;
}

async function lotar(dono = ana): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < TETO; i++) ids.push(await lead({ dono }));
  return ids;
}

/** Entrada em Em atendimento pela porta única, como a tela faz. */
async function entrar(como: UsuarioTeste, leadId: string) {
  await comoUsuario(c, como.id);
  try {
    await c.query(
      `SELECT public.transicionar_lead($1, 'em_atendimento'::public.lead_status,
                                       NULL, 'Dar sequência ao atendimento', now() + interval '1 day')`,
      [leadId],
    );
  } finally {
    await comoSuperuser(c);
  }
}

async function comoServico<T>(fn: () => Promise<T>): Promise<T> {
  await c.query(`RESET ROLE`);
  await c.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ role: "service_role" }),
  ]);
  await c.query(`SET ROLE service_role`);
  try {
    return await fn();
  } finally {
    await comoSuperuser(c);
  }
}

async function rpc<T = Record<string, unknown>>(
  como: UsuarioTeste,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  await comoUsuario(c, como.id);
  try {
    const r = await c.query(sql, params);
    return r.rows[0]?.r as T;
  } finally {
    await comoSuperuser(c);
  }
}

async function estado(id: string) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT status::text AS status, corretor_id, proximo_followup, temperatura::text AS temperatura,
            motivo_perda_categoria, motivo_perdido
       FROM public.leads WHERE id = $1`,
    [id],
  );
  return r.rows[0];
}

const futuro = (dias: number) => new Date(Date.now() + dias * DIA).toISOString();

// ---------------------------------------------------------------------------
// 1. A trava da troca
// ---------------------------------------------------------------------------

describe("entra um, sai um", () => {
  it("com o teto cheio, o corretor não põe mais um; com vaga, põe", async () => {
    const [primeiro] = await lotar();
    const novo = await lead({ status: "aguardando_atendimento" });

    expect(await errCode(entrar(ana, novo))).toBe("EA065");
    expect((await estado(novo)).status).toBe("aguardando_atendimento");

    // Um desfecho libera a vaga; aí a entrada passa.
    await rpc(ana, `SELECT public.registrar_retorno_lead($1, 'pediu_retorno', $2) AS r`, [
      primeiro,
      futuro(5),
    ]);
    await entrar(ana, novo);
    expect((await estado(novo)).status).toBe("em_atendimento");
  });

  it("o erro diz quantos e o que fazer", async () => {
    await lotar();
    const novo = await lead({ status: "aguardando_atendimento" });
    await comoUsuario(c, ana.id);
    const msg = await c
      .query(
        `SELECT public.transicionar_lead($1, 'em_atendimento'::public.lead_status, NULL, 'Ligar', now() + interval '1 day')`,
        [novo],
      )
      .then(
        () => "",
        (e: Error & { detail?: string }) => `${e.message} | ${e.detail}`,
      );
    await comoSuperuser(c);
    expect(msg).toContain(`${TETO} de ${TETO}`);
    expect(msg).toContain("entra um, sai um");
    expect(msg).toContain(`"teto": ${TETO}`);
  });

  it("gestão e serviço seguem livres (cadência, webhook, ajuste da gestão)", async () => {
    await lotar();
    const peloGestor = await lead({ status: "aguardando_atendimento" });
    const peloServico = await lead({ status: "aguardando_atendimento" });

    await entrar(admin, peloGestor);
    await comoServico(() =>
      c.query(
        `SELECT public.transicionar_lead($1, 'em_atendimento'::public.lead_status, NULL, 'Cliente respondeu', NULL)`,
        [peloServico],
      ),
    );
    expect((await estado(peloGestor)).status).toBe("em_atendimento");
    expect((await estado(peloServico)).status).toBe("em_atendimento");
  });

  it("quem age na carteira de outro (SDR agendando) não bate na trava do dono", async () => {
    const sdr = await criarUsuario(c, { nome: "Sara SDR", papel: "sdr" });
    await lotar();
    const novo = await lead({ status: "aguardando_atendimento" });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET sdr_id = $2 WHERE id = $1`, [novo, sdr.id]);
    await entrar(sdr, novo);
    expect((await estado(novo)).status).toBe("em_atendimento");
  });

  it("conta sem papel de corretor não tem teto", async () => {
    const sdr = await criarUsuario(c, { nome: "Sara SDR", papel: "sdr" });
    for (let i = 0; i < TETO; i++) await lead({ dono: sdr });
    const novo = await lead({ dono: sdr, status: "aguardando_atendimento" });
    await entrar(sdr, novo);
    expect((await estado(novo)).status).toBe("em_atendimento");
  });

  it("lixeira e arquivado não ocupam vaga", async () => {
    const [a, b] = await lotar();
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET na_lixeira = true WHERE id = $1`, [a]);
    await c.query(`UPDATE public.leads SET arquivado_em = now() WHERE id = $1`, [b]);
    const novo = await lead({ status: "aguardando_atendimento" });
    await entrar(ana, novo);
    expect((await estado(novo)).status).toBe("em_atendimento");
  });

  it("duas entradas ao mesmo tempo com uma vaga: só uma passa", async () => {
    for (let i = 0; i < TETO - 1; i++) await lead();
    const x = await lead({ status: "aguardando_atendimento" });
    const y = await lead({ status: "aguardando_atendimento" });

    const c2 = novoClient();
    await c2.connect();
    try {
      await comoUsuario(c, ana.id);
      await c.query(`BEGIN`);
      await c.query(
        `SELECT public.transicionar_lead($1, 'em_atendimento'::public.lead_status, NULL, 'Ligar', now() + interval '1 day')`,
        [x],
      );
      await comoUsuario(c2, ana.id);
      const segunda = c2
        .query(
          `SELECT public.transicionar_lead($1, 'em_atendimento'::public.lead_status, NULL, 'Ligar', now() + interval '1 day')`,
          [y],
        )
        .then(
          () => null,
          (e: { code?: string }) => e.code ?? "erro",
        );
      await new Promise((ok) => setTimeout(ok, 200));
      await c.query(`COMMIT`);
      expect(await segunda).toBe("EA065");
    } finally {
      await comoSuperuser(c);
      await c2.end();
    }
    expect((await estado(x)).status).toBe("em_atendimento");
    expect((await estado(y)).status).toBe("aguardando_atendimento");
  });
});

// ---------------------------------------------------------------------------
// 2. A troca
// ---------------------------------------------------------------------------

describe("a troca é uma transação", () => {
  it("sai com retorno marcado, entra o novo, a ocupação continua no teto", async () => {
    const [sai] = await lotar();
    const entra = await lead({ status: "aguardando_atendimento" });

    const r = await rpc(
      ana,
      `SELECT public.trocar_vaga_em_atendimento($1, $2, 'pediu_retorno', $3) AS r`,
      [entra, sai, futuro(7)],
    );
    expect(r).toMatchObject({ ok: true, desfecho: "pediu_retorno" });

    const s = await estado(sai);
    expect(s.status).toBe("aguardando_retorno");
    expect(Math.abs(new Date(s.proximo_followup).getTime() - Date.now() - 7 * DIA)).toBeLessThan(
      60_000,
    );
    expect((await estado(entra)).status).toBe("em_atendimento");

    const cont = await rpc<{ em_atendimento: number }>(
      ana,
      `SELECT public.em_atendimento_contador_v1() AS r`,
    );
    expect(cont.em_atendimento).toBe(TETO);

    await comoSuperuser(c);
    const ev = await c.query(
      `SELECT lead_id, payload ->> 'papel' AS papel FROM public.lead_eventos
        WHERE tipo = 'troca_em_atendimento' ORDER BY papel`,
    );
    expect(ev.rows).toEqual([
      { lead_id: entra, papel: "entra" },
      { lead_id: sai, papel: "sai" },
    ]);
  });

  it("troca que falha não muda nada", async () => {
    const [sai] = await lotar();
    const entra = await lead({ status: "aguardando_atendimento" });
    // Data no passado: o desfecho falha, e a entrada não pode ter acontecido.
    expect(
      await errCode(
        rpc(ana, `SELECT public.trocar_vaga_em_atendimento($1, $2, 'pediu_retorno', $3) AS r`, [
          entra,
          sai,
          futuro(-1),
        ]),
      ),
    ).toBe("22023");
    expect((await estado(sai)).status).toBe("em_atendimento");
    expect((await estado(entra)).status).toBe("aguardando_atendimento");
  });

  it("quem sai sem liberar vaga (lixeira) não abre espaço: a troca é recusada", async () => {
    await lotar();
    const naLixeira = await lead();
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET na_lixeira = true WHERE id = $1`, [naLixeira]);
    const entra = await lead({ status: "aguardando_atendimento" });
    expect(
      await errCode(
        rpc(ana, `SELECT public.trocar_vaga_em_atendimento($1, $2, 'esfriou', $3) AS r`, [
          entra,
          naLixeira,
          futuro(3),
        ]),
      ),
    ).toBe("EA065");
    expect((await estado(entra)).status).toBe("aguardando_atendimento");
    expect((await estado(naLixeira)).status).toBe("em_atendimento");
  });

  it("quem sai como perdido leva o motivo; quem entra fica", async () => {
    const [sai] = await lotar();
    const entra = await lead({ status: "aguardando_atendimento" });
    await rpc(
      ana,
      `SELECT public.trocar_vaga_em_atendimento($1, $2, 'perdido', NULL, 'sem_contato', 'não atende há semanas') AS r`,
      [entra, sai],
    );
    const s = await estado(sai);
    expect(s.status).toBe("perdido");
    expect(s.motivo_perda_categoria).toBe("sem_contato");
    expect((await estado(entra)).status).toBe("em_atendimento");
  });

  it("só dentro da própria carteira", async () => {
    const [sai] = await lotar();
    const entra = await lead({ status: "aguardando_atendimento" });
    // Bia não troca na carteira da Ana.
    expect(
      await errCode(
        rpc(bia, `SELECT public.trocar_vaga_em_atendimento($1, $2, 'esfriou', $3) AS r`, [
          entra,
          sai,
          futuro(3),
        ]),
      ),
    ).toBe("42501");
    // Nem leva um lead dela para o lugar de um da Ana.
    const daBia = await lead({ dono: bia, status: "aguardando_atendimento" });
    expect(
      await errCode(
        rpc(ana, `SELECT public.trocar_vaga_em_atendimento($1, $2, 'esfriou', $3) AS r`, [
          daBia,
          sai,
          futuro(3),
        ]),
      ),
    ).toBe("22023");
    expect((await estado(sai)).status).toBe("em_atendimento");
  });
});

// ---------------------------------------------------------------------------
// 3. Pediu retorno, Esfriou e o retorno futuro
// ---------------------------------------------------------------------------

describe("retorno com data", () => {
  it("até 30 dias: Aguardando retorno com a data; esfriou deixa o lead frio", async () => {
    const pediu = await lead({ temperatura: "quente" });
    const esfriou = await lead({ temperatura: "quente" });
    await rpc(ana, `SELECT public.registrar_retorno_lead($1, 'pediu_retorno', $2) AS r`, [
      pediu,
      futuro(30),
    ]);
    const r = await rpc(ana, `SELECT public.registrar_retorno_lead($1, 'esfriou', $2) AS r`, [
      esfriou,
      futuro(10),
    ]);
    expect(r).toMatchObject({ destino: "aguardando_retorno" });
    expect(await estado(pediu)).toMatchObject({
      status: "aguardando_retorno",
      temperatura: "quente",
    });
    expect(await estado(esfriou)).toMatchObject({
      status: "aguardando_retorno",
      temperatura: "frio",
    });
  });

  it("mais de 30 dias: perda retorno futuro, seca, com a data guardada", async () => {
    const id = await lead({ origem: "facebook" });
    const r = await rpc(ana, `SELECT public.registrar_retorno_lead($1, 'pediu_retorno', $2) AS r`, [
      id,
      futuro(45),
    ]);
    expect(r).toMatchObject({ destino: "perdido", categoria: "retorno_futuro" });
    const s = await estado(id);
    expect(s.status).toBe("perdido");
    expect(s.motivo_perda_categoria).toBe("retorno_futuro");
    // Seca: sem a redistribuição do "Marcar como perdido".
    expect(s.corretor_id).toBe(ana.id);
    await comoSuperuser(c);
    const ev = await c.query(
      `SELECT payload ->> 'retorno_em' AS em FROM public.lead_eventos
        WHERE lead_id = $1 AND tipo = 'retorno_futuro'`,
      [id],
    );
    expect(ev.rows).toHaveLength(1);
  });

  it("lead próprio nunca perde: fica com a data longa", async () => {
    const id = await lead({ origem: "indicacao" });
    const r = await rpc(ana, `SELECT public.registrar_retorno_lead($1, 'pediu_retorno', $2) AS r`, [
      id,
      futuro(60),
    ]);
    expect(r).toMatchObject({ destino: "aguardando_retorno", proprio: true });
    expect((await estado(id)).status).toBe("aguardando_retorno");
  });

  it("data no passado ou desfecho desconhecido são recusados", async () => {
    const id = await lead();
    expect(
      await errCode(
        rpc(ana, `SELECT public.registrar_retorno_lead($1, 'pediu_retorno', $2) AS r`, [
          id,
          futuro(-2),
        ]),
      ),
    ).toBe("22023");
    expect(
      await errCode(
        rpc(ana, `SELECT public.registrar_retorno_lead($1, 'sumiu', $2) AS r`, [id, futuro(2)]),
      ),
    ).toBe("22023");
  });
});

// ---------------------------------------------------------------------------
// 4. A escolha dos 65
// ---------------------------------------------------------------------------

type Linha = { lead_id: string; acao: string; posicao: number | null; escolhido: boolean };

async function classificar(): Promise<Map<string, Linha>> {
  await comoUsuario(c, ana.id);
  const r = await c.query(
    `SELECT * FROM public.em_atendimento_sombra_leads_v2(NULL, 'em_atendimento')`,
  );
  await comoSuperuser(c);
  return new Map((r.rows as Linha[]).map((l) => [l.lead_id, l]));
}

const escolher = (id: string, sim = true, como = ana) =>
  rpc<{ ok: boolean; motivo?: string; escolhidos: number }>(
    como,
    `SELECT public.escolher_em_atendimento($1, $2) AS r`,
    [id, sim],
  );

describe("a escolha dos 65", () => {
  it("o escolhido vai para a frente da disputa", async () => {
    // Quatro disputando três vagas. O pior pelo critério (frio, toque mais
    // antigo) é o escolhido — sem a escolha, ele seria o excedente.
    const quentes = [
      await lead({ temperatura: "quente", horasSemToque: 1 }),
      await lead({ temperatura: "quente", horasSemToque: 2 }),
      await lead({ temperatura: "quente", horasSemToque: 3 }),
    ];
    const frio = await lead({ temperatura: "frio", horasSemToque: 90 });

    const antes = await classificar();
    expect(antes.get(frio)?.acao).toBe("excedente");

    expect(await escolher(frio)).toMatchObject({ ok: true, escolhidos: 1 });
    const depois = await classificar();
    expect(depois.get(frio)).toMatchObject({ acao: "fica", posicao: 1, escolhido: true });
    expect(quentes.filter((q) => depois.get(q)?.acao === "excedente")).toHaveLength(1);
  });

  it("a escolha não protege do relógio de 5 dias", async () => {
    const parado = await lead({ horasSemToque: 6 * 24 });
    await escolher(parado);
    expect((await classificar()).get(parado)).toMatchObject({
      acao: "perde_vaga",
      escolhido: true,
    });
  });

  it("no máximo o teto de escolhidos; desmarcar libera", async () => {
    const ids: string[] = [];
    for (let i = 0; i < TETO + 1; i++) ids.push(await lead());
    for (const id of ids.slice(0, TETO)) await escolher(id);
    expect(await escolher(ids[TETO])).toMatchObject({ ok: false, motivo: "limite" });
    await escolher(ids[0], false);
    expect(await escolher(ids[TETO])).toMatchObject({ ok: true, escolhidos: TETO });
  });

  it("só o dono escolhe, e só lead em Em atendimento", async () => {
    const id = await lead();
    expect(await errCode(escolher(id, true, bia))).toBe("42501");
    const naBase = await lead({ status: "aguardando_atendimento" });
    expect(await errCode(escolher(naBase))).toBe("22023");
  });

  it("a escolha perde o efeito quando o lead sai de Em atendimento", async () => {
    const ids: string[] = [];
    for (let i = 0; i < TETO; i++) ids.push(await lead());
    for (const id of ids) await escolher(id);
    await rpc(ana, `SELECT public.registrar_retorno_lead($1, 'pediu_retorno', $2) AS r`, [
      ids[0],
      futuro(3),
    ]);
    const cont = await rpc<{ escolhidos: number }>(
      ana,
      `SELECT public.em_atendimento_contador_v1() AS r`,
    );
    expect(cont.escolhidos).toBe(TETO - 1);
    // A vaga de escolha voltou: dá para escolher outro.
    const outro = await lead();
    expect(await escolher(outro)).toMatchObject({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// 5. O contador
// ---------------------------------------------------------------------------

describe("o contador X/65", () => {
  it("em atendimento, teto, lotado e Minha base", async () => {
    await lotar();
    await lead({ status: "aguardando_atendimento" });
    await lead({ status: "aguardando_retorno" });
    await lead({ status: "agendado" }); // fundo: fora dos dois números
    const r = await rpc(ana, `SELECT public.em_atendimento_contador_v1() AS r`);
    expect(r).toMatchObject({
      corretor_id: ana.id,
      corretor: true,
      em_atendimento: TETO,
      teto: TETO,
      lotado: true,
      minha_base: 2,
      retorno_max_dias: 30,
    });
  });

  it("corretor vê só a si", async () => {
    expect(
      await errCode(rpc(bia, `SELECT public.em_atendimento_contador_v1($1) AS r`, [ana.id])),
    ).toBe("42501");
    const r = await rpc(admin, `SELECT public.em_atendimento_contador_v1($1) AS r`, [ana.id]);
    expect(r).toMatchObject({ corretor_id: ana.id });
  });
});

// ---------------------------------------------------------------------------
// 6. Acesso
// ---------------------------------------------------------------------------

describe("acesso", () => {
  it("RPCs para quem está logado; peças internas e a tabela, para ninguém", async () => {
    await comoSuperuser(c);
    const r = await c.query(`
      SELECT
        has_function_privilege('anon', 'public.trocar_vaga_em_atendimento(uuid,uuid,text,timestamptz,text,text,text,timestamptz,text)', 'EXECUTE') AS anon_troca,
        has_function_privilege('authenticated', 'public.trocar_vaga_em_atendimento(uuid,uuid,text,timestamptz,text,text,text,timestamptz,text)', 'EXECUTE') AS auth_troca,
        has_function_privilege('authenticated', 'public.escolher_em_atendimento(uuid,boolean)', 'EXECUTE') AS auth_escolha,
        has_function_privilege('authenticated', 'public.registrar_retorno_lead(uuid,text,timestamptz,text)', 'EXECUTE') AS auth_retorno,
        has_function_privilege('authenticated', 'public.em_atendimento_contador_v1(uuid)', 'EXECUTE') AS auth_contador,
        has_function_privilege('authenticated', 'public.em_atendimento_ocupacao(uuid)', 'EXECUTE') AS auth_ocupacao,
        has_table_privilege('authenticated', 'public.em_atendimento_escolhas', 'SELECT') AS auth_tabela
    `);
    expect(r.rows[0]).toEqual({
      anon_troca: false,
      auth_troca: true,
      auth_escolha: true,
      auth_retorno: true,
      auth_contador: true,
      auth_ocupacao: false,
      auth_tabela: false,
    });
  });
});
