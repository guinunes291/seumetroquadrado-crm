/**
 * INTEGRIDADE COMERCIAL — aprovar_venda e a malha de guards em volta dela.
 *
 * Assinaturas reais descobertas no banco:
 *   - public.aprovar_venda(p_venda_id uuid, p_decisao status_venda,
 *     p_motivo text DEFAULT NULL) RETURNS vendas — SECURITY DEFINER; exige
 *     papel de gestão; FOR UPDATE na venda; decisão igual ao status atual é
 *     no-op (retorna a linha sem efeitos).
 *   - public.gerar_comissoes_para_venda(_venda_id uuid) RETURNS void —
 *     chamada pelo trigger; comissões corretor/gerente/superintendente com
 *     round(valor * pct / 100, 2) e crédito no comissao_ledger com
 *     idempotency_key 'venda:<venda>:comissao:<comissao>:credito'.
 *   - Triggers: trg_validar_mutacao_venda (BEFORE INS/UPD em vendas — imutável
 *     após aprovação, decisões só via RPC), trg_aplicar_efeitos_status_venda
 *     (AFTER UPDATE OF status_venda — comissões, venda_metricas_ledger, lead →
 *     contrato_fechado, lead_eventos; no cancelamento estorna append-only),
 *     trg_comissao_ledger_imutavel / trg_venda_metricas_ledger_imutavel
 *     (bloquear_mutacao_ledger, ERRCODE 55000, vale até para superusuário),
 *     trg_proteger_fechamento_sem_venda_aprovada (leads, ERRCODE 23514).
 *   - Índice parcial uq_vendas_lead_ativa: UNIQUE (lead_id) WHERE status_venda
 *     IN ('rascunho','pendente','aprovada') — uma venda ativa por lead.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import {
  comoSuperuser,
  comoUsuario,
  criarEquipe,
  criarLead,
  criarUsuario,
  errCode,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let equipeId: string;
let gestor: UsuarioTeste;
let corretor: UsuarioTeste;
let superintendente: UsuarioTeste;

// Valores escolhidos para forçar arredondamento de 2 casas (validado no banco):
//   corretor:        round(123456.78 * 1.234 / 100, 2) = 1523.46
//   gerente:         round(123456.78 * 0.555 / 100, 2) =  685.19
//   superintendente: round(123456.78 * 0.125 / 100, 2) =  154.32
const VALOR_VENDA = "123456.78";
const PCT = { corretor: "1.234", gerente: "0.555", superintendente: "0.125" };
const ESPERADO = { corretor: "1523.46", gerente: "685.19", superintendente: "154.32" };
const SOMA_ESPERADA = "2362.97";

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  equipeId = await criarEquipe(c);
  gestor = await criarUsuario(c, { papel: "gestor", equipeId });
  corretor = await criarUsuario(c, { papel: "corretor", equipeId });
  // Exatamente 1 superintendente ativo — condição para gerar_comissoes_para_venda
  // resolver o beneficiário da comissão de superintendência.
  superintendente = await criarUsuario(c, { papel: "superintendente" });
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

/** Código + mensagem do erro Postgres de uma promise (null se resolveu). */
async function erroDe(p: Promise<unknown>): Promise<{ code?: string; message: string } | null> {
  try {
    await p;
    return null;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { code: err.code, message: err.message ?? String(e) };
  }
}

/** INSERT em vendas exatamente como o app faz: corretor autenticado, RLS valendo,
 *  status_venda='pendente'. Retorna o id da venda. */
async function registrarVendaComoCorretor(leadId: string): Promise<string> {
  await comoUsuario(c, corretor.id);
  const r = await c.query(
    `INSERT INTO public.vendas
       (lead_id, corretor_id, criado_por_id, valor_venda, data_assinatura,
        percentual_corretor, percentual_gerente, percentual_superintendente, status_venda)
     VALUES ($1, $2, $2, $3, current_date, $4, $5, $6, 'pendente'::public.status_venda)
     RETURNING id`,
    [leadId, corretor.id, VALOR_VENDA, PCT.corretor, PCT.gerente, PCT.superintendente],
  );
  return r.rows[0].id as string;
}

