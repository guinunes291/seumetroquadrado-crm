/**
 * `lead_sem_proximo_passo` (migration 20260914190000).
 *
 * A regra antiga perguntava "existe tarefa pendente?" sem olhar o vencimento.
 * Uma tarefa que venceu há 40 dias e ninguém fechou continua `pendente` — e
 * fazia o lead contar como "tem próximo passo". Isso não é próximo passo, é
 * dívida.
 *
 * Medido em produção em 14/09/2026, nos quatro corretores acima do teto: 444
 * leads em tratativa, 567 tarefas abertas JÁ VENCIDAS, atraso máximo de 88
 * dias — e só 79 leads com algo marcado adiante. Com a regra antiga, 365
 * apareciam como "com próximo passo" e a tela de equipe mostrava time em dia.
 *
 * `proximo_followup` ficou FORA da conta de propósito: ele é um espelho de
 * `min(data_vencimento)` das tarefas pendentes, ou seja, aponta para a dívida
 * mais velha. Usá-lo aqui seria herdar o mesmo defeito por outra porta.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  comGestaoConfig,
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
const leads: Record<string, string> = {};

async function semPasso(id: string): Promise<boolean> {
  await comoSuperuser(c);
  const r = await c.query(`SELECT public.lead_sem_proximo_passo($1) AS v`, [id]);
  return r.rows[0].v as boolean;
}

async function tarefa(
  leadId: string,
  venc: string,
  opts: { apagada?: boolean; semVencimento?: boolean } = {},
) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.tarefas (lead_id, corretor_id, titulo, tipo, status, prioridade,
                                 data_vencimento, deleted_at)
     VALUES ($1, $2, 'Follow-up com X', 'follow_up', 'pendente', 'media',
             CASE WHEN $4 THEN NULL ELSE now() + $3::interval END,
             CASE WHEN $5 THEN now() ELSE NULL END)`,
    [leadId, corretor.id, venc, !!opts.semVencimento, !!opts.apagada],
  );
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  admin = await criarUsuario(c, { nome: "Admin Passo", papel: "admin" });
  corretor = await criarUsuario(c, { nome: "Corretor Passo", papel: "corretor" });

  for (const nome of [
    "vencida",
    "futura",
    "vencida_e_futura",
    "nada",
    "agendado_futuro",
    "apagada_futura",
    "sem_vencimento",
  ]) {
    leads[nome] = await criarLead(c, {
      nome,
      corretorId: corretor.id,
      status: "em_atendimento",
    });
  }

  await comoSuperuser(c);
  // Base em formação (20260925120000): `criarLead` com corretor põe o lead
  // em D0 (Lead chegou). Os leads EM TRATATIVA deste fixture modelam carteira que já passou
  // da cadência (em produção, sai ao avançar de fase ou ganhar passo) — o D0
  // deles é artefato e mudaria o que a suíte mede.
  await c.query(
    `UPDATE public.leads
        SET cadencia_etapa = NULL, cadencia_prazo_ts = NULL, cadencia_inicio_ts = NULL
      WHERE corretor_id = $1`,
    [corretor.id],
  );
  await c.query(`DELETE FROM public.tarefas`);
  await tarefa(leads.vencida, "-40 days");
  await tarefa(leads.futura, "2 days");
  await tarefa(leads.vencida_e_futura, "-40 days");
  await tarefa(leads.vencida_e_futura, "2 days");
  await tarefa(leads.apagada_futura, "2 days", { apagada: true });
  await tarefa(leads.sem_vencimento, "0 days", { semVencimento: true });
  await c.query(
    `INSERT INTO public.agendamentos (lead_id, corretor_id, titulo, data_inicio, data_fim)
     VALUES ($1, $2, 'Visita', now() + interval '3 days', now() + interval '3 days 1 hour')`,
    [leads.agendado_futuro, corretor.id],
  );
  // Todo mundo com toque recente: o recorte de "em tratativa" não é o que
  // está em teste aqui.
  await c.query(`UPDATE public.leads SET ultima_interacao = now() - interval '5 days'`);
});

describe("tarefa vencida é dívida, não próximo passo", () => {
  it("só tarefa vencida = SEM próximo passo", async () => {
    expect(await semPasso(leads.vencida)).toBe(true);
  });

  it("tarefa no futuro = COM próximo passo", async () => {
    expect(await semPasso(leads.futura)).toBe(false);
  });

  it("dívida velha + passo para depois de amanhã = COM próximo passo", async () => {
    // O caso que a leitura por `min(data_vencimento)` erra: o espelho aponta
    // para a dívida de 40 dias e esconde a tarefa de 2 dias à frente.
    expect(await semPasso(leads.vencida_e_futura)).toBe(false);
  });

  it("nada marcado = SEM próximo passo", async () => {
    expect(await semPasso(leads.nada)).toBe(true);
  });

  it("agendamento futuro conta como próximo passo", async () => {
    expect(await semPasso(leads.agendado_futuro)).toBe(false);
  });

  it("tarefa apagada em soft-delete não blinda o lead", async () => {
    expect(await semPasso(leads.apagada_futura)).toBe(true);
  });

  it("tarefa pendente sem data de vencimento não é próximo passo", async () => {
    // Ela não diz QUANDO. Contar isso como passo é o mesmo erro, sem a data.
    expect(await semPasso(leads.sem_vencimento)).toBe(true);
  });
});

describe("os consumidores usam a regra nova", () => {
  it("a Reserva passa a dizer 'sem próximo passo definido'", async () => {
    // Parado há 5 dias, com o corte em 2: passa do gatilho do próximo passo e
    // não chega nos 30 de "sem movimento". O corte é declarado aqui porque a
    // operação o move (foi para 7 em 15/09/2026) — herdar o valor de produção
    // faz o teste falhar por decisão de negócio, não por defeito.
    const motivo = await comGestaoConfig(
      c,
      "carteira_ativa",
      { devolver_sem_proximo_passo_dias: 2 },
      async () => {
        await comoSuperuser(c);
        const r = await c.query(
          `SELECT motivo FROM public._carteira_classificar($1) WHERE lead_id = $2`,
          [corretor.id, leads.vencida],
        );
        return r.rows[0]?.motivo as string | undefined;
      },
    );
    expect(motivo).toBe("sem próximo passo definido");
  });

  it("o lead com passo vivo NÃO recebe esse motivo", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT motivo FROM public._carteira_classificar($1) WHERE lead_id = $2`,
      [corretor.id, leads.vencida_e_futura],
    );
    expect(r.rows[0]?.motivo).not.toBe("sem próximo passo definido");
  });

  it("a tela de equipe conta os sem passo", async () => {
    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT * FROM public.fila_equipe_v1()`);
    const linha = r.rows.find((x: { corretor_id: string | null }) => x.corretor_id === corretor.id);
    // vencida, nada, apagada_futura e sem_vencimento = 4.
    expect(Number(linha?.sem_proximo_passo)).toBe(4);
  });

  it("a gestão de carteira mostra sem_passo_vivo", async () => {
    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT * FROM public.carteira_stats_por_corretor_v1()`);
    const linha = r.rows.find((x: { corretor_id: string | null }) => x.corretor_id === corretor.id);
    expect(Number(linha?.ativa)).toBe(7);
    expect(Number(linha?.sem_passo_vivo)).toBe(4);
  });
});
