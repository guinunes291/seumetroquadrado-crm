/**
 * BASE EM FORMAÇÃO (migration 20260925120000).
 *
 * Decisão do dono (22/09/2026): "a carteira de 65 deve ter apenas leads
 * avançados e realmente tratados; os toques de cadência entram numa base em
 * formação; vai para os 65 só o que avançar de fase ou agendar para frente."
 *
 * O que está em jogo, na ordem em que quebraria a operação:
 *
 *  1. O LEAD QUE AVANÇOU POR FORA DO BOTÃO NÃO PODE IR PARA A ROLETA. Antes
 *     desta migration, agendar a visita pela ficha deixava o lead em cadência; o
 *     prazo vencia e `cadencia_vencidos` tirava o corretor e voltava o status
 *     para `aguardando_corretor` — apagando o agendamento. Cada teste de saída
 *     roda o motor de vencidos DEPOIS, com um lead de controle que não avançou
 *     e É devolvido: sem o controle, "não devolveu" poderia ser só "o motor
 *     não rodou".
 *  2. A régua de devolução não toca lead em formação (a cadência é a dona).
 *  3. Formação fora dos 65, fora da Reserva, e a porta de entrada é dela.
 *  4. A Fase 0 entra pela vaga da formação, nunca passa da metade dela, e
 *     para quando a carteira de 65 está cheia.
 *  5. As telas do gestor não acusam "sem próximo passo" quem está em formação.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
let corretor: UsuarioTeste;

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
});

afterAll(async () => {
  await comoSuperuser(c);
  await c.query(`UPDATE public.cadencia_config SET modo = 'sombra' WHERE id = 1`);
  await limparDados(c);
  await c.end();
});

beforeEach(async () => {
  await limparDados(c);
  await comoSuperuser(c);
  await c.query(`UPDATE public.cadencia_config SET modo = 'ativo' WHERE id = 1`);
  admin = await criarUsuario(c, { nome: "Admin Formação", papel: "admin" });
  corretor = await criarUsuario(c, { nome: "Corretor Formação", papel: "corretor" });
});

/** Lead recém-chegado: o gatilho de atribuição o põe em Lead chegou (D0). */
async function leadRecemChegado(status = "aguardando_atendimento", corretorId?: string) {
  const id = await criarLead(c, { corretorId: corretorId ?? corretor.id, status });
  await comoSuperuser(c);
  const r = await c.query(`SELECT cadencia_etapa FROM public.leads WHERE id = $1`, [id]);
  expect(r.rows[0].cadencia_etapa).toBe("D0");
  return id;
}

/** Prazo da etapa vencido além da tolerância: candidato do motor de vencidos. */
async function vencerPrazo(id: string) {
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.leads SET cadencia_prazo_ts = now() - interval '3 days' WHERE id = $1`,
    [id],
  );
}

async function lead(id: string) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT cadencia_etapa, corretor_id, status::text AS status FROM public.leads WHERE id = $1`,
    [id],
  );
  return r.rows[0] as { cadencia_etapa: string | null; corretor_id: string | null; status: string };
}

async function eventoSaida(id: string) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT payload->>'de_estado' AS de, payload->>'para_estado' AS para, payload->>'via' AS via
       FROM public.lead_eventos
      WHERE lead_id = $1 AND tipo = 'cadencia_etapa'
      ORDER BY created_at DESC LIMIT 1`,
    [id],
  );
  return r.rows[0] as { de: string; para: string; via: string } | undefined;
}

async function tarefa(id: string, venc: string, automatica = false) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.tarefas
       (lead_id, corretor_id, titulo, tipo, status, prioridade, data_vencimento, origem_automatica)
     VALUES ($1, $2, 'Retornar', 'follow_up', 'pendente', 'media', now() + $3::interval, $4)`,
    [id, corretor.id, venc, automatica],
  );
}

async function rodarVencidos() {
  await comoSuperuser(c);
  await c.query(`SELECT * FROM public.cadencia_vencidos('ativo')`);
}

// ---------------------------------------------------------------------------
// 1. As portas de saída — e o motor de vencidos respeitando cada uma
// ---------------------------------------------------------------------------