/** Lead em analise_credito na carteira do corretor + venda pendente registrada. */
async function novoCenario(): Promise<{ leadId: string; vendaId: string }> {
  const leadId = await criarLead(c, { corretorId: corretor.id, status: "analise_credito" });
  const vendaId = await registrarVendaComoCorretor(leadId);
  return { leadId, vendaId };
}

/** Chama a RPC com a assinatura real (3 parâmetros posicionais). */
function aprovarVenda(client: Client, vendaId: string, decisao: string, motivo?: string | null) {
  return client.query(
    `SELECT (t.r).id, (t.r).status_venda::text AS status_venda, (t.r).aprovado_por,
            (t.r).aprovado_em, (t.r).motivo_decisao, (t.r).distrato, (t.r).data_distrato
     FROM (SELECT public.aprovar_venda($1, $2::public.status_venda, $3) AS r) t`,
    [vendaId, decisao, motivo ?? null],
  );
}

/** Fotografia dos efeitos comerciais de uma venda (visão superusuário). */
async function efeitosDaVenda(vendaId: string) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT
       (SELECT count(*)::int FROM public.comissoes WHERE venda_id = $1) AS comissoes,
       (SELECT count(*)::int FROM public.comissao_ledger WHERE venda_id = $1 AND evento = 'credito') AS creditos,
       (SELECT count(*)::int FROM public.comissao_ledger WHERE venda_id = $1 AND evento = 'estorno') AS estornos,
       (SELECT count(*)::int FROM public.venda_metricas_ledger WHERE venda_id = $1 AND evento = 'credito') AS metricas_credito,
       (SELECT count(*)::int FROM public.venda_metricas_ledger WHERE venda_id = $1 AND evento = 'estorno') AS metricas_estorno`,
    [vendaId],
  );
  return r.rows[0] as {
    comissoes: number;
    creditos: number;
    estornos: number;
    metricas_credito: number;
    metricas_estorno: number;
  };
}

// ---------------------------------------------------------------------------
// 1. Fluxo feliz
// ---------------------------------------------------------------------------

describe("aprovar_venda: fluxo feliz", () => {
  let leadId: string;
  let vendaId: string;

  it("gestor aprova venda pendente: venda aprovada com autor e timestamp", async () => {
    ({ leadId, vendaId } = await novoCenario());

    await comoUsuario(c, gestor.id);
    const r = await aprovarVenda(c, vendaId, "aprovada");
    expect(r.rows[0].status_venda).toBe("aprovada");
    expect(r.rows[0].aprovado_por).toBe(gestor.id);
    expect(r.rows[0].aprovado_em).not.toBeNull();

    await comoSuperuser(c);
    const venda = await c.query(
      `SELECT status_venda::text AS status_venda, aprovado_por FROM public.vendas WHERE id = $1`,
      [vendaId],
    );
    expect(venda.rows[0]).toEqual({ status_venda: "aprovada", aprovado_por: gestor.id });
  });

  it("lead foi para contrato_fechado e lead_eventos registrou 'venda_aprovada'", async () => {
    await comoSuperuser(c);
    const lead = await c.query(
      `SELECT status::text AS status, proxima_acao, proximo_followup FROM public.leads WHERE id = $1`,
      [leadId],
    );
    expect(lead.rows[0]).toEqual({
      status: "contrato_fechado",
      proxima_acao: null,
      proximo_followup: null,
    });

    const eventos = await c.query(
      `SELECT tipo, agente, payload->>'venda_id' AS venda_id, payload->>'valor_venda' AS valor
       FROM public.lead_eventos WHERE lead_id = $1 AND tipo = 'venda_aprovada'`,
      [leadId],
    );
    expect(eventos.rows).toHaveLength(1);
    expect(eventos.rows[0]).toMatchObject({
      tipo: "venda_aprovada",
      agente: "aprovar_venda",
      venda_id: vendaId,
      valor: VALOR_VENDA,
    });
  });

  it("comissões geradas para corretor, gerente e superintendente com round de 2 casas e soma correta", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT tipo, beneficiario_id, percentual::text AS percentual,
              valor_comissao::text AS valor_comissao, valor_liquido::text AS valor_liquido,
              valor_base::text AS valor_base, contrato_vgv::text AS contrato_vgv, status
       FROM public.comissoes WHERE venda_id = $1 ORDER BY tipo`,
      [vendaId],
    );
    expect(r.rows).toHaveLength(3);
    const porTipo = Object.fromEntries(r.rows.map((row) => [row.tipo as string, row]));

    expect(porTipo.corretor).toMatchObject({
      beneficiario_id: corretor.id,
      percentual: PCT.corretor,
      valor_comissao: ESPERADO.corretor,
      valor_liquido: ESPERADO.corretor,
      valor_base: VALOR_VENDA,
      contrato_vgv: VALOR_VENDA,
      status: "pendente",
    });
    // Gerente = gestor_id da equipe do corretor.
    expect(porTipo.gerente).toMatchObject({
      beneficiario_id: gestor.id,
      percentual: PCT.gerente,
      valor_comissao: ESPERADO.gerente,
    });
    // Superintendente único e ativo é resolvido como beneficiário.
    expect(porTipo.superintendente).toMatchObject({
      beneficiario_id: superintendente.id,
      percentual: PCT.superintendente,
      valor_comissao: ESPERADO.superintendente,
    });

    const soma = await c.query(
      `SELECT sum(valor_comissao)::text AS soma FROM public.comissoes WHERE venda_id = $1`,
      [vendaId],
    );
    expect(soma.rows[0].soma).toBe(SOMA_ESPERADA);
  });

  it("comissao_ledger tem exatamente 1 crédito idempotente por comissão, com o valor da comissão", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT cl.beneficiario_tipo, cl.evento, cl.valor::text AS valor, cl.idempotency_key,
              cl.criado_por, cl.valor = co.valor_liquido AS valor_bate,
              cl.idempotency_key = 'venda:' || $1::text || ':comissao:' || co.id::text || ':credito' AS chave_bate
       FROM public.comissao_ledger cl
       JOIN public.comissoes co ON co.id = cl.comissao_id
       WHERE cl.venda_id = $1::uuid ORDER BY cl.beneficiario_tipo`,
      [vendaId],
    );
    expect(r.rows).toHaveLength(3);
    for (const row of r.rows) {
      expect(row.evento).toBe("credito");
      expect(row.valor_bate).toBe(true);
      expect(row.chave_bate).toBe(true);
      expect(row.criado_por).toBe(gestor.id);
    }
    expect(new Set(r.rows.map((row) => row.idempotency_key)).size).toBe(3);
  });

  it("venda_metricas_ledger tem exatamente 1 crédito idempotente (delta +1, vgv = valor da venda)", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT evento, vendas_delta, vgv_delta::text AS vgv_delta, origem, idempotency_key, corretor_id
       FROM public.venda_metricas_ledger WHERE venda_id = $1`,
      [vendaId],
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toEqual({
      evento: "credito",
      vendas_delta: 1,
      vgv_delta: VALOR_VENDA,
      origem: "aprovacao",
      idempotency_key: `venda:${vendaId}:metricas:credito`,
      corretor_id: corretor.id,
    });
  });

  // -------------------------------------------------------------------------
  // 2. Idempotência (mesma venda do fluxo feliz)
  // -------------------------------------------------------------------------

  it("idempotência: aprovar de novo a mesma venda é no-op — não duplica comissões nem ledgers", async () => {
    const antes = await efeitosDaVenda(vendaId);
    expect(antes).toEqual({
      comissoes: 3,
      creditos: 3,
      estornos: 0,
      metricas_credito: 1,
      metricas_estorno: 0,
    });

    await comoSuperuser(c);
    const tsAntes = await c.query(`SELECT aprovado_em FROM public.vendas WHERE id = $1`, [vendaId]);

    await comoUsuario(c, gestor.id);
    const r = await aprovarVenda(c, vendaId, "aprovada");
    expect(r.rows[0].status_venda).toBe("aprovada");

    const depois = await efeitosDaVenda(vendaId);
    expect(depois).toEqual(antes);

    const tsDepois = await c.query(`SELECT aprovado_em FROM public.vendas WHERE id = $1`, [vendaId]);
    expect(tsDepois.rows[0].aprovado_em).toEqual(tsAntes.rows[0].aprovado_em);
  });
});

