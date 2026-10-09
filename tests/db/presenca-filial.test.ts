/**
 * PRESENÇA POR FILIAL — migration 20261013120000. Pedido do dono (09/10/2026):
 * "os corretores marquem em que loja estão logando e marcando presença no dia
 * para que estejam aptos para as roletas. Corretores com menos de 3 vendas no
 * mês não podem pegar lead em casa, apenas com presença no plantão." Na
 * revisão: a meta conta o MÊS ANTERIOR, e presença vale para TODA fila.
 *
 * Elenco (corretores com telefone, na roleta do Plantão):
 *   Ana  — 0 vendas no mês anterior
 *   Beto — 3 vendas aprovadas no mês anterior
 *   Caio — no mês anterior: 2 aprovadas + 1 pendente + 1 com distrato; e 1
 *          aprovada no mês ATUAL (conta 2: o critério é o do tier de comissão,
 *          só que no mês anterior)
 *
 * O que cada bloco prova:
 *   1. a regra: filial sempre libera; em casa só com o mínimo de vendas;
 *   2. os motores leem a mesma chave (a elegibilidade da roleta muda junto);
 *   3. não há burla: UPDATE direto em profiles e o marcar_presenca(true) do
 *      auto check-in antigo não ligam a presença sem check-in;
 *   4. a gestão faz check-in por alguém e o interruptor da Central fica
 *      registrado como "liberado pela gestão";
 *   5. a conferência de localização (distância, nunca a coordenada) e a chave
 *      que a torna obrigatória;
 *   6. RLS, quadro da gestão, edição de filiais e o auto-checkout das 23h;
 *   7. presença obrigatória em toda fila — menos a do SDR (decisão pendente).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarLead,
  criarUsuario,
  errCode,
  limparDados,
  novoClient,
  pool,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let gestor: UsuarioTeste;
let superint: UsuarioTeste;
let ana: UsuarioTeste;
let beto: UsuarioTeste;
let caio: UsuarioTeste;
let mesAnterior: string; // YYYY-MM-01
type FilialOriginal = {
  slug: string;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  raio_metros: number;
};
let filiaisOriginais: FilialOriginal[];

type Status = {
  presente: boolean;
  mes_referencia: string;
  vendas_mes_anterior: number;
  vendas_minimas: number;
  casa_liberada: boolean;
  checkin: {
    modo: string;
    filial_slug: string | null;
    apto_roleta: boolean;
    motivo: string | null;
    localizacao: string | null;
    distancia_m: number | null;
    origem: string;
    encerrado_em: string | null;
  } | null;
};

async function setting(chave: string, valor: unknown) {
  await comoSuperuser(c);
  await c.query(`UPDATE public.distribuicao_settings SET valor = $2::jsonb WHERE chave = $1`, [
    chave,
    JSON.stringify(valor),
  ]);
}

async function checkin(
  u: UsuarioTeste,
  modo: "loja" | "casa",
  filial: string | null = null,
  geo: { lat: number; lng: number; precisao?: number } | null = null,
): Promise<Status> {
  await comoUsuario(c, u.id);
  const r = await c.query(`SELECT public.presenca_checkin($1, $2, $3, $4, $5) AS s`, [
    modo,
    filial,
    geo?.lat ?? null,
    geo?.lng ?? null,
    geo?.precisao ?? null,
  ]);
  await comoSuperuser(c);
  return r.rows[0].s as Status;
}

async function perfil(u: UsuarioTeste) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT presente,
            (presente_em AT TIME ZONE 'America/Sao_Paulo')::date
              = (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje
       FROM public.profiles WHERE id = $1`,
    [u.id],
  );
  return r.rows[0] as { presente: boolean; hoje: boolean | null };
}

async function abertos(u: UsuarioTeste): Promise<number> {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT count(*)::int AS n FROM public.presenca_checkins
      WHERE corretor_id = $1 AND encerrado_em IS NULL`,
    [u.id],
  );
  return r.rows[0].n as number;
}

async function venda(
  u: UsuarioTeste,
  assinatura: string,
  status: "aprovada" | "pendente",
  distrato = false,
) {
  await comoSuperuser(c);
  const leadId = await criarLead(c, { corretorId: u.id });
  const r = await c.query(
    `INSERT INTO public.vendas (lead_id, corretor_id, valor_venda, data_assinatura, status_venda)
     VALUES ($1, $2, 250000, $3::date, 'pendente') RETURNING id`,
    [leadId, u.id, assinatura],
  );
  if (status === "aprovada") {
    await c.query(
      `UPDATE public.vendas
          SET status_venda = 'aprovada', aprovado_em = now(),
              contrato_assinado = true, ato_pago = true, apto_repasse = true,
              distrato = $2, data_distrato = CASE WHEN $2 THEN current_date END
        WHERE id = $1`,
      [r.rows[0].id, distrato],
    );
  }
}

/** Elegibilidade do corretor na roleta do Plantão (o que o motor v3 lê). */
async function noPlantao(u: UsuarioTeste) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT apto, presente, motivos FROM public._elegibilidade_roleta('plantao', $1)`,
    [u.id],
  );
  return r.rows[0] as { apto: boolean; presente: boolean; motivos: string[] };
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  gestor = await criarUsuario(c, { nome: "Gil Gestor", papel: "gestor" });
  superint = await criarUsuario(c, { nome: "Sara Super", papel: "superintendente" });
  ana = await criarUsuario(c, { nome: "Ana Plantão" });
  beto = await criarUsuario(c, { nome: "Beto Três Vendas" });
  caio = await criarUsuario(c, { nome: "Caio Duas Vendas" });

  await comoSuperuser(c);
  await c.query(`UPDATE public.profiles SET telefone = '11999990000' WHERE id = ANY($1::uuid[])`, [
    [ana.id, beto.id, caio.id],
  ]);
  await c.query(
    `INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo)
     SELECT r.id, u, true FROM public.roletas r, unnest($1::uuid[]) u WHERE r.slug = 'plantao'
     ON CONFLICT (roleta_id, corretor_id) DO UPDATE SET ativo = true`,
    [[ana.id, beto.id, caio.id]],
  );
  await c.query(`UPDATE public.roletas SET exigir_presenca = true WHERE slug = 'plantao'`);

  const datas = (
    await c.query(
      `SELECT to_char(date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS atual,
              to_char(date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') - interval '1 month',
                      'YYYY-MM-DD') AS anterior`,
    )
  ).rows[0] as { atual: string; anterior: string };
  mesAnterior = datas.anterior;
  const noMesAnterior = mesAnterior.slice(0, 8) + "15";

  for (let i = 0; i < 3; i++) await venda(beto, noMesAnterior, "aprovada");
  await venda(caio, noMesAnterior, "aprovada");
  await venda(caio, noMesAnterior, "aprovada");
  await venda(caio, noMesAnterior, "pendente");
  await venda(caio, noMesAnterior, "aprovada", true);
  await venda(caio, datas.atual, "aprovada");

  filiaisOriginais = (
    await c.query(`SELECT slug, endereco, latitude, longitude, raio_metros FROM public.filiais`)
  ).rows;
  await setting("presenca_casa_min_vendas_mes_anterior", 3);
  await setting("presenca_loja_exige_localizacao", false);
});

afterAll(async () => {
  await setting("presenca_casa_min_vendas_mes_anterior", 3);
  await setting("presenca_loja_exige_localizacao", false);
  // Devolve as filiais como a migration as criou (endereço, coordenadas e
  // raio do dono): os testes de localização mexem nelas.
  for (const f of filiaisOriginais) {
    await c.query(
      `UPDATE public.filiais SET endereco = $2, latitude = $3, longitude = $4, raio_metros = $5
        WHERE slug = $1`,
      [f.slug, f.endereco, f.latitude, f.longitude, f.raio_metros],
    );
  }
  await limparDados(c);
  await c.end();
  await pool.end();
});

describe("as filiais", () => {
  it("nascem as três lojas da SMQ, ativas, na ordem e com os endereços do dono", async () => {
    await comoUsuario(c, ana.id);
    const r = await c.query(`SELECT public.presenca_minha_v1() AS s`);
    const filiais = (
      r.rows[0].s as { filiais: { slug: string; nome: string; endereco: string | null }[] }
    ).filiais;
    expect(filiais.map((f) => [f.slug, f.nome, f.endereco])).toEqual([
      [
        "barra-funda",
        "Barra Funda",
        "Av. Marquês de São Vicente, 1619 - Barra Funda, São Paulo - SP, 01139-003",
      ],
      ["liberdade", "Liberdade", "Av. da Liberdade, 1000 - Liberdade, São Paulo - SP, 01502-001"],
      ["belem", "Belém", "Av. Álvaro Ramos, 896 - Quarta Parada, São Paulo - SP, 03330-002"],
    ]);
  });

  it("…e com as coordenadas do pino de cada loja (passadas pelo dono), raio de 300 m", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT slug, latitude, longitude, raio_metros FROM public.filiais ORDER BY ordem`,
    );
    expect(r.rows).toEqual([
      { slug: "barra-funda", latitude: -23.520116, longitude: -46.676975, raio_metros: 300 },
      { slug: "liberdade", latitude: -23.56125, longitude: -46.638897, raio_metros: 300 },
      { slug: "belem", latitude: -23.544943, longitude: -46.585915, raio_metros: 300 },
    ]);
  });

  it("check-in a ~80 m da loja da Liberdade conta como na filial; do centro do CEP (491 m), não", async () => {
    // Corretora própria: a sequência de check-ins da Ana é conferida adiante.
    const lia = await criarUsuario(c, { nome: "Lia Liberdade" });
    const perto = await checkin(lia, "loja", "liberdade", {
      lat: -23.56053,
      lng: -46.63889,
      precisao: 20,
    });
    expect(perto.checkin?.localizacao).toBe("confirmada");
    expect(perto.checkin?.distancia_m).toBe(80);
    const doCep = await checkin(lia, "loja", "liberdade", {
      lat: -23.55737,
      lng: -46.63659,
      precisao: 20,
    });
    expect(doCep.checkin).toMatchObject({ localizacao: "fora_do_raio", distancia_m: 491 });
  });
});

