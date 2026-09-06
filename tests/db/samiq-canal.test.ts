/**
 * SAMIQ CANAL — Onda S4 (migration 20260909100000_samiq_copiloto_s4.sql).
 *
 * Cobre no Postgres real:
 *   - samiq_reservar_execucao com _canal: grava o canal na execução, aceita a
 *     chamada antiga (sem _canal → 'painel') e rejeita canal desconhecido;
 *   - samiq_gravar_turno com _canal: a conversa nasce no canal certo, a
 *     chamada antiga continua válida e a retomada por canal tem índice;
 *   - as assinaturas antigas saíram (sem overload ambíguo no PostgREST).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  criarEquipe,
  criarUsuario,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let corretor: UsuarioTeste;

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  const equipe = await criarEquipe(c);
  corretor = await criarUsuario(c, { papel: "corretor", equipeId: equipe });
  await comoSuperuser(c);
  await c.query(`DELETE FROM public.samiq_execucoes`);
  await c.query(`DELETE FROM public.samiq_conversas`);
});

afterAll(async () => {
  await comoSuperuser(c);
  await c.end();
});

describe("reserva com canal", () => {
  it("grava 'whatsapp' quando pedido, 'painel' na chamada antiga, e recusa canal inválido", async () => {
    await comoSuperuser(c);
    const wa = await c.query(
      `SELECT execution_id, allowed FROM public.samiq_reservar_execucao($1, 'pergunta_livre', 1000, NULL, 'whatsapp')`,
      [corretor.id],
    );
    expect(wa.rows[0].allowed).toBe(true);
    const antiga = await c.query(
      `SELECT execution_id, allowed FROM public.samiq_reservar_execucao($1, 'pergunta_livre', 1000)`,
      [corretor.id],
    );
    expect(antiga.rows[0].allowed).toBe(true);

    const canais = await c.query(
      `SELECT id, canal FROM public.samiq_execucoes WHERE id = ANY($1::uuid[]) ORDER BY canal`,
      [[wa.rows[0].execution_id, antiga.rows[0].execution_id]],
    );
    expect(canais.rows.map((r) => r.canal)).toEqual(["painel", "whatsapp"]);

    await expect(
      c.query(
        `SELECT * FROM public.samiq_reservar_execucao($1, 'pergunta_livre', 1000, NULL, 'telegram')`,
        [corretor.id],
      ),
    ).rejects.toMatchObject({ code: "22023" });
  });

  it("só existe a assinatura nova (5 parâmetros) — sem overload para o PostgREST", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT pg_get_function_identity_arguments(oid) AS args
         FROM pg_proc WHERE proname = 'samiq_reservar_execucao' AND pronamespace = 'public'::regnamespace`,
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].args).toMatch(/_canal text$/);
  });
});

describe("memória com canal", () => {
  it("a conversa nasce no canal pedido; a chamada antiga cai em 'painel'; canal inválido é recusado", async () => {
    await comoSuperuser(c);
    const wa = await c.query(
      `SELECT public.samiq_gravar_turno($1, NULL, NULL, 'Falei com a Maria', 'Preparei o registro', '{}', NULL, 'whatsapp') AS id`,
      [corretor.id],
    );
    const painel = await c.query(
      `SELECT public.samiq_gravar_turno($1, NULL, NULL, 'Quem tem visita hoje?', 'Ninguém', '{}', NULL) AS id`,
      [corretor.id],
    );
    const conversas = await c.query(
      `SELECT id, canal, titulo FROM public.samiq_conversas WHERE user_id = $1 ORDER BY canal`,
      [corretor.id],
    );
    expect(conversas.rows).toEqual([
      { id: painel.rows[0].id, canal: "painel", titulo: "Quem tem visita hoje?" },
      { id: wa.rows[0].id, canal: "whatsapp", titulo: "Falei com a Maria" },
    ]);

    // Continuar a conversa mantém o canal (o parâmetro só vale para a criação).
    const mesma = await c.query(
      `SELECT public.samiq_gravar_turno($1, $2, NULL, 'Confirmar', 'Registrei 1 item', '{}', NULL, 'whatsapp') AS id`,
      [corretor.id, wa.rows[0].id],
    );
    expect(mesma.rows[0].id).toBe(wa.rows[0].id);
    const msgs = await c.query(
      `SELECT count(*)::int AS n FROM public.samiq_conversa_mensagens WHERE conversa_id = $1`,
      [wa.rows[0].id],
    );
    expect(msgs.rows[0].n).toBe(4);

    await expect(
      c.query(`SELECT public.samiq_gravar_turno($1, NULL, NULL, 'x', 'y', '{}', NULL, 'sms')`, [
        corretor.id,
      ]),
    ).rejects.toMatchObject({ code: "22023" });
  });

  it("índice de retomada por canal existe e a assinatura antiga saiu", async () => {
    await comoSuperuser(c);
    const idx = await c.query(
      `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'samiq_conversas_user_canal_recentes_idx'`,
    );
    expect(idx.rowCount).toBe(1);
    const fn = await c.query(
      `SELECT pg_get_function_identity_arguments(oid) AS args
         FROM pg_proc WHERE proname = 'samiq_gravar_turno' AND pronamespace = 'public'::regnamespace`,
    );
    expect(fn.rows).toHaveLength(1);
    expect(fn.rows[0].args).toMatch(/_canal text$/);
  });
});
