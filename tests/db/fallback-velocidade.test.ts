/**
 * FALLBACK POR VELOCIDADE: migration 20261019120000. Decisões do dono
 * (12/10/2026): "sempre que faltarem corretores, os leads vão para o
 * Marquinhos" e "lead vai para quem está ativo no CRM nos últimos 30 minutos,
 * após isso, escolha o mais rápido entre eles".
 *
 * Elenco (corretores com telefone, todos na Barra Funda, que atende a Sul;
 * NINGUÉM com check-in, então a roleta nunca tem apto):
 *   Rápida: score de velocidade alto
 *   Lento:  score baixo
 *   Ociosa: score mais alto de todos, mas sem ação no CRM há mais de 30 min
 *   Ada:    admin, ativa no CRM (não é corretora: nunca recebe)
 *
 * O que cada bloco prova:
 *   1. desligado, nada muda (o lead espera);
 *   2. ninguém ativo: o lead fica sem dono (com o Marquinhos);
 *   3. entre os ativos, vai para o mais rápido; o log diz por quê;
 *   4. as outras réguas da roleta valem: pausado e quem já teve o lead não
 *      recebem;
 *   5. o cron faz tudo sozinho e só olha a última semana;
 *   6. a métrica conta só WhatsApp/ligação do próprio corretor, e lead nunca
 *      contatado é falha.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  criarLead,
  criarUsuario,
  darRegiao,
  limparDados,
  novoClient,
  pool,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let admin: UsuarioTeste;
let rapida: UsuarioTeste;
let lento: UsuarioTeste;
let ociosa: UsuarioTeste;
const settingsAntes = new Map<string, unknown>();

async function setting(chave: string, valor: unknown) {
  await comoSuperuser(c);
  if (!settingsAntes.has(chave)) {
    const r = await c.query(`SELECT valor FROM public.distribuicao_settings WHERE chave = $1`, [
      chave,
    ]);
    settingsAntes.set(chave, r.rows[0]?.valor);
  }
  await c.query(`UPDATE public.distribuicao_settings SET valor = $2::jsonb WHERE chave = $1`, [
    chave,
    JSON.stringify(valor),
  ]);
}

/** Ação no CRM há `minutos` (o que o fallback lê como "ativo"). */
async function agiuHa(u: UsuarioTeste, minutos: number) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.audit_log (tabela, operacao, registro_id, usuario_id, created_at)
     VALUES ('leads', 'UPDATE', gen_random_uuid(), $1, now() - make_interval(mins => $2))`,
    [u.id, minutos],
  );
}

async function velocidade(u: UsuarioTeste, score: number) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.corretor_velocidade
       (corretor_id, recebidos, contatados, contatados_15min, pct_15min, pct_contato, score)
     VALUES ($1, 20, 20, 10, 50, 100, $2)
     ON CONFLICT (corretor_id) DO UPDATE SET score = EXCLUDED.score`,
    [u.id, score],
  );
}

async function leadSul(nome: string): Promise<string> {
  const id = await criarLead(c, { nome });
  await comoSuperuser(c);
  await c.query(`UPDATE public.leads SET zona = 'Sul' WHERE id = $1`, [id]);
  return id;
}

async function fallback(leadId: string) {
  await comoSuperuser(c);
  const r = await c.query(`SELECT public._fallback_velocidade($1::uuid) AS r`, [leadId]);
  return r.rows[0].r as Record<string, unknown>;
}

async function dono(leadId: string): Promise<string | null> {
  await comoSuperuser(c);
  const r = await c.query(`SELECT corretor_id FROM public.leads WHERE id = $1`, [leadId]);
  return (r.rows[0]?.corretor_id as string | null) ?? null;
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  // Outras réguas do motor ficam fora do caminho: o assunto aqui é o fallback.
  await setting("modelo_v2_ativo", false);
  await setting("percentual_minimo_trabalhado", 0);
  await setting("zona_estrita", true);
  await setting("fallback_velocidade_atividade_min", 30);

  admin = await criarUsuario(c, { nome: "Ada Admin", papel: "admin" });
  rapida = await criarUsuario(c, { nome: "Rita Rápida", papel: "corretor" });
  lento = await criarUsuario(c, { nome: "Lino Lento", papel: "corretor" });
  ociosa = await criarUsuario(c, { nome: "Olga Ociosa", papel: "corretor" });

  await comoSuperuser(c);
  for (const [i, u] of [admin, rapida, lento, ociosa].entries()) {
    await c.query(`UPDATE public.profiles SET telefone = $2 WHERE id = $1`, [
      u.id,
      `119777700${String(i).padStart(2, "0")}`,
    ]);
  }
  for (const u of [rapida, lento, ociosa]) await darRegiao(c, u.id, ["Sul"]);
});

afterAll(async () => {
  await comoSuperuser(c);
  for (const [chave, valor] of settingsAntes) {
    if (valor !== undefined) {
      await c.query(`UPDATE public.distribuicao_settings SET valor = $2::jsonb WHERE chave = $1`, [
        chave,
        JSON.stringify(valor),
      ]);
    }
  }
  await limparDados(c);
  await c.end();
  await pool.end();
});