describe("a regra do plantão", () => {
  it("Ana (0 vendas no mês anterior) em casa: o check-in fica registrado, mas não libera a roleta", async () => {
    const s = await checkin(ana, "casa");
    expect(s).toMatchObject({
      presente: false,
      mes_referencia: mesAnterior,
      vendas_mes_anterior: 0,
      vendas_minimas: 3,
      casa_liberada: false,
    });
    expect(s.checkin).toMatchObject({
      modo: "casa",
      filial_slug: null,
      apto_roleta: false,
      motivo: "casa_abaixo_minimo_vendas",
      localizacao: null,
    });
    expect((await perfil(ana)).presente).toBe(false);
  });

  it("…e o motor da roleta enxerga isso como ausência", async () => {
    const e = await noPlantao(ana);
    expect(e.apto).toBe(false);
    expect(e.motivos).toContain("ausente_hoje");
  });

  it("Ana na Barra Funda: libera, troca o check-in (um aberto por dia) e o motor a vê apta", async () => {
    const s = await checkin(ana, "loja", "barra-funda");
    expect(s.presente).toBe(true);
    expect(s.checkin).toMatchObject({
      modo: "loja",
      filial_slug: "barra-funda",
      apto_roleta: true,
    });
    expect(await perfil(ana)).toEqual({ presente: true, hoje: true });
    expect(await abertos(ana)).toBe(1);
    const e = await noPlantao(ana);
    expect(e.presente).toBe(true);
    expect(e.motivos).not.toContain("ausente_hoje");
  });

  it("trocar de filial no meio do dia encerra a anterior", async () => {
    await checkin(ana, "loja", "liberdade");
    const r = await c.query(
      `SELECT f.slug, (c.encerrado_em IS NOT NULL) AS encerrado
         FROM public.presenca_checkins c LEFT JOIN public.filiais f ON f.id = c.filial_id
        WHERE c.corretor_id = $1 ORDER BY c.created_at`,
      [ana.id],
    );
    expect(r.rows).toEqual([
      { slug: null, encerrado: true },
      { slug: "barra-funda", encerrado: true },
      { slug: "liberdade", encerrado: false },
    ]);
  });

  it("Beto (3 vendas aprovadas no mês anterior) em casa: libera", async () => {
    const s = await checkin(beto, "casa");
    expect(s).toMatchObject({ presente: true, vendas_mes_anterior: 3, casa_liberada: true });
    expect(s.checkin).toMatchObject({ modo: "casa", apto_roleta: true, motivo: null });
  });

  it("Caio conta 2: pendente, distrato e a venda deste mês não entram", async () => {
    const s = await checkin(caio, "casa");
    expect(s.vendas_mes_anterior).toBe(2);
    expect(s.presente).toBe(false);
    expect(s.checkin?.motivo).toBe("casa_abaixo_minimo_vendas");
  });

  it("filial inexistente/inativa e modo inválido são recusados (22023)", async () => {
    await comoUsuario(c, ana.id);
    expect(await errCode(c.query(`SELECT public.presenca_checkin('loja', 'paulista')`))).toBe(
      "22023",
    );
    expect(await errCode(c.query(`SELECT public.presenca_checkin('loja')`))).toBe("22023");
    expect(await errCode(c.query(`SELECT public.presenca_checkin('praia')`))).toBe("22023");
    await comoSuperuser(c);
    await c.query(`UPDATE public.filiais SET ativa = false WHERE slug = 'belem'`);
    await comoUsuario(c, ana.id);
    expect(await errCode(c.query(`SELECT public.presenca_checkin('loja', 'belem')`))).toBe("22023");
    await comoSuperuser(c);
    await c.query(`UPDATE public.filiais SET ativa = true WHERE slug = 'belem'`);
  });

  it("rollback sem deploy: mínimo 0 faz o 'em casa' liberar para todos", async () => {
    await setting("presenca_casa_min_vendas_mes_anterior", 0);
    try {
      const s = await checkin(caio, "casa");
      expect(s.presente).toBe(true);
      expect(s.checkin).toMatchObject({ apto_roleta: true });
    } finally {
      await setting("presenca_casa_min_vendas_mes_anterior", 3);
    }
    // de volta ao 3: o próximo check-in em casa do Caio não libera
    expect((await checkin(caio, "casa")).presente).toBe(false);
  });
});

