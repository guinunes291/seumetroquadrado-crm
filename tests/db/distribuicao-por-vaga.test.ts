/**
 * distribuir_estoque_roleta com limite por VAGA (migration 20260913120100).
 *
 * Medido em 13/09/2026: todos os 49 corretores têm `limite_diario_leads = 50`
 * e o teto de carteira é 65 — os dois números brigam, e enquanto a roleta
 * olhar só a cota diária o teto de carteira é decorativo.
 *
 * Por que a distribuição é chamada como SUPERUSER e não como admin: em
 * produção quem a dispara é o cron (`distribuir-estoque-plantao`), onde o
 * papel da sessão não é `authenticated` e o guard de transição de status
 * libera a passagem. Chamada por um admin autenticado — o botão "escoar
 * estoque" da Central de Distribuição — ela estoura em
 * `status do lead só pode ser alterado por transicionar_lead` para lead em
 * `aguardando_corretor`, porque `_distribuir_lead_v3` só promove status
 * quando ele era `novo` e o UPDATE seguinte já encontra `corretor_id`
 * preenchido. Isso é ANTERIOR a esta migration (reproduzido contra
 * 20260908195600) e não é assunto deste arquivo — mas está anotado aqui
 * para a próxima pessoa não achar que a mudança por vaga causou o erro.
 *
 * O caso que este arquivo existe para travar: **corretor sem vaga é PULADO,
 * não encerra a rodada.** O laço original sai com `EXIT WHEN _entregues = 0`
 * para detectar estoque vazio; se a carteira cheia caísse nesse mesmo EXIT,
 * um corretor com 70 leads no fundo — que aparece cedo na ordem da roleta,
 * porque está há mais tempo sem receber — travaria a distribuição de todo
 * mundo depois dele.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarLead,
  criarUsuario,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let admin: UsuarioTeste;
let cheio: UsuarioTeste; // carteira estourada, primeiro na fila da roleta
let vazio: UsuarioTeste; // carteira vazia, depois dele
let novato: UsuarioTeste; // carteira vazia, reservado para o teste do cap de entrada

async function carteira(id: string): Promise<number> {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT count(*)::int AS n FROM public.leads
      WHERE corretor_id = $1 AND deleted_at IS NULL AND na_lixeira = false
        AND status NOT IN ('perdido','contrato_fechado','pos_venda')`,
    [id],
  );
  return r.rows[0].n as number;
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);

  admin = await criarUsuario(c, { nome: "Admin Vaga", papel: "admin" });
  cheio = await criarUsuario(c, { nome: "Corretor Cheio Vaga", papel: "corretor" });
  vazio = await criarUsuario(c, { nome: "Corretor Vazio Vaga", papel: "corretor" });
  novato = await criarUsuario(c, { nome: "Corretor Novato Vaga", papel: "corretor" });

  // `_elegibilidade_roleta` exige telefone no perfil (o motivo `sem_telefone`
  // deixa o corretor inapto e fora do laço da distribuição).
  await comoSuperuser(c);
  await c.query(`UPDATE public.profiles SET telefone = '11999990000' WHERE id = ANY($1::uuid[])`, [
    [cheio.id, vazio.id, novato.id],
  ]);

  await comoUsuario(c, admin.id);
  for (const u of [cheio, vazio, novato]) {
    await c.query(`SELECT public.gerenciar_participante_roleta('plantao', $1::uuid, 'incluir')`, [
      u.id,
    ]);
  }
  for (const u of [cheio, vazio, novato]) {
    await comoUsuario(c, u.id);
    await c.query(`SELECT public.marcar_presenca(true)`);
  }

  // O corretor cheio aparece PRIMEIRO na roleta (há mais tempo sem receber) —
  // é exatamente essa ordem que tornava o bug do EXIT fatal.
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.roleta_participantes rp
        SET ultimo_lead_em = CASE rp.corretor_id
              WHEN $1::uuid THEN now() - interval '5 hours'
              ELSE now() - interval '1 hour' END
       FROM public.roletas r
      WHERE r.id = rp.roleta_id AND r.slug = 'plantao'`,
    [cheio.id],
  );

  // Carteira estourada: 70 leads no fundo do funil, teto 65.
  for (let i = 1; i <= 70; i++) {
    const l = await criarLead(c, { corretorId: cheio.id, status: "analise_credito" });
    await c.query(
      `UPDATE public.leads SET ultima_interacao = now() - make_interval(days => $2) WHERE id = $1`,
      [l, i],
    );
  }

  // Estoque à espera da roleta.
  for (let i = 1; i <= 8; i++) {
    const l = await criarLead(c, { corretorId: null, status: "novo" });
    await c.query(`UPDATE public.leads SET status = 'aguardando_corretor' WHERE id = $1`, [l]);
  }

  await comoSuperuser(c);
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

describe("distribuir_estoque_roleta — limite por vaga", () => {
  it("não entrega para quem está sem vaga, e não trava a rodada para os demais", async () => {
    const antesCheio = await carteira(cheio.id);
    const antesVazio = await carteira(vazio.id);
    expect(antesCheio).toBe(70);
    expect(antesVazio).toBe(0);

    // Como o cron roda (ver o cabeçalho): sessão não-authenticated.
    await comoSuperuser(c);
    const r = await c.query(`SELECT public.distribuir_estoque_roleta('plantao', 30) AS out`);
    const out = r.rows[0].out;

    expect(out.ok).toBe(true);
    expect(out.corretores_sem_vaga).toBe(1);
    // A prova de que o EXIT não matou a rodada: quem vinha DEPOIS do
    // corretor cheio recebeu o estoque inteiro.
    expect(out.distribuidos).toBe(8);
    expect(await carteira(cheio.id)).toBe(70);
    expect(await carteira(vazio.id)).toBe(8);
  });

  it("a roleta para no cap da FORMAÇÃO, não no teto — e quem entra não ocupa os 65", async () => {
    // `novato` tem a carteira zerada: 65 vagas globais e 20 de formação
    // (cap_formacao, herdado de cap_sla). Com 100 leads de estoque e lote de
    // 200, a porta fecha em 20: é quanto a cadência consegue trabalhar ao
    // mesmo tempo. Desde 20260925120000 esses 20 estão na BASE EM FORMAÇÃO
    // (D1), não na carteira — os 65 continuam inteiros para o que avançar.
    await comoSuperuser(c);
    for (let i = 1; i <= 100; i++) {
      const l = await criarLead(c, { corretorId: null, status: "novo" });
      await c.query(`UPDATE public.leads SET status = 'aguardando_corretor' WHERE id = $1`, [l]);
    }

    const antes = await c.query(`SELECT public.carteira_vagas_entrada_v1($1)::int AS v`, [
      novato.id,
    ]);
    expect(antes.rows[0].v).toBe(20);

    await c.query(`SELECT public.distribuir_estoque_roleta('plantao', 200)`);

    expect(await carteira(novato.id)).toBe(20);

    const entrada = await c.query(`SELECT public.carteira_vagas_entrada_v1($1)::int AS v`, [
      novato.id,
    ]);
    expect(entrada.rows[0].v).toBe(0);

    // A carteira de 65 não foi tocada: lead recém-chegado não é carteira. Até
    // 20260925120000 isto dava 45 — o lead que ninguém ainda tinha
    // conseguido falar ocupava vaga de quem já está em negociação.
    const global = await c.query(`SELECT public.carteira_vagas_v1($1)::int AS v`, [novato.id]);
    expect(global.rows[0].v).toBe(65);

    const formacao = await c.query(
      `SELECT count(*)::int AS n FROM public._carteira_classificar($1) WHERE faixa = 'formacao'`,
      [novato.id],
    );
    expect(formacao.rows[0].n).toBe(20);

    // E nenhum dos leads entregues caiu na Reserva.
    const reserva = await c.query(
      `SELECT count(*)::int AS n FROM public._carteira_classificar($1)
        WHERE NOT ativa AND faixa <> 'formacao'`,
      [novato.id],
    );
    expect(reserva.rows[0].n).toBe(0);
  });
});
