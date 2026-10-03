/**
 * REGISTRO MÃE (clientes) e REGISTROS FILHOS (leads) — Fatia A
 * (migration 20261009120700, desenho em docs/ops/registro-mae.md).
 *
 * Decisões do dono (03/10/2026) que esta suíte trava:
 *
 *  1. Toda entrada antiga continua deduplicando: o mesmo telefone não vira
 *     dois leads por webhook, cadastro manual ou importação. Registro filho
 *     adicional nasce SÓ por `criar_registro_filho`.
 *  2. O corretor acha o cliente por telefone, CPF ou e-mail e cria o SEU
 *     registro, herdando só os DADOS (não observações nem histórico).
 *  3. Mudança num filho atualiza só a mãe (com autor e data); os outros
 *     filhos não mudam. Exceção de compliance: opt-out vale para a pessoa.
 *  4. O primeiro a chegar em Visita realizada encerra os outros registros,
 *     como sistema: sem o nome de quem avançou no histórico do encerrado.
 *  5. Ninguém cria filho se outro corretor já está em Visita realizada+.
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
let bruno: UsuarioTeste;

const TEL = "11987654321";

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

beforeEach(async () => {
  await limparDados(c);
  await c.query(`TRUNCATE public.clientes CASCADE`);
  admin = await criarUsuario(c, { nome: "Admin Mãe", papel: "admin" });
  ana = await criarUsuario(c, { nome: "Ana Corretora", papel: "corretor" });
  bruno = await criarUsuario(c, { nome: "Bruno Corretor", papel: "corretor" });
});

async function lead(id: string) {
  await comoSuperuser(c);
  const r = await c.query(`SELECT *, status::text AS st FROM public.leads WHERE id = $1`, [id]);
  return r.rows[0];
}

async function mae(clienteId: string) {
  await comoSuperuser(c);
  const r = await c.query(`SELECT * FROM public.clientes WHERE id = $1`, [clienteId]);
  return r.rows[0];
}

/** Lead da Ana com dados de cliente preenchidos, como o funil deixa. */
async function leadDaAnaComDados() {
  const id = await criarLead(c, {
    nome: "Carla Cliente",
    telefone: TEL,
    corretorId: ana.id,
    status: "aguardando_atendimento",
  });
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.leads
        SET email = 'carla@exemplo.com', renda_informada = 'R$ 4.500',
            usa_fgts = true, fgts_valor = 18000, bairro = 'Tucuruvi',
            observacoes = 'nota privada da Ana', proxima_acao = 'ligar às 19h'
      WHERE id = $1`,
    [id],
  );
  return id;
}

async function buscar(como: UsuarioTeste, args: { tel?: string; email?: string; cpf?: string }) {
  await comoUsuario(c, como.id);
  const r = await c.query(`SELECT public.buscar_oportunidade($1, $2, $3) AS r`, [
    args.tel ?? null,
    args.email ?? null,
    args.cpf ?? null,
  ]);
  await comoSuperuser(c);
  return r.rows[0].r;
}

async function criarFilho(como: UsuarioTeste, clienteId: string, payload = {}) {
  await comoUsuario(c, como.id);
  const r = await c.query(`SELECT public.criar_registro_filho($1, $2::jsonb) AS r`, [
    clienteId,
    JSON.stringify(payload),
  ]);
  await comoSuperuser(c);
  return r.rows[0].r;
}

/** Mudança de status feita PELO corretor, com a trava liberada como a RPC faz. */
async function moverComo(como: UsuarioTeste, leadId: string, status: string) {
  await comoUsuario(c, como.id);
  await c.query(`SELECT set_config('app.transicionar_lead', 'on', false)`);
  await c.query(`UPDATE public.leads SET status = $2::public.lead_status WHERE id = $1`, [
    leadId,
    status,
  ]);
  await c.query(`SELECT set_config('app.transicionar_lead', '', false)`);
  await comoSuperuser(c);
}

// ---------------------------------------------------------------------------
// 1. O vínculo e a deduplicação antiga
// ---------------------------------------------------------------------------

describe("vínculo com a mãe", () => {
  it("todo lead novo ganha mãe pela chave do telefone (9 últimos dígitos)", async () => {
    const id = await criarLead(c, { telefone: "+55 (11) 98765-4321" });
    const l = await lead(id);
    const m = await mae(l.cliente_id);
    expect(m.chave_telefone).toBe("987654321");
    expect(l.registro_adicional).toBe(false);
  });

  it("a deduplicação de sempre continua: o mesmo telefone não vira outro lead", async () => {
    await criarLead(c, { telefone: TEL, corretorId: ana.id });
    expect(await errCode(criarLead(c, { telefone: `+55${TEL}`, corretorId: bruno.id }))).toBe(
      "23505",
    );
  });

  it("o mesmo telefone volta (da lixeira) para a MESMA mãe", async () => {
    const velho = await criarLead(c, { telefone: TEL });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET na_lixeira = true WHERE id = $1`, [velho]);
    const novo = await criarLead(c, { telefone: TEL });
    expect((await lead(novo)).cliente_id).toBe((await lead(velho)).cliente_id);
  });
});

