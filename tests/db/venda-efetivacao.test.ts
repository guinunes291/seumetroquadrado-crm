/**
 * EFETIVAÇÃO DA VENDA — marcos "Contrato Assinado", "Ato Pago" e
 * "Apto para repasse" (migração 20260826130000_venda_efetivacao_flags).
 *
 * Contrato coberto:
 *  - A venda nasce pendente com os 3 marcos desligados (cadastro no momento
 *    da venda); pode nascer com marco já ligado e o trigger carimba o *_em.
 *  - public.atualizar_efetivacao_venda(p_venda_id uuid,
 *    p_contrato_assinado bool, p_ato_pago bool, p_apto_repasse bool)
 *    RETURNS vendas — gestão OU o corretor/criador da venda, escopo por
 *    pode_acessar_lead, só rascunho/pendente; carimba/limpa timestamps,
 *    grava lead_eventos 'efetivacao_venda' e é idempotente (no-op sem
 *    mudança real). É a ÚNICA porta: UPDATE direto autenticado = 42501.
 *  - aprovar_venda('aprovada') recusa venda sem os 3 marcos (22023) e o
 *    check vendas_efetivacao_aprovada_ck segura até superusuário (23514).
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

let equipeId: string;
let gestor: UsuarioTeste;
let corretor: UsuarioTeste;
let outroCorretor: UsuarioTeste;

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  equipeId = await criarEquipe(c);
  gestor = await criarUsuario(c, { papel: "gestor", equipeId });
  corretor = await criarUsuario(c, { papel: "corretor", equipeId });
  outroCorretor = await criarUsuario(c, { papel: "corretor", equipeId });
  await comoSuperuser(c);
  await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gestor.id, equipeId]);
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

// ---------------------------------------------------------------------------
// Helpers locais
// ---------------------------------------------------------------------------

async function erroDe(p: Promise<unknown>): Promise<{ code?: string; message: string } | null> {
  try {
    await p;
    return null;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { code: err.code, message: err.message ?? String(e) };
  }
}

/** Lead em analise_credito + venda pendente registrada pelo corretor (RLS). */
async function novoCenario(): Promise<{ leadId: string; vendaId: string }> {
  const leadId = await criarLead(c, { corretorId: corretor.id, status: "analise_credito" });
  await comoUsuario(c, corretor.id);
  const r = await c.query(
    `INSERT INTO public.vendas
       (lead_id, corretor_id, criado_por_id, valor_venda, data_assinatura,
        percentual_corretor, percentual_gerente, percentual_superintendente, status_venda)
     VALUES ($1, $2, $2, 250000, current_date, 1.5, 0.5, 0, 'pendente'::public.status_venda)
     RETURNING id`,
    [leadId, corretor.id],
  );
  return { leadId, vendaId: r.rows[0].id as string };
}

/** Chama a RPC com a assinatura real (4 parâmetros posicionais). */
function efetivar(
  vendaId: string,
  flags: { contrato?: boolean | null; ato?: boolean | null; apto?: boolean | null } = {},
) {
  return c.query(
    `SELECT (t.r).id, (t.r).status_venda::text AS status_venda,
            (t.r).contrato_assinado, (t.r).contrato_assinado_em,
            (t.r).ato_pago, (t.r).ato_pago_em,
            (t.r).apto_repasse, (t.r).apto_repasse_em
     FROM (SELECT public.atualizar_efetivacao_venda($1, $2, $3, $4) AS r) t`,
    [vendaId, flags.contrato ?? null, flags.ato ?? null, flags.apto ?? null],
  );
}

function aprovar(vendaId: string) {
  return c.query(`SELECT public.aprovar_venda($1, 'aprovada'::public.status_venda, NULL)`, [
    vendaId,
  ]);
}