describe("saída da formação quando o lead avança por fora do botão", () => {
  it("visita agendada pela ficha: sai da cadência e o motor de vencidos NÃO a manda para a roleta", async () => {
    const avancou = await leadRecemChegado();
    const controle = await leadRecemChegado();
    await vencerPrazo(avancou);
    await vencerPrazo(controle);

    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET status = 'agendado' WHERE id = $1`, [avancou]);
    expect(await eventoSaida(avancou)).toEqual({ de: "D0", para: "respondeu", via: "status" });

    await rodarVencidos();

    // O que avançou fica com o corretor, agendado.
    expect(await lead(avancou)).toEqual({
      cadencia_etapa: "respondeu",
      corretor_id: corretor.id,
      status: "agendado",
    });
    // O controle prova que o motor rodou: este sim foi devolvido.
    const ctl = await lead(controle);
    expect(ctl.corretor_id).toBeNull();
    expect(ctl.status).toBe("aguardando_corretor");
  });

  it("de novo para em_atendimento pela ficha é avançar de fase", async () => {
    const id = await leadRecemChegado("novo");
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET status = 'em_atendimento' WHERE id = $1`, [id]);
    expect((await lead(id)).cadencia_etapa).toBe("respondeu");
  });

  it("voltar para prospecção NÃO é avanço (é redistribuição, e a etapa é de quem redistribui)", async () => {
    const id = await leadRecemChegado("novo");
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET status = 'aguardando_atendimento' WHERE id = $1`, [id]);
    expect((await lead(id)).cadencia_etapa).toBe("D0");
  });

  it("estoque em em_atendimento admitido de propósito continua na cadência", async () => {
    // O ESTADO em_atendimento não é avanço — a Fase 0 põe esse estoque na
    // cadência. Só a TRANSIÇÃO para ele é.
    const id = await leadRecemChegado("em_atendimento");
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads SET ultima_interacao = now() - interval '1 hour' WHERE id = $1`,
      [id],
    );
    expect((await lead(id)).cadencia_etapa).toBe("D0");
  });

  it("perda marcada pela ficha encerra a cadência sem contar como resposta, e ninguém a ressuscita", async () => {
    const id = await leadRecemChegado();
    await vencerPrazo(id);
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads SET status = 'perdido', motivo_perda_categoria = 'outro' WHERE id = $1`,
      [id],
    );
    expect(await eventoSaida(id)).toEqual({ de: "D0", para: "encerrado", via: "status" });

    await rodarVencidos();
    // `_cadencia_devolver_roleta` poria `aguardando_corretor` num lead perdido.
    expect((await lead(id)).status).toBe("perdido");
  });

  it("tarefa humana com data futura é agendar para frente — e o painel conta como resposta", async () => {
    const id = await leadRecemChegado();
    const controle = await leadRecemChegado();
    await vencerPrazo(id);
    await vencerPrazo(controle);
    await tarefa(id, "2 days");

    expect(await eventoSaida(id)).toEqual({ de: "D0", para: "respondeu", via: "tarefa" });
    // A saída NÃO muda o status: só o corretor sabe em que ponto da venda o
    // lead está. O botão muda porque ali ele DECLAROU a resposta.
    expect((await lead(id)).status).toBe("aguardando_atendimento");

    await rodarVencidos();
    expect((await lead(id)).corretor_id).toBe(corretor.id);
    expect((await lead(controle)).corretor_id).toBeNull();
  });

  it("tarefa AUTOMÁTICA não tira da formação — nem pela tarefa, nem pelo espelho", async () => {
    // O espelho `proximo_followup` é preenchido por `sync_proximo_followup` a
    // partir dela. Se o gatilho de leads lesse o espelho sem olhar a origem,
    // a exceção entraria pela porta dos fundos.
    const id = await leadRecemChegado();
    await tarefa(id, "1 day", true);
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT proximo_followup > now() AS espelho FROM public.leads WHERE id = $1`,
      [id],
    );
    expect(r.rows[0].espelho).toBe(true);
    expect((await lead(id)).cadencia_etapa).toBe("D0");
  });

  it("tarefa vencida (dívida) não é passo e não tira da formação", async () => {
    const id = await leadRecemChegado();
    await tarefa(id, "-2 days");
    expect((await lead(id)).cadencia_etapa).toBe("D0");
  });

  it("agendamento futuro tira da formação", async () => {
    const id = await leadRecemChegado();
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.agendamentos (lead_id, corretor_id, titulo, data_inicio, data_fim)
       VALUES ($1, $2, 'Ligação marcada', now() + interval '1 day', now() + interval '1 day 30 min')`,
      [id, corretor.id],
    );
    expect(await eventoSaida(id)).toEqual({ de: "D0", para: "respondeu", via: "agendamento" });
  });

  it("próximo passo escrito direto no lead (como transicionar_lead faz) tira da formação", async () => {
    const id = await leadRecemChegado();
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads SET proximo_followup = now() + interval '2 days' WHERE id = $1`,
      [id],
    );
    expect(await eventoSaida(id)).toEqual({ de: "D0", para: "respondeu", via: "proximo_passo" });
  });

  it("o botão continua dono da própria saída: nenhum evento duplicado", async () => {
    const id = await leadRecemChegado();
    await comoUsuario(c, corretor.id);
    await c.query(
      `SELECT public.cadencia_marcar_respondeu($1, 'Visitar decorado', now() + interval '2 days')`,
      [id],
    );
    await comoSuperuser(c);
    // A tarefa que o botão cria dispara o gatilho de tarefas — que encontra o
    // lead já fora de D0 e não faz nada.
    const r = await c.query(
      `SELECT count(*)::int AS n FROM public.lead_eventos
        WHERE lead_id = $1 AND tipo = 'cadencia_etapa'`,
      [id],
    );
    expect(r.rows[0].n).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. A régua de devolução não toca a formação
// ---------------------------------------------------------------------------

describe("régua de devolução", () => {
  it("lead de estoque admitido em Lead chegou, antes do primeiro toque, não é candidato", async () => {
    // O caso reproduzido antes da migration: relógio de 20 dias, sem passo
    // (a cadência não escreve passo, por desenho) — era candidato 'sem_passo'.
    const id = await criarLead(c, { corretorId: corretor.id, status: "aguardando_atendimento" });
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads
          SET origem = 'importacao', ultimo_contato = NULL,
              ultima_interacao = now() - interval '20 days'
        WHERE id = $1`,
      [id],
    );
    expect((await lead(id)).cadencia_etapa).toBe("D0");
    const em = await c.query(
      `SELECT 1 FROM public.regua_devolucao_candidatos_v1() WHERE lead_id = $1`,
      [id],
    );
    expect(em.rows).toHaveLength(0);

    // Fora da cadência, o mesmo lead volta a ser avaliado normalmente.
    await c.query(
      `UPDATE public.leads SET cadencia_etapa = NULL, cadencia_prazo_ts = NULL WHERE id = $1`,
      [id],
    );
    const fora = await c.query(
      `SELECT motivo FROM public.regua_devolucao_candidatos_v1() WHERE lead_id = $1`,
      [id],
    );
    expect(fora.rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Admissão da Fase 0 pela vaga da formação
// ---------------------------------------------------------------------------

/** Estoque que a Fase 0 manda para a cadência: com dono, fora dela, parado há 10 dias. */
async function estoque(n: number, dono: string) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = await criarLead(c, { corretorId: dono, status: "em_atendimento" });
    ids.push(id);
  }
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.leads
        SET cadencia_etapa = NULL, cadencia_prazo_ts = NULL, cadencia_inicio_ts = NULL,
            ultimo_contato = NULL,
            ultima_interacao = now() - interval '10 days' - (random() * interval '1 hour')
      WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  return ids;
}

async function admitir(lote = 15) {
  await comoSuperuser(c);
  const r = await c.query(`SELECT * FROM public.cadencia_fase0_admitir('ativo', $1)`, [lote]);
  return r.rows[0].admitidos as number;
}

describe("Fase 0 pela vaga da formação", () => {
  it("o estoque nunca passa da metade da formação: com lote 15 entram 10", async () => {
    await estoque(12, corretor.id);
    expect(await admitir(15)).toBe(10);
  });

  it("lead novo já em formação come a parte do estoque: com 4 frescos, entram 6", async () => {
    for (let i = 0; i < 4; i++) await leadRecemChegado();
    await estoque(12, corretor.id);
    expect(await admitir(15)).toBe(6);
  });

  it("carteira de 65 cheia: não admite nada — a resposta não teria vaga", async () => {
    await comoSuperuser(c);
    for (let i = 0; i < 65; i++) {
      await criarLead(c, { corretorId: corretor.id, status: "analise_credito" });
    }
    await estoque(5, corretor.id);
    expect(await admitir(15)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. As telas do gestor
// ---------------------------------------------------------------------------

describe("telas do gestor não acusam a formação", () => {
  it("fila_equipe_v1 e carteira_stats: em formação não é 'sem próximo passo' nem carteira ativa", async () => {
    // Estoque admitido: status em_atendimento, tocado hoje, em D0 — o caso que
    // carteira_stats contava como "ativo" e "sem passo vivo".
    const [id] = await estoque(1, corretor.id);
    await comoSuperuser(c);
    await c.query(`SELECT public.cadencia_iniciar($1)`, [id]);
    await c.query(`UPDATE public.leads SET ultima_interacao = now() WHERE id = $1`, [id]);
    expect((await lead(id)).cadencia_etapa).toBe("D0");

    await comoUsuario(c, admin.id);
    const eq = await c.query(`SELECT * FROM public.fila_equipe_v1()`);
    const st = await c.query(`SELECT * FROM public.carteira_stats_por_corretor_v1()`);
    await comoSuperuser(c);
    const linhaEq = eq.rows.find((r) => r.corretor_id === corretor.id);
    const linhaSt = st.rows.find((r) => r.corretor_id === corretor.id);
    expect(Number(linhaEq.sem_proximo_passo)).toBe(0);
    expect(Number(linhaSt.sem_passo_vivo)).toBe(0);
    expect(Number(linhaSt.ativa)).toBe(0);
    expect(Number(linhaSt.prospeccao)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5. A correção dos que já tinham avançado antes da migration
// ---------------------------------------------------------------------------

describe("cadencia_corrigir_avancados", () => {
  it("tira da formação quem já estava avançado, e deixa o estoque em em_atendimento", async () => {
    const agendado = await leadRecemChegado();
    const comTarefa = await leadRecemChegado();
    const estoqueParado = await leadRecemChegado("em_atendimento");
    // O estado de ANTES da migration: avançado e ainda em D0. Os gatilhos
    // ficam desligados para montá-lo — é exatamente o que eles impediriam.
    await comoSuperuser(c);
    await c.query(`SET session_replication_role = replica`);
    await c.query(`UPDATE public.leads SET status = 'agendado' WHERE id = $1`, [agendado]);
    await c.query(
      `INSERT INTO public.tarefas (lead_id, corretor_id, titulo, tipo, status, prioridade, data_vencimento)
       VALUES ($1, $2, 'Retornar', 'follow_up', 'pendente', 'media', now() + interval '1 day')`,
      [comTarefa, corretor.id],
    );
    await c.query(`SET session_replication_role = DEFAULT`);

    const r = await c.query(`SELECT * FROM public.cadencia_corrigir_avancados()`);
    expect(r.rows[0]).toEqual({ por_status: 1, por_passo: 1 });
    expect((await lead(agendado)).cadencia_etapa).toBe("respondeu");
    expect((await lead(comTarefa)).cadencia_etapa).toBe("respondeu");
    expect((await lead(estoqueParado)).cadencia_etapa).toBe("D0");

    // Idempotente: rodar de novo não acha ninguém.
    const again = await c.query(`SELECT * FROM public.cadencia_corrigir_avancados()`);
    expect(again.rows[0]).toEqual({ por_status: 0, por_passo: 0 });
  });

  it("corretor não roda a correção", async () => {
    await comoUsuario(c, corretor.id);
    await expect(c.query(`SELECT * FROM public.cadencia_corrigir_avancados()`)).rejects.toThrow(
      /apenas admin/,
    );
    await comoSuperuser(c);
  });
});
