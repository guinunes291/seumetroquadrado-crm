/**
 * SAMIQ PRESENÇA — Onda S3 (migration 20260908100000_samiq_copiloto_s3.sql).
 *
 * Cobre no Postgres real:
 *   - samiq_gerar_briefing_alertas: um alerta por corretor por dia, só para
 *     quem tem pauta (visitas hoje / sem confirmar / follow-ups vencidos /
 *     esfriando), com a mensagem montada a partir das contagens e dedup no
 *     dia de São Paulo;
 *   - trg_samiq_alerta_credito_reprovado: análise que volta 'reprovada' gera
 *     um alerta para o corretor, uma vez por análise, com link do dossiê.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  criarEquipe,
  criarLead,
  criarUsuario,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let equipe: string;
let corretorA: UsuarioTeste;
let corretorB: UsuarioTeste;
let leadA: string;

/** Instante no dia de São Paulo de hoje (+ dias) numa hora fixa. */
const spHoje = (dias: number, hora: number) =>
  `(((now() AT TIME ZONE 'America/Sao_Paulo')::date + ${dias})::timestamp + interval '${hora} hours') AT TIME ZONE 'America/Sao_Paulo'`;

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await c.query(`DELETE FROM public.alertas`);
  equipe = await criarEquipe(c);
  corretorA = await criarUsuario(c, { papel: "corretor", equipeId: equipe });
  corretorB = await criarUsuario(c, { papel: "corretor", equipeId: equipe });
  leadA = await criarLead(c, {
    corretorId: corretorA.id,
    nome: "Maria da Silva",
    status: "em_atendimento",
  });
});

afterAll(async () => {
  await comoSuperuser(c);
  await c.end();
});

describe("alerta diário da Sami", () => {
  it("monta a mensagem com as contagens do corretor e ignora quem não tem pauta", async () => {
    await comoSuperuser(c);
    // A: visita HOJE sem confirmar + visita AMANHÃ confirmada + follow-up vencido + lead esfriando.
    await c.query(
      `INSERT INTO public.agendamentos (lead_id, corretor_id, criado_por_id, tipo, status, titulo, data_inicio, data_fim, timezone)
       VALUES ($1, $2, $2, 'visita', 'agendado', 'Visita hoje', ${spHoje(0, 23)}, ${spHoje(0, 23)} + interval '1 hour', 'America/Sao_Paulo'),
              ($1, $2, $2, 'visita', 'confirmado', 'Visita amanhã', ${spHoje(1, 10)}, ${spHoje(1, 11)}, 'America/Sao_Paulo')`,
      [leadA, corretorA.id],
    );
    await c.query(
      `INSERT INTO public.tarefas (titulo, tipo, status, prioridade, lead_id, corretor_id, criado_por, data_vencimento)
       VALUES ('Follow-up com Maria', 'follow_up', 'pendente', 'media', $1, $2, $2, now() - interval '1 day')`,
      [leadA, corretorA.id],
    );
    await c.query(
      `UPDATE public.leads SET temperatura = 'quente', ultima_interacao = now() - interval '4 days' WHERE id = $1`,
      [leadA],
    );

    const primeira = await c.query(`SELECT public.samiq_gerar_briefing_alertas() AS n`);
    expect(primeira.rows[0].n).toBe(1);

    const alertas = await c.query(
      `SELECT user_id, tipo, titulo, mensagem, link FROM public.alertas WHERE titulo LIKE 'Sami: seu dia%' ORDER BY created_at`,
    );
    expect(alertas.rows).toHaveLength(1);
    expect(alertas.rows[0]).toMatchObject({
      user_id: corretorA.id,
      tipo: "sistema",
      link: "/atendimento",
    });
    expect(alertas.rows[0].titulo).toMatch(/^Sami: seu dia \d{2}\/\d{2}$/);
    expect(alertas.rows[0].mensagem).toBe(
      "1 visita hoje · 1 visita sem confirmar · 1 follow-up vencido · 1 cliente esfriando. Abra a Sami para ver por quem começar.",
    );
    const deB = await c.query(`SELECT 1 FROM public.alertas WHERE user_id = $1`, [corretorB.id]);
    expect(deB.rowCount).toBe(0);
  });

  it("segunda rodada no mesmo dia não duplica", async () => {
    await comoSuperuser(c);
    const segunda = await c.query(`SELECT public.samiq_gerar_briefing_alertas() AS n`);
    expect(segunda.rows[0].n).toBe(0);
    const total = await c.query(
      `SELECT count(*)::int AS n FROM public.alertas WHERE titulo LIKE 'Sami: seu dia%'`,
    );
    expect(total.rows[0].n).toBe(1);
  });
});

describe("crédito reprovado", () => {
  it("análise reprovada avisa o corretor uma vez, com link do dossiê; aprovada não avisa", async () => {
    await comoSuperuser(c);
    const rep = await c.query(
      `INSERT INTO public.analises_credito (lead_id, corretor_id, status) VALUES ($1, $2, 'reprovada') RETURNING id`,
      [leadA, corretorA.id],
    );
    const analiseId = rep.rows[0].id as string;
    const alerta = await c.query(
      `SELECT user_id, titulo, link, ref_id FROM public.alertas WHERE titulo LIKE 'Crédito reprovado:%'`,
    );
    expect(alerta.rows).toEqual([
      {
        user_id: corretorA.id,
        titulo: "Crédito reprovado: Maria da Silva",
        link: `/leads/${leadA}`,
        ref_id: analiseId,
      },
    ]);

    // Mesma análise "reprovada" de novo (update sem mudança) não repete o aviso.
    await c.query(`UPDATE public.analises_credito SET observacoes = 'x' WHERE id = $1`, [
      analiseId,
    ]);
    await c.query(`UPDATE public.analises_credito SET status = 'reprovada' WHERE id = $1`, [
      analiseId,
    ]);
    const repetidos = await c.query(
      `SELECT count(*)::int AS n FROM public.alertas WHERE titulo LIKE 'Crédito reprovado:%'`,
    );
    expect(repetidos.rows[0].n).toBe(1);

    // Aprovada → nada; depois vira reprovada → avisa (outra análise, outro ref_id).
    const ap = await c.query(
      `INSERT INTO public.analises_credito (lead_id, corretor_id, status) VALUES ($1, $2, 'aprovada') RETURNING id`,
      [leadA, corretorA.id],
    );
    expect(
      (
        await c.query(
          `SELECT count(*)::int AS n FROM public.alertas WHERE titulo LIKE 'Crédito reprovado:%'`,
        )
      ).rows[0].n,
    ).toBe(1);
    await c.query(`UPDATE public.analises_credito SET status = 'reprovada' WHERE id = $1`, [
      ap.rows[0].id,
    ]);
    expect(
      (
        await c.query(
          `SELECT count(*)::int AS n FROM public.alertas WHERE titulo LIKE 'Crédito reprovado:%'`,
        )
      ).rows[0].n,
    ).toBe(2);
  });
});