describe("sem burla", () => {
  it("o corretor não liga a própria presença com UPDATE direto em profiles", async () => {
    expect((await perfil(caio)).presente).toBe(false);
    await comoUsuario(c, caio.id);
    await c.query(
      `UPDATE public.profiles SET presente = true, presente_em = now(), bio = 'teste' WHERE id = $1`,
      [caio.id],
    );
    await comoSuperuser(c);
    const r = await c.query(`SELECT presente, bio FROM public.profiles WHERE id = $1`, [caio.id]);
    // o resto do perfil continua editável; a presença, não
    expect(r.rows[0]).toEqual({ presente: false, bio: "teste" });
  });

  it("nem desliga por fora (sair é pelo marcar_presenca(false))", async () => {
    await comoUsuario(c, beto.id);
    await c.query(`UPDATE public.profiles SET presente = false WHERE id = $1`, [beto.id]);
    expect((await perfil(beto)).presente).toBe(true);
  });

  it("marcar_presenca(true) sem check-in hoje (o auto check-in da aba antiga) é recusado", async () => {
    const novo = await criarUsuario(c, { nome: "Dani Sem Checkin" });
    await comoUsuario(c, novo.id);
    await expect(c.query(`SELECT public.marcar_presenca(true)`)).rejects.toThrow(/Faça o check-in/);
    expect((await perfil(novo)).presente).toBe(false);
  });

  it("marcar_presenca(true) com check-in em casa reavalia: a gestão aprovou a 3ª venda do mês anterior", async () => {
    await comoUsuario(c, caio.id);
    await c.query(`SELECT public.marcar_presenca(true)`);
    expect((await perfil(caio)).presente).toBe(false); // ainda 2 vendas: nada muda

    await venda(caio, mesAnterior.slice(0, 8) + "28", "aprovada");

    await comoUsuario(c, caio.id);
    await c.query(`SELECT public.marcar_presenca(true)`);
    expect((await perfil(caio)).presente).toBe(true);
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT modo, apto_roleta, vendas_mes_anterior FROM public.presenca_checkins
        WHERE corretor_id = $1 AND encerrado_em IS NULL`,
      [caio.id],
    );
    expect(r.rows).toEqual([{ modo: "casa", apto_roleta: true, vendas_mes_anterior: 3 }]);
  });

  it("marcar_presenca(false) encerra o check-in e tira da roleta", async () => {
    await comoUsuario(c, beto.id);
    await c.query(`SELECT public.marcar_presenca(false)`);
    expect((await perfil(beto)).presente).toBe(false);
    expect(await abertos(beto)).toBe(0);
  });

  it("o corretor não grava check-in direto na tabela", async () => {
    await comoUsuario(c, ana.id);
    expect(
      await errCode(
        c.query(
          `INSERT INTO public.presenca_checkins (corretor_id, modo, apto_roleta) VALUES ($1, 'casa', true)`,
          [ana.id],
        ),
      ),
    ).toBe("42501");
  });

  it("anônimo não executa as RPCs de presença", async () => {
    await comoSuperuser(c);
    await c.query(`SET ROLE anon`);
    try {
      expect(await errCode(c.query(`SELECT public.presenca_checkin('casa')`))).toBe("42501");
      expect(await errCode(c.query(`SELECT public.marcar_presenca(true)`))).toBe("42501");
      expect(await errCode(c.query(`SELECT public.presenca_minha_v1()`))).toBe("42501");
    } finally {
      await c.query(`RESET ROLE`);
    }
  });
});

describe("gestão", () => {
  it("o gestor faz o check-in do corretor na filial: localização confirmada pela gestão", async () => {
    await comoUsuario(c, gestor.id);
    const r = await c.query(
      `SELECT public.presenca_checkin('loja', 'belem', NULL, NULL, NULL, $1) AS s`,
      [beto.id],
    );
    const s = r.rows[0].s as Status;
    expect(s.presente).toBe(true);
    expect(s.checkin).toMatchObject({
      filial_slug: "belem",
      origem: "gestao",
      localizacao: "confirmada_gestao",
    });
  });

  it("em casa, a regra das vendas vale igual para o check-in feito pela gestão", async () => {
    await comoUsuario(c, gestor.id);
    const r = await c.query(
      `SELECT public.presenca_checkin('casa', NULL, NULL, NULL, NULL, $1) AS s`,
      [ana.id],
    );
    expect((r.rows[0].s as Status).presente).toBe(false);
  });

  it("corretor não faz check-in por colega (42501)", async () => {
    await comoUsuario(c, ana.id);
    expect(
      await errCode(
        c.query(`SELECT public.presenca_checkin('loja', 'belem', NULL, NULL, NULL, $1)`, [beto.id]),
      ),
    ).toBe("42501");
  });

  it("o interruptor da Central (marcar_presenca_admin) fica registrado como liberado pela gestão", async () => {
    await comoUsuario(c, gestor.id);
    await c.query(`SELECT public.marcar_presenca_admin($1, true)`, [ana.id]);
    expect((await perfil(ana)).presente).toBe(true);
    const r = await c.query(
      `SELECT modo, apto_roleta, origem, registrado_por FROM public.presenca_checkins
        WHERE corretor_id = $1 AND encerrado_em IS NULL`,
      [ana.id],
    );
    expect(r.rows).toEqual([
      { modo: "liberado_gestao", apto_roleta: true, origem: "gestao", registrado_por: gestor.id },
    ]);

    await comoUsuario(c, gestor.id);
    await c.query(`SELECT public.marcar_presenca_admin($1, false)`, [ana.id]);
    expect((await perfil(ana)).presente).toBe(false);
    expect(await abertos(ana)).toBe(0);
  });

  it("quadro do dia: todo corretor ativo aparece, com ou sem check-in; só a gestão lê", async () => {
    await comoUsuario(c, ana.id);
    expect(await errCode(c.query(`SELECT * FROM public.presenca_hoje_v1()`))).toBe("42501");

    await comoUsuario(c, superint.id);
    const r = await c.query(
      `SELECT nome, presente, modo, filial_slug, vendas_mes_anterior, vendas_minimas
         FROM public.presenca_hoje_v1()`,
    );
    const porNome = Object.fromEntries(r.rows.map((x) => [x.nome, x]));
    expect(porNome["Beto Três Vendas"]).toMatchObject({
      presente: true,
      modo: "loja",
      filial_slug: "belem",
      vendas_mes_anterior: 3,
      vendas_minimas: 3,
    });
    expect(porNome["Dani Sem Checkin"]).toMatchObject({ presente: false, modo: null });
    // gestão sem papel de corretor não entra no quadro
    expect(porNome["Gil Gestor"]).toBeUndefined();
  });

  it("RLS: o corretor lê só os próprios check-ins; a gestão lê todos", async () => {
    await comoUsuario(c, ana.id);
    const proprios = await c.query(`SELECT DISTINCT corretor_id FROM public.presenca_checkins`);
    expect(proprios.rows).toEqual([{ corretor_id: ana.id }]);
    await comoUsuario(c, gestor.id);
    const todos = await c.query(
      `SELECT count(DISTINCT corretor_id)::int AS n FROM public.presenca_checkins`,
    );
    expect(todos.rows[0].n).toBeGreaterThanOrEqual(3);
  });

  it("filiais: o gestor cadastra coordenadas; o corretor não altera nada", async () => {
    await comoUsuario(c, ana.id);
    await c.query(`UPDATE public.filiais SET raio_metros = 5000 WHERE slug = 'barra-funda'`);
    await comoUsuario(c, gestor.id);
    await c.query(
      `UPDATE public.filiais SET latitude = -23.5260, longitude = -46.6660, raio_metros = 300,
              endereco = 'Endereço de teste' WHERE slug = 'barra-funda'`,
    );
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT raio_metros, latitude, endereco FROM public.filiais WHERE slug = 'barra-funda'`,
    );
    expect(r.rows[0]).toEqual({
      raio_metros: 300,
      latitude: -23.526,
      endereco: "Endereço de teste",
    });
  });
});

