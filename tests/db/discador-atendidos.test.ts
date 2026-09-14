/**
 * DISCADOR — ATENDIDOS (migration 20260915140000_discador_atendidos).
 *
 * Decisão: quem atende o discador NÃO ganha dono. Vira um "atendido" do
 * corretor, fora da base ativa (sem dono, nunca entra nos 65), e segue no
 * Bolsão, discável por outros, até alguém avançar a fase (posse a partir de
 * agendado, por configuração). O contrato testado:
 * 1. atender (service_role) registra o atendimento sem mexer no dono; os dois
 *    eventos da mesma chamada contam UM atendimento; lead com dono é recusado.
 * 2. O lead atendido continua elegível para a reserva de OUTRO corretor.
 * 3. A aba do corretor (meus_v1) é anonimizada e só a própria; conta os
 *    outros corretores sem dizer quem.
 * 4. Nota na timeline sem posse: só quem atendeu; autor = corretor.
 * 5. Assumir pela aba: só quem atendeu; dá posse, encerra os atendimentos de
 *    todos (próprio = posse_propria, outros = posse_outro) e o lead some da
 *    reserva e do Bolsão.
 * 6. authenticated não chama atender nem lê a tabela; config tem
 *    discador_posse_a_partir_de e perdeu discador_assume_ao_atender.
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

async function comoServiceRole(cl: Client): Promise<void> {
  await cl.query(`RESET ROLE`);
  await cl.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  await cl.query(`SET ROLE service_role`);
}

let corretorA: UsuarioTeste;
let corretorB: UsuarioTeste;
let corretorC: UsuarioTeste;
let leadX: string;
let leadY: string;
let comDonoC: string;
let chamada1: string;
let chamada2: string;

async function atender(lead: string, corretor: string, chamada: string | null) {
  await comoServiceRole(c);
  const r = await c.query(`SELECT public.discador_bolsao_atender_v1($1, $2, $3) AS r`, [
    lead,
    corretor,
    chamada,
  ]);
  return r.rows[0].r as { ok: boolean; motivo: string };
}

async function meus(quem: UsuarioTeste) {
  await comoUsuario(c, quem.id);
  const r = await c.query(`SELECT * FROM public.discador_atendidos_meus_v1()`);
  return r;
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  corretorA = await criarUsuario(c, { nome: "Corretor A", papel: "corretor" });
  corretorB = await criarUsuario(c, { nome: "Corretor B", papel: "corretor" });
  corretorC = await criarUsuario(c, { nome: "Corretor C", papel: "corretor" });
  leadX = await criarLead(c, { nome: "Cliente X", telefone: "11999990001" });
  leadY = await criarLead(c, { nome: "Cliente Y", telefone: "11999990002" });
  comDonoC = await criarLead(c, {
    nome: "Da carteira de C",
    telefone: "11999990003",
    corretorId: corretorC.id,
  });
  await comoSuperuser(c);
  const ch = await c.query(
    `INSERT INTO public.chamadas (lead_id, corretor_id, direcao, origem, provider, numero, status)
     VALUES ($1, $2, 'saida', 'campanha', '3cplus', '11999990001', 'atendida'),
            ($1, $2, 'saida', 'campanha', '3cplus', '11999990001', 'concluida')
     RETURNING id`,
    [leadX, corretorA.id],
  );
  chamada1 = ch.rows[0].id as string;
  chamada2 = ch.rows[1].id as string;
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

describe("atender: registro sem posse", () => {
  it("registra o atendimento e o lead continua sem dono", async () => {
    expect(await atender(leadX, corretorA.id, chamada1)).toMatchObject({
      ok: true,
      motivo: "atendido",
    });
    await comoSuperuser(c);
    const lead = await c.query(`SELECT corretor_id FROM public.leads WHERE id = $1`, [leadX]);
    expect(lead.rows[0].corretor_id).toBeNull();
    const a = await c.query(
      `SELECT atendimentos, encerrado_em FROM public.discador_atendimentos WHERE lead_id = $1 AND corretor_id = $2`,
      [leadX, corretorA.id],
    );
    expect(a.rows[0]).toMatchObject({ atendimentos: 1, encerrado_em: null });
  });

  it("os dois eventos da mesma chamada contam um atendimento; outra chamada conta mais um", async () => {
    await atender(leadX, corretorA.id, chamada1);
    await comoSuperuser(c);
    let a = await c.query(
      `SELECT atendimentos FROM public.discador_atendimentos WHERE lead_id = $1 AND corretor_id = $2`,
      [leadX, corretorA.id],
    );
    expect(a.rows[0].atendimentos).toBe(1);
    await atender(leadX, corretorA.id, chamada2);
    await comoSuperuser(c);
    a = await c.query(
      `SELECT atendimentos FROM public.discador_atendimentos WHERE lead_id = $1 AND corretor_id = $2`,
      [leadX, corretorA.id],
    );
    expect(a.rows[0].atendimentos).toBe(2);
  });

  it("lead com dono não vira atendido do Bolsão", async () => {
    expect(await atender(comDonoC, corretorA.id, null)).toMatchObject({
      ok: false,
      motivo: "tem_dono",
    });
    expect(await atender(comDonoC, corretorC.id, null)).toMatchObject({
      ok: false,
      motivo: "ja_e_seu",
    });
  });

  it("o atendido continua no Bolsão e na reserva de OUTRO corretor", async () => {
    await comoServiceRole(c);
    const r = await c.query(
      `SELECT lead_id FROM public.discador_bolsao_reservar_v1($1, 50, 'campanha', NULL, NULL)`,
      [corretorB.id],
    );
    // leadX tem `chamadas` recentes (rediscagem de 7 dias) — o teste do
    // Bolsão em si é leadY; leadX prova que a exclusão é a rediscagem, não a posse.
    const ids = r.rows.map((x) => x.lead_id as string);
    expect(ids).toContain(leadY);
    await comoUsuario(c, corretorB.id);
    const bolsao = await c.query(`SELECT lead_id FROM public.bolsao_v1(NULL, 200, 0)`);
    expect(bolsao.rows.map((x) => x.lead_id)).toContain(leadX);
    await comoServiceRole(c);
    await c.query(`SELECT public.discador_bolsao_liberar_v1($1, NULL)`, [corretorB.id]);
  });
});

describe("a aba Atendidos", () => {
  it("anonimizada, só a própria, com a contagem de outros corretores", async () => {
    await atender(leadX, corretorB.id, null);
    const ra = await meus(corretorA);
    const colunas = ra.fields.map((f) => f.name);
    expect(colunas).not.toContain("telefone");
    expect(colunas.some((n) => n.includes("corretor_id"))).toBe(false);
    const x = ra.rows.find((l) => l.lead_id === leadX)!;
    expect(x.telefone_mascarado).toBe("(11) •••••0001");
    expect(x.atendimentos).toBe(2);
    expect(x.outros_corretores).toBe(1);
    expect(x).toMatchObject({
      tem_dono: false,
      dono_sou_eu: false,
      ainda_no_bolsao: true,
      encerrado_em: null,
    });
    const rc = await meus(corretorC);
    expect(rc.rows.map((l) => l.lead_id)).not.toContain(leadX);
  });

  it("authenticated não registra atendimento nem lê a tabela", async () => {
    await comoUsuario(c, corretorA.id);
    expect(
      await errCode(
        c.query(`SELECT public.discador_bolsao_atender_v1($1, $2, NULL)`, [leadY, corretorA.id]),
      ),
    ).toBe("42501");
    expect(await errCode(c.query(`SELECT * FROM public.discador_atendimentos`))).toBe("42501");
  });
});

describe("trabalhar o atendido sem posse", () => {
  it("nota na timeline: só quem atendeu; autor é o corretor; lead segue sem dono", async () => {
    await comoUsuario(c, corretorC.id);
    expect(
      await errCode(
        c.query(`SELECT public.discador_atendido_nota_v1($1, 'tentei', 'ligacao')`, [leadX]),
      ),
    ).toBe("42501");
    await comoUsuario(c, corretorA.id);
    const r = await c.query(
      `SELECT public.discador_atendido_nota_v1($1, 'Quer 2 dorms, ligar sábado', 'ligacao') AS r`,
      [leadX],
    );
    expect(r.rows[0].r.ok).toBe(true);
    await comoSuperuser(c);
    const i = await c.query(
      `SELECT autor_id, tipo::text AS tipo, direcao::text AS direcao, metadata->>'fonte' AS fonte
         FROM public.interacoes WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [leadX],
    );
    expect(i.rows[0]).toMatchObject({
      autor_id: corretorA.id,
      tipo: "ligacao",
      direcao: "saida",
      fonte: "discador_atendido",
    });
    const lead = await c.query(`SELECT corretor_id FROM public.leads WHERE id = $1`, [leadX]);
    expect(lead.rows[0].corretor_id).toBeNull();
    // Conteúdo vazio é recusado antes de olhar o atendimento (como o corretor).
    await comoUsuario(c, corretorA.id);
    expect(
      await errCode(c.query(`SELECT public.discador_atendido_nota_v1($1, '   ', 'nota')`, [leadY])),
    ).toBe("22023");
  });

  it("assumir pela aba: só quem atendeu; dá posse e encerra os atendimentos de todos", async () => {
    await comoUsuario(c, corretorC.id);
    expect(await errCode(c.query(`SELECT public.discador_atendido_assumir_v1($1)`, [leadX]))).toBe(
      "42501",
    );

    await comoUsuario(c, corretorA.id);
    const r = await c.query(`SELECT public.discador_atendido_assumir_v1($1) AS r`, [leadX]);
    expect(r.rows[0].r).toMatchObject({ ok: true, motivo: "assumido" });

    await comoSuperuser(c);
    const lead = await c.query(`SELECT corretor_id, status FROM public.leads WHERE id = $1`, [
      leadX,
    ]);
    expect(lead.rows[0].corretor_id).toBe(corretorA.id);
    expect(lead.rows[0].status).toBe("aguardando_atendimento");
    const a = await c.query(
      `SELECT corretor_id, encerrado_motivo FROM public.discador_atendimentos WHERE lead_id = $1 ORDER BY corretor_id`,
      [leadX],
    );
    const porCorretor = Object.fromEntries(a.rows.map((x) => [x.corretor_id, x.encerrado_motivo]));
    expect(porCorretor[corretorA.id]).toBe("posse_propria");
    expect(porCorretor[corretorB.id]).toBe("posse_outro");

    // A aba de B diz que o lead ganhou dono, sem dizer quem; a de A, que é dele.
    const rb = await meus(corretorB);
    const xb = rb.rows.find((l) => l.lead_id === leadX)!;
    expect(xb).toMatchObject({
      tem_dono: true,
      dono_sou_eu: false,
      encerrado_motivo: "posse_outro",
    });
    const ra = await meus(corretorA);
    const xa = ra.rows.find((l) => l.lead_id === leadX)!;
    expect(xa).toMatchObject({
      dono_sou_eu: true,
      encerrado_motivo: "posse_propria",
      ainda_no_bolsao: false,
    });

    // Saiu do Bolsão e da reserva.
    await comoUsuario(c, corretorB.id);
    const bolsao = await c.query(`SELECT lead_id FROM public.bolsao_v1(NULL, 200, 0)`);
    expect(bolsao.rows.map((x) => x.lead_id)).not.toContain(leadX);
    // Nota depois da posse: o atendimento está encerrado, a RPC recusa
    // (o lead é dele — o registro normal do dossiê passa a valer).
    await comoUsuario(c, corretorA.id);
    expect(
      await errCode(c.query(`SELECT public.discador_atendido_nota_v1($1, 'x', 'nota')`, [leadX])),
    ).toBe("42501");
  });
});

describe("posse ao avançar — a sequência do webhook (qualificação ANTES da posse)", () => {
  // O tcplus-webhook, como service_role, primeiro aplica a qualificação
  // (transicionar_lead, com a escada por em_atendimento quando a matriz não
  // liga a etapa de origem à alvo) num lead que AINDA NÃO TEM DONO, e só
  // depois chama assumir_v1. A posse não pode regredir a etapa que a
  // qualificação acabou de dar.
  async function qualificarComoWebhook(lead: string, alvo: string) {
    await comoServiceRole(c);
    const args = [lead, alvo, "Qualificação do discador (3C Plus): Agendou", "Retomar contato"];
    const q = `SELECT public.transicionar_lead($1, $2::public.lead_status, $3, $4)`;
    const direto = await errCode(c.query(q, args));
    if (direto === null) return "direto";
    await c.query(q, [lead, "em_atendimento", args[2], args[3]]);
    await c.query(q, args);
    return "via_em_atendimento";
  }

  it.each([
    ["novo", "via_em_atendimento"],
    ["perdido", "via_em_atendimento"],
  ])(
    "lead sem dono em %s: qualificado para agendado e então assumido — fica em agendado",
    async (status, caminho) => {
      // `perdido` exige motivo_perda_categoria no INSERT: nasce vivo e cai
      // como dado histórico (mesmo padrão de bolsao.test.ts).
      const lead = await criarLead(c, { status: "novo" });
      if (status !== "novo") {
        await comoSuperuser(c);
        await c.query(`SET session_replication_role = replica`);
        await c.query(
          `UPDATE public.leads
              SET status = $2::public.lead_status, motivo_perda_categoria = 'sem_contato'
            WHERE id = $1`,
          [lead, status],
        );
        await c.query(`SET session_replication_role = DEFAULT`);
      }
      expect(await atender(lead, corretorA.id, null)).toMatchObject({
        ok: true,
        motivo: "atendido",
      });
      expect(await qualificarComoWebhook(lead, "agendado")).toBe(caminho);

      await comoServiceRole(c);
      const r = await c.query(
        `SELECT public.discador_bolsao_assumir_v1($1, $2, 'Discador 3C Plus: avançou para agendado') AS r`,
        [lead, corretorA.id],
      );
      expect(r.rows[0].r).toMatchObject({
        ok: true,
        motivo: "assumido",
        status_anterior: "agendado",
      });

      await comoSuperuser(c);
      const l = await c.query(`SELECT corretor_id, status FROM public.leads WHERE id = $1`, [lead]);
      expect(l.rows[0]).toMatchObject({ corretor_id: corretorA.id, status: "agendado" });
      const a = await c.query(
        `SELECT encerrado_motivo FROM public.discador_atendimentos WHERE lead_id = $1`,
        [lead],
      );
      expect(a.rows).toEqual([{ encerrado_motivo: "posse_propria" }]);
    },
  );
});

describe("configuração", () => {
  it("posse a partir de agendado; a posse-ao-atender saiu", async () => {
    await comoSuperuser(c);
    const r = await c.query(`SELECT valor FROM public.gestao_config WHERE chave = 'bolsao'`);
    const valor = r.rows[0].valor as Record<string, unknown>;
    expect(valor.discador_posse_a_partir_de).toEqual([
      "agendado",
      "visita_realizada",
      "proposta_enviada",
      "analise_credito",
    ]);
    expect(valor).not.toHaveProperty("discador_assume_ao_atender");
  });
});
