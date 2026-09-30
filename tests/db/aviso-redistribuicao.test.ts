/**
 * Aviso de redistribuição por SLA sai do CRM (migration 20261002130000).
 *
 * Antes, _notificar_handoff_novo_dono mandava TODO handoff para o n8n (Marcão)
 * e o aviso "🔁 lead novo pra você" dependia de um digest no n8n. Agora a
 * redistribuição por SLA entra na fila avisos_redistribuicao do próprio CRM e
 * sai agrupada pela Edge Function notify-redistribuicao; os demais handoffs
 * seguem para o dossiê do Marcão.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comoSuperuser, criarLead, criarUsuario, limparDados, novoClient } from "./helpers";

const c = novoClient();

const MOTIVO_SLA = "redistribuido por SLA (15min): Ana -> Bruno";

async function notificar(leadId: string, corretorId: string, motivo: string) {
  await comoSuperuser(c);
  await c.query(`SELECT public._notificar_handoff_novo_dono($1::uuid, $2::uuid, $3)`, [
    leadId,
    corretorId,
    motivo,
  ]);
}

async function handoffsN8n(leadId: string): Promise<number> {
  const r = await c.query(
    `SELECT count(*)::int AS n FROM net.http_request_queue
      WHERE url LIKE '%/webhook/copiloto/handoff' AND body->>'lead_id' = $1`,
    [leadId],
  );
  return r.rows[0].n as number;
}

async function avisosDe(leadId: string) {
  const r = await c.query(
    `SELECT id, corretor_id, status, resultado FROM public.avisos_redistribuicao
      WHERE lead_id = $1 ORDER BY id`,
    [leadId],
  );
  return r.rows as { id: string; corretor_id: string; status: string; resultado: string | null }[];
}

async function emitirToken(): Promise<string> {
  const r = await c.query(
    `INSERT INTO public.avisos_redistribuicao_disparos DEFAULT VALUES RETURNING token`,
  );
  return r.rows[0].token as string;
}

async function reivindicar(token: string) {
  const r = await c.query(`SELECT public.reivindicar_avisos_redistribuicao($1::uuid) AS j`, [
    token,
  ]);
  return r.rows[0].j as {
    ok: boolean;
    erro?: string;
    avisos: {
      id: number;
      lead_id: string;
      lead_nome: string;
      projeto_nome: string | null;
      corretor_id: string;
      corretor_telefone: string | null;
    }[];
    descartados_salto: number;
    descartados_dono_mudou: number;
    gestor_telefone: string | null;
  };
}

let ana: string;
let bruno: string;
let carla: string;

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  ana = (await criarUsuario(c, { nome: "Ana" })).id;
  bruno = (await criarUsuario(c, { nome: "Bruno" })).id;
  carla = (await criarUsuario(c, { nome: "Carla" })).id;
  await comoSuperuser(c);
  await c.query(`UPDATE public.profiles SET telefone = '11999990002' WHERE id = $1`, [bruno]);
  await c.query(`UPDATE public.profiles SET telefone = '11999990003' WHERE id = $1`, [carla]);
});

afterAll(async () => {
  await comoSuperuser(c);
  await c.query(`DELETE FROM public.avisos_redistribuicao`);
  await c.end();
});

describe("roteamento em _notificar_handoff_novo_dono", () => {
  it("redistribuição por SLA vai para a fila do CRM — nada de POST no n8n", async () => {
    const lead = await criarLead(c, { corretorId: bruno, status: "aguardando_atendimento" });
    await notificar(lead, bruno, MOTIVO_SLA);

    expect(await handoffsN8n(lead)).toBe(0);
    const avisos = await avisosDe(lead);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ corretor_id: bruno, status: "pendente" });
  });

  it("outros handoffs (roleta, transferência) seguem para o dossiê do Marcão", async () => {
    const lead = await criarLead(c, { corretorId: bruno, status: "aguardando_atendimento" });
    await notificar(lead, bruno, "roleta v2: distribuicao automatica");

    expect(await handoffsN8n(lead)).toBe(1);
    expect(await avisosDe(lead)).toHaveLength(0);
  });
});

describe("reivindicar_avisos_redistribuicao", () => {
  it("token inválido, já usado ou vencido não reivindica nada", async () => {
    await comoSuperuser(c);
    const lead = await criarLead(c, { corretorId: bruno, status: "aguardando_atendimento" });
    await notificar(lead, bruno, MOTIVO_SLA);

    expect((await reivindicar("00000000-0000-0000-0000-000000000000")).erro).toBe("token_invalido");
    const vencido = await emitirToken();
    await c.query(
      `UPDATE public.avisos_redistribuicao_disparos SET expira_em = now() - interval '1 minute' WHERE token = $1`,
      [vencido],
    );
    expect((await reivindicar(vencido)).ok).toBe(false);
    expect((await avisosDe(lead))[0].status).toBe("pendente");
  });

  it("devolve os avisos com lead, projeto e telefone do corretor, e marca 'enviando'", async () => {
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.avisos_redistribuicao`);
    const lead = await criarLead(c, {
      nome: "Jaqueline",
      corretorId: bruno,
      status: "aguardando_atendimento",
    });
    await c.query(`UPDATE public.leads SET projeto_nome = 'Elev Saúde' WHERE id = $1`, [lead]);
    await notificar(lead, bruno, MOTIVO_SLA);

    const token = await emitirToken();
    const r = await reivindicar(token);
    expect(r.ok).toBe(true);
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0]).toMatchObject({
      lead_id: lead,
      lead_nome: "Jaqueline",
      projeto_nome: "Elev Saúde",
      corretor_id: bruno,
      corretor_telefone: "5511999990002",
    });
    expect(r.gestor_telefone).toBe("5511930785690");
    expect((await avisosDe(lead))[0].status).toBe("enviando");

    // Token é de uso único.
    expect((await reivindicar(token)).erro).toBe("token_invalido");

    // Conclusão registra o resultado; falha vira 'erro' (sem reenvio).
    await c.query(`SELECT public.concluir_avisos_redistribuicao(ARRAY[$1::bigint], 'enviada')`, [
      r.avisos[0].id,
    ]);
    expect((await avisosDe(lead))[0].status).toBe("enviado");
  });

  it("salto intermediário: lead redistribuído 2x antes do aviso — só o dono final recebe", async () => {
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.avisos_redistribuicao`);
    const lead = await criarLead(c, { corretorId: carla, status: "aguardando_atendimento" });
    await notificar(lead, bruno, MOTIVO_SLA);
    await notificar(lead, carla, MOTIVO_SLA);

    const r = await reivindicar(await emitirToken());
    expect(r.descartados_salto).toBe(1);
    expect(r.avisos.map((a) => a.corretor_id)).toEqual([carla]);
    const avisos = await avisosDe(lead);
    expect(avisos[0]).toMatchObject({ status: "descartado", resultado: "salto_intermediario" });
  });

  it("dono mudou depois (transferência manual) — aviso descartado", async () => {
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.avisos_redistribuicao`);
    const lead = await criarLead(c, { corretorId: bruno, status: "aguardando_atendimento" });
    await notificar(lead, bruno, MOTIVO_SLA);
    await c.query(`UPDATE public.leads SET corretor_id = $1 WHERE id = $2`, [ana, lead]);

    const r = await reivindicar(await emitirToken());
    expect(r.descartados_dono_mudou).toBe(1);
    expect(r.avisos).toHaveLength(0);
    expect((await avisosDe(lead))[0]).toMatchObject({
      status: "descartado",
      resultado: "dono_mudou",
    });
  });

  it("lease vencida (função caiu no meio) volta para a fila", async () => {
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.avisos_redistribuicao`);
    const lead = await criarLead(c, { corretorId: bruno, status: "aguardando_atendimento" });
    await notificar(lead, bruno, MOTIVO_SLA);
    await c.query(
      `UPDATE public.avisos_redistribuicao
          SET status = 'enviando', reivindicado_em = now() - interval '20 minutes'
        WHERE lead_id = $1`,
      [lead],
    );
    const r = await reivindicar(await emitirToken());
    expect(r.avisos.map((a) => a.lead_id)).toEqual([lead]);
  });
});

describe("disparar_avisos_redistribuicao (cron)", () => {
  it("fila vazia: não dispara nada", async () => {
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.avisos_redistribuicao`);
    const r = await c.query(`SELECT public.disparar_avisos_redistribuicao() AS j`);
    expect(r.rows[0].j).toMatchObject({ disparou: false, motivo: "fila_vazia" });
  });

  it("com aviso pendente: dispara com token de uso único (ou espera o expediente)", async () => {
    await comoSuperuser(c);
    const lead = await criarLead(c, { corretorId: bruno, status: "aguardando_atendimento" });
    await notificar(lead, bruno, MOTIVO_SLA);

    const hora = await c.query(
      `SELECT EXTRACT(hour FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::int AS h`,
    );
    const r = await c.query(`SELECT public.disparar_avisos_redistribuicao() AS j`);
    const j = r.rows[0].j as { disparou: boolean; motivo?: string };
    const h = hora.rows[0].h as number;
    if (h < 8 || h >= 20) {
      expect(j).toMatchObject({ disparou: false, motivo: "fora_do_horario" });
      return;
    }
    expect(j.disparou).toBe(true);
    const req = await c.query(
      `SELECT body FROM net.http_request_queue
        WHERE url LIKE '%/functions/v1/notify-redistribuicao' ORDER BY id DESC LIMIT 1`,
    );
    const token = req.rows[0].body.token as string;
    const t = await c.query(
      `SELECT consumido_em FROM public.avisos_redistribuicao_disparos WHERE token = $1`,
      [token],
    );
    expect(t.rows[0].consumido_em).toBeNull();
  });

  it("agendado a cada 10 minutos", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT schedule FROM cron.job WHERE jobname = 'avisos-redistribuicao'`,
    );
    expect(r.rows[0].schedule).toBe("*/10 * * * *");
  });
});
