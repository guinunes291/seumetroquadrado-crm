/**
 * ROLETA FECHADA À NOITE — migration 20261014120000. Pedido do dono
 * (10/10/2026): "após as 22h todos os leads parem de cair na roleta e passem a
 * cair para o marquinhos". Decisões: reabre às 9h; o lead que chega à noite
 * espera a reabertura (o Marquinhos avisa o cliente); sem exceção da gestão.
 *
 * A janela depende do relógio: `comRoletaNoite` (helpers) a põe EM VOLTA de
 * agora (fechada) ou longe de agora (aberta), e o estado limpo da suíte é a
 * janela desligada. Sair do `comRoletaNoite` faz o papel da reabertura.
 *
 * Elenco: Ana e Bia na Roleta Plantão, com telefone e check-in na Barra Funda;
 * Caio e Duda na campanha de equipe fixa `equipe-guilherme`. Leads sem zona
 * (vão para o Plantão pela triagem de origem).
 *
 * O que cada bloco prova:
 *   1. a janela em si: limites (22:00 fecha, 09:00 abre), meia-noite, leitura
 *      tolerante da configuração;
 *   2. lead novo à noite espera sem dono, sem exceção e sem log — e a primeira
 *      rodada da reabertura o entrega;
 *   3. fechada para todos: o botão da gestão também espera; só a atribuição
 *      direta a um corretor escolhido passa;
 *   4. campanha (webhook e repasse) e o selo de SLA também esperam, sem mexer
 *      no lead;
 *   5. lead perdido à noite espera a reabertura em vez de ir para a lixeira;
 *   6. Escoar estoque e o alerta de roleta vazia dormem;
 *   7. a leitura das telas (roleta_janela_v1).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  comRoletaNoite,
  criarLead,
  criarUsuario,
  errCode,
  limparDados,
  novoClient,
  pool,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let admin: UsuarioTeste;
let ana: UsuarioTeste;
let bia: UsuarioTeste;
let caio: UsuarioTeste;
let duda: UsuarioTeste;
let v2Antes: unknown;
let pctAntes: unknown;

type Res = {
  ok?: boolean;
  adiado?: boolean;
  motivo?: string;
  reabre_as?: string;
  reabre_em?: string;
  corretor_id?: string;
};

async function janela(valor: unknown) {
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.distribuicao_settings SET valor = $1::jsonb WHERE chave = 'roleta_noite'`,
    [JSON.stringify(valor)],
  );
}

async function fechadaEm(ts: string): Promise<boolean> {
  await comoSuperuser(c);
  const r = await c.query(`SELECT public._roleta_fechada_agora($1::timestamptz) AS f`, [ts]);
  return r.rows[0].f as boolean;
}

async function reabreEm(ts: string): Promise<string | null> {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT to_char(public._roleta_reabre_em($1::timestamptz) AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI"Z"') AS t`,
    [ts],
  );
  return r.rows[0].t as string | null;
}

async function lead(id: string) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT corretor_id, corretor_anterior_id, status::text AS status, na_lixeira,
            corretores_que_tentaram
       FROM public.leads WHERE id = $1`,
    [id],
  );
  return r.rows[0] as {
    corretor_id: string | null;
    corretor_anterior_id: string | null;
    status: string;
    na_lixeira: boolean;
    corretores_que_tentaram: string[] | null;
  };
}

async function rastros(id: string) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT (SELECT count(*)::int FROM public.distribution_log WHERE lead_id = $1) AS logs,
            (SELECT count(*)::int FROM public.distribuicao_excecoes WHERE lead_id = $1) AS excecoes`,
    [id],
  );
  return r.rows[0] as { logs: number; excecoes: number };
}

async function triar(id: string, gatilho = "webhook"): Promise<Res> {
  await comoSuperuser(c);
  const r = await c.query(`SELECT public.triar_e_distribuir_lead($1, $2) AS r`, [id, gatilho]);
  return r.rows[0].r as Res;
}

async function rodada() {
  await comoSuperuser(c);
  const r = await c.query(`SELECT public.processar_distribuicao_automatica() AS r`);
  return r.rows[0].r as Record<string, unknown>;
}

/** Lead já entregue a `dono`, com o relógio do SLA vencido. */
async function leadComDono(opts: {
  nome: string;
  dono: UsuarioTeste;
  roleta?: string | null;
  minutosAtras?: number;
}): Promise<string> {
  const id = await criarLead(c, { nome: opts.nome, origem: "outro" });
  await comoSuperuser(c);
  await c.query(`SET session_replication_role = replica`);
  await c.query(
    `UPDATE public.leads
        SET corretor_id = $2, roleta_slug = $3,
            status = 'aguardando_atendimento', via_webhook = true,
            data_distribuicao = now() - make_interval(mins => $4),
            timestamp_recebimento = now() - make_interval(mins => $4),
            corretores_que_tentaram = ARRAY[$2::uuid]
      WHERE id = $1`,
    [id, opts.dono.id, opts.roleta ?? null, opts.minutosAtras ?? 60],
  );
  await c.query(`SET session_replication_role = DEFAULT`);
  return id;
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await comoSuperuser(c);
  v2Antes = (
    await c.query(`SELECT valor FROM public.distribuicao_settings WHERE chave = 'modelo_v2_ativo'`)
  ).rows[0]?.valor;
  await c.query(
    `UPDATE public.distribuicao_settings SET valor = 'false'::jsonb WHERE chave = 'modelo_v2_ativo'`,
  );
  await c.query(
    `UPDATE public.distribuicao_settings SET valor = 'true'::jsonb WHERE chave = 'zona_estrita'`,
  );
  // Os leads entregues ao longo do arquivo ficam "aguardando atendimento": o %
  // mínimo trabalhado do Plantão deixaria Ana e Bia inaptas no meio da suíte.
  pctAntes = (
    await c.query(
      `SELECT valor FROM public.distribuicao_settings WHERE chave = 'percentual_minimo_trabalhado'`,
    )
  ).rows[0]?.valor;
  await c.query(
    `INSERT INTO public.distribuicao_settings (chave, valor) VALUES ('percentual_minimo_trabalhado', '0')
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
  );

  admin = await criarUsuario(c, { nome: "Ada Admin", papel: "admin" });
  ana = await criarUsuario(c, { nome: "Ana Plantão", papel: "corretor" });
  bia = await criarUsuario(c, { nome: "Bia Plantão", papel: "corretor" });
  caio = await criarUsuario(c, { nome: "Caio Equipe", papel: "corretor" });
  duda = await criarUsuario(c, { nome: "Duda Equipe", papel: "corretor" });
  await comoSuperuser(c);
  for (const [i, u] of [ana, bia, caio, duda].entries()) {
    await c.query(`UPDATE public.profiles SET telefone = $2 WHERE id = $1`, [
      u.id,
      `1196666000${i}`,
    ]);
  }

  await comoUsuario(c, admin.id);
  for (const [slug, quem] of [
    ["plantao", ana],
    ["plantao", bia],
    ["equipe-guilherme", caio],
    ["equipe-guilherme", duda],
  ] as const) {
    await c.query(`SELECT public.gerenciar_participante_roleta($1, $2::uuid, 'incluir')`, [
      slug,
      quem.id,
    ]);
  }
  for (const u of [ana, bia, caio, duda]) {
    await comoUsuario(c, u.id);
    await c.query(`SELECT public.presenca_checkin('loja', 'barra-funda')`);
  }
  await comoSuperuser(c);
});

afterAll(async () => {
  await comoSuperuser(c);
  if (v2Antes !== undefined) {
    await c.query(
      `UPDATE public.distribuicao_settings SET valor = $1::jsonb WHERE chave = 'modelo_v2_ativo'`,
      [JSON.stringify(v2Antes)],
    );
  }
  if (pctAntes === undefined) {
    await c.query(
      `DELETE FROM public.distribuicao_settings WHERE chave = 'percentual_minimo_trabalhado'`,
    );
  } else {
    await c.query(
      `UPDATE public.distribuicao_settings SET valor = $1::jsonb WHERE chave = 'percentual_minimo_trabalhado'`,
      [JSON.stringify(pctAntes)],
    );
  }
  await limparDados(c);
  await c.end();
  await pool.end();
});

// ---------------------------------------------------------------------------
describe("1. a janela (22h–9h, horário de Brasília)", () => {
  afterAll(() => janela({ ativa: false, inicio: "22:00", fim: "09:00" }));

  it("22:00 em ponto já fecha; 09:00 em ponto já abre", async () => {
    await janela({ ativa: true, inicio: "22:00", fim: "09:00" });
    // BRT = UTC-3: 22:00 BRT = 01:00Z do dia seguinte.
    expect(await fechadaEm("2026-10-13T00:59:59Z")).toBe(false); // 21:59:59
    expect(await fechadaEm("2026-10-13T01:00:00Z")).toBe(true); // 22:00
    expect(await fechadaEm("2026-10-13T06:00:00Z")).toBe(true); // 03:00
    expect(await fechadaEm("2026-10-13T11:59:59Z")).toBe(true); // 08:59:59
    expect(await fechadaEm("2026-10-13T12:00:00Z")).toBe(false); // 09:00
    expect(await fechadaEm("2026-10-13T18:00:00Z")).toBe(false); // 15:00
  });

  it("a reabertura é a próxima 9h — no mesmo dia de madrugada, no dia seguinte antes da meia-noite", async () => {
    await janela({ ativa: true, inicio: "22:00", fim: "09:00" });
    expect(await reabreEm("2026-10-13T02:30:00Z")).toBe("2026-10-13T12:00Z"); // 23:30 do dia 12
    expect(await reabreEm("2026-10-13T07:00:00Z")).toBe("2026-10-13T12:00Z"); // 04:00 do dia 13
    expect(await reabreEm("2026-10-13T15:00:00Z")).toBeNull(); // aberta
  });

  it("desligada ou com início = fim, nunca fecha", async () => {
    await janela({ ativa: false, inicio: "22:00", fim: "09:00" });
    expect(await fechadaEm("2026-10-13T03:00:00Z")).toBe(false);
    await janela({ ativa: true, inicio: "22:00", fim: "22:00" });
    expect(await fechadaEm("2026-10-13T03:00:00Z")).toBe(false);
  });

  it("janela que não vira a meia-noite também funciona", async () => {
    await janela({ ativa: true, inicio: "12:00", fim: "14:00" });
    expect(await fechadaEm("2026-10-13T15:30:00Z")).toBe(true); // 12:30
    expect(await fechadaEm("2026-10-13T17:00:00Z")).toBe(false); // 14:00
  });

  it("configuração quebrada ou ausente cai na regra do dono (ligada, 22h–9h) — nunca abre por acidente", async () => {
    await janela({ ativa: "sim", inicio: "25:00", fim: 9 });
    expect(await fechadaEm("2026-10-13T03:00:00Z")).toBe(true); // 00:00
    expect(await fechadaEm("2026-10-13T15:00:00Z")).toBe(false); // 12:00
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.distribuicao_settings WHERE chave = 'roleta_noite'`);
    expect(await fechadaEm("2026-10-13T03:00:00Z")).toBe(true);
    await c.query(
      `INSERT INTO public.distribuicao_settings (chave, valor)
       VALUES ('roleta_noite', '{"ativa": false, "inicio": "22:00", "fim": "09:00"}')`,
    );
  });
});