describe("conferência de localização (só na filial)", () => {
  // Barra Funda de teste em (-23.5260, -46.6660), raio 300 m (bloco anterior).
  it("a ~100 m: confirmada, com a distância e sem guardar a coordenada", async () => {
    const s = await checkin(ana, "loja", "barra-funda", {
      lat: -23.5251,
      lng: -46.666,
      precisao: 25,
    });
    expect(s.checkin?.localizacao).toBe("confirmada");
    expect(s.checkin?.distancia_m).toBeGreaterThanOrEqual(95);
    expect(s.checkin?.distancia_m).toBeLessThanOrEqual(105);
    const cols = await c.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'presenca_checkins'
          AND column_name IN ('latitude', 'longitude')`,
    );
    expect(cols.rows).toEqual([]);
  });

  it("a ~5 km com a chave desligada: registra 'fora do raio', mas libera", async () => {
    const s = await checkin(ana, "loja", "barra-funda", {
      lat: -23.571,
      lng: -46.666,
      precisao: 20,
    });
    expect(s.checkin).toMatchObject({ localizacao: "fora_do_raio", apto_roleta: true });
    expect(s.presente).toBe(true);
  });

  it("com a chave ligada: fora do raio ou sem localização não liberam", async () => {
    await setting("presenca_loja_exige_localizacao", true);
    try {
      const longe = await checkin(ana, "loja", "barra-funda", { lat: -23.571, lng: -46.666 });
      expect(longe.presente).toBe(false);
      expect(longe.checkin).toMatchObject({ apto_roleta: false, motivo: "fora_da_filial" });

      const semGps = await checkin(ana, "loja", "barra-funda");
      expect(semGps.checkin).toMatchObject({ apto_roleta: false, motivo: "sem_localizacao" });

      const perto = await checkin(ana, "loja", "barra-funda", { lat: -23.5262, lng: -46.6661 });
      expect(perto.presente).toBe(true);

      // filial sem coordenadas (ex.: uma filial nova) não tem como conferir:
      // libera e marca o porquê
      await c.query(
        `UPDATE public.filiais SET latitude = NULL, longitude = NULL WHERE slug = 'liberdade'`,
      );
      const lib = await checkin(ana, "loja", "liberdade");
      expect(lib.checkin).toMatchObject({
        apto_roleta: true,
        localizacao: "filial_sem_coordenadas",
      });

      // em casa nunca pede localização
      const casa = await checkin(beto, "casa");
      expect(casa.checkin).toMatchObject({ localizacao: null, apto_roleta: true });
    } finally {
      await setting("presenca_loja_exige_localizacao", false);
    }
  });
});

describe("fim do dia", () => {
  it("o auto-checkout das 23h tira todos da roleta e fecha os check-ins abertos", async () => {
    await comoSuperuser(c);
    await c.query(`SELECT public.auto_checkout_presenca()`);
    const r = await c.query(
      `SELECT count(*) FILTER (WHERE encerrado_em IS NULL)::int AS abertos,
              (SELECT count(*)::int FROM public.profiles WHERE presente) AS presentes
         FROM public.presenca_checkins`,
    );
    expect(r.rows[0]).toEqual({ abertos: 0, presentes: 0 });
  });
});

describe("presença obrigatória em toda fila (decisão do dono, 09/10/2026)", () => {
  it("toda fila exige presença — menos a do SDR, que entrega por agenda livre", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT slug, exigir_presenca FROM public.roletas
        WHERE exigir_presenca IS DISTINCT FROM (tipo IS DISTINCT FROM 'sdr')`,
    );
    expect(r.rows).toEqual([]);
    const sdr = await c.query(
      `SELECT exigir_presenca FROM public.roletas WHERE slug = 'agendados-sdr'`,
    );
    expect(sdr.rows).toEqual([{ exigir_presenca: false }]);
  });

  it("desligar a presença numa fila (por qualquer caminho) não pega", async () => {
    await comoSuperuser(c);
    await c.query(`UPDATE public.roletas SET exigir_presenca = false WHERE slug = 'plantao'`);
    const nova = await c.query(
      `INSERT INTO public.roletas (slug, nome, exigir_presenca) VALUES ('teste-sem-presenca', 'Teste', false)
       ON CONFLICT (slug) DO UPDATE SET exigir_presenca = false RETURNING exigir_presenca`,
    );
    expect(nova.rows[0].exigir_presenca).toBe(true);
    const plantao = await c.query(
      `SELECT exigir_presenca FROM public.roletas WHERE slug = 'plantao'`,
    );
    expect(plantao.rows[0].exigir_presenca).toBe(true);
    await c.query(`DELETE FROM public.roletas WHERE slug = 'teste-sem-presenca'`);
  });

  it("a fila do SDR continua podendo ser configurada (fica como está até a decisão)", async () => {
    await comoSuperuser(c);
    await c.query(`UPDATE public.roletas SET exigir_presenca = true WHERE slug = 'agendados-sdr'`);
    await c.query(`UPDATE public.roletas SET exigir_presenca = false WHERE slug = 'agendados-sdr'`);
    const r = await c.query(
      `SELECT exigir_presenca FROM public.roletas WHERE slug = 'agendados-sdr'`,
    );
    expect(r.rows[0].exigir_presenca).toBe(false);
  });
});