// ---------------------------------------------------------------------------
// 3. Concorrência
// ---------------------------------------------------------------------------

describe("aprovar_venda: concorrência", () => {
  it("duas conexões aprovando a mesma venda simultaneamente produzem UM único conjunto de efeitos", async () => {
    const { leadId, vendaId } = await novoCenario();

    const c1 = novoClient();
    const c2 = novoClient();
    await Promise.all([c1.connect(), c2.connect()]);
    try {
      await comoUsuario(c1, gestor.id);
      await comoUsuario(c2, gestor.id);

      const resultados = await Promise.allSettled([
        aprovarVenda(c1, vendaId, "aprovada"),
        aprovarVenda(c2, vendaId, "aprovada"),
      ]);

      // Comportamento observado: o segundo espera o lock (FOR UPDATE), relê a
      // linha já aprovada e vira no-op — ambas as chamadas resolvem sem erro.
      const rejeitadas = resultados.filter((r) => r.status === "rejected");
      expect(rejeitadas).toEqual([]);
      for (const r of resultados) {
        if (r.status === "fulfilled") {
          expect(r.value.rows[0].status_venda).toBe("aprovada");
        }
      }

      const efeitos = await efeitosDaVenda(vendaId);
      expect(efeitos).toEqual({
        comissoes: 3,
        creditos: 3,
        estornos: 0,
        metricas_credito: 1,
        metricas_estorno: 0,
      });

      await comoSuperuser(c);
      const eventos = await c.query(
        `SELECT count(*)::int AS n FROM public.lead_eventos
         WHERE lead_id = $1 AND tipo = 'venda_aprovada'`,
        [leadId],
      );
      expect(eventos.rows[0].n).toBe(1);
    } finally {
      await Promise.allSettled([c1.end(), c2.end()]);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. uq_vendas_lead_ativa
// ---------------------------------------------------------------------------

describe("uq_vendas_lead_ativa: uma venda ativa por lead", () => {
  it("segunda venda para lead que já tem venda pendente é rejeitada com 23505", async () => {
    const { leadId } = await novoCenario();
    expect(await errCode(registrarVendaComoCorretor(leadId))).toBe("23505");
  });

  it("segunda venda para lead que já tem venda APROVADA também é rejeitada com 23505", async () => {
    const { leadId, vendaId } = await novoCenario();
    await comoUsuario(c, gestor.id);
    await aprovarVenda(c, vendaId, "aprovada");
    expect(await errCode(registrarVendaComoCorretor(leadId))).toBe("23505");
  });
});

// ---------------------------------------------------------------------------
// 5. Imutabilidade
// ---------------------------------------------------------------------------

describe("imutabilidade de venda aprovada e dos ledgers", () => {
  let vendaId: string;

  beforeAll(async () => {
    ({ vendaId } = await novoCenario());
    await comoUsuario(c, gestor.id);
    await aprovarVenda(c, vendaId, "aprovada");
  });

  it("corretor não altera valor_venda de venda aprovada (RLS tira a linha do alcance: 0 linhas)", async () => {
    await comoUsuario(c, corretor.id);
    const r = await c.query(`UPDATE public.vendas SET valor_venda = 1 WHERE id = $1`, [vendaId]);
    expect(r.rowCount).toBe(0);

    await comoSuperuser(c);
    const venda = await c.query(`SELECT valor_venda::text AS v FROM public.vendas WHERE id = $1`, [
      vendaId,
    ]);
    expect(venda.rows[0].v).toBe(VALOR_VENDA);
  });

  it("nem gestor altera valor_venda de venda aprovada (guard 42501 'venda aprovada é imutável')", async () => {
    await comoUsuario(c, gestor.id);
    const erro = await erroDe(
      c.query(`UPDATE public.vendas SET valor_venda = 1 WHERE id = $1`, [vendaId]),
    );
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("42501");
    expect(erro!.message).toMatch(/venda aprovada é imutável/);
  });

  it("gestor não muda status_venda por UPDATE direto (só via RPC)", async () => {
    await comoUsuario(c, gestor.id);
    const erro = await erroDe(
      c.query(
        `UPDATE public.vendas SET status_venda = 'cancelada'::public.status_venda,
                motivo_decisao = 'na marra' WHERE id = $1`,
        [vendaId],
      ),
    );
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("42501");
    expect(erro!.message).toMatch(/RPC aprovar_venda/);
  });

  it("gestor (authenticated) não faz UPDATE nem DELETE em comissao_ledger (42501)", async () => {
    await comoUsuario(c, gestor.id);
    expect(await errCode(c.query(`UPDATE public.comissao_ledger SET valor = 0`))).toBe("42501");
    expect(await errCode(c.query(`DELETE FROM public.comissao_ledger`))).toBe("42501");
    expect(await errCode(c.query(`UPDATE public.venda_metricas_ledger SET vgv_delta = 0`))).toBe(
      "42501",
    );
  });

  it("nem superusuário muta os ledgers: bloquear_mutacao_ledger responde 55000", async () => {
    await comoSuperuser(c);
    const upd = await erroDe(
      c.query(`UPDATE public.comissao_ledger SET valor = 0 WHERE venda_id = $1`, [vendaId]),
    );
    expect(upd).not.toBeNull();
    expect(upd!.code).toBe("55000");
    expect(upd!.message).toMatch(/ledger imutável/);

    expect(
      await errCode(c.query(`DELETE FROM public.comissao_ledger WHERE venda_id = $1`, [vendaId])),
    ).toBe("55000");
    expect(
      await errCode(
        c.query(`UPDATE public.venda_metricas_ledger SET vgv_delta = 0 WHERE venda_id = $1`, [
          vendaId,
        ]),
      ),
    ).toBe("55000");
    expect(
      await errCode(
        c.query(`DELETE FROM public.venda_metricas_ledger WHERE venda_id = $1`, [vendaId]),
      ),
    ).toBe("55000");
  });
});

// ---------------------------------------------------------------------------
// 6. proteger_fechamento_sem_venda_aprovada
// ---------------------------------------------------------------------------

describe("proteger_fechamento_sem_venda_aprovada", () => {
  it("gestor não move lead para contrato_fechado sem venda aprovada (23514 via transicionar_lead)", async () => {
    const leadId = await criarLead(c, { corretorId: corretor.id, status: "analise_credito" });

    await comoUsuario(c, gestor.id);
    const erro = await erroDe(
      c.query(`SELECT public.transicionar_lead($1, 'contrato_fechado'::public.lead_status)`, [
        leadId,
      ]),
    );
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("23514");
    expect(erro!.message).toMatch(/lead só pode ser fechado após aprovação da venda/);

    await comoSuperuser(c);
    const lead = await c.query(`SELECT status::text AS s FROM public.leads WHERE id = $1`, [leadId]);
    expect(lead.rows[0].s).toBe("analise_credito");
  });

  it("até UPDATE administrativo direto é barrado pelo trigger (defesa em profundidade)", async () => {
    const leadId = await criarLead(c, { corretorId: corretor.id, status: "analise_credito" });

    await comoSuperuser(c);
    const erro = await erroDe(
      c.query(
        `UPDATE public.leads SET status = 'contrato_fechado'::public.lead_status WHERE id = $1`,
        [leadId],
      ),
    );
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("23514");
    expect(erro!.message).toMatch(/lead só pode ser fechado após aprovação da venda/);
  });

  it("venda pendente (ainda não aprovada) NÃO libera o fechamento", async () => {
    const { leadId } = await novoCenario();

    await comoUsuario(c, gestor.id);
    const erro = await erroDe(
      c.query(`SELECT public.transicionar_lead($1, 'contrato_fechado'::public.lead_status)`, [
        leadId,
      ]),
    );
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("23514");
  });
});

// ---------------------------------------------------------------------------
// 7. Rejeição
// ---------------------------------------------------------------------------

describe("aprovar_venda: rejeição", () => {
  it("rejeitar sem motivo é 22023 ('motivo é obrigatório'); motivo só de espaços idem", async () => {
    const { vendaId } = await novoCenario();

    await comoUsuario(c, gestor.id);
    const semMotivo = await erroDe(aprovarVenda(c, vendaId, "rejeitada"));
    expect(semMotivo).not.toBeNull();
    expect(semMotivo!.code).toBe("22023");
    expect(semMotivo!.message).toMatch(/motivo é obrigatório para rejeitar ou cancelar/);

    const motivoVazio = await erroDe(aprovarVenda(c, vendaId, "rejeitada", "   "));
    expect(motivoVazio).not.toBeNull();
    expect(motivoVazio!.code).toBe("22023");
  });

  it("rejeitada com motivo: registra motivo_decisao, NÃO gera comissões/ledgers e NÃO move o lead", async () => {
    const { leadId, vendaId } = await novoCenario();

    await comoUsuario(c, gestor.id);
    const r = await aprovarVenda(c, vendaId, "rejeitada", "Documentação incompleta");
    expect(r.rows[0].status_venda).toBe("rejeitada");
    expect(r.rows[0].motivo_decisao).toBe("Documentação incompleta");

    const efeitos = await efeitosDaVenda(vendaId);
    expect(efeitos).toEqual({
      comissoes: 0,
      creditos: 0,
      estornos: 0,
      metricas_credito: 0,
      metricas_estorno: 0,
    });

    await comoSuperuser(c);
    const lead = await c.query(`SELECT status::text AS s FROM public.leads WHERE id = $1`, [leadId]);
    expect(lead.rows[0].s).toBe("analise_credito");
    const eventos = await c.query(
      `SELECT count(*)::int AS n FROM public.lead_eventos
       WHERE lead_id = $1 AND tipo IN ('venda_aprovada', 'venda_cancelada')`,
      [leadId],
    );
    expect(eventos.rows[0].n).toBe(0);

    // Rejeitada sai do índice parcial uq_vendas_lead_ativa: o lead volta a
    // aceitar uma nova venda ativa.
    const novaVenda = await registrarVendaComoCorretor(leadId);
    expect(novaVenda).toBeTruthy();
  });

  it("venda rejeitada é terminal: não pode ser aprovada depois (22023)", async () => {
    const { vendaId } = await novoCenario();
    await comoUsuario(c, gestor.id);
    await aprovarVenda(c, vendaId, "rejeitada", "Cliente desistiu");

    const erro = await erroDe(aprovarVenda(c, vendaId, "aprovada"));
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("22023");
    expect(erro!.message).toMatch(/estado terminal não pode ser reaberta/);
  });

  it("corretor não decide venda: aprovar_venda exige papel de gestão (42501)", async () => {
    const { vendaId } = await novoCenario();
    await comoUsuario(c, corretor.id);
    const erro = await erroDe(aprovarVenda(c, vendaId, "aprovada"));
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("42501");
    expect(erro!.message).toMatch(/exige papel de gestão/);
  });
});

// ---------------------------------------------------------------------------
// 8. Cancelamento pós-aprovação (estorno append-only)
// ---------------------------------------------------------------------------

describe("aprovar_venda: cancelamento pós-aprovação", () => {
  it("cancelar exige motivo (22023) e só vale para venda aprovada", async () => {
    const { vendaId } = await novoCenario();

    await comoUsuario(c, gestor.id);
    // Pendente não pode ser cancelada (fluxo correto seria rejeitar).
    const pendente = await erroDe(aprovarVenda(c, vendaId, "cancelada", "motivo qualquer"));
    expect(pendente).not.toBeNull();
    expect(pendente!.code).toBe("22023");
    expect(pendente!.message).toMatch(/somente venda aprovada pode ser cancelada/);

    await aprovarVenda(c, vendaId, "aprovada");
    const semMotivo = await erroDe(aprovarVenda(c, vendaId, "cancelada"));
    expect(semMotivo).not.toBeNull();
    expect(semMotivo!.code).toBe("22023");
    expect(semMotivo!.message).toMatch(/motivo é obrigatório/);
  });

  it("cancelamento estorna de forma append-only: estornos novos, créditos preservados, lead reaberto", async () => {
    const { leadId, vendaId } = await novoCenario();
    await comoUsuario(c, gestor.id);
    await aprovarVenda(c, vendaId, "aprovada");

    await comoSuperuser(c);
    const creditosAntes = await c.query(
      `SELECT id, comissao_id, valor::text AS valor FROM public.comissao_ledger
       WHERE venda_id = $1 AND evento = 'credito' ORDER BY id`,
      [vendaId],
    );
    expect(creditosAntes.rows).toHaveLength(3);
    const metricaCreditoAntes = await c.query(
      `SELECT id, dia FROM public.venda_metricas_ledger WHERE venda_id = $1 AND evento = 'credito'`,
      [vendaId],
    );

    await comoUsuario(c, gestor.id);
    const r = await aprovarVenda(c, vendaId, "cancelada", "Distrato solicitado pelo cliente");
    expect(r.rows[0].status_venda).toBe("cancelada");
    expect(r.rows[0].distrato).toBe(true);
    expect(r.rows[0].data_distrato).not.toBeNull();
    expect(r.rows[0].motivo_decisao).toBe("Distrato solicitado pelo cliente");

    // Ledger de comissões: 3 créditos originais INTACTOS + 3 estornos novos.
    await comoSuperuser(c);
    const ledger = await c.query(
      `SELECT id, comissao_id, evento, valor::text AS valor FROM public.comissao_ledger
       WHERE venda_id = $1 ORDER BY evento, id`,
      [vendaId],
    );
    expect(ledger.rows).toHaveLength(6);
    const creditosDepois = ledger.rows.filter((row) => row.evento === "credito");
    expect(creditosDepois.map((row) => row.id).sort()).toEqual(
      creditosAntes.rows.map((row) => row.id).sort(),
    );
    // Cada estorno espelha o valor do crédito da mesma comissão.
    const estornos = ledger.rows.filter((row) => row.evento === "estorno");
    expect(estornos).toHaveLength(3);
    const valorCreditoPorComissao = new Map(
      creditosAntes.rows.map((row) => [row.comissao_id, row.valor]),
    );
    for (const estorno of estornos) {
      expect(estorno.valor).toBe(valorCreditoPorComissao.get(estorno.comissao_id));
    }

    // Comissões não são deletadas: viram 'cancelada'.
    const comissoes = await c.query(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE status = 'cancelada')::int AS canceladas
       FROM public.comissoes WHERE venda_id = $1`,
      [vendaId],
    );
    expect(comissoes.rows[0]).toEqual({ n: 3, canceladas: 3 });

    // Métricas: crédito preservado + estorno espelhado no MESMO dia do crédito.
    const metricas = await c.query(
      `SELECT id, evento, vendas_delta, vgv_delta::text AS vgv_delta, dia, origem
       FROM public.venda_metricas_ledger WHERE venda_id = $1 ORDER BY evento`,
      [vendaId],
    );
    expect(metricas.rows).toHaveLength(2);
    expect(metricas.rows[0].evento).toBe("credito");
    expect(metricas.rows[0].id).toBe(metricaCreditoAntes.rows[0].id);
    expect(metricas.rows[1]).toMatchObject({
      evento: "estorno",
      vendas_delta: -1,
      vgv_delta: `-${VALOR_VENDA}`,
      origem: "cancelamento",
    });
    expect(metricas.rows[1].dia).toEqual(metricaCreditoAntes.rows[0].dia);

    // Lead reaberto para tratamento com evento de auditoria.
    const lead = await c.query(
      `SELECT status::text AS status, proxima_acao FROM public.leads WHERE id = $1`,
      [leadId],
    );
    expect(lead.rows[0]).toEqual({
      status: "em_atendimento",
      proxima_acao: "Revisar venda cancelada",
    });
    const eventos = await c.query(
      `SELECT descricao FROM public.lead_eventos WHERE lead_id = $1 AND tipo = 'venda_cancelada'`,
      [leadId],
    );
    expect(eventos.rows).toHaveLength(1);
    expect(eventos.rows[0].descricao).toBe("Distrato solicitado pelo cliente");

    // Cancelar de novo é no-op: nenhum evento adicional no ledger.
    await comoUsuario(c, gestor.id);
    const denovo = await aprovarVenda(c, vendaId, "cancelada", "repetido");
    expect(denovo.rows[0].status_venda).toBe("cancelada");
    const efeitosFinais = await efeitosDaVenda(vendaId);
    expect(efeitosFinais).toEqual({
      comissoes: 3,
      creditos: 3,
      estornos: 3,
      metricas_credito: 1,
      metricas_estorno: 1,
    });
  });

  it("cancelamento é terminal: venda cancelada não pode ser reaprovada (22023)", async () => {
    const { vendaId } = await novoCenario();
    await comoUsuario(c, gestor.id);
    await aprovarVenda(c, vendaId, "aprovada");
    await aprovarVenda(c, vendaId, "cancelada", "Distrato");

    const erro = await erroDe(aprovarVenda(c, vendaId, "aprovada"));
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("22023");
    expect(erro!.message).toMatch(/estado terminal não pode ser reaberta/);
  });
});