// ---------------------------------------------------------------------------
describe("2. lead novo à noite espera a reabertura", () => {
  let id: string;

  it("o webhook recebe 'adiado' com a hora da reabertura; o lead fica sem dono, sem exceção e sem log", async () => {
    id = await criarLead(c, { nome: "Chegou 23h", origem: "outro" });
    await comRoletaNoite(c, { fechada: true }, async () => {
      const r = await triar(id, "webhook");
      expect(r).toMatchObject({ ok: false, adiado: true, motivo: "roleta_fechada_noite" });
      expect(r.reabre_as).toMatch(/^\d{2}:\d{2}$/);
      expect(r.reabre_em).toBeTruthy();
      expect((await lead(id)).corretor_id).toBeNull();
      expect(await rastros(id)).toEqual({ logs: 0, excecoes: 0 });
    });
  });

  it("a rodada do cron não roda à noite (e diz por quê)", async () => {
    await comRoletaNoite(c, { fechada: true }, async () => {
      const r = await rodada();
      expect(r).toMatchObject({ roleta_fechada: true, distribuidos: 0 });
      expect((await lead(id)).corretor_id).toBeNull();
    });
  });

  it("com a janela aberta (antes das 22h), nada muda — o mesmo cron entrega", async () => {
    const outro = await criarLead(c, { nome: "Chegou 21h", origem: "outro" });
    await comRoletaNoite(c, { fechada: false }, async () => {
      const r = await triar(outro, "webhook");
      expect(r.ok).toBe(true);
      expect([ana.id, bia.id]).toContain(r.corretor_id);
    });
  });

  it("na reabertura, a primeira rodada entrega o lead da noite para quem fez check-in", async () => {
    // Fora do comRoletaNoite = janela desligada = reabertura.
    const r = await rodada();
    expect(r.roleta_fechada).toBeUndefined();
    const l = await lead(id);
    expect([ana.id, bia.id]).toContain(l.corretor_id);
    expect(l.status).toBe("aguardando_atendimento");
  });
});

