/**
 * Roleta Marquinhos automática — os 6 corretores com mais vendas em 30 dias
 * (migration 20261024120000, drizzle 0088).
 *
 * Decisões do dono (13/10/2026): o time da Marquinhos é automático; conta a
 * QUANTIDADE de vendas assinadas (pendente ou aprovada, sem distrato) nos
 * últimos 30 dias; empate pelo valor vendido; quem a gestão bloqueia não
 * volta pela regra; o "Inapto" de antes vira bloqueio.
 *
 * O que se prova aqui:
 *   1. a régua: janela (hoje-29 entra, hoje-30 não), status, distrato,
 *      desempate por valor e pela venda mais recente, só corretor ativo;
 *   2. o time: os 6 do topo entram, o resto sai; 4 vendedores → 4; nenhum →
 *      roleta vazia, alerta, e o lead do bot vai para a filial;
 *   3. bloqueio manual vence a regra e o 7º entra na hora; "devolver à
 *      regra" desfaz; remoção ANTERIOR à regra não bloqueia; pausa fica;
 *   4. rodar de novo não muda nada; as ações da regra vão sem autor;
 *   5. quem pode o quê (RPCs e o placar) e o cron.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarLead,
  criarUsuario,
  darRegiao,
  errCode,
  limparDados,
  marcarEfetivacao,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();
const settingsAntes = new Map<string, unknown>();

let admin: UsuarioTeste;
let gestor: UsuarioTeste;
const vend: UsuarioTeste[] = []; // v0..v7

let tel = 0;
const novoTelefone = () => `1195${String(7000000 + ++tel).slice(-7)}`;

async function setSetting(chave: string, valor: unknown) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.distribuicao_settings (chave, valor) VALUES ($1, $2::jsonb)
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
    [chave, JSON.stringify(valor)],
  );
}

/** Venda de `diasAtras` dias (BRT), com valor e status. */
async function venda(
  u: UsuarioTeste,
  diasAtras: number,
  o: { valor?: number; status?: string; distrato?: boolean } = {},
) {
  await comoSuperuser(c);
  // Aprovada só pelo caminho real (aprovar_venda, com os 3 marcos de
  // efetivação); rejeitada/cancelada exigem o motivo (CHECK de vendas).
  const status = o.status ?? "pendente";
  // Uma venda ativa por lead: cada venda com o próprio lead do corretor.
  const lead = await criarLead(c, { corretorId: u.id, telefone: novoTelefone() });
  await comoSuperuser(c);
  // Rejeitada/cancelada só existem aqui para provar que NÃO contam: entram
  // sem os gatilhos do fluxo de aprovação (as CHECKs continuam valendo).
  const decidida = status === "rejeitada" || status === "cancelada";
  if (decidida) await c.query(`SET session_replication_role = replica`);
  const r = await c.query(
    `INSERT INTO public.vendas (corretor_id, lead_id, valor_venda, status_venda, data_assinatura,
                                distrato, motivo_decisao)
     VALUES ($1, $6, $2, $3::public.status_venda,
             (now() AT TIME ZONE 'America/Sao_Paulo')::date - $4::int, $5,
             CASE WHEN $3 IN ('rejeitada', 'cancelada') THEN 'teste' END)
     RETURNING id`,
    [
      u.id,
      o.valor ?? 200000,
      status === "aprovada" ? "pendente" : status,
      diasAtras,
      o.distrato ?? false,
      lead,
    ],
  );
  if (decidida) await c.query(`SET session_replication_role = DEFAULT`);
  if (status === "aprovada") {
    const id = r.rows[0].id as string;
    await marcarEfetivacao(c, id);
    await comoUsuario(c, admin.id);
    await c.query(`SELECT public.aprovar_venda($1, 'aprovada'::public.status_venda, NULL)`, [id]);
    await comoSuperuser(c);
  }
}

type Linha = {
  corretor_id: string;
  vendas: number;
  posicao: number | null;
  resultado: string;
  bloqueado: boolean;
};

async function ranking(): Promise<Linha[]> {
  await comoSuperuser(c);
  return (await c.query(`SELECT * FROM public._marquinhos_ranking()`)).rows as Linha[];
}

async function apurar() {
  await comoSuperuser(c);
  return (await c.query(`SELECT public.marquinhos_apurar() AS r`)).rows[0].r as Record<
    string,
    unknown
  >;
}