// ---------------------------------------------------------------------------
// 2. Buscar oportunidade
// ---------------------------------------------------------------------------

describe("buscar oportunidade", () => {
  it("acha por telefone, CPF e e-mail; não acha quem não existe", async () => {
    const id = await leadDaAnaComDados();
    await c.query(`UPDATE public.leads SET cpf = '123.456.789-09' WHERE id = $1`, [id]);
    const clienteId = (await lead(id)).cliente_id;

    expect(await buscar(bruno, { tel: "(11) 98765-4321" })).toMatchObject({
      encontrado: true,
      cliente_id: clienteId,
      match_por: "telefone",
    });
    expect(await buscar(bruno, { cpf: "12345678909" })).toMatchObject({
      cliente_id: clienteId,
      match_por: "cpf",
    });
    expect(await buscar(bruno, { email: " CARLA@exemplo.com " })).toMatchObject({
      cliente_id: clienteId,
      match_por: "email",
    });
    expect(await buscar(bruno, { tel: "11911112222" })).toEqual({ encontrado: false });
  });

  it("diz quais campos virão, sem os valores e sem quem é o outro corretor", async () => {
    await leadDaAnaComDados();
    const r = await buscar(bruno, { tel: TEL });
    expect(r).toMatchObject({ em_outra_carteira: true, ja_na_carteira: false, bloqueado: false });
    expect(r.campos_herdados).toEqual(
      expect.arrayContaining(["bairro", "fgts_valor", "renda_informada", "usa_fgts"]),
    );
    expect(JSON.stringify(r)).not.toContain("4.500");
    expect(JSON.stringify(r)).not.toContain(ana.id);
  });

  it("para o próprio dono, aponta o lead que já é dele", async () => {
    const id = await leadDaAnaComDados();
    expect(await buscar(ana, { tel: TEL })).toMatchObject({
      ja_na_carteira: true,
      meu_lead_id: id,
    });
  });

  it("é do corretor: SDR e admin sem papel de corretor não usam", async () => {
    const sdr = await criarUsuario(c, { papel: "sdr" });
    await comoUsuario(c, sdr.id);
    expect(await errCode(c.query(`SELECT public.buscar_oportunidade($1)`, [TEL]))).toBe("42501");
    await comoUsuario(c, admin.id);
    expect(await errCode(c.query(`SELECT public.buscar_oportunidade($1)`, [TEL]))).toBe("42501");
    await comoSuperuser(c);
  });
});

// ---------------------------------------------------------------------------
// 3. O registro filho
// ---------------------------------------------------------------------------