// ---------------------------------------------------------------------------
describe("3. fechada para todos", () => {
  it("o botão da gestão (distribuir pela roleta) também espera", async () => {
    const id = await criarLead(c, { nome: "Gestão tenta à noite", origem: "outro" });
    await comRoletaNoite(c, { fechada: true }, async () => {
      await comoUsuario(c, admin.id);
      const r = await c.query(
        `SELECT public.distribuir_lead_v3($1, 'automatica', 'plantao', NULL, 'manual') AS r`,
        [id],
      );
      expect(r.rows[0].r).toMatchObject({
        ok: false,
        adiado: true,
        motivo: "roleta_fechada_noite",
      });
      expect((await lead(id)).corretor_id).toBeNull();
    });
  });

  it("'liberado pela gestão' não abre a roleta de madrugada", async () => {
    const id = await criarLead(c, { nome: "Liberado à noite", origem: "outro" });
    await comRoletaNoite(c, { fechada: true }, async () => {
      await comoUsuario(c, admin.id);
      await c.query(`SELECT public.marcar_presenca_admin($1, true)`, [ana.id]);
      expect((await triar(id)).motivo).toBe("roleta_fechada_noite");
      expect((await lead(id)).corretor_id).toBeNull();
    });
  });

  it("atribuição direta a um corretor escolhido não é roleta e passa", async () => {
    const id = await criarLead(c, { nome: "Entregue na mão", origem: "outro" });
    await comRoletaNoite(c, { fechada: true }, async () => {
      await comoUsuario(c, admin.id);
      const r = await c.query(
        `SELECT public.distribuir_lead_v3($1, 'manual', NULL, $2, 'manual') AS r`,
        [id, bia.id],
      );
      expect(r.rows[0].r).toMatchObject({ ok: true, corretor_id: bia.id });
    });
  });
});

