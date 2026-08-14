/**
 * CONTENÇÃO DO REPROCESSO (Fatia 1 / P1) — backoff exponencial com teto.
 *
 * Contexto medido (14/08): 676.394 tentativas 'sem_corretor' em 14 dias
 * porque o backoff era fixo em 30 min para sempre. A migration
 * 20260814180000 troca a janela fixa por uma janela que dobra a cada
 * tentativa após reprocesso_max_tentativas (3): 30min, 1h, 2h, 4h, 8h,
 * até o teto (reprocesso_backoff_teto_minutos, default 720).
 *
 * O que trava aqui:
 *  - _excecao_em_backoff: a matemática da janela (dentro/fora, teto, e o
 *    caso sem exceção aberta);
 *  - processar_distribuicao_automatica: lead em descanso NÃO gira (nenhuma
 *    linha nova em distribution_log), lead fora do descanso gira;
 *  - o auto-resgate continua: exceção "velha" volta a ser tentada.
 *
 * Também cobre roletas_resumo_publico (Fatia 1 / P2 — o sinal): shape do
 * payload, contagem de aptos e ausência do webhook_token.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comoSuperuser, criarLead, limparDados, novoClient, pool } from "./helpers";

const c = novoClient();

async function backoff(leadId: string): Promise<boolean> {
  const r = await c.query(`SELECT public._excecao_em_backoff($1) AS b`, [leadId]);
  return r.rows[0].b as boolean;
}

/** Cria exceção aberta com tentativas/updated_at controlados (visão de fora do RLS). */
async function excecaoAberta(
  leadId: string,
  tentativas: number,
  updatedAgoMinutes: number,
): Promise<void> {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.distribuicao_excecoes (lead_id, motivo, detalhe, tentativas)
     VALUES ($1, 'sem_corretor_elegivel', 'teste contenção', $2)`,
    [leadId, tentativas],
  );
  // O trigger set_updated_at sobrescreve em UPDATE; ajusta por baixo dele.
  await c.query(
    `ALTER TABLE public.distribuicao_excecoes DISABLE TRIGGER set_distribuicao_excecoes_updated_at`,
  );
  await c.query(
    `UPDATE public.distribuicao_excecoes
        SET updated_at = now() - make_interval(mins => $2)
      WHERE lead_id = $1 AND status = 'pendente'`,
    [leadId, updatedAgoMinutes],
  );
  await c.query(
    `ALTER TABLE public.distribuicao_excecoes ENABLE TRIGGER set_distribuicao_excecoes_updated_at`,
  );
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
  await pool.end();
});

describe("_excecao_em_backoff — a matemática da janela", () => {
  it("sem exceção aberta → false (lead elegível para triagem)", async () => {
    const lead = await criarLead(c, { status: "novo" });
    expect(await backoff(lead)).toBe(false);
  });

  it("abaixo de reprocesso_max_tentativas → false (fase de tentativas normais)", async () => {
    const lead = await criarLead(c, { status: "novo" });
    await excecaoAberta(lead, 2, 0);
    expect(await backoff(lead)).toBe(false);
  });

  it("tentativa 3, tocada agora → em descanso (janela 30min)", async () => {
    const lead = await criarLead(c, { status: "novo" });
    await excecaoAberta(lead, 3, 5);
    expect(await backoff(lead)).toBe(true);
  });

  it("tentativa 3, tocada há 31min → fora do descanso (auto-resgate preservado)", async () => {
    const lead = await criarLead(c, { status: "novo" });
    await excecaoAberta(lead, 3, 31);
    expect(await backoff(lead)).toBe(false);
  });

  it("tentativa 5 (janela 2h): 90min atrás → descansando; 121min atrás → elegível", async () => {
    const dentro = await criarLead(c, { status: "novo" });
    await excecaoAberta(dentro, 5, 90);
    expect(await backoff(dentro)).toBe(true);

    const fora = await criarLead(c, { status: "novo" });
    await excecaoAberta(fora, 5, 121);
    expect(await backoff(fora)).toBe(false);
  });

  it("tentativas altas respeitam o teto (720min): 11h atrás → descansando; 12h+1min → elegível", async () => {
    const dentro = await criarLead(c, { status: "novo" });
    await excecaoAberta(dentro, 50, 660);
    expect(await backoff(dentro)).toBe(true);

    const fora = await criarLead(c, { status: "novo" });
    await excecaoAberta(fora, 50, 721);
    expect(await backoff(fora)).toBe(false);
  });

  it("exceção resolvida/arquivada não conta como descanso", async () => {
    const lead = await criarLead(c, { status: "novo" });
    await excecaoAberta(lead, 10, 0);
    await c.query(
      `UPDATE public.distribuicao_excecoes
          SET status='resolvida', resolvida_em=now(), resolucao='teste'
        WHERE lead_id=$1`,
      [lead],
    );
    expect(await backoff(lead)).toBe(false);
  });
});

describe("processar_distribuicao_automatica — lead em descanso não gira", () => {
  async function tentativasLogadas(leadId: string): Promise<number> {
    const r = await c.query(
      `SELECT count(*)::int AS n FROM public.distribution_log WHERE lead_id = $1`,
      [leadId],
    );
    return r.rows[0].n as number;
  }

  it("em descanso: nenhuma linha nova no distribution_log; fora do descanso: gira de novo", async () => {
    await comoSuperuser(c);
    // Sem participantes aptos em nenhuma roleta (limparDados zerou tudo):
    // qualquer triagem falha com sem_corretor_* — exatamente o cenário F-085.
    const descansando = await criarLead(c, { status: "aguardando_atendimento" });
    await excecaoAberta(descansando, 10, 5); // janela no teto, tocada agora

    const acordado = await criarLead(c, { status: "aguardando_atendimento" });
    await excecaoAberta(acordado, 10, 721); // além do teto → elegível

    const antesDescansando = await tentativasLogadas(descansando);
    const antesAcordado = await tentativasLogadas(acordado);

    await c.query(`SELECT public.processar_distribuicao_automatica()`);

    expect(await tentativasLogadas(descansando)).toBe(antesDescansando);
    expect(await tentativasLogadas(acordado)).toBeGreaterThan(antesAcordado);

    // A tentativa acordada falhou (sem aptos) e voltou a descansar com
    // tentativas incrementadas — o ciclo se auto-contém.
    const exc = await c.query(
      `SELECT tentativas FROM public.distribuicao_excecoes
        WHERE lead_id=$1 AND status IN ('pendente','em_analise')`,
      [acordado],
    );
    expect(exc.rows[0].tentativas).toBe(11);
    expect(await backoff(acordado)).toBe(true);
  });
});

describe("roletas_resumo_publico — o sinal do vigia", () => {
  it("devolve todas as roletas com contagem de aptos e SEM webhook_token", async () => {
    await comoSuperuser(c);
    const r = await c.query(`SELECT public.roletas_resumo_publico() AS j`);
    const roletas = r.rows[0].j as Array<Record<string, unknown>>;

    expect(Array.isArray(roletas)).toBe(true);
    const slugs = roletas.map((x) => x.slug);
    expect(slugs).toEqual(expect.arrayContaining(["plantao", "marquinhos", "landing"]));

    for (const rol of roletas) {
      expect(rol).toHaveProperty("corretores_aptos");
      expect(rol).toHaveProperty("participantes_ativos");
      expect(rol).toHaveProperty("tem_token");
      expect(typeof rol.corretores_aptos).toBe("number");
      // Segurança: token NUNCA sai no payload, nem por engano de shape.
      expect(rol).not.toHaveProperty("webhook_token");
      expect(rol).not.toHaveProperty("token");
    }

    // Sem participantes (banco limpo) → 0 aptos em todas.
    for (const rol of roletas) expect(rol.corretores_aptos).toBe(0);
  });
});