describe("fallback por velocidade", () => {
  it("a roleta sozinha não entrega: ninguém fez check-in", async () => {
    const lead = await leadSul("Sem check-in");
    await comoSuperuser(c);
    const r = await c.query(`SELECT public.triar_e_distribuir_lead($1::uuid, 'teste') AS r`, [
      lead,
    ]);
    expect(r.rows[0].r.ok).toBe(false);
    expect(r.rows[0].r.motivo).toBe("sem_corretor_na_zona");
    expect(await dono(lead)).toBeNull();
  });

  it("desligado: não faz nada", async () => {
    await setting("fallback_velocidade_ativo", false);
    await agiuHa(rapida, 1);
    const lead = await leadSul("Desligado");
    const r = await fallback(lead);
    expect(r.motivo).toBe("fallback_desligado");
    expect(await dono(lead)).toBeNull();
    await setting("fallback_velocidade_ativo", true);
  });

  it("ninguém ativo nos últimos 30 min: o lead fica com o Marquinhos (sem dono)", async () => {
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.audit_log WHERE usuario_id = ANY($1::uuid[])`, [
      [admin.id, rapida.id, lento.id, ociosa.id],
    ]);
    await agiuHa(ociosa, 45);
    await agiuHa(admin, 1); // admin ativa não conta: não é corretora
    const lead = await leadSul("Ninguém ativo");
    const r = await fallback(lead);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("ninguem_ativo_no_crm");
    expect(await dono(lead)).toBeNull();
  });

  it("entre os ativos, vai para o mais rápido (a ociosa mais rápida não conta)", async () => {
    await velocidade(rapida, 40);
    await velocidade(lento, 5);
    await velocidade(ociosa, 90);
    await agiuHa(rapida, 10);
    await agiuHa(lento, 2);
    const lead = await leadSul("Vai para a Rita");
    const r = await fallback(lead);
    expect(r.ok).toBe(true);
    expect(await dono(lead)).toBe(rapida.id);

    await comoSuperuser(c);
    const log = await c.query(
      `SELECT regra_aplicada, motivo, tipo::text FROM public.distribution_log
        WHERE lead_id = $1 AND resultado = 'sucesso'`,
      [lead],
    );
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0].regra_aplicada).toBe("fallback_velocidade");
    expect(log.rows[0].motivo).toContain("Rita Rápida");
    // Conta na cota diária como lead de roleta.
    expect(log.rows[0].tipo).toBe("automatica");
  });

  it("pausado na roleta não recebe: vai para o próximo ativo", async () => {
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.roleta_participantes SET pausado_ate = now() + interval '1 hour'
        WHERE corretor_id = $1`,
      [rapida.id],
    );
    try {
      const lead = await leadSul("Rita pausada");
      const r = await fallback(lead);
      expect(r.ok).toBe(true);
      expect(await dono(lead)).toBe(lento.id);
    } finally {
      await comoSuperuser(c);
      await c.query(
        `UPDATE public.roleta_participantes SET pausado_ate = NULL WHERE corretor_id = $1`,
        [rapida.id],
      );
    }
  });

  it("quem já teve o lead não recebe de volta", async () => {
    const lead = await leadSul("Já passou pela Rita");
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads SET corretores_que_tentaram = ARRAY[$2::uuid] WHERE id = $1`,
      [lead, rapida.id],
    );
    const r = await fallback(lead);
    expect(r.ok).toBe(true);
    expect(await dono(lead)).toBe(lento.id);
  });

  it("o cron aplica o fallback sozinho e ignora lead com mais de 7 dias", async () => {
    const novo = await leadSul("Do cron");
    const velho = await leadSul("Da importação");
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET created_at = now() - interval '30 days' WHERE id = $1`, [
      velho,
    ]);
    const r = await c.query(`SELECT public.processar_distribuicao_automatica() AS r`);
    expect(r.rows[0].r.fallback_velocidade).toBeGreaterThanOrEqual(1);
    expect(await dono(novo)).toBe(rapida.id);
    expect(await dono(velho)).toBeNull();
  });
});

describe("métrica de velocidade real", () => {
  it("conta só WhatsApp/ligação do próprio corretor; lead não contatado é falha", async () => {
    await comoSuperuser(c);
    await c.query(`TRUNCATE public.distribution_log, public.distribuicao_log_contexto CASCADE`);
    const contatado = await criarLead(c, { nome: "Contatado", corretorId: lento.id });
    const soStatus = await criarLead(c, { nome: "Só status", corretorId: lento.id });
    const nunca = await criarLead(c, { nome: "Nunca", corretorId: lento.id });
    // Recebidos numa terça às 10h (horário útil), há mais de 2 horas.
    const recebido = `date_trunc('week', now()) - interval '6 days' + interval '13 hours'`;
    for (const lead of [contatado, soStatus, nunca]) {
      await c.query(
        `INSERT INTO public.distribution_log
           (lead_id, corretor_id, tipo, motivo, regra_aplicada, resultado, created_at)
         VALUES ($1, $2, 'automatica', 'teste', 'rodizio_menos_recente', 'sucesso', ${recebido})`,
        [lead, lento.id],
      );
    }
    await c.query(
      `INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, titulo, conteudo, ocorreu_em)
       VALUES ($1, $3, 'whatsapp', 'saida', 'oi', 'oi', ${recebido} + interval '5 minutes'),
              ($2, $3, 'mudanca_status', 'interna', 'perdido', 'perdido', ${recebido} + interval '1 minute')`,
      [contatado, soStatus, lento.id],
    );
    const n = await c.query(`SELECT public.recalcular_velocidade_contato() AS n`);
    expect(n.rows[0].n).toBe(1);
    const v = await c.query(`SELECT * FROM public.corretor_velocidade WHERE corretor_id = $1`, [
      lento.id,
    ]);
    expect(v.rows[0].recebidos).toBe(3);
    expect(v.rows[0].contatados).toBe(1);
    expect(v.rows[0].contatados_15min).toBe(1);
    expect(Number(v.rows[0].pct_15min)).toBeCloseTo(33.3, 1);
  });
});