// ---------------------------------------------------------------------------
describe("4. campanha e repasse também esperam", () => {
  it("webhook de campanha de equipe fixa (roleta ponderada) espera", async () => {
    const id = await criarLead(c, { nome: "Campanha à noite", origem: "outro" });
    await comRoletaNoite(c, { fechada: true }, async () => {
      await comoSuperuser(c);
      const r = await c.query(
        `SELECT public.distribuir_lead_ponderado($1, 'equipe-guilherme') AS r`,
        [id],
      );
      expect(r.rows[0].r).toMatchObject({
        ok: false,
        adiado: true,
        motivo: "roleta_fechada_noite",
        roleta: "equipe-guilherme",
      });
      expect((await lead(id)).corretor_id).toBeNull();
    });
  });

  it("repasse de campanha fica com o dono atual", async () => {
    const id = await leadComDono({
      nome: "Repasse equipe",
      dono: caio,
      roleta: "equipe-guilherme",
    });
    await comRoletaNoite(c, { fechada: true }, async () => {
      await comoSuperuser(c);
      const r = await c.query(
        `SELECT public._repassar_lead_campanha($1, 'equipe-guilherme', 'sla_webhook') AS r`,
        [id],
      );
      expect(r.rows[0].r).toMatchObject({ adiado: true, motivo: "roleta_fechada_noite" });
      expect((await lead(id)).corretor_id).toBe(caio.id);
    });
  });

  it("o selo de SLA na tela não repassa nem toca no lead (corretores_que_tentaram intacto)", async () => {
    const id = await leadComDono({ nome: "SLA estourado 22h10", dono: ana, roleta: "plantao" });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET corretores_que_tentaram = '{}' WHERE id = $1`, [id]);
    await comRoletaNoite(c, { fechada: true }, async () => {
      await comoUsuario(c, ana.id);
      const r = await c.query(`SELECT public.disparar_repasse_sla_lead($1) AS ok`, [id]);
      expect(r.rows[0].ok).toBe(false);
      const l = await lead(id);
      expect(l.corretor_id).toBe(ana.id);
      expect(l.corretores_que_tentaram).toEqual([]);
    });
  });

  it("lead parado à noite também fica com o dono: a rodada do cron não mexe nele", async () => {
    const id = await leadComDono({ nome: "Parado 25h", dono: ana, minutosAtras: 25 * 60 });
    await comRoletaNoite(c, { fechada: true }, async () => {
      await rodada();
      expect((await lead(id)).corretor_id).toBe(ana.id);
    });
  });
});

// ---------------------------------------------------------------------------
describe("5. lead perdido à noite", () => {
  it("não vai para a lixeira: sai da carteira e espera a reabertura sem dono", async () => {
    const id = await criarLead(c, {
      nome: "Perdido 23h",
      corretorId: ana.id,
      status: "em_atendimento",
    });
    await comRoletaNoite(c, { fechada: true }, async () => {
      await comoUsuario(c, ana.id);
      const r = await c.query(
        `SELECT public.marcar_lead_perdido_v2($1, 'timing_adiou', 'pediu para falar outro dia') AS novo`,
        [id],
      );
      expect(r.rows[0].novo).toBeNull();
      const l = await lead(id);
      expect(l).toMatchObject({
        corretor_id: null,
        corretor_anterior_id: ana.id,
        status: "aguardando_atendimento",
        na_lixeira: false,
      });
      expect(l.corretores_que_tentaram).toContain(ana.id);
      await comoSuperuser(c);
      const log = await c.query(
        `SELECT regra_aplicada, resultado, motivo FROM public.distribution_log
          WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [id],
      );
      expect(log.rows[0]).toMatchObject({
        regra_aplicada: "lead_perdido_noite",
        resultado: "sem_corretor",
      });
      expect(log.rows[0].motivo).toContain("roleta fechada à noite");
    });

    // Reabertura: vai para outro corretor — nunca de volta para quem perdeu.
    await rodada();
    expect((await lead(id)).corretor_id).toBe(bia.id);
  });

  it("de dia, sem ninguém para receber, o comportamento de antes fica (lixeira)", async () => {
    const id = await criarLead(c, {
      nome: "Perdido sem saída",
      corretorId: ana.id,
      status: "em_atendimento",
    });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET corretores_que_tentaram = $2 WHERE id = $1`, [
      id,
      [bia.id],
    ]);
    await comoUsuario(c, ana.id);
    await c.query(`SELECT public.marcar_lead_perdido_v2($1, 'timing_adiou', NULL)`, [id]);
    expect(await lead(id)).toMatchObject({
      corretor_id: null,
      status: "perdido",
      na_lixeira: true,
    });
  });
});

// ---------------------------------------------------------------------------
describe("6. estoque e alerta de roleta vazia dormem", () => {
  it("Escoar estoque não entrega à noite (nem o cron de 10 min, nem o botão)", async () => {
    const id = await criarLead(c, { nome: "Estoque", origem: "outro" });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET status = 'aguardando_corretor' WHERE id = $1`, [id]);
    await comRoletaNoite(c, { fechada: true }, async () => {
      await comoSuperuser(c);
      const cron = await c.query(`SELECT public.distribuir_estoque_roleta('plantao', 30) AS r`);
      expect(cron.rows[0].r).toMatchObject({ ok: true, distribuidos: 0, roleta_fechada: true });
      await comoUsuario(c, admin.id);
      const botao = await c.query(`SELECT public.distribuir_estoque_roleta('plantao', 30) AS r`);
      expect(botao.rows[0].r.roleta_fechada).toBe(true);
      expect((await lead(id)).corretor_id).toBeNull();
    });
  });

  it("roleta fechada não é roleta vazia: sem alerta para a gestão de madrugada", async () => {
    // Zona Norte não tem ninguém: de dia o alerta sai.
    const alertas = async () => {
      await comoSuperuser(c);
      const r = await c.query(
        `SELECT count(*)::int AS n FROM public.alertas
          WHERE user_id = $1 AND titulo LIKE 'Roleta sem corretor apto:%'`,
        [admin.id],
      );
      return r.rows[0].n as number;
    };
    await comRoletaNoite(c, { fechada: true }, async () => {
      await comoSuperuser(c);
      await c.query(`SELECT public.alertar_roletas_sem_apto()`);
      expect(await alertas()).toBe(0);
    });
    await comoSuperuser(c);
    await c.query(`SELECT public.alertar_roletas_sem_apto()`);
    expect(await alertas()).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
describe("7. leitura das telas", () => {
  it("o corretor lê a janela (ele não lê distribuicao_settings)", async () => {
    await comRoletaNoite(c, { fechada: true }, async () => {
      await comoUsuario(c, ana.id);
      const r = await c.query(`SELECT public.roleta_janela_v1() AS j`);
      expect(r.rows[0].j).toMatchObject({ ativa: true, fechada: true, fecha_em: null });
      expect(r.rows[0].j.reabre_em).toBeTruthy();
      expect(r.rows[0].j.fim).toMatch(/^\d{2}:\d{2}$/);
    });
    await comoUsuario(c, ana.id);
    const r = await c.query(`SELECT public.roleta_janela_v1() AS j`);
    expect(r.rows[0].j).toMatchObject({ ativa: false, fechada: false, reabre_em: null });
  });

  it("anônimo não lê, e os helpers internos não são chamáveis pela API", async () => {
    await comoSuperuser(c);
    await c.query(`SELECT set_config('request.jwt.claims', '{"role":"anon"}', false)`);
    await c.query(`SET ROLE anon`);
    expect(await errCode(c.query(`SELECT public.roleta_janela_v1()`))).toBe("42501");
    await comoUsuario(c, ana.id);
    expect(await errCode(c.query(`SELECT public._roleta_fechada_agora()`))).toBe("42501");
    await comoSuperuser(c);
  });
});
