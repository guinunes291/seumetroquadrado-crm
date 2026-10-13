/**
 * O estoque pelas FILIAIS (roletas simples, 20261022120000 / drizzle 0083).
 *
 * Decisão do dono (13/10/2026): sem o Plantão, o cron que entregava o
 * estoque aos aptos do Plantão passa a entregar pelas filiais, sempre por
 * vaga na carteira. Revisão técnica: o estoque não conta na cota do dia nem
 * anda a fila (um lote de 30 esgotava a cota de 20 e travava o lead quente).
 *
 * O que se prova aqui:
 *   1. cada um recebe o estoque das zonas das filiais em que está APTO, mais
 *      o sem zona; quem está em duas filiais recebe UM lote só;
 *   2. a entrega vai rotulada 'estoque_filial': fora da cota (recebidos_hoje)
 *      e da fila (ultimo_lead_em);
 *   3. pausado numa filial e apto na outra: só o estoque da outra;
 *   4. cron e botão nunca rodam juntos;
 *   5. a mesma assinatura antiga (distribuir_estoque_roleta) cai nas filiais.
 *
 * Elenco (check-in feito): Ana (Barra Funda: Oeste, Norte, Sul), Duo (Barra
 * Funda e Belém), Lu (Liberdade: Centro e Leste).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarLead,
  criarUsuario,
  darRegiao,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();
const settingsAntes = new Map<string, unknown>();

let ana: UsuarioTeste;
let duo: UsuarioTeste;
let lu: UsuarioTeste;

let tel = 0;
const novoTelefone = () => `1196${String(6000000 + ++tel).slice(-7)}`;

async function setSetting(chave: string, valor: unknown) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.distribuicao_settings (chave, valor) VALUES ($1, $2::jsonb)
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
    [chave, JSON.stringify(valor)],
  );
}

/** Estoque: lead sem dono em aguardando_corretor, com ou sem zona. */
async function estoque(zona: string | null, n = 1): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = await criarLead(c, { telefone: novoTelefone(), status: "novo" });
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads SET status = 'aguardando_corretor', zona = $2 WHERE id = $1`,
      [id, zona],
    );
    ids.push(id);
  }
  return ids;
}

async function recebidos(u: UsuarioTeste): Promise<{ id: string; zona: string | null }[]> {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT id, zona FROM public.leads WHERE corretor_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
      [u.id],
    )
  ).rows as { id: string; zona: string | null }[];
}

async function rodar(limite: number) {
  await comoSuperuser(c);
  return (await c.query(`SELECT public.distribuir_estoque_filiais($1) AS r`, [limite])).rows[0]
    .r as Record<string, unknown>;
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await comoSuperuser(c);
  for (const chave of ["zona_estrita", "percentual_minimo_trabalhado", "sdr_ativo"]) {
    const r = await c.query(`SELECT valor FROM public.distribuicao_settings WHERE chave = $1`, [
      chave,
    ]);
    settingsAntes.set(chave, r.rows[0]?.valor);
  }
  await setSetting("zona_estrita", true);
  await setSetting("percentual_minimo_trabalhado", 0);
  await setSetting("sdr_ativo", false);

  ana = await criarUsuario(c, { nome: "Ana Barra" });
  duo = await criarUsuario(c, { nome: "Duo Duas Filiais" });
  lu = await criarUsuario(c, { nome: "Lu Liberdade" });
  await comoSuperuser(c);
  for (const [i, u] of [ana, duo, lu].entries()) {
    await c.query(`UPDATE public.profiles SET telefone = $2, ativo = true WHERE id = $1`, [
      u.id,
      `119555500${String(i).padStart(2, "0")}`,
    ]);
  }
  await darRegiao(c, ana.id, ["Oeste"]);
  await darRegiao(c, duo.id, ["Oeste", "Grande SP"]);
  await darRegiao(c, lu.id, ["Centro"]);
  for (const u of [ana, duo, lu]) {
    await comoUsuario(c, u.id);
    await c.query(`SELECT public.presenca_checkin('loja', 'barra-funda')`);
  }
  await comoSuperuser(c);
});

beforeEach(async () => {
  await comoSuperuser(c);
  // Cada caso começa sem estoque e sem carteira.
  await c.query(`DELETE FROM public.distribuicao_log_contexto`);
  await c.query(`DELETE FROM public.distribution_log`);
  await c.query(`UPDATE public.leads SET deleted_at = now() WHERE deleted_at IS NULL`);
  await c.query(`UPDATE public.roleta_participantes SET pausado_ate = NULL, ultimo_lead_em = NULL`);
  await c.query(`UPDATE public.profiles SET last_lead_assigned_at = NULL`);
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

describe("estoque pelas filiais", () => {
  it("cada um recebe da região das filiais em que está; duas filiais = UM lote", async () => {
    await estoque("Oeste", 4);
    await estoque("Centro", 2);
    await estoque("Grande SP", 2);
    await estoque(null, 2);

    const r = await rodar(2);
    expect(r.ok).toBe(true);
    expect(r.roleta).toBe("filiais");
    expect(r.corretores_aptos).toBe(3);
    expect(r.distribuidos).toBe(6);

    const zonasAna = (await recebidos(ana)).map((l) => l.zona);
    const zonasDuo = (await recebidos(duo)).map((l) => l.zona);
    const zonasLu = (await recebidos(lu)).map((l) => l.zona);
    // Lote de 2 cada — Duo, nas duas filiais, também 2 (não 4).
    expect(zonasAna).toHaveLength(2);
    expect(zonasDuo).toHaveLength(2);
    expect(zonasLu).toHaveLength(2);
    for (const z of zonasAna) expect([null, "Oeste", "Norte", "Sul"]).toContain(z);
    for (const z of zonasDuo) expect([null, "Oeste", "Norte", "Sul", "Leste", "Grande SP"]).toContain(z);
    for (const z of zonasLu) expect([null, "Centro", "Leste"]).toContain(z);
  });

  it("o estoque fica fora da cota do dia e não anda a fila do lead quente", async () => {
    await estoque("Oeste", 3);
    await rodar(3);
    await comoSuperuser(c);
    const log = (
      await c.query(
        `SELECT DISTINCT regra_aplicada, roleta_slug FROM public.distribution_log
          WHERE corretor_id = $1 AND resultado = 'sucesso'`,
        [ana.id],
      )
    ).rows;
    expect(log).toEqual([{ regra_aplicada: "estoque_filial", roleta_slug: "filial-barra-funda" }]);
    const elig = (
      await c.query(
        `SELECT recebidos_hoje, ultimo_lead_em FROM public._elegibilidade_roleta('filial-barra-funda')
          WHERE corretor_id = $1`,
        [ana.id],
      )
    ).rows[0];
    expect(elig.recebidos_hoje).toBe(0);
    expect(elig.ultimo_lead_em).toBeNull();
  });

  it("pausado numa filial e apto na outra: só o estoque da outra (e o sem zona)", async () => {
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.roleta_participantes rp SET pausado_ate = now() + interval '1 day'
         FROM public.roletas r
        WHERE r.id = rp.roleta_id AND r.slug = 'filial-barra-funda' AND rp.corretor_id = $1`,
      [duo.id],
    );
    // Ana e Lu fora da jogada: só o Duo recebe.
    await c.query(
      `UPDATE public.roleta_participantes SET pausado_ate = now() + interval '1 day'
        WHERE corretor_id = ANY($1::uuid[])`,
      [[ana.id, lu.id]],
    );
    await estoque("Oeste", 3);
    await estoque("Grande SP", 2);
    await rodar(10);
    const zonas = (await recebidos(duo)).map((l) => l.zona).sort();
    expect(zonas).toEqual(["Grande SP", "Grande SP"]);
  });

  it("cron e botão nunca juntos: a segunda rodada desiste sem esperar", async () => {
    await estoque("Oeste", 1);
    const c1 = novoClient();
    await c1.connect();
    try {
      await c1.query("BEGIN");
      await c1.query(`SELECT public.distribuir_estoque_filiais(1)`);
      const r = await rodar(1);
      expect(r).toMatchObject({ ok: false, motivo: "escoamento_em_andamento" });
      await c1.query("COMMIT");
    } finally {
      await c1.end();
    }
  });

  it("a assinatura antiga: 'plantao' (desligado) → todas as filiais; uma filial → só ela", async () => {
    await estoque(null, 3);
    await comoSuperuser(c);
    const todas = (await c.query(`SELECT public.distribuir_estoque_roleta('plantao', 1) AS r`))
      .rows[0].r as Record<string, unknown>;
    expect(todas.roleta).toBe("filiais");
    expect(todas.roletas).toBeNull();
    expect(todas.distribuidos).toBe(3);

    await estoque(null, 3);
    const so = (await c.query(`SELECT public.distribuir_estoque_roleta('filial-liberdade', 5) AS r`))
      .rows[0].r as Record<string, unknown>;
    expect(so.roletas).toEqual(["filial-liberdade"]);
    expect((await recebidos(lu)).length).toBeGreaterThanOrEqual(3);
  });
});
