/**
 * REGISTRO MÃE — FATIA B: o cliente que volta por campanha paga
 * (migration 20261010120400, desenho em docs/ops/registro-mae.md).
 *
 * Decisão do dono (03/10/2026), "Sempre filho novo pela roleta": toda volta
 * por campanha gera um registro novo para o corretor que a roleta sortear,
 * mesmo que outro esteja atendendo. O que esta suíte trava:
 *
 *  1. A volta vira um filho novo, vinculado à mãe, fora do índice único — e
 *     quem já tem a pessoa não é sorteado (roleta da campanha e time da zona).
 *  2. O filho herda da mãe o que o formulário não trouxe, MENOS o lugar de
 *     interesse: zona, bairro e empreendimento vêm do anúncio novo.
 *  3. Reenvio em até 10 minutos é a mesma entrada; duas voltas simultâneas
 *     viram um registro só.
 *  4. Negociação em Visita realizada ou além segura a pessoa com o dono.
 *  5. Telefone novo segue o caminho de sempre (o webhook faz o INSERT).
 *
 * Elenco: Ana e Bia (Sul) na campanha comum `jardim-bf`. Ambas presentes.
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
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let ana: UsuarioTeste;
let bia: UsuarioTeste;
let v2Antes: unknown;
let estritaAntes: unknown;

const TEL = "11987654321";
const CAMPANHA = "jardim-bf";

/** O objeto que o webhook insere em leads (src/routes/api/public/webhooks/lead/$token.ts). */
function entrada(extra: Record<string, unknown> = {}) {
  return {
    nome: "Carla Cliente",
    telefone: TEL,
    email: null,
    origem: "facebook",
    projeto_id: null,
    projeto_nome: "Residencial Novo",
    campanha: "anuncio-outubro",
    observacoes: "Respostas do formulário",
    renda_informada: null,
    entrada_disponivel: null,
    temperatura: null,
    zona: null,
    bairro: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    roleta_slug: CAMPANHA,
    via_webhook: true,
    canal_entrada: "webhook_chatbot",
    ...extra,
  };
}

/** Como o webhook chama: service_role. */
async function voltar(payload: Record<string, unknown> = entrada()) {
  await comoSuperuser(c);
  await c.query(`SET ROLE service_role`);
  try {
    const r = await c.query(`SELECT public.registrar_volta_campanha($1::jsonb) AS r`, [
      JSON.stringify(payload),
    ]);
    return r.rows[0].r;
  } finally {
    await c.query(`RESET ROLE`);
  }
}

async function distribuirNaCampanha(leadId: string) {
  await comoSuperuser(c);
  await c.query(`SET ROLE service_role`);
  try {
    const r = await c.query(`SELECT public.distribuir_lead_ponderado($1, $2) AS r`, [
      leadId,
      CAMPANHA,
    ]);
    return r.rows[0].r;
  } finally {
    await c.query(`RESET ROLE`);
  }
}

async function lead(id: string) {
  await comoSuperuser(c);
  const r = await c.query(`SELECT *, status::text AS st FROM public.leads WHERE id = $1`, [id]);
  return r.rows[0];
}

async function leadsDoTelefone() {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT id, corretor_id, registro_adicional FROM public.leads
      WHERE public.cliente_chave_telefone(telefone) = public.cliente_chave_telefone($1)
      ORDER BY created_at`,
    [TEL],
  );
  return r.rows;
}

/** Carla com a Ana, entrada antiga (fora da janela de reenvio), dados preenchidos. */
async function carlaComAna(status = "em_atendimento") {
  const id = await criarLead(c, {
    nome: "Carla Cliente",
    telefone: TEL,
    corretorId: ana.id,
    status,
  });
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.leads
        SET email = 'carla@exemplo.com', renda_informada = 'R$ 4.500',
            usa_fgts = true, fgts_valor = 18000, decisor = 'casal',
            zona = 'Norte', bairro = 'Tucuruvi', projeto_nome = 'Residencial Antigo',
            observacoes = 'nota privada da Ana',
            created_at = now() - interval '3 days'
      WHERE id = $1`,
    [id],
  );
  return id;
}