async function time(): Promise<string[]> {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT rp.corretor_id FROM public.roleta_participantes rp
         JOIN public.roletas r ON r.id = rp.roleta_id
        WHERE r.slug = 'marquinhos' AND rp.ativo
        ORDER BY rp.corretor_id`,
    )
  ).rows.map((r) => r.corretor_id as string);
}

const ids = (us: UsuarioTeste[]) => us.map((u) => u.id).sort();

async function gerenciar(quem: UsuarioTeste, u: UsuarioTeste, acao: string, extra = "") {
  await comoUsuario(c, quem.id);
  try {
    return (
      await c.query(
        `SELECT public.gerenciar_participante_roleta('marquinhos', $1::uuid, $2${extra}) AS r`,
        [u.id, acao],
      )
    ).rows[0].r;
  } finally {
    await comoSuperuser(c);
  }
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await comoSuperuser(c);
  for (const chave of [
    "marquinhos_regra_ativa",
    "marquinhos_top_n",
    "marquinhos_janela_dias",
    "marquinhos_status_venda",
    "marquinhos_regra_desde",
    "zona_estrita",
    "percentual_minimo_trabalhado",
  ]) {
    const r = await c.query(`SELECT valor FROM public.distribuicao_settings WHERE chave = $1`, [
      chave,
    ]);
    settingsAntes.set(chave, r.rows[0]?.valor);
  }
  await setSetting("marquinhos_regra_ativa", true);
  await setSetting("marquinhos_top_n", 6);
  await setSetting("marquinhos_janela_dias", 30);
  await setSetting("marquinhos_status_venda", ["pendente", "aprovada"]);
  await setSetting("zona_estrita", true);
  await setSetting("percentual_minimo_trabalhado", 0);

  admin = await criarUsuario(c, { nome: "Ada Admin", papel: "admin" });
  gestor = await criarUsuario(c, { nome: "Gil Gestor", papel: "gestor" });
  for (let i = 0; i < 8; i++) {
    vend.push(await criarUsuario(c, { nome: `Vendedor ${i}` }));
  }
  await comoSuperuser(c);
  for (const [i, u] of vend.entries()) {
    await c.query(`UPDATE public.profiles SET telefone = $2, ativo = true WHERE id = $1`, [
      u.id,
      `119444400${String(i).padStart(2, "0")}`,
    ]);
  }
});

beforeEach(async () => {
  await comoSuperuser(c);
  // A aprovação gera comissões e ledgers: limpa tudo que pende de vendas.
  await c.query(`TRUNCATE public.vendas CASCADE`);
  await c.query(`DELETE FROM public.marquinhos_apuracoes`);
  await c.query(
    `DELETE FROM public.roleta_participantes_log l USING public.roletas r
      WHERE r.id = l.roleta_id AND r.slug = 'marquinhos'`,
  );
  await c.query(
    `DELETE FROM public.roleta_participantes rp USING public.roletas r
      WHERE r.id = rp.roleta_id AND r.slug = 'marquinhos'`,
  );
  // A regra começa "agora" em cada caso (remoção antes disto não bloqueia).
  await setSetting("marquinhos_regra_desde", new Date(Date.now() - 1000).toISOString());
});

afterAll(async () => {
  await comoSuperuser(c);
  for (const [chave, valor] of settingsAntes) {
    if (valor === undefined) {
      await c.query(`DELETE FROM public.distribuicao_settings WHERE chave = $1`, [chave]);
    } else {
      await c.query(`UPDATE public.distribuicao_settings SET valor = $2::jsonb WHERE chave = $1`, [
        chave,
        JSON.stringify(valor),
      ]);
    }
  }
  await limparDados(c);
  await c.end();
});

describe("a régua", () => {
  it("janela de 30 dias com hoje; só pendente e aprovada; distrato não conta; só corretor ativo", async () => {
    await venda(vend[0], 0);
    await venda(vend[0], 29); // entra
    await venda(vend[0], 30); // fora da janela
    await venda(vend[1], 3, { status: "aprovada" });
    await venda(vend[1], 3, { status: "rascunho" });
    await venda(vend[1], 3, { status: "rejeitada" });
    await venda(vend[1], 3, { status: "cancelada" });
    await venda(vend[2], 3, { distrato: true });
    await venda(vend[3], 3);
    await comoSuperuser(c);
    await c.query(`UPDATE public.profiles SET ativo = false WHERE id = $1`, [vend[3].id]);
    try {
      const r = await ranking();
      const porId = new Map(r.map((x) => [x.corretor_id, x]));
      expect(porId.get(vend[0].id)).toMatchObject({ vendas: 2, posicao: 1, resultado: "dentro" });
      expect(porId.get(vend[1].id)).toMatchObject({ vendas: 1, posicao: 2, resultado: "dentro" });
      expect(porId.get(vend[2].id)).toMatchObject({
        vendas: 0,
        posicao: null,
        resultado: "sem_venda",
      });
      expect(porId.has(vend[3].id)).toBe(false);
    } finally {
      await c.query(`UPDATE public.profiles SET ativo = true WHERE id = $1`, [vend[3].id]);
    }
  });

  it("desempate: mais vendas; depois maior valor; depois a venda mais recente", async () => {
    await venda(vend[0], 1, { valor: 100000 });
    await venda(vend[0], 1, { valor: 100000 });
    await venda(vend[1], 1, { valor: 300000 }); // 1 venda, valor alto
    await venda(vend[2], 1, { valor: 100000 }); // 1 venda, valor baixo, recente
    await venda(vend[3], 9, { valor: 100000 }); // 1 venda, valor baixo, antiga
    const r = (await ranking()).filter((x) => x.posicao !== null);
    expect(r.map((x) => x.corretor_id)).toEqual([vend[0].id, vend[1].id, vend[2].id, vend[3].id]);
  });
});

describe("o time", () => {
  it("8 vendedores: os 6 do topo entram; quem caiu do top sai na apuração seguinte", async () => {
    for (let i = 0; i < 8; i++) {
      for (let k = 0; k < 8 - i; k++) await venda(vend[i], 2);
    }
    const r = await apurar();
    expect(r).toMatchObject({ ok: true, dentro: 6, entraram: 6, sairam: 0 });
    expect(await time()).toEqual(ids(vend.slice(0, 6)));

    // O 8º vende muito: entra; o 6º sai.
    for (let k = 0; k < 10; k++) await venda(vend[7], 1);
    const r2 = await apurar();
    expect(r2).toMatchObject({ entraram: 1, sairam: 1 });
    expect(await time()).toEqual(ids([...vend.slice(0, 5), vend[7]]));

    // Rodar de novo não muda nada.
    expect(await apurar()).toMatchObject({ entraram: 0, sairam: 0 });

    // As ações da regra vão sem autor.
    await comoSuperuser(c);
    const autores = (
      await c.query(
        `SELECT DISTINCT l.feito_por FROM public.roleta_participantes_log l
           JOIN public.roletas r ON r.id = l.roleta_id WHERE r.slug = 'marquinhos'`,
      )
    ).rows;
    expect(autores).toEqual([{ feito_por: null }]);
  });

  it("só 4 com venda: entram 4; ninguém: a roleta esvazia, alerta, e o lead do bot vai para a filial", async () => {
    for (let i = 0; i < 4; i++) await venda(vend[i], 2);
    await apurar();
    expect(await time()).toEqual(ids(vend.slice(0, 4)));

    await comoSuperuser(c);
    await c.query(`TRUNCATE public.vendas CASCADE`);
    const r = await apurar();
    expect(r).toMatchObject({ dentro: 0, sairam: 4 });
    expect(await time()).toEqual([]);
    const alerta = (
      await c.query(
        `SELECT count(*)::int AS n FROM public.alertas
          WHERE titulo = 'Roleta Marquinhos sem ninguém com venda'`,
      )
    ).rows[0].n;
    expect(alerta).toBeGreaterThan(0);

    // O lead do bot (sem zona) vai para uma filial.
    await darRegiao(c, vend[5].id, ["Oeste"]);
    await comoUsuario(c, vend[5].id);
    await c.query(`SELECT public.presenca_checkin('loja', 'barra-funda')`);
    const id = await criarLead(c, { telefone: novoTelefone(), origem: "chatbot" });
    await comoSuperuser(c);
    await c.query(`SELECT public.triar_e_distribuir_lead($1::uuid, 'teste')`, [id]);
    const lead = (
      await c.query(`SELECT corretor_id, roleta_slug FROM public.leads WHERE id = $1`, [id])
    ).rows[0];
    expect(lead).toEqual({ corretor_id: vend[5].id, roleta_slug: "filial-barra-funda" });
  });
});

describe("a gestão e a regra", () => {
  it("bloquear vence a regra e o 7º entra na hora; devolver à regra desfaz", async () => {
    for (let i = 0; i < 7; i++) {
      for (let k = 0; k < 7 - i; k++) await venda(vend[i], 2);
    }
    await apurar();
    expect(await time()).toEqual(ids(vend.slice(0, 6)));

    const bloq = await gerenciar(admin, vend[0], "remover");
    expect(bloq.regra_automatica).toBe(true);
    expect(await time()).toEqual(ids(vend.slice(1, 7)));
    // A apuração do dia seguinte não o traz de volta.
    await apurar();
    expect(await time()).toEqual(ids(vend.slice(1, 7)));
    expect((await ranking()).find((x) => x.corretor_id === vend[0].id)?.resultado).toBe(
      "bloqueado_admin",
    );

    await gerenciar(admin, vend[0], "incluir");
    expect(await time()).toEqual(ids(vend.slice(0, 6)));
  });

  it("remoção ANTES da regra começar não bloqueia; pausa fica (e guarda a vaga)", async () => {
    await venda(vend[0], 2);
    await venda(vend[1], 2);
    await comoSuperuser(c);
    // Removido à mão "ontem", no critério antigo.
    await c.query(
      `INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo)
       SELECT r.id, $1, false FROM public.roletas r WHERE r.slug = 'marquinhos'`,
      [vend[0].id],
    );
    await c.query(
      `INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, feito_por, created_at)
       SELECT r.id, $1, 'removido', $2, now() - interval '1 day' FROM public.roletas r WHERE r.slug = 'marquinhos'`,
      [vend[0].id, admin.id],
    );
    await apurar();
    expect(await time()).toEqual(ids([vend[0], vend[1]]));

    await comoUsuario(c, admin.id);
    await c.query(
      `SELECT public.gerenciar_participante_roleta('marquinhos', $1::uuid, 'pausar', 'férias', NULL, now() + interval '7 days')`,
      [vend[1].id],
    );
    await apurar();
    await comoSuperuser(c);
    const pausa = (
      await c.query(
        `SELECT rp.ativo, rp.pausado_ate IS NOT NULL AS pausado
           FROM public.roleta_participantes rp JOIN public.roletas r ON r.id = rp.roleta_id
          WHERE r.slug = 'marquinhos' AND rp.corretor_id = $1`,
        [vend[1].id],
      )
    ).rows[0];
    expect(pausa).toEqual({ ativo: true, pausado: true });
    // "Reativar" só tira a pausa — não fura a regra para quem está fora.
    await gerenciar(admin, vend[1], "reativar");
    await gerenciar(admin, vend[5], "remover"); // bloqueia quem nem estava
    expect(
      await errCode(
        c.query(`SELECT public.gerenciar_participante_roleta('marquinhos', $1::uuid, 'reativar')`, [
          vend[5].id,
        ]),
      ),
    ).toBeNull();
    expect(await time()).toEqual(ids([vend[0], vend[1]]));
  });

  it("o 'Inapto' de antes (pausa até 2099) foi convertido na virada", async () => {
    await comoSuperuser(c);
    const restantes = (
      await c.query(
        `SELECT count(*)::int AS n FROM public.roleta_participantes rp
           JOIN public.roletas r ON r.id = rp.roleta_id
          WHERE r.slug = 'marquinhos' AND rp.pausado_ate >= '2099-01-01'`,
      )
    ).rows[0].n;
    expect(restantes).toBe(0);
  });
});

describe("quem pode o quê", () => {
  it("apurar: só admin (e o cron); gestor não devolve à regra; corretor vê só a própria linha", async () => {
    await venda(vend[0], 2);
    await venda(vend[1], 2);
    await comoUsuario(c, gestor.id);
    expect(await errCode(c.query(`SELECT public.marquinhos_apurar()`))).toBe("42501");
    await comoUsuario(c, admin.id);
    expect(await errCode(c.query(`SELECT public.marquinhos_apurar()`))).toBeNull();
    await comoUsuario(c, gestor.id);
    const r = (await c.query(`SELECT public.marquinhos_ranking_v1() AS r`)).rows[0].r as {
      corretores: { corretor_id: string }[];
      top_n: number;
    };
    expect(r.top_n).toBe(6);
    expect(r.corretores.length).toBeGreaterThanOrEqual(2);
    await comoUsuario(c, vend[1].id);
    const meu = (await c.query(`SELECT public.marquinhos_ranking_v1() AS r`)).rows[0].r as {
      corretores: { corretor_id: string }[];
    };
    expect(meu.corretores.map((x) => x.corretor_id)).toEqual([vend[1].id]);
    const placar = (await c.query(`SELECT corretor_id FROM public.marquinhos_apuracoes`)).rows;
    expect(placar.map((x) => x.corretor_id)).toEqual([vend[1].id]);
    await comoSuperuser(c);
  });

  it("regra desligada: apurar não mexe e incluir volta a ser manual; o cron está lá", async () => {
    await setSetting("marquinhos_regra_ativa", false);
    try {
      expect(await apurar()).toMatchObject({ ok: false, motivo: "regra_inativa" });
      await gerenciar(admin, vend[7], "incluir");
      expect(await time()).toEqual([vend[7].id]);
    } finally {
      await setSetting("marquinhos_regra_ativa", true);
    }
    await comoSuperuser(c);
    const job = (
      await c.query(
        `SELECT schedule, command FROM cron.job WHERE jobname = 'marquinhos-apuracao-diaria'`,
      )
    ).rows[0];
    expect(job).toEqual({ schedule: "50 9 * * *", command: "SELECT public.marquinhos_apurar();" });
  });
});
