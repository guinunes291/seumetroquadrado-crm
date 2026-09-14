/**
 * DISCADOR SOBRE O BOLSÃO (migration 20260915130000_discador_bolsao).
 *
 * "A base que o discador deve gerar é tudo que está fora da carteira ativa
 * dos corretores" — o Bolsão, a base sem dono. O contrato testado:
 * 1. Só a service_role reserva/libera/assume (o telefone inteiro sai da
 *    reserva); authenticated recebe 42501 e não lê bolsao_discagem.
 * 2. Reservar pega SÓ quem está no Bolsão (mesma régua de bolsao_v1), pula
 *    quem está com o SDR, quem foi discado há pouco, quem outro corretor já
 *    reservou e quem o próprio corretor devolveu há pouco (anti-ioiô); os
 *    mais frios primeiro; respeita a quantidade.
 * 3. Dois corretores não recebem o mesmo lead; reserva expirada é retomada.
 * 4. A sessão do corretor (minha_v1) é anonimizada: telefone mascarado, sem
 *    coluna de telefone cru, só a própria sessão; reflete discado/atendido.
 * 5. Assumir: lead do Bolsão que atendeu entra na carteira de quem falou
 *    (dono, log de distribuição, novo -> aguardando_atendimento pela RPC
 *    oficial); recusa lead com dono, em triagem de SDR e com venda viva.
 * 6. bolsao_v1 continua a mesma população (fonte única _bolsao_elegivel).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
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

/** O que as edge functions são: service_role (BYPASSRLS, claims role). */
async function comoServiceRole(cl: Client): Promise<void> {
  await cl.query(`RESET ROLE`);
  await cl.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  await cl.query(`SET ROLE service_role`);
}

let corretorA: UsuarioTeste;
let corretorB: UsuarioTeste;
let sdr: UsuarioTeste;

let frio1: string; // o mais frio da casa
let frio2: string;
let frio3: string;
let frio4: string;
let comDonoA: string;
let comSdr: string;
let recemDiscado: string;
let optOut: string;
let devolvidoPorA: string;
let comVenda: string;