async function eventosEfetivacao(leadId: string): Promise<number> {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT count(*)::int AS n FROM public.lead_eventos
     WHERE lead_id = $1 AND tipo = 'efetivacao_venda'`,
    [leadId],
  );
  return r.rows[0].n as number;
}

// ---------------------------------------------------------------------------
// 1. Cadastro no momento da venda + trava de aprovação
// ---------------------------------------------------------------------------

describe("venda cadastrada no momento da venda aguarda a efetivação", () => {
  it("venda nasce pendente com os 3 marcos desligados e timestamps nulos", async () => {
    const { vendaId } = await novoCenario();

    await comoSuperuser(c);
    const r = await c.query(
      `SELECT contrato_assinado, contrato_assinado_em, ato_pago, ato_pago_em,
              apto_repasse, apto_repasse_em
       FROM public.vendas WHERE id = $1`,
      [vendaId],
    );
    expect(r.rows[0]).toEqual({
      contrato_assinado: false,
      contrato_assinado_em: null,
      ato_pago: false,
      ato_pago_em: null,
      apto_repasse: false,
      apto_repasse_em: null,
    });
  });

  it("aprovar sem os 3 marcos é recusado (22023) e não deixa efeito comercial", async () => {
    const { leadId, vendaId } = await novoCenario();

    await comoUsuario(c, gestor.id);
    const erro = await erroDe(aprovar(vendaId));
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("22023");
    expect(erro!.message).toMatch(/3 marcos de efetivação ativos/);

    // Com 2 de 3 marcos também não passa.
    await comoUsuario(c, corretor.id);
    await efetivar(vendaId, { contrato: true, ato: true });
    await comoUsuario(c, gestor.id);
    const quaseLa = await erroDe(aprovar(vendaId));
    expect(quaseLa).not.toBeNull();
    expect(quaseLa!.code).toBe("22023");

    await comoSuperuser(c);
    const venda = await c.query(`SELECT status_venda::text AS s FROM public.vendas WHERE id = $1`, [
      vendaId,
    ]);
    expect(venda.rows[0].s).toBe("pendente");
    const efeitos = await c.query(
      `SELECT (SELECT count(*)::int FROM public.comissoes WHERE venda_id = $1) AS comissoes,
              (SELECT count(*)::int FROM public.venda_metricas_ledger WHERE venda_id = $1) AS metricas`,
      [vendaId],
    );
    expect(efeitos.rows[0]).toEqual({ comissoes: 0, metricas: 0 });
    const lead = await c.query(`SELECT status::text AS s FROM public.leads WHERE id = $1`, [
      leadId,
    ]);
    expect(lead.rows[0].s).toBe("analise_credito");
  });

  it("com os 3 marcos ativos o gestor aprova e a venda efetiva normalmente", async () => {
    const { leadId, vendaId } = await novoCenario();

    await comoUsuario(c, corretor.id);
    await efetivar(vendaId, { contrato: true, ato: true, apto: true });

    await comoUsuario(c, gestor.id);
    const r = await c.query(
      `SELECT (t.r).status_venda::text AS status_venda
       FROM (SELECT public.aprovar_venda($1, 'aprovada'::public.status_venda, NULL) AS r) t`,
      [vendaId],
    );
    expect(r.rows[0].status_venda).toBe("aprovada");

    await comoSuperuser(c);
    const lead = await c.query(`SELECT status::text AS s FROM public.leads WHERE id = $1`, [
      leadId,
    ]);
    expect(lead.rows[0].s).toBe("contrato_fechado");
  });
});

// ---------------------------------------------------------------------------
// 2. Comportamento da RPC atualizar_efetivacao_venda
// ---------------------------------------------------------------------------

describe("atualizar_efetivacao_venda: marcos, timestamps e auditoria", () => {
  it("corretor dono liga marcos um a um; cada mudança carimba o *_em e gera lead_eventos", async () => {
    const { leadId, vendaId } = await novoCenario();

    await comoUsuario(c, corretor.id);
    const passo1 = await efetivar(vendaId, { contrato: true });
    expect(passo1.rows[0]).toMatchObject({
      contrato_assinado: true,
      ato_pago: false,
      apto_repasse: false,
    });
    expect(passo1.rows[0].contrato_assinado_em).not.toBeNull();
    expect(passo1.rows[0].ato_pago_em).toBeNull();

    await comoUsuario(c, corretor.id);
    const passo2 = await efetivar(vendaId, { ato: true, apto: true });
    expect(passo2.rows[0]).toMatchObject({
      contrato_assinado: true,
      ato_pago: true,
      apto_repasse: true,
    });
    expect(passo2.rows[0].ato_pago_em).not.toBeNull();
    expect(passo2.rows[0].apto_repasse_em).not.toBeNull();

    expect(await eventosEfetivacao(leadId)).toBe(2);
  });

  it("desligar um marco limpa o timestamp; repetir o mesmo valor é no-op sem novo evento", async () => {
    const { leadId, vendaId } = await novoCenario();

    await comoUsuario(c, corretor.id);
    await efetivar(vendaId, { contrato: true });
    const desligado = await efetivar(vendaId, { contrato: false });
    expect(desligado.rows[0].contrato_assinado).toBe(false);
    expect(desligado.rows[0].contrato_assinado_em).toBeNull();
    expect(await eventosEfetivacao(leadId)).toBe(2);

    // Mesmo valor de novo: idempotente, sem terceiro evento.
    await comoUsuario(c, corretor.id);
    const noop = await efetivar(vendaId, { contrato: false });
    expect(noop.rows[0].contrato_assinado).toBe(false);
    expect(await eventosEfetivacao(leadId)).toBe(2);
  });

  it("gestor também pode marcar; corretor que não é da venda é barrado (42501)", async () => {
    const { vendaId } = await novoCenario();

    await comoUsuario(c, gestor.id);
    const r = await efetivar(vendaId, { ato: true });
    expect(r.rows[0].ato_pago).toBe(true);

    await comoUsuario(c, outroCorretor.id);
    const erro = await erroDe(efetivar(vendaId, { apto: true }));
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("42501");
  });

  it("depois da decisão os marcos ficam travados (22023)", async () => {
    const { vendaId } = await novoCenario();
    await comoUsuario(c, corretor.id);
    await efetivar(vendaId, { contrato: true, ato: true, apto: true });
    await comoUsuario(c, gestor.id);
    await aprovar(vendaId);

    await comoUsuario(c, gestor.id);
    const erro = await erroDe(efetivar(vendaId, { ato: false }));
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("22023");
    expect(erro!.message).toMatch(/antes da decisão da venda/);
  });

  it("INSERT pode nascer com marco ligado e o trigger carimba o timestamp", async () => {
    const leadId = await criarLead(c, { corretorId: corretor.id, status: "analise_credito" });
    await comoUsuario(c, corretor.id);
    const r = await c.query(
      `INSERT INTO public.vendas
         (lead_id, corretor_id, criado_por_id, valor_venda, data_assinatura,
          status_venda, contrato_assinado)
       VALUES ($1, $2, $2, 180000, current_date, 'pendente'::public.status_venda, true)
       RETURNING contrato_assinado, contrato_assinado_em, ato_pago, ato_pago_em`,
      [leadId, corretor.id],
    );
    expect(r.rows[0].contrato_assinado).toBe(true);
    expect(r.rows[0].contrato_assinado_em).not.toBeNull();
    expect(r.rows[0].ato_pago).toBe(false);
    expect(r.rows[0].ato_pago_em).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Defesa em profundidade
// ---------------------------------------------------------------------------

describe("marcos de efetivação: guards fora da RPC", () => {
  it("UPDATE direto de marco por usuário autenticado é bloqueado (42501, aponta a RPC)", async () => {
    const { vendaId } = await novoCenario();

    await comoUsuario(c, gestor.id);
    const erro = await erroDe(
      c.query(`UPDATE public.vendas SET ato_pago = true WHERE id = $1`, [vendaId]),
    );
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("42501");
    expect(erro!.message).toMatch(/atualizar_efetivacao_venda/);
  });

  it("check vendas_efetivacao_aprovada_ck: nem superusuário grava aprovada sem os marcos (23514)", async () => {
    const { vendaId } = await novoCenario();

    await comoSuperuser(c);
    const erro = await erroDe(
      c.query(
        `UPDATE public.vendas
            SET status_venda = 'aprovada'::public.status_venda, aprovado_em = now()
          WHERE id = $1`,
        [vendaId],
      ),
    );
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("23514");
    expect(erro!.message).toMatch(/vendas_efetivacao_aprovada_ck/);
  });
});