/** Mudança de status com a trava liberada, como a RPC de transição faz. */
async function mover(leadId: string, status: string) {
  await comoSuperuser(c);
  await c.query(`SELECT set_config('app.transicionar_lead', 'on', false)`);
  await c.query(`UPDATE public.leads SET status = $2::public.lead_status WHERE id = $1`, [
    leadId,
    status,
  ]);
  await c.query(`SELECT set_config('app.transicionar_lead', '', false)`);
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await comoSuperuser(c);
  v2Antes = (
    await c.query(`SELECT valor FROM public.distribuicao_settings WHERE chave = 'modelo_v2_ativo'`)
  ).rows[0]?.valor;
  estritaAntes = (
    await c.query(`SELECT valor FROM public.distribuicao_settings WHERE chave = 'zona_estrita'`)
  ).rows[0]?.valor;
  await c.query(
    `UPDATE public.distribuicao_settings SET valor = 'false'::jsonb WHERE chave = 'modelo_v2_ativo'`,
  );
  await c.query(
    `UPDATE public.distribuicao_settings SET valor = 'true'::jsonb WHERE chave = 'zona_estrita'`,
  );

  const admin = await criarUsuario(c, { nome: "Ada Admin", papel: "admin" });
  ana = await criarUsuario(c, { nome: "Ana Sul", papel: "corretor" });
  bia = await criarUsuario(c, { nome: "Bia Sul", papel: "corretor" });
  await comoSuperuser(c);
  for (const [i, u] of [ana, bia].entries()) {
    await c.query(`UPDATE public.profiles SET telefone = $2 WHERE id = $1`, [
      u.id,
      `1197777000${i}`,
    ]);
  }
  await darRegiao(c, ana.id, ["Sul"]);
  await darRegiao(c, bia.id, ["Sul"]);
  await comoUsuario(c, admin.id);
  for (const u of [ana, bia]) {
    await c.query(`SELECT public.gerenciar_participante_roleta($1, $2::uuid, 'incluir')`, [
      CAMPANHA,
      u.id,
    ]);
  }
  for (const u of [ana, bia]) {
    await comoUsuario(c, u.id);
    await c.query(`SELECT public.marcar_presenca(true)`);
  }
  await comoSuperuser(c);
});

beforeEach(async () => {
  await comoSuperuser(c);
  await c.query(`TRUNCATE public.clientes CASCADE`);
  await c.query(`TRUNCATE public.distribution_log, public.distribuicao_excecoes CASCADE`);
  await c.query(`UPDATE public.roleta_participantes SET wrr_current = 0`);
});

afterAll(async () => {
  await comoSuperuser(c);
  for (const [chave, valor] of [
    ["modelo_v2_ativo", v2Antes],
    ["zona_estrita", estritaAntes],
  ] as const) {
    if (valor !== undefined) {
      await c.query(`UPDATE public.distribuicao_settings SET valor = $1::jsonb WHERE chave = $2`, [
        JSON.stringify(valor),
        chave,
      ]);
    }
  }
  await c.query(`TRUNCATE public.clientes CASCADE`);
  await limparDados(c);
  await c.end();
});

// ---------------------------------------------------------------------------
// 1. A volta vira um filho novo, para quem ainda não tem a pessoa
// ---------------------------------------------------------------------------