async function reservar(
  corretor: string,
  qtd: number | null,
  modo = "campanha",
  listId: string | null = null,
): Promise<Array<{ lead_id: string; telefone: string; dias_parado: number }>> {
  await comoServiceRole(c);
  const r = await c.query(
    `SELECT * FROM public.discador_bolsao_reservar_v1($1, $2, $3, 'camp-1', $4)`,
    [corretor, qtd, modo, listId],
  );
  return r.rows;
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  corretorA = await criarUsuario(c, { nome: "Corretor A", papel: "corretor" });
  corretorB = await criarUsuario(c, { nome: "Corretor B", papel: "corretor" });
  sdr = await criarUsuario(c, { nome: "SDR", papel: "sdr" });

  frio1 = await criarLead(c, { nome: "Frio 1", telefone: "11999990001" });
  frio2 = await criarLead(c, { nome: "Frio 2", telefone: "11999990002" });
  frio3 = await criarLead(c, { nome: "Frio 3", telefone: "11999990003" });
  frio4 = await criarLead(c, { nome: "Frio 4", telefone: "11999990004" });
  comDonoA = await criarLead(c, {
    nome: "Com Dono",
    telefone: "11999990005",
    corretorId: corretorA.id,
  });
  comSdr = await criarLead(c, { nome: "Com SDR", telefone: "11999990006" });
  recemDiscado = await criarLead(c, { nome: "Recém Discado", telefone: "11999990007" });
  optOut = await criarLead(c, { nome: "Opt-out", telefone: "11999990008" });
  devolvidoPorA = await criarLead(c, { nome: "Devolvido por A", telefone: "11999990009" });
  comVenda = await criarLead(c, { nome: "Com Venda", telefone: "11999990010" });

  await comoSuperuser(c);
  // Frieza determinística: frio1 é o mais antigo, frio4 o mais recente.
  for (const [id, dias] of [
    [frio1, 400],
    [frio2, 300],
    [frio3, 200],
    [frio4, 100],
    [comDonoA, 500],
    [comSdr, 500],
    [recemDiscado, 500],
    [optOut, 500],
    [devolvidoPorA, 500],
    [comVenda, 500],
  ] as const) {
    await c.query(
      `UPDATE public.leads SET created_at = now() - make_interval(days => $2) WHERE id = $1`,
      [id, dias],
    );
  }
  await c.query(`UPDATE public.leads SET sdr_id = $2 WHERE id = $1`, [comSdr, sdr.id]);
  await c.query(`UPDATE public.leads SET opt_out = true WHERE id = $1`, [optOut]);
  await c.query(
    `INSERT INTO public.chamadas (lead_id, corretor_id, direcao, origem, provider, numero, status, criado_em)
     VALUES ($1, $2, 'saida', 'campanha', '3cplus', '11999990007', 'nao_atendida', now() - interval '1 day')`,
    [recemDiscado, corretorB.id],
  );
  await c.query(
    `INSERT INTO public.devolucao_log (lote_id, lead_id, corretor_anterior_id, grupo, destino, modo, aplicado)
     VALUES (gen_random_uuid(), $1, $2, 'estoque', 'bolsao', 'ativo', true)`,
    [devolvidoPorA, corretorA.id],
  );
  await c.query(
    `INSERT INTO public.vendas (lead_id, data_assinatura, valor_venda, status_venda, distrato)
     VALUES ($1, current_date, 250000, 'pendente'::public.status_venda, false)`,
    [comVenda],
  );
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

describe("acesso: só a service_role mexe nas reservas", () => {
  it("authenticated não reserva, não libera, não assume nem lê bolsao_discagem", async () => {
    await comoUsuario(c, corretorA.id);
    expect(
      await errCode(
        c.query(`SELECT * FROM public.discador_bolsao_reservar_v1($1, 5, 'campanha', NULL, NULL)`, [
          corretorA.id,
        ]),
      ),
    ).toBe("42501");
    expect(
      await errCode(c.query(`SELECT public.discador_bolsao_liberar_v1($1, NULL)`, [corretorA.id])),
    ).toBe("42501");
    expect(
      await errCode(
        c.query(`SELECT public.discador_bolsao_assumir_v1($1, $2, NULL)`, [frio1, corretorA.id]),
      ),
    ).toBe("42501");
    expect(await errCode(c.query(`SELECT * FROM public.bolsao_discagem`))).toBe("42501");
  });
});

describe("reservar: quem entra na fila", () => {
  it("pega só o Bolsão discável, os mais frios primeiro, na quantidade pedida", async () => {
    const linhas = await reservar(corretorA.id, 3);
    expect(linhas.map((l) => l.lead_id)).toEqual([frio1, frio2, frio3]);
    // O telefone sai inteiro: é o que sobe para o mailing (service_role só).
    expect(linhas[0].telefone).toBe("11999990001");
    expect(linhas[0].dias_parado).toBeGreaterThan(390);
  });

  it("outro corretor não recebe os leads já reservados; recebe o que sobrou", async () => {
    const linhas = await reservar(corretorB.id, 10);
    const ids = linhas.map((l) => l.lead_id);
    expect(ids).not.toContain(frio1);
    expect(ids).not.toContain(frio2);
    expect(ids).not.toContain(frio3);
    expect(ids).toContain(frio4);
    // Anti-ioiô é por corretor: o lead que A devolveu está livre para B.
    expect(ids).toContain(devolvidoPorA);
    // Exclusões absolutas: dono, SDR, discado há pouco, opt-out, venda viva.
    expect(ids).not.toContain(comDonoA);
    expect(ids).not.toContain(comSdr);
    expect(ids).not.toContain(recemDiscado);
    expect(ids).not.toContain(optOut);
    expect(ids).not.toContain(comVenda);
  });

  it("anti-ioiô: o lead que o próprio corretor devolveu há pouco não volta para ele", async () => {
    await comoServiceRole(c);
    await c.query(`SELECT public.discador_bolsao_liberar_v1($1, NULL)`, [corretorB.id]);
    const ids = (await reservar(corretorA.id, 50)).map((l) => l.lead_id);
    expect(ids).toContain(frio4);
    expect(ids).not.toContain(devolvidoPorA);
  });

  it("reserva expirada é retomada por quem chegar", async () => {
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.bolsao_discagem SET expira_em = now() - interval '1 hour' WHERE lead_id = $1`,
      [frio4],
    );
    const ids = (await reservar(corretorB.id, 50)).map((l) => l.lead_id);
    expect(ids).toContain(frio4);
    expect(ids).not.toContain(frio1);
    const r = await c.query(`SELECT corretor_id FROM public.bolsao_discagem WHERE lead_id = $1`, [
      frio4,
    ]);
    expect(r.rows[0].corretor_id).toBe(corretorB.id);
  });

  it("liberar solta as reservas do corretor (e só as dele)", async () => {
    await comoServiceRole(c);
    const r = await c.query(`SELECT public.discador_bolsao_liberar_v1($1, NULL) AS n`, [
      corretorB.id,
    ]);
    expect(Number(r.rows[0].n)).toBeGreaterThan(0);
    await comoSuperuser(c);
    const resto = await c.query(`SELECT corretor_id FROM public.bolsao_discagem`);
    expect(resto.rows.every((x) => x.corretor_id === corretorA.id)).toBe(true);
  });
});

describe("minha sessão: anonimizada e só a própria", () => {
  it("telefone mascarado, sem coluna de telefone cru, só os leads do corretor", async () => {
    await comoUsuario(c, corretorA.id);
    const r = await c.query(`SELECT * FROM public.bolsao_discagem_minha_v1()`);
    const colunas = r.fields.map((f) => f.name);
    expect(colunas).not.toContain("telefone");
    expect(colunas.some((n) => n.includes("corretor"))).toBe(false);
    const ids = r.rows.map((x) => x.lead_id as string);
    expect(ids).toContain(frio1);
    expect(ids).not.toContain(frio4);
    const linha = r.rows.find((x) => x.lead_id === frio1)!;
    expect(linha.telefone_mascarado).toBe("(11) •••••0001");
    expect(linha.discado).toBe(false);
    expect(linha.atendido).toBe(false);
    expect(linha.modo).toBe("campanha");

    await comoUsuario(c, corretorB.id);
    const rb = await c.query(`SELECT lead_id FROM public.bolsao_discagem_minha_v1()`);
    expect(rb.rows.map((x) => x.lead_id)).not.toContain(frio1);
  });

  it("reflete discado/atendido a partir de `chamadas` da sessão", async () => {
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.chamadas (lead_id, corretor_id, direcao, origem, provider, numero, status)
       VALUES ($1, $2, 'saida', 'campanha', '3cplus', '11999990001', 'atendida')`,
      [frio1, corretorA.id],
    );
    await comoUsuario(c, corretorA.id);
    const r = await c.query(
      `SELECT discado, atendido, assumido_em FROM public.bolsao_discagem_minha_v1() WHERE lead_id = $1`,
      [frio1],
    );
    expect(r.rows[0]).toMatchObject({ discado: true, atendido: true, assumido_em: null });
  });
});

