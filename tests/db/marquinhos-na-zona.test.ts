/**
 * LEAD DO MARQUINHOS SEGUE A ROLETA MARQUINHOS — migration 20261012120000.
 *
 * Com a zona estrita (20261009120100), todo lead COM zona ia direto para a
 * roleta da zona: a triagem por origem (chatbot → Marquinhos) só rodava para
 * lead SEM zona. Como o Marquinhos manda a "região de interesse" da
 * qualificação (que vira a zona do lead), na prática nenhum lead do bot caía
 * mais na Roleta Marquinhos — o time montado pela gestão para o bot ficava
 * parado e o lead ia para quem estivesse na vez da zona.
 *
 * Regra nova (mesma ideia da campanha de equipe fixa): lead do Marquinhos com
 * zona vai para quem da Roleta Marquinhos atende a zona dele; sem ninguém
 * apto ali, vai para o time da zona — nunca sai da zona, nunca espera o bot.
 *
 * Desde as roletas por filial (20261018120000, decisões do dono de
 * 12/10/2026) o "time da zona" é a filial que atende a zona: Barra Funda =
 * Oeste, Norte e Sul; Liberdade = Centro e Leste; Belém = Leste e Grande SP —
 * a Leste tem duas filiais e o lead da Leste alterna entre elas.
 *
 * Elenco (todos corretores com telefone, presentes):
 *   Mara  — Belém (Leste e Grande SP), na Roleta Marquinhos
 *   Lia   — Liberdade (Centro e Leste), fora da Marquinhos (só a filial)
 *   Otto  — Barra Funda (Oeste, Norte e Sul), na Roleta Marquinhos
 * Ninguém da Marquinhos atende o Centro: é a zona "sem Marquinhos", com a
 * Lia como time. (Até 12/10 esse papel era da Nina, Norte; com a Barra Funda
 * inteira na região do Otto, o Norte passou a ter Marquinhos.)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarLead,
  criarUsuario,
  limparDados,
  novoClient,
  pool,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let admin: UsuarioTeste;
let mara: UsuarioTeste;
let lia: UsuarioTeste;
let otto: UsuarioTeste;
const settingsAntes = new Map<string, unknown>();

async function setSetting(chave: string, valor: unknown) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.distribuicao_settings (chave, valor) VALUES ($1, $2::jsonb)
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
    [chave, JSON.stringify(valor)],
  );
}

async function leadDoBot(opts: {
  nome: string;
  zona?: string | null;
  origem?: string;
  canal?: string | null;
}): Promise<string> {
  const id = await criarLead(c, { nome: opts.nome, origem: opts.origem ?? "chatbot" });
  await comoSuperuser(c);
  await c.query(`UPDATE public.leads SET zona = $2, canal_entrada = $3 WHERE id = $1`, [
    id,
    opts.zona ?? null,
    opts.canal === undefined ? "webhook_chatbot" : opts.canal,
  ]);
  return id;
}

async function triar(leadId: string) {
  await comoSuperuser(c);
  const r = await c.query(`SELECT public.triar_e_distribuir_lead($1::uuid, 'teste') AS res`, [
    leadId,
  ]);
  return r.rows[0].res as Record<string, unknown>;
}

async function ultimoLog(leadId: string) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT dl.motivo, dl.roleta_slug, dl.corretor_id, ctx.contexto
       FROM public.distribution_log dl
       LEFT JOIN public.distribuicao_log_contexto ctx ON ctx.log_id = dl.id
      WHERE dl.lead_id = $1
      ORDER BY dl.created_at DESC, dl.id DESC LIMIT 1`,
    [leadId],
  );
  return r.rows[0];
}

async function excecoesAbertas(leadId: string): Promise<number> {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT count(*)::int AS n FROM public.distribuicao_excecoes
      WHERE lead_id = $1 AND status IN ('pendente', 'em_analise')`,
    [leadId],
  );
  return r.rows[0].n as number;
}

// Chegar = check-in numa filial (20261013120000: marcar_presenca(true) sozinho
// não marca presença); sair = marcar_presenca(false).
async function presenca(u: UsuarioTeste, presente: boolean) {
  await comoUsuario(c, u.id);
  await c.query(
    presente
      ? `SELECT public.presenca_checkin('loja', 'barra-funda')`
      : `SELECT public.marcar_presenca(false)`,
  );
  await comoSuperuser(c);
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await comoSuperuser(c);
  for (const chave of [
    "zona_estrita",
    "modelo_v2_ativo",
    "percentual_minimo_trabalhado",
    "marquinhos_antes_da_zona",
  ]) {
    const r = await c.query(`SELECT valor FROM public.distribuicao_settings WHERE chave = $1`, [
      chave,
    ]);
    settingsAntes.set(chave, r.rows[0]?.valor);
  }
  // Isola a regra de zona/origem: o motor v2 e o % trabalhado são outras réguas.
  await setSetting("zona_estrita", true);
  await setSetting("modelo_v2_ativo", false);
  await setSetting("percentual_minimo_trabalhado", 0);

  admin = await criarUsuario(c, { nome: "Ada Admin", papel: "admin" });
  mara = await criarUsuario(c, { nome: "Mara Marquinhos Leste", papel: "corretor" });
  lia = await criarUsuario(c, { nome: "Lia Leste", papel: "corretor" });
  otto = await criarUsuario(c, { nome: "Otto Marquinhos Oeste", papel: "corretor" });

  await comoSuperuser(c);
  for (const [i, u] of [admin, mara, lia, otto].entries()) {
    await c.query(`UPDATE public.profiles SET telefone = $2 WHERE id = $1`, [
      u.id,
      `119777700${String(i).padStart(2, "0")}`,
    ]);
  }

  // A região é por filial inteira (aba Corretores).
  await comoUsuario(c, admin.id);
  const regioes: [UsuarioTeste, string[]][] = [
    [mara, ["Leste", "Grande SP"]], // Belém
    [lia, ["Centro", "Leste"]], // Liberdade
    [otto, ["Oeste", "Norte", "Sul"]], // Barra Funda
  ];
  for (const [u, zonas] of regioes) {
    await c.query(`SELECT public.atualizar_corretor_distribuicao($1::uuid, $2::text[])`, [
      u.id,
      zonas,
    ]);
  }
  for (const u of [mara, otto]) {
    await c.query(
      `SELECT public.gerenciar_participante_roleta('marquinhos', $1::uuid, 'incluir')`,
      [u.id],
    );
  }
  // A Liberdade (Lia) é a filial da vez na Leste: o rodízio entre as
  // filiais começa zerado (limparDados) e o empate vai pela ordem das
  // filiais. Sem a regra, o lead do bot iria para a Lia.
  for (const u of [mara, lia, otto]) await presenca(u, true);
});

afterAll(async () => {
  await comoSuperuser(c);
  for (const [chave, valor] of settingsAntes) {
    if (valor === undefined) {
      await c.query(`DELETE FROM public.distribuicao_settings WHERE chave = $1`, [chave]);
    } else {
      await setSetting(chave, valor);
    }
  }
  await limparDados(c);
  await c.end();
  await pool.end();
});

// ---------------------------------------------------------------------------
describe("1. lead do Marquinhos com zona vai para a Roleta Marquinhos, filtrada pela zona", () => {
  it("lead do bot da Leste vai para a Mara (Marquinhos ∩ Leste), não para a Lia (vez da zona)", async () => {
    const l = await leadDoBot({ nome: "Bot Leste 1", zona: "Leste" });
    const res = await triar(l);
    expect(res).toMatchObject({ ok: true, corretor_id: mara.id, roleta: "marquinhos" });
    const log = await ultimoLog(l);
    expect(log.roleta_slug).toBe("marquinhos");
    expect(log.motivo).toMatch(/Zona Leste/);
    expect(log.contexto).toMatchObject({ zona: "Leste", marquinhos_na_zona: true });
    // Otto está na Marquinhos mas não atende a Leste: cortado, e auditado.
    expect(log.contexto.fora_da_regiao).toContain(otto.id);
  });

  it("todos os leads do bot da Leste ficam com a Mara — o rodízio da zona não entra", async () => {
    for (let i = 2; i <= 3; i++) {
      const l = await leadDoBot({ nome: `Bot Leste ${i}`, zona: "Leste" });
      expect(await triar(l)).toMatchObject({
        ok: true,
        corretor_id: mara.id,
        roleta: "marquinhos",
      });
    }
  });

  it("lead do bot da Oeste vai para o Otto", async () => {
    const l = await leadDoBot({ nome: "Bot Oeste", zona: "Oeste" });
    expect(await triar(l)).toMatchObject({ ok: true, corretor_id: otto.id, roleta: "marquinhos" });
  });

  it("vale também sem canal_entrada (só a origem chatbot)", async () => {
    const l = await leadDoBot({ nome: "Bot sem canal", zona: "Oeste", canal: null });
    expect(await triar(l)).toMatchObject({ ok: true, corretor_id: otto.id, roleta: "marquinhos" });
  });

  it("não marca o lead com o pino de zona (o repasse volta a tentar a Marquinhos)", async () => {
    const l = await leadDoBot({ nome: "Bot sem pino", zona: "Leste" });
    await triar(l);
    await comoSuperuser(c);
    const r = await c.query(`SELECT roleta_slug FROM public.leads WHERE id = $1`, [l]);
    expect(r.rows[0].roleta_slug).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("2. ninguém da Marquinhos apto na zona → time da zona (nunca espera, nunca sai da zona)", () => {
  it("zona sem ninguém da Marquinhos (Centro) vai para a Lia, com o desvio auditado", async () => {
    const l = await leadDoBot({ nome: "Bot Centro", zona: "Centro" });
    const res = await triar(l);
    expect(res).toMatchObject({ ok: true, corretor_id: lia.id, roleta: "filial-liberdade" });
    const log = await ultimoLog(l);
    expect(log.motivo).toMatch(/Marquinhos/);
    expect(log.contexto).toMatchObject({
      roleta_pedida: "marquinhos",
      marquinhos_sem_apto_na_zona: true,
    });
    expect(await excecoesAbertas(l)).toBe(0);
  });

  it("Mara ausente: lead do bot da Leste vai para a Lia pela zona (a Belém, sem ninguém apto, é pulada)", async () => {
    await presenca(mara, false);
    try {
      const l = await leadDoBot({ nome: "Bot Leste sem Mara", zona: "Leste" });
      expect(await triar(l)).toMatchObject({
        ok: true,
        corretor_id: lia.id,
        roleta: "filial-liberdade",
      });
      expect(await excecoesAbertas(l)).toBe(0);
    } finally {
      await presenca(mara, true);
    }
  });

  it("repasse: quem já teve o lead não recebe de novo; sem outro da Marquinhos na zona, vai para a zona", async () => {
    const l = await leadDoBot({ nome: "Bot repasse", zona: "Leste" });
    expect(await triar(l)).toMatchObject({ corretor_id: mara.id });
    // A Belém é a filial da vez da Leste (a Liberdade acabou de receber), mas
    // lá só a Mara está apta — e ela já teve o lead: a Leste vai para a
    // filial que pode recebê-lo (a Liberdade), não espera na Belém.
    await comoSuperuser(c);
    expect((await c.query(`SELECT public.roleta_da_zona('Leste') AS s`)).rows[0].s).toBe(
      "filial-belem",
    );
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads
          SET corretores_que_tentaram = array_append(COALESCE(corretores_que_tentaram, '{}'), corretor_id)
        WHERE id = $1 AND NOT (corretor_id = ANY (COALESCE(corretores_que_tentaram, '{}')))`,
      [l],
    );
    const r = await c.query(
      `SELECT public._distribuir_lead_v3($1::uuid, 'redistribuicao', NULL, NULL, NULL, 'sla_webhook') AS res`,
      [l],
    );
    expect(r.rows[0].res).toMatchObject({
      ok: true,
      corretor_id: lia.id,
      roleta: "filial-liberdade",
    });
  });

  it("time da zona também sem ninguém apto: o lead espera a ZONA (exceção da zona, sem loop)", async () => {
    await presenca(lia, false);
    try {
      const l = await leadDoBot({ nome: "Bot Centro vazio", zona: "Centro" });
      const res = await triar(l);
      expect(res).toMatchObject({
        ok: false,
        motivo: "sem_corretor_na_zona",
        roleta: "filial-liberdade",
      });
      expect(await excecoesAbertas(l)).toBe(1);
    } finally {
      await presenca(lia, true);
    }
  });
});

// ---------------------------------------------------------------------------
describe("3. o que NÃO muda", () => {
  it("lead que não é do Marquinhos (facebook) com zona segue o rodízio da zona", async () => {
    const l = await leadDoBot({
      nome: "Face Leste",
      zona: "Leste",
      origem: "facebook",
      canal: null,
    });
    await comoSuperuser(c);
    const daVez = (await c.query(`SELECT public.roleta_da_zona('Leste') AS s`)).rows[0].s;
    expect(["filial-liberdade", "filial-belem"]).toContain(daVez);
    const res = await triar(l);
    expect(res).toMatchObject({ ok: true, roleta: daVez });
  });

  it("lead do bot SEM zona continua na Roleta Marquinhos (qualquer um do time)", async () => {
    const l = await leadDoBot({ nome: "Bot sem zona" });
    const res = await triar(l);
    expect(res).toMatchObject({ ok: true, roleta: "marquinhos" });
    expect([mara.id, otto.id]).toContain(res.corretor_id);
  });

  it("campanha comum delega para a zona — e o lead do bot passa pela Marquinhos dessa zona", async () => {
    const l = await leadDoBot({ nome: "Bot campanha", zona: "Oeste" });
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT public.distribuir_lead_ponderado($1::uuid, 'jardim-bf') AS res`,
      [l],
    );
    expect(r.rows[0].res).toMatchObject({ ok: true, corretor_id: otto.id, roleta: "marquinhos" });
  });

  it("Roleta Marquinhos desativada → lead do bot vai direto para a zona", async () => {
    await comoSuperuser(c);
    await c.query(`UPDATE public.roletas SET ativo = false WHERE slug = 'marquinhos'`);
    try {
      const l = await leadDoBot({ nome: "Bot Oeste desativada", zona: "Oeste" });
      const res = await triar(l);
      expect(res).toMatchObject({ ok: true, corretor_id: otto.id, roleta: "filial-barra-funda" });
      expect((await ultimoLog(l)).contexto.marquinhos_sem_apto_na_zona).toBeUndefined();
    } finally {
      await c.query(`UPDATE public.roletas SET ativo = true WHERE slug = 'marquinhos'`);
    }
  });

  it("gestão reaponta chatbot → Plantão (mesclagem): o lead do bot vai para a zona", async () => {
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.distribuicao_config SET roleta_slug = 'plantao' WHERE origem = 'chatbot'`,
    );
    try {
      const l = await leadDoBot({ nome: "Bot mesclado", zona: "Oeste" });
      expect(await triar(l)).toMatchObject({ ok: true, roleta: "filial-barra-funda" });
    } finally {
      await c.query(
        `UPDATE public.distribuicao_config SET roleta_slug = 'marquinhos' WHERE origem = 'chatbot'`,
      );
    }
  });

  it("interruptor marquinhos_antes_da_zona = false volta ao comportamento anterior (zona direto)", async () => {
    await setSetting("marquinhos_antes_da_zona", false);
    try {
      const l = await leadDoBot({ nome: "Bot interruptor", zona: "Oeste" });
      expect(await triar(l)).toMatchObject({ ok: true, roleta: "filial-barra-funda" });
    } finally {
      await setSetting("marquinhos_antes_da_zona", true);
    }
  });
});
