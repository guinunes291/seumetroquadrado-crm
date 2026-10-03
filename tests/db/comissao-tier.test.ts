/**
 * COMISSÃO POR TIER E ESTEIRA — drizzle/migrations/0015 (criada no Lovable em
 * 28/09, trazida para o replay em 20261010120000) e a esteira "Marquinhos" só
 * para a visita do robô (20261010120200).
 *
 * Na venda registrada pelo corretor, o gatilho trg_vendas_tier_comissao grava
 * tier, esteira e a fatia do corretor, e o percentual do corretor passa a ser
 * total × fatia — o digitado não vale. Fatias do tier_1: lead da empresa 40%,
 * lead próprio 45%, Marquinhos 30%, SDR 8%.
 *
 * A esteira "marquinhos" contava QUALQUER visita sem autor; três caminhos do
 * próprio CRM gravam visita sem autor sem o robô ter marcado nada (visita
 * automática de "Visita realizada", registro histórico e reagendamento pelo
 * Modo Visita) e tiravam 10 a 15 pontos da fatia do corretor.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarEquipe,
  criarLead,
  criarUsuario,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();
let gestor: UsuarioTeste;
let corretor: UsuarioTeste;
let sdr: UsuarioTeste;

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  const equipeId = await criarEquipe(c);
  gestor = await criarUsuario(c, { papel: "gestor", equipeId });
  corretor = await criarUsuario(c, { papel: "corretor", equipeId });
  sdr = await criarUsuario(c, { papel: "sdr" });
  await comoSuperuser(c);
  await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gestor.id, equipeId]);
});

afterAll(async () => {
  await comoSuperuser(c);
  await limparDados(c);
  await c.end();
});

/** Visita do lead; sem `autor` = gravada sem criado_por_id (robô, sistema). */
async function visita(
  leadId: string,
  opts: { autor?: string; auto?: boolean; descricao?: string } = {},
): Promise<void> {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.agendamentos
       (lead_id, corretor_id, criado_por_id, tipo, status, titulo, descricao,
        data_inicio, data_fim, auto_gerado)
     VALUES ($1, $2, $3, 'visita', 'realizado', 'Visita', $4,
             now() - interval '2 days', now() - interval '2 days' + interval '1 hour', $5)`,
    [leadId, corretor.id, opts.autor ?? null, opts.descricao ?? null, opts.auto ?? false],
  );
}

async function esteira(leadId: string): Promise<string> {
  await comoSuperuser(c);
  const r = await c.query(`SELECT public.lead_esteira_comissao($1) AS e`, [leadId]);
  return r.rows[0].e as string;
}

describe("venda registrada pelo corretor", () => {
  let vendaId: string;

  it("o percentual do corretor sai do tier (3,5 × 40% = 1,4), não do digitado", async () => {
    const leadId = await criarLead(c, { corretorId: corretor.id, status: "analise_credito" });
    await comoUsuario(c, corretor.id);
    const r = await c.query(
      `INSERT INTO public.vendas
         (lead_id, corretor_id, criado_por_id, valor_venda, data_assinatura,
          percentual_comissao, percentual_corretor, status_venda)
       VALUES ($1, $2, $2, 245000, current_date, 3.5, 1.85, 'pendente')
       RETURNING id, tier_comissao, esteira_comissao,
                 pct_share_corretor::text AS fatia, percentual_corretor::text AS pct`,
      [leadId, corretor.id],
    );
    vendaId = r.rows[0].id as string;
    expect(r.rows[0]).toMatchObject({
      tier_comissao: "tier_1",
      esteira_comissao: "lead_empresa",
      fatia: "40.00",
    });
    expect(Number(r.rows[0].pct)).toBe(1.4);
  });

  it("depois de registrada, só a gestão muda os percentuais", async () => {
    await comoUsuario(c, corretor.id);
    await expect(
      c.query(`UPDATE public.vendas SET percentual_corretor = 3 WHERE id = $1`, [vendaId]),
    ).rejects.toThrow(/Somente a gestão/);

    await comoUsuario(c, gestor.id);
    await c.query(`UPDATE public.vendas SET percentual_corretor = 1.5 WHERE id = $1`, [vendaId]);
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT percentual_corretor::text AS p FROM public.vendas WHERE id = $1`,
      [vendaId],
    );
    expect(Number(r.rows[0].p)).toBe(1.5);
  });
});

describe("esteira: 'marquinhos' só para a visita do robô", () => {
  it("visita sem autor, marcada pelo robô → marquinhos", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id });
    await visita(lead);
    expect(await esteira(lead)).toBe("marquinhos");
  });

  it("visita automática de 'Visita realizada' e registro histórico (auto_gerado) → lead da empresa", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id });
    await visita(lead, {
      auto: true,
      descricao:
        "Agendamento criado automaticamente ao mover o lead para Visita realizada sem visita validada.",
    });
    expect(await esteira(lead)).toBe("lead_empresa");
  });

  it("reagendamento pelo Modo Visita (sem autor) → lead da empresa", async () => {
    for (const descricao of [
      "Reagendada a partir do Modo Visita.",
      "Reagendada após não comparecimento.",
    ]) {
      const lead = await criarLead(c, { corretorId: corretor.id });
      await visita(lead, { autor: corretor.id });
      await visita(lead, { descricao });
      expect(await esteira(lead), descricao).toBe("lead_empresa");
    }
  });

  it("visita do robô reagendada pelo corretor continua do robô (a original segue lá)", async () => {
    const lead = await criarLead(c, { corretorId: corretor.id });
    await visita(lead);
    await visita(lead, { descricao: "Reagendada a partir do Modo Visita." });
    expect(await esteira(lead)).toBe("marquinhos");
  });

  it("visita do corretor, lead do SDR e lead próprio seguem as outras esteiras", async () => {
    const doCorretor = await criarLead(c, { corretorId: corretor.id });
    await visita(doCorretor, { autor: corretor.id });
    expect(await esteira(doCorretor)).toBe("lead_empresa");

    const doSdr = await criarLead(c, { corretorId: corretor.id });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET sdr_id = $1 WHERE id = $2`, [sdr.id, doSdr]);
    expect(await esteira(doSdr)).toBe("sdr");

    const proprio = await criarLead(c, { corretorId: corretor.id, origem: "captacao_corretor" });
    expect(await esteira(proprio)).toBe("lead_proprio");
  });
});