describe("assumir: quem atende entra na carteira de quem falou", () => {
  it("lead do Bolsão vira do corretor, com log e caixa de entrada (novo -> aguardando_atendimento)", async () => {
    await comoServiceRole(c);
    const r = await c.query(
      `SELECT public.discador_bolsao_assumir_v1($1, $2, 'Discador: atendeu') AS r`,
      [frio1, corretorA.id],
    );
    expect(r.rows[0].r).toMatchObject({ ok: true, motivo: "assumido", status_anterior: "novo" });
    await comoSuperuser(c);
    const lead = await c.query(`SELECT corretor_id, status FROM public.leads WHERE id = $1`, [
      frio1,
    ]);
    expect(lead.rows[0].corretor_id).toBe(corretorA.id);
    expect(lead.rows[0].status).toBe("aguardando_atendimento");
    const log = await c.query(
      `SELECT regra_aplicada, tipo FROM public.distribution_log WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [frio1],
    );
    expect(log.rows[0]).toMatchObject({ regra_aplicada: "discador_bolsao", tipo: "automatica" });
    const reserva = await c.query(
      `SELECT assumido_em FROM public.bolsao_discagem WHERE lead_id = $1`,
      [frio1],
    );
    expect(reserva.rows[0].assumido_em).not.toBeNull();
    // A sessão do corretor mostra que o lead já é dele.
    await comoUsuario(c, corretorA.id);
    const minha = await c.query(
      `SELECT assumido_em FROM public.bolsao_discagem_minha_v1() WHERE lead_id = $1`,
      [frio1],
    );
    expect(minha.rows[0].assumido_em).not.toBeNull();
  });

  it("é idempotente para o mesmo corretor e recusa lead com dono, com SDR ou com venda viva", async () => {
    await comoServiceRole(c);
    const denovo = await c.query(`SELECT public.discador_bolsao_assumir_v1($1, $2, NULL) AS r`, [
      frio1,
      corretorA.id,
    ]);
    expect(denovo.rows[0].r).toMatchObject({ ok: true, motivo: "ja_e_seu" });
    const outro = await c.query(`SELECT public.discador_bolsao_assumir_v1($1, $2, NULL) AS r`, [
      frio1,
      corretorB.id,
    ]);
    expect(outro.rows[0].r).toMatchObject({ ok: false, motivo: "tem_dono" });
    const emSdr = await c.query(`SELECT public.discador_bolsao_assumir_v1($1, $2, NULL) AS r`, [
      comSdr,
      corretorA.id,
    ]);
    expect(emSdr.rows[0].r).toMatchObject({ ok: false, motivo: "em_triagem_sdr" });
    const venda = await c.query(`SELECT public.discador_bolsao_assumir_v1($1, $2, NULL) AS r`, [
      comVenda,
      corretorA.id,
    ]);
    expect(venda.rows[0].r).toMatchObject({ ok: false, motivo: "venda_viva" });
  });

  it("depois de assumido, o lead sai do Bolsão (e da próxima reserva)", async () => {
    await comoServiceRole(c);
    await c.query(`SELECT public.discador_bolsao_liberar_v1($1, NULL)`, [corretorA.id]);
    await c.query(`SELECT public.discador_bolsao_liberar_v1($1, NULL)`, [corretorB.id]);
    const ids = (await reservar(corretorB.id, 50)).map((l) => l.lead_id);
    expect(ids).not.toContain(frio1);
    await comoUsuario(c, corretorB.id);
    const bolsao = await c.query(`SELECT lead_id FROM public.bolsao_v1(NULL, 200, 0)`);
    expect(bolsao.rows.map((x) => x.lead_id)).not.toContain(frio1);
    expect(bolsao.rows.map((x) => x.lead_id)).toContain(frio2);
  });
});