describe("criar registro filho", () => {
  it("nasce na carteira do corretor com os DADOS da mãe, sem as notas do outro", async () => {
    const daAna = await leadDaAnaComDados();
    const clienteId = (await lead(daAna)).cliente_id;

    const r = await criarFilho(bruno, clienteId);
    expect(r).toMatchObject({ ok: true, ja_existia: false, adicional: true });

    const f = await lead(r.lead_id);
    expect(f).toMatchObject({
      cliente_id: clienteId,
      corretor_id: bruno.id,
      registro_adicional: true,
      st: "aguardando_atendimento",
      origem: "captacao_corretor",
      nome: "Carla Cliente",
      email: "carla@exemplo.com",
      renda_informada: "R$ 4.500",
      usa_fgts: true,
      bairro: "Tucuruvi",
    });
    expect(Number(f.fgts_valor)).toBe(18000);
    expect(f.observacoes).toBeNull();
    expect(f.proxima_acao).toBeNull();
    // A Ana continua com o dela.
    expect((await lead(daAna)).corretor_id).toBe(ana.id);
  });

  it("duas chamadas, um registro só", async () => {
    const clienteId = (await lead(await leadDaAnaComDados())).cliente_id;
    const a = await criarFilho(bruno, clienteId);
    const b = await criarFilho(bruno, clienteId);
    expect(b).toMatchObject({ ok: true, ja_existia: true, lead_id: a.lead_id });
  });

  it("bloqueado quando outro corretor já levou o cliente a Visita realizada", async () => {
    const daAna = await leadDaAnaComDados();
    await moverComo(ana, daAna, "visita_realizada");
    const clienteId = (await lead(daAna)).cliente_id;

    expect(await buscar(bruno, { tel: TEL })).toMatchObject({
      bloqueado: true,
      motivo_bloqueio: "negociacao_avancada",
    });
    expect(await criarFilho(bruno, clienteId)).toEqual({
      ok: false,
      motivo: "negociacao_avancada",
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Só a mãe muda
// ---------------------------------------------------------------------------

describe("a mudança num filho sobe só para a mãe", () => {
  it("guarda valor, lead, corretor e autor; o outro filho fica como estava", async () => {
    const daAna = await leadDaAnaComDados();
    const clienteId = (await lead(daAna)).cliente_id;
    const doBruno = (await criarFilho(bruno, clienteId)).lead_id;

    await comoUsuario(c, bruno.id);
    await c.query(`UPDATE public.leads SET renda_informada = 'R$ 6.000' WHERE id = $1`, [doBruno]);
    await comoSuperuser(c);

    const m = await mae(clienteId);
    expect(m.dados.renda_informada).toMatchObject({
      valor: "R$ 6.000",
      lead_id: doBruno,
      corretor_id: bruno.id,
      autor_id: bruno.id,
    });
    expect((await lead(daAna)).renda_informada).toBe("R$ 4.500");

    const ev = await c.query(
      `SELECT valor_anterior, valor_novo FROM public.cliente_eventos
        WHERE cliente_id = $1 AND campo = 'renda_informada' ORDER BY em DESC LIMIT 1`,
      [clienteId],
    );
    expect(ev.rows[0]).toEqual({ valor_anterior: "R$ 4.500", valor_novo: "R$ 6.000" });

    // Quem criar depois já recebe o valor mais novo.
    const carlos = await criarUsuario(c, { papel: "corretor" });
    const doCarlos = (await criarFilho(carlos, clienteId)).lead_id;
    expect((await lead(doCarlos)).renda_informada).toBe("R$ 6.000");
  });

  it("observação e próxima ação não sobem: são do corretor", async () => {
    const daAna = await leadDaAnaComDados();
    const m = await mae((await lead(daAna)).cliente_id);
    expect(m.dados.observacoes).toBeUndefined();
    expect(m.dados.proxima_acao).toBeUndefined();
  });

  it("opt-out vale para a pessoa: mãe e todos os filhos", async () => {
    const daAna = await leadDaAnaComDados();
    const clienteId = (await lead(daAna)).cliente_id;
    const doBruno = (await criarFilho(bruno, clienteId)).lead_id;

    await c.query(`UPDATE public.leads SET opt_out = true WHERE id = $1`, [doBruno]);
    expect((await mae(clienteId)).opt_out).toBe(true);
    expect((await lead(daAna)).opt_out).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. O encerramento
// ---------------------------------------------------------------------------

describe("o primeiro a chegar em Visita realizada encerra os outros", () => {
  it("encerra como sistema: perda própria, sem retrabalho e sem o nome de quem avançou", async () => {
    const daAna = await leadDaAnaComDados();
    const clienteId = (await lead(daAna)).cliente_id;
    const doBruno = (await criarFilho(bruno, clienteId)).lead_id;

    await moverComo(bruno, doBruno, "visita_realizada");

    const a = await lead(daAna);
    expect(a.st).toBe("perdido");
    expect(a.motivo_perda_categoria).toBe("seguiu_outro_corretor");
    expect(a.corretor_id).toBe(ana.id);

    // O histórico da Ana não carrega o Bruno.
    const hist = await c.query(
      `SELECT autor_id FROM public.interacoes WHERE lead_id = $1 AND tipo = 'mudanca_status'`,
      [daAna],
    );
    expect(hist.rows.length).toBeGreaterThan(0);
    expect(hist.rows.every((x) => x.autor_id === null)).toBe(true);
    const ev = await c.query(
      `SELECT agente FROM public.lead_eventos WHERE lead_id = $1 AND tipo = 'transicao_lead'`,
      [daAna],
    );
    expect(ev.rows.map((x) => x.agente)).toContain("registro_mae");

    const r = await c.query(
      `SELECT public.motivo_perda_sem_retrabalho('seguiu_outro_corretor') AS v`,
    );
    expect(r.rows[0].v).toBe(true);
    // O Bruno segue normal.
    expect((await lead(doBruno)).st).toBe("visita_realizada");
  });

  it("depois do encerramento a identidade da sessão volta ao corretor", async () => {
    const daAna = await leadDaAnaComDados();
    const doBruno = (await criarFilho(bruno, (await lead(daAna)).cliente_id)).lead_id;
    await comoUsuario(c, bruno.id);
    await c.query(`SELECT set_config('app.transicionar_lead', 'on', false)`);
    await c.query(`UPDATE public.leads SET status = 'visita_realizada' WHERE id = $1`, [doBruno]);
    const r = await c.query(`SELECT auth.uid() AS uid`);
    expect(r.rows[0].uid).toBe(bruno.id);
    await comoSuperuser(c);
  });

  it("registro que também já avançou não é encerrado (conflito fica com a gestão)", async () => {
    const daAna = await leadDaAnaComDados();
    const doBruno = (await criarFilho(bruno, (await lead(daAna)).cliente_id)).lead_id;
    // Conflito herdado de antes da regra: o da Ana já estava em proposta.
    await comoSuperuser(c);
    await c.query(`SET session_replication_role = replica`);
    await c.query(`UPDATE public.leads SET status = 'proposta_enviada' WHERE id = $1`, [daAna]);
    await c.query(`SET session_replication_role = DEFAULT`);

    await moverComo(bruno, doBruno, "visita_realizada");
    expect((await lead(daAna)).st).toBe("proposta_enviada");
    expect((await lead(doBruno)).st).toBe("visita_realizada");
  });

  it("quem avança primeiro fica; o registro do outro é que encerra", async () => {
    const daAna = await leadDaAnaComDados();
    const doBruno = (await criarFilho(bruno, (await lead(daAna)).cliente_id)).lead_id;
    await moverComo(ana, daAna, "analise_credito");
    expect((await lead(doBruno)).st).toBe("perdido");
    expect((await lead(daAna)).st).toBe("analise_credito");
  });
});

// ---------------------------------------------------------------------------
// 6. O que supunha "um telefone, um lead"
// ---------------------------------------------------------------------------

describe("pontos que supunham telefone único", () => {
  it("Bolsão: registro sem dono de quem já está com um corretor não vai ao discador", async () => {
    const daAna = await leadDaAnaComDados();
    const clienteId = (await lead(daAna)).cliente_id;
    // Um registro adicional sem dono (ex.: devolvido) da mesma pessoa.
    const doBruno = (await criarFilho(bruno, clienteId)).lead_id;
    await c.query(`UPDATE public.leads SET corretor_id = NULL WHERE id = $1`, [doBruno]);
    const r = await c.query(
      `SELECT public._bolsao_elegivel(l) AS ok FROM public.leads l WHERE l.id = $1`,
      [doBruno],
    );
    expect(r.rows[0].ok).toBe(false);
  });

  it("WhatsApp recebido vai para o filho com contato real mais recente", async () => {
    const daAna = await leadDaAnaComDados();
    const doBruno = (await criarFilho(bruno, (await lead(daAna)).cliente_id)).lead_id;
    await c.query(
      `UPDATE public.leads SET ultimo_contato = now() - interval '10 days' WHERE id = $1`,
      [daAna],
    );
    await c.query(
      `UPDATE public.leads SET ultimo_contato = now() - interval '1 hour' WHERE id = $1`,
      [doBruno],
    );
    // A Ana é atualizada por último por um motor — não rouba a mensagem.
    await c.query(`UPDATE public.leads SET temperatura = 'quente' WHERE id = $1`, [daAna]);
    const r = await c.query(`SELECT public.buscar_lead_ativo_por_telefone_global($1) AS id`, [TEL]);
    expect(r.rows[0].id).toBe(doBruno);
  });

  it("a mescla em lote por telefone não junta filhos de corretores diferentes", async () => {
    const daAna = await leadDaAnaComDados();
    const doBruno = (await criarFilho(bruno, (await lead(daAna)).cliente_id)).lead_id;
    await c.query(`SELECT public.mesclar_leads_por_telefone($1)`, [TEL]);
    await c.query(`SELECT public.mesclar_duplicados_lote(100)`);
    expect((await lead(doBruno)).na_lixeira).toBe(false);
    expect((await lead(daAna)).na_lixeira).toBe(false);
  });

  it("a página de duplicatas não acusa registro adicional", async () => {
    const daAna = await leadDaAnaComDados();
    await criarFilho(bruno, (await lead(daAna)).cliente_id);
    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT * FROM public.detectar_duplicatas_leads()`);
    await comoSuperuser(c);
    expect(r.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 7. A mãe vista pela gestão
// ---------------------------------------------------------------------------

describe("cliente_registro_mae_v1", () => {
  it("admin vê dados, filhos e histórico; corretor não", async () => {
    const daAna = await leadDaAnaComDados();
    await criarFilho(bruno, (await lead(daAna)).cliente_id);

    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT public.cliente_registro_mae_v1($1) AS r`, [daAna]);
    const v = r.rows[0].r;
    expect(v.filhos).toHaveLength(2);
    expect(v.dados.renda_informada.valor).toBe("R$ 4.500");

    await comoUsuario(c, ana.id);
    expect(await errCode(c.query(`SELECT public.cliente_registro_mae_v1($1)`, [daAna]))).toBe(
      "42501",
    );
    await comoSuperuser(c);
  });

  it("a mãe não é legível pelo corretor direto na tabela", async () => {
    await leadDaAnaComDados();
    await comoUsuario(c, ana.id);
    const r = await c.query(`SELECT count(*)::int AS n FROM public.clientes`);
    await comoSuperuser(c);
    expect(r.rows[0].n).toBe(0);
  });
});