describe("a volta pela campanha", () => {
  it("telefone que o CRM não conhece segue o INSERT de sempre", async () => {
    expect(await voltar()).toEqual({ acao: "cliente_novo" });
    expect(await leadsDoTelefone()).toEqual([]);
  });

  it("cliente da Ana volta: nasce um filho adicional, vinculado à mãe, sem dono", async () => {
    const daAna = await carlaComAna();
    const r = await voltar();
    expect(r.acao).toBe("registro_filho");
    expect(r.corretores_excluidos).toBe(1);

    const filho = await lead(r.lead_id);
    const original = await lead(daAna);
    expect(filho.cliente_id).toBe(original.cliente_id);
    expect(r.cliente_id).toBe(original.cliente_id);
    expect(filho.registro_adicional).toBe(true);
    expect(filho.corretor_id).toBeNull();
    expect(filho.corretores_que_tentaram).toEqual([ana.id]);
    expect(filho.via_webhook).toBe(true);
    expect(filho.roleta_slug).toBe(CAMPANHA);
    // O registro da Ana não muda: ela continua com o cliente dela.
    expect(original.corretor_id).toBe(ana.id);
    expect(original.st).toBe("em_atendimento");

    await comoSuperuser(c);
    const ev = await c.query(
      `SELECT valor_novo FROM public.cliente_eventos WHERE lead_id = $1 AND campo = '_registro_filho'`,
      [r.lead_id],
    );
    expect(ev.rows[0].valor_novo).toMatchObject({ porta: "campanha", corretores_excluidos: 1 });
  });

  it("o mesmo celular escrito sem o 9 é a mesma pessoa (chave do telefone normalizado)", async () => {
    const daAna = await carlaComAna();
    // Sobre o texto cru a chave seria 187654321; o vínculo e o índice único
    // usam o telefone normalizado (com o 9): 987654321.
    const r = await voltar(entrada({ telefone: "11 8765-4321" }));
    expect(r.acao).toBe("registro_filho");
    expect(r.cliente_id).toBe((await lead(daAna)).cliente_id);
  });

  it("Buscar oportunidade (Fatia A) também acha pelo celular digitado sem o 9", async () => {
    await carlaComAna();
    await comoUsuario(c, bia.id);
    const r = (
      await c.query(`SELECT public.buscar_oportunidade($1, NULL, NULL) AS r`, ["11 8765-4321"])
    ).rows[0].r;
    await comoSuperuser(c);
    expect(r).toMatchObject({ encontrado: true, match_por: "telefone", em_outra_carteira: true });
  });

  it("roleta da campanha: quem já tem a pessoa não é sorteado", async () => {
    await carlaComAna();
    const r = await voltar();
    // Sem a exclusão, a Ana ganharia: o SWRR pega o maior acumulado.
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.roleta_participantes SET wrr_current = 1000 WHERE corretor_id = $1`,
      [ana.id],
    );
    const d = await distribuirNaCampanha(r.lead_id);
    expect(d).toMatchObject({ ok: true, corretor_id: bia.id });
    expect((await lead(r.lead_id)).corretor_id).toBe(bia.id);
  });

  it("time da zona (zona estrita): quem já tem a pessoa também fica de fora", async () => {
    await carlaComAna();
    const r = await voltar(entrada({ zona: "Sul" }));
    // Sem a exclusão, a Ana ganharia: o motor v3 pega quem recebeu há mais tempo.
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.profiles SET last_lead_assigned_at = now() - interval '30 days' WHERE id = $1`,
      [ana.id],
    );
    await c.query(`UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = $1`, [
      bia.id,
    ]);
    const d = await distribuirNaCampanha(r.lead_id);
    expect(d).toMatchObject({ ok: true, corretor_id: bia.id });
  });

  it("lead que não é filho da campanha (lista vazia) segue sorteando como antes", async () => {
    const id = await criarLead(c, { telefone: "11911112222" });
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.roleta_participantes SET wrr_current = 1000 WHERE corretor_id = $1`,
      [ana.id],
    );
    expect(await distribuirNaCampanha(id)).toMatchObject({ ok: true, corretor_id: ana.id });
  });

  it("cliente só com registros perdidos: filho novo, e quem perdeu pode recebê-lo", async () => {
    const daAna = await carlaComAna();
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads SET motivo_perda_categoria = 'sem_contato', motivo_perdido = 'não atendeu'
        WHERE id = $1`,
      [daAna],
    );
    await mover(daAna, "perdido");
    // O índice único de sempre vale para perdidos: o INSERT do webhook bateria nele.
    expect(await errCode(criarLead(c, { telefone: TEL }))).toBe("23505");

    const r = await voltar();
    expect(r.acao).toBe("registro_filho");
    expect(r.corretores_excluidos).toBe(0);
    expect((await lead(r.lead_id)).corretores_que_tentaram).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. O que o filho herda — e o que vem do anúncio
// ---------------------------------------------------------------------------

describe("herança da mãe", () => {
  it("o formulário manda; a mãe preenche o resto, menos o lugar de interesse", async () => {
    await carlaComAna();
    const r = await voltar(entrada({ renda_informada: "R$ 6.000" }));
    const filho = await lead(r.lead_id);

    // Do formulário (mais novo que a mãe).
    expect(filho.renda_informada).toBe("R$ 6.000");
    expect(filho.projeto_nome).toBe("Residencial Novo");
    expect(filho.observacoes).toBe("Respostas do formulário");
    // Da mãe: o que o formulário não trouxe.
    expect(filho.email).toBe("carla@exemplo.com");
    expect(filho.usa_fgts).toBe(true);
    expect(Number(filho.fgts_valor)).toBe(18000);
    expect(filho.decisor).toBe("casal");
    // Do anúncio: onde ela quer comprar agora. Herdar a Zona Norte faria a
    // roleta seguir o interesse antigo (zona_do_lead olha a zona antes do
    // empreendimento).
    expect(filho.zona).toBeNull();
    expect(filho.bairro).toBeNull();

    expect(r.campos_herdados).toEqual(
      expect.arrayContaining(["decisor", "email", "fgts_valor", "usa_fgts"]),
    );
    for (const doAnuncio of ["zona", "bairro", "projeto_nome", "construtora", "renda_informada"]) {
      expect(r.campos_herdados).not.toContain(doAnuncio);
    }
  });

  it("a mãe aprende o que o formulário trouxe de novo, sem perder o que já sabia", async () => {
    await carlaComAna();
    const r = await voltar(entrada({ renda_informada: "R$ 6.000" }));
    await comoSuperuser(c);
    const m = (await c.query(`SELECT dados FROM public.clientes WHERE id = $1`, [r.cliente_id]))
      .rows[0].dados;
    expect(m.renda_informada.valor).toBe("R$ 6.000");
    expect(m.renda_informada.lead_id).toBe(r.lead_id);
    expect(m.projeto_nome.valor).toBe("Residencial Novo");
    expect(m.bairro.valor).toBe("Tucuruvi");
    expect(m.usa_fgts.valor).toBe(true);
  });

  it("chaves de controle no payload são descartadas; campo inexistente derruba", async () => {
    await carlaComAna();
    const r = await voltar(entrada({ corretor_id: ana.id, status: "contrato_fechado" }));
    const filho = await lead(r.lead_id);
    expect(filho.corretor_id).toBeNull();
    expect(filho.st).toBe("novo");

    await c.query(`TRUNCATE public.clientes CASCADE`);
    await carlaComAna();
    expect(await errCode(voltar(entrada({ campo_que_nao_existe: 1 })))).toBe("22023");
  });
});

// ---------------------------------------------------------------------------
// 3. Reenvio e concorrência
// ---------------------------------------------------------------------------

describe("a mesma entrada não vira dois registros", () => {
  it("reenvio em até 10 minutos devolve o registro que já entrou", async () => {
    await carlaComAna();
    const primeira = await voltar();
    const segunda = await voltar();
    expect(segunda).toEqual({
      acao: "reenvio",
      lead_id: primeira.lead_id,
      cliente_id: primeira.cliente_id,
      corretor_id: null,
    });
    expect(await leadsDoTelefone()).toHaveLength(2);
  });

  it("o formulário enviado duas vezes por um cliente novo também é reenvio", async () => {
    // A primeira entrada fez o INSERT de sempre (cliente_novo).
    const id = await criarLead(c, { telefone: TEL });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET via_webhook = true WHERE id = $1`, [id]);
    expect(await voltar()).toMatchObject({ acao: "reenvio", lead_id: id });
  });

  it("passados 10 minutos, é uma volta", async () => {
    await carlaComAna();
    const primeira = await voltar();
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads SET created_at = now() - interval '11 minutes', corretor_id = $2
        WHERE id = $1`,
      [primeira.lead_id, bia.id],
    );
    const segunda = await voltar();
    expect(segunda.acao).toBe("registro_filho");
    expect(segunda.lead_id).not.toBe(primeira.lead_id);
    // Ana e Bia já têm a Carla: as duas ficam fora do sorteio.
    expect(segunda.corretores_excluidos).toBe(2);
  });

  it("duas voltas ao mesmo tempo: a segunda espera e vê a primeira", async () => {
    await carlaComAna();
    const c2 = novoClient();
    await c2.connect();
    try {
      await comoSuperuser(c);
      await c.query(`BEGIN`);
      const r1 = (
        await c.query(`SELECT public.registrar_volta_campanha($1::jsonb) AS r`, [
          JSON.stringify(entrada()),
        ])
      ).rows[0].r;
      // A segunda entrada fica presa no cadeado da pessoa até a primeira gravar.
      const p2 = c2.query(`SELECT public.registrar_volta_campanha($1::jsonb) AS r`, [
        JSON.stringify(entrada()),
      ]);
      await new Promise((ok) => setTimeout(ok, 200));
      await c.query(`COMMIT`);
      const r2 = (await p2).rows[0].r;
      expect(r1.acao).toBe("registro_filho");
      expect(r2).toMatchObject({ acao: "reenvio", lead_id: r1.lead_id });
      expect(await leadsDoTelefone()).toHaveLength(2);
    } finally {
      await c2.end();
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Negociação avançada
// ---------------------------------------------------------------------------

describe("negociação avançada segura a pessoa", () => {
  it("Ana em Visita realizada: nenhum registro novo, a volta aponta o dela", async () => {
    const daAna = await carlaComAna();
    await mover(daAna, "visita_realizada");
    expect(await voltar()).toEqual({
      acao: "negociacao_avancada",
      lead_id: daAna,
      cliente_id: (await lead(daAna)).cliente_id,
      corretor_id: ana.id,
    });
    expect(await leadsDoTelefone()).toHaveLength(1);
  });

  it("a mesma fonte decide o Buscar oportunidade, o filho do corretor e a campanha", async () => {
    await comoSuperuser(c);
    const r = await c.query(`
      SELECT p.proname
        FROM pg_proc AS p
        JOIN pg_namespace AS n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('buscar_oportunidade', 'criar_registro_filho', 'registrar_volta_campanha')
         AND p.prosrc LIKE '%_cliente_lead_avancado(%'
         AND p.prosrc NOT LIKE '%''proposta_enviada''%'
       ORDER BY p.proname
    `);
    expect(r.rows.map((x) => x.proname)).toEqual([
      "buscar_oportunidade",
      "criar_registro_filho",
      "registrar_volta_campanha",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 5. Acesso
// ---------------------------------------------------------------------------

describe("acesso", () => {
  it("só o servidor (service_role) decide a volta", async () => {
    await comoSuperuser(c);
    const r = await c.query(`
      SELECT
        has_function_privilege('anon', 'public.registrar_volta_campanha(jsonb)', 'EXECUTE') AS anon,
        has_function_privilege('authenticated', 'public.registrar_volta_campanha(jsonb)', 'EXECUTE') AS auth,
        has_function_privilege('service_role', 'public.registrar_volta_campanha(jsonb)', 'EXECUTE') AS srv,
        has_function_privilege('authenticated', 'public._cliente_lead_avancado(uuid, uuid)', 'EXECUTE') AS avancado
    `);
    expect(r.rows[0]).toEqual({ anon: false, auth: false, srv: true, avancado: false });
  });
});
