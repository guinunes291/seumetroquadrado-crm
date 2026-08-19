/**
 * MÓDULO DRE — cascata, resolução de unidade, regimes e RLS.
 *
 * Valida a migration 20260819210000_dre_modulo.sql contra o teste de aceite
 * da planilha oficial (parâmetros seed 4% / 10% / 1,8% / 0,6% / 0,3%):
 *
 *   1 venda de VGV R$ 245.000 →
 *     Faturamento 9.800,00 · Impostos 980,00 · Receita Líquida 8.820,00 ·
 *     Consultor 4.410,00 · Gerente 1.470,00 · Sócio operador 735,00 ·
 *     Margem da Empresa 2.205,00
 *   12 vendas de 245.000 no mês + R$ 13.200 de custo fixo →
 *     Margem 26.460 → EBITDA 13.260 → Reinv. 2.652 → Reserva 2.652 →
 *     Lucro para Distribuição 7.956
 *
 * Também cobre: precedência override > gerente > corretor da view
 * dre_vw_vendas_unidade, modo de percentual 'venda' (com fallback quando a
 * venda não tem percentual gravado), regime caixa (venda sem recebimento fica
 * fora), consolidado = soma das unidades, avisos e a guarda de papel
 * (corretor não enxerga DRE).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
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
let unidadeA: string; // SMQ Bruno — unidade do corretor
let unidadeB: string; // SMQ Sheldon — unidade do gestor (gerente comissionado)

const VGV = "245000.00";

async function unidadeIdPorNome(nome: string): Promise<string> {
  await comoSuperuser(c);
  const r = await c.query(`SELECT id FROM public.dre_unidades WHERE nome = $1`, [nome]);
  expect(r.rowCount).toBe(1);
  return r.rows[0].id as string;
}

/** Venda pendente registrada pelo corretor (fluxo real, RLS valendo). */
async function registrarVenda(opts: {
  dataAssinatura: string;
  pct?: { total: string; corretor: string; gerente: string; superintendente: string };
}): Promise<string> {
  const leadId = await criarLead(c, { corretorId: corretor.id, status: "analise_credito" });
  await comoUsuario(c, corretor.id);
  const pct = opts.pct ?? { total: "0", corretor: "0", gerente: "0", superintendente: "0" };
  const r = await c.query(
    `INSERT INTO public.vendas
       (lead_id, corretor_id, criado_por_id, valor_venda, data_assinatura,
        percentual_comissao, percentual_corretor, percentual_gerente,
        percentual_superintendente, status_venda)
     VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, 'pendente'::public.status_venda)
     RETURNING id`,
    [
      leadId,
      corretor.id,
      VGV,
      opts.dataAssinatura,
      pct.total,
      pct.corretor,
      pct.gerente,
      pct.superintendente,
    ],
  );
  return r.rows[0].id as string;
}

async function aprovar(vendaId: string): Promise<void> {
  await comoUsuario(c, gestor.id);
  await c.query(`SELECT public.aprovar_venda($1, 'aprovada'::public.status_venda, NULL)`, [
    vendaId,
  ]);
}

/** Cascata como o app chama (gestor autenticado). Devolve mapa linha→valor do mês. */
async function cascata(
  unidadeId: string | null,
  mes: number,
  regime = "competencia",
  modoPct = "parametro",
  ano = 2026,
): Promise<Record<string, string>> {
  await comoUsuario(c, gestor.id);
  const r = await c.query(
    `SELECT linha, valor FROM public.dre_calcular($1, $2, $3, $4) WHERE mes = $5`,
    [unidadeId, ano, regime, modoPct, mes],
  );
  return Object.fromEntries(r.rows.map((row) => [row.linha, String(row.valor)]));
}

async function limparDre(): Promise<void> {
  await comoSuperuser(c);
  await c.query(`DELETE FROM public.dre_despesas`);
  await c.query(`DELETE FROM public.dre_orcamento`);
  await c.query(`DELETE FROM public.dre_venda_unidade`);
  await c.query(`DELETE FROM public.dre_unidade_membros`);
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await limparDre();
  equipeId = await criarEquipe(c);
  gestor = await criarUsuario(c, { papel: "gestor", equipeId });
  corretor = await criarUsuario(c, { papel: "corretor", equipeId });
  // Exatamente 1 superintendente ativo — condição para gerar_comissoes_para_venda
  // resolver o beneficiário da comissão de superintendência.
  await criarUsuario(c, { papel: "superintendente" });
  await comoSuperuser(c);
  await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gestor.id, equipeId]);

  unidadeA = await unidadeIdPorNome("SMQ Bruno");
  unidadeB = await unidadeIdPorNome("SMQ Sheldon");
});

afterAll(async () => {
  await limparDre();
  await limparDados(c);
  await c.end();
});

// ---------------------------------------------------------------------------
// 1. Seeds da migration
// ---------------------------------------------------------------------------

describe("dre: seeds", () => {
  it("as 3 unidades, o parâmetro padrão da rede e a matriz societária existem", async () => {
    await comoSuperuser(c);
    const unidades = await c.query(`SELECT nome FROM public.dre_unidades ORDER BY ordem`);
    expect(unidades.rows.map((r) => r.nome)).toEqual(["SMQ Bruno", "SMQ Sheldon", "SMQ Guilherme"]);

    const par = await c.query(
      `SELECT comissao_total_pct, imposto_sobre_faturamento_pct, consultor_pct,
              gerente_pct, socio_operador_pct
       FROM public.dre_parametros WHERE unidade_id IS NULL`,
    );
    expect(par.rowCount).toBe(1);
    expect(par.rows[0]).toMatchObject({
      comissao_total_pct: "0.0400",
      imposto_sobre_faturamento_pct: "0.1000",
      consultor_pct: "0.0180",
      gerente_pct: "0.0060",
      socio_operador_pct: "0.0030",
    });

    const socios = await c.query(`SELECT count(*)::int AS n FROM public.dre_socios_participacao`);
    expect(socios.rows[0].n).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// 2. Teste de aceite da planilha (modo 'parametro')
// ---------------------------------------------------------------------------

describe("dre_calcular: cascata da planilha, centavo a centavo", () => {
  beforeAll(async () => {
    await limparDre();
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.dre_unidade_membros (unidade_id, profile_id, papel)
       VALUES ($1, $2, 'corretor')`,
      [unidadeA, corretor.id],
    );
  });

  it("1 venda de R$ 245.000: faturamento 9.800 → margem 2.205", async () => {
    const vendaId = await registrarVenda({ dataAssinatura: "2026-05-15" });
    await aprovar(vendaId);

    const maio = await cascata(unidadeA, 5);
    expect(maio.vendas_qtd).toBe("1");
    expect(maio.vgv).toBe("245000.00");
    expect(maio.faturamento).toBe("9800.00");
    expect(maio.impostos).toBe("980.00");
    expect(maio.receita_liquida).toBe("8820.00");
    expect(maio.consultor).toBe("4410.00");
    expect(maio.gerente).toBe("1470.00");
    expect(maio.socio_operador).toBe("735.00");
    expect(maio.margem_empresa).toBe("2205.00");
  });

  it("12 vendas + R$ 13.200 de custo fixo: EBITDA 13.260 → lucro 7.956", async () => {
    // já existe 1 venda de maio do teste anterior; completa até 12.
    for (let i = 0; i < 11; i++) {
      const vendaId = await registrarVenda({ dataAssinatura: "2026-05-15" });
      await aprovar(vendaId);
    }
    await comoUsuario(c, gestor.id);
    await c.query(
      `INSERT INTO public.dre_despesas (unidade_id, categoria_id, descricao, valor, competencia)
       SELECT $1, id, 'Custo fixo do mês', 13200, '2026-05-01'
       FROM public.dre_categorias_despesa WHERE nome = 'Locação'`,
      [unidadeA],
    );

    const maio = await cascata(unidadeA, 5);
    expect(maio.vendas_qtd).toBe("12");
    expect(maio.margem_empresa).toBe("26460.00");
    expect(maio.custos_fixos).toBe("13200.00");
    expect(maio.ebitda).toBe("13260.00");
    expect(maio.reinvestimento).toBe("2652.00");
    expect(maio.reserva_expansao).toBe("2652.00");
    expect(maio.lucro_distribuicao).toBe("7956.00");
  });

  it("pró-labore: no fechamento do trimestre, só o que exceder o caixa mínimo (senão rola)", async () => {
    // Caixa mínimo = 1 × custo fixo médio (13.200) > lucro acumulado (7.956):
    // junho distribui zero e o valor rola; dezembro idem (nada novo entrou).
    const junho = await cascata(unidadeA, 6);
    expect(junho.pro_labore).toBe("0.00");
    expect(junho.caixa_acumulado).toBe("7956.00");

    // Total do ano (mes 0): caixa acumulado é posição de dezembro, não soma.
    const total = await cascata(unidadeA, 0);
    expect(total.lucro_distribuicao).toBe("7956.00");
    expect(total.caixa_acumulado).toBe("7956.00");

    // Derruba o caixa mínimo para 0,25 mês: no próximo trimestre a sobra sai.
    await comoUsuario(c, gestor.id);
    await c.query(
      `UPDATE public.dre_parametros SET caixa_minimo_meses_custo_fixo = 0.25
       WHERE unidade_id IS NULL`,
    );
    const junhoFolgado = await cascata(unidadeA, 6);
    // caixa antes da distribuição 7.956 − mínimo 3.300 = 4.656 distribuíveis
    expect(junhoFolgado.pro_labore).toBe("4656.00");
    expect(junhoFolgado.caixa_retido).toBe("-4656.00");
    expect(junhoFolgado.caixa_acumulado).toBe("3300.00");
    await c.query(
      `UPDATE public.dre_parametros SET caixa_minimo_meses_custo_fixo = 1
       WHERE unidade_id IS NULL`,
    );
  });

  it("consolidado (unidade null) soma as unidades linha a linha", async () => {
    // sequencial de propósito: as chamadas compartilham a mesma conexão e o
    // papel/claims são estado da sessão.
    const unidadeC = await unidadeIdPorNome("SMQ Guilherme");
    const consolidado = await cascata(null, 5);
    const soma = [
      await cascata(unidadeA, 5),
      await cascata(unidadeB, 5),
      await cascata(unidadeC, 5),
    ];
    const esperado = soma.reduce((acc, u) => acc + Number(u.margem_empresa), 0);
    expect(Number(consolidado.margem_empresa)).toBeCloseTo(esperado, 2);
    expect(consolidado.vendas_qtd).toBe("12");
  });
});

// ---------------------------------------------------------------------------
// 3. Modo de percentual 'venda' (gravado na venda, com fallback)
// ---------------------------------------------------------------------------

describe("dre_calcular: modo 'venda' usa o percentual gravado em cada venda", () => {
  beforeAll(async () => {
    await limparDados(c);
    await limparDre();
    equipeId = await criarEquipe(c);
    gestor = await criarUsuario(c, { papel: "gestor", equipeId });
    corretor = await criarUsuario(c, { papel: "corretor", equipeId });
    await criarUsuario(c, { papel: "superintendente" });
    await comoSuperuser(c);
    await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gestor.id, equipeId]);
    await c.query(
      `INSERT INTO public.dre_unidade_membros (unidade_id, profile_id, papel)
       VALUES ($1, $2, 'corretor')`,
      [unidadeA, corretor.id],
    );
  });

  it("percentuais da venda (3,5/1,85/0,5/0,3) mandam no modo 'venda'", async () => {
    const vendaId = await registrarVenda({
      dataAssinatura: "2026-03-10",
      pct: { total: "3.5", corretor: "1.85", gerente: "0.5", superintendente: "0.3" },
    });
    await aprovar(vendaId);

    const marco = await cascata(unidadeA, 3, "competencia", "venda");
    expect(marco.faturamento).toBe("8575.00"); // 245.000 × 3,5%
    expect(marco.impostos).toBe("857.50"); // imposto continua vindo do parâmetro (10%)
    expect(marco.consultor).toBe("4532.50"); // 245.000 × 1,85%
    expect(marco.gerente).toBe("1225.00");
    expect(marco.socio_operador).toBe("735.00");

    // no modo 'parametro' a MESMA venda volta ao modelo da planilha
    const marcoModelo = await cascata(unidadeA, 3, "competencia", "parametro");
    expect(marcoModelo.faturamento).toBe("9800.00");
  });

  it("venda sem percentual gravado (0) cai no parâmetro vigente", async () => {
    const vendaId = await registrarVenda({ dataAssinatura: "2026-04-10" });
    await aprovar(vendaId);
    const abril = await cascata(unidadeA, 4, "competencia", "venda");
    expect(abril.faturamento).toBe("9800.00");
    expect(abril.consultor).toBe("4410.00");
  });
});

// ---------------------------------------------------------------------------
// 4. Resolução de unidade (view) + avisos
// ---------------------------------------------------------------------------

describe("dre_vw_vendas_unidade: override > gerente > corretor > não atribuída", () => {
  let vendaId: string;

  beforeAll(async () => {
    await limparDados(c);
    await limparDre();
    equipeId = await criarEquipe(c);
    gestor = await criarUsuario(c, { papel: "gestor", equipeId });
    corretor = await criarUsuario(c, { papel: "corretor", equipeId });
    await criarUsuario(c, { papel: "superintendente" });
    await comoSuperuser(c);
    await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gestor.id, equipeId]);

    // percentual de gerente > 0: sem ele o CRM não gera a comissão de gerente
    // (gerar_comissoes_para_venda) e a precedência "gerente" não tem o que ler.
    vendaId = await registrarVenda({
      dataAssinatura: "2026-05-15",
      pct: { total: "3.5", corretor: "1.85", gerente: "0.5", superintendente: "0.3" },
    });
    await aprovar(vendaId); // gera comissão de gerente para o gestor da equipe
  });

  async function unidadeResolvida(): Promise<{ unidade: string | null; origem: string | null }> {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT unidade_id, origem_atribuicao FROM public.dre_vw_vendas_unidade WHERE venda_id = $1`,
      [vendaId],
    );
    return { unidade: r.rows[0].unidade_id, origem: r.rows[0].origem_atribuicao };
  }

  it("sem vínculo nenhum: não atribuída (e fora da DRE, mas contada nos avisos)", async () => {
    expect(await unidadeResolvida()).toEqual({ unidade: null, origem: null });

    const maio = await cascata(unidadeA, 5);
    expect(maio.vendas_qtd).toBe("0");

    await comoUsuario(c, gestor.id);
    const avisos = await c.query(`SELECT * FROM public.dre_avisos(NULL, 2026)`);
    expect(avisos.rows[0].sem_unidade_qtd).toBe(1);
    expect(String(avisos.rows[0].sem_unidade_vgv)).toBe("245000.00");
  });

  it("vínculo do corretor resolve a venda para a unidade dele", async () => {
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.dre_unidade_membros (unidade_id, profile_id, papel)
       VALUES ($1, $2, 'corretor')`,
      [unidadeA, corretor.id],
    );
    expect(await unidadeResolvida()).toEqual({ unidade: unidadeA, origem: "corretor" });
  });

  it("gerente comissionado vence o corretor", async () => {
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.dre_unidade_membros (unidade_id, profile_id, papel)
       VALUES ($1, $2, 'gerente')`,
      [unidadeB, gestor.id],
    );
    expect(await unidadeResolvida()).toEqual({ unidade: unidadeB, origem: "gerente" });
  });

  it("override manual vence tudo", async () => {
    await comoUsuario(c, gestor.id);
    await c.query(
      `INSERT INTO public.dre_venda_unidade (venda_id, unidade_id, definido_por)
       VALUES ($1, $2, $3)`,
      [vendaId, unidadeA, gestor.id],
    );
    expect(await unidadeResolvida()).toEqual({ unidade: unidadeA, origem: "override" });
  });

  it("vínculo com vigência posterior à assinatura não resolve", async () => {
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.dre_venda_unidade WHERE venda_id = $1`, [vendaId]);
    await c.query(`DELETE FROM public.dre_unidade_membros`);
    await c.query(
      `INSERT INTO public.dre_unidade_membros (unidade_id, profile_id, papel, vigencia_inicio)
       VALUES ($1, $2, 'corretor', '2026-06-01')`,
      [unidadeA, corretor.id],
    );
    expect(await unidadeResolvida()).toEqual({ unidade: null, origem: null });
  });
});

// ---------------------------------------------------------------------------
// 5. Regimes e avisos de recebimento
// ---------------------------------------------------------------------------

describe("dre_calcular: regime caixa", () => {
  let vendaId: string;

  beforeAll(async () => {
    await limparDados(c);
    await limparDre();
    equipeId = await criarEquipe(c);
    gestor = await criarUsuario(c, { papel: "gestor", equipeId });
    corretor = await criarUsuario(c, { papel: "corretor", equipeId });
    await criarUsuario(c, { papel: "superintendente" });
    await comoSuperuser(c);
    await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gestor.id, equipeId]);
    await c.query(
      `INSERT INTO public.dre_unidade_membros (unidade_id, profile_id, papel)
       VALUES ($1, $2, 'corretor')`,
      [unidadeA, corretor.id],
    );
    vendaId = await registrarVenda({ dataAssinatura: "2026-05-15" });
    await aprovar(vendaId);
  });

  it("sem data de recebimento a venda fica fora do regime caixa (e no aviso)", async () => {
    const maioCaixa = await cascata(unidadeA, 5, "caixa");
    expect(maioCaixa.vendas_qtd).toBe("0");
    expect(maioCaixa.faturamento).toBe("0");

    await comoUsuario(c, gestor.id);
    const avisos = await c.query(`SELECT * FROM public.dre_avisos($1, 2026)`, [unidadeA]);
    expect(avisos.rows[0].sem_recebimento_qtd).toBe(1);
  });

  it("com recebimento em julho, a venda entra em julho no caixa (competência segue maio)", async () => {
    await comoSuperuser(c);
    // grava o recebimento por fora dos triggers de imutabilidade da venda —
    // o caminho real é o Fechamento; aqui interessa só a leitura da DRE.
    await c.query(`SET session_replication_role = replica`);
    await c.query(`UPDATE public.vendas SET data_recebimento = '2026-07-03' WHERE id = $1`, [
      vendaId,
    ]);
    await c.query(`SET session_replication_role = DEFAULT`);

    const julhoCaixa = await cascata(unidadeA, 7, "caixa");
    expect(julhoCaixa.vendas_qtd).toBe("1");
    expect(julhoCaixa.faturamento).toBe("9800.00");

    const maioCompetencia = await cascata(unidadeA, 5, "competencia");
    expect(maioCompetencia.vendas_qtd).toBe("1");

    // despesa não paga fica fora do caixa; paga entra no mês do pagamento
    await comoUsuario(c, gestor.id);
    await c.query(
      `INSERT INTO public.dre_despesas
         (unidade_id, categoria_id, descricao, valor, competencia, data_pagamento)
       SELECT $1, id, 'CRM mensal', 500, '2026-05-01', '2026-06-02'
       FROM public.dre_categorias_despesa WHERE nome = 'CRM'`,
      [unidadeA],
    );
    const junhoCaixa = await cascata(unidadeA, 6, "caixa");
    expect(junhoCaixa.custos_fixos).toBe("500.00");
    const maioCaixa = await cascata(unidadeA, 5, "caixa");
    expect(maioCaixa.custos_fixos).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// 6. Guardas de acesso (RLS + RPC)
// ---------------------------------------------------------------------------

describe("dre: acesso restrito à gestão", () => {
  beforeAll(async () => {
    await limparDados(c);
    await limparDre();
    equipeId = await criarEquipe(c);
    gestor = await criarUsuario(c, { papel: "gestor", equipeId });
    corretor = await criarUsuario(c, { papel: "corretor", equipeId });
  });

  it("corretor não lê tabelas dre_ (RLS) nem chama dre_calcular (42501)", async () => {
    await comoUsuario(c, corretor.id);
    const unidades = await c.query(`SELECT count(*)::int AS n FROM public.dre_unidades`);
    expect(unidades.rows[0].n).toBe(0);

    await expect(
      c.query(`SELECT * FROM public.dre_calcular($1, 2026, 'competencia', 'venda')`, [unidadeA]),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(c.query(`SELECT * FROM public.dre_avisos(NULL, 2026)`)).rejects.toMatchObject({
      code: "42501",
    });
  });

  it("corretor não escreve despesa (RLS bloqueia)", async () => {
    await comoUsuario(c, corretor.id);
    await expect(
      c.query(
        `INSERT INTO public.dre_despesas (unidade_id, categoria_id, descricao, valor, competencia)
         VALUES ($1, (SELECT id FROM public.dre_categorias_despesa LIMIT 1), 'x', 10, '2026-05-01')`,
        [unidadeA],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("gestor lê unidades e chama dre_calcular", async () => {
    await comoUsuario(c, gestor.id);
    const unidades = await c.query(`SELECT count(*)::int AS n FROM public.dre_unidades`);
    expect(unidades.rows[0].n).toBe(3);
    const r = await c.query(
      `SELECT count(*)::int AS n FROM public.dre_calcular($1, 2026, 'competencia', 'venda')`,
      [unidadeA],
    );
    // 18 linhas × (12 meses + total)
    expect(r.rows[0].n).toBe(18 * 13);
  });

  it("despesa é normalizada para o dia 1 da competência", async () => {
    await comoUsuario(c, gestor.id);
    const r = await c.query(
      `INSERT INTO public.dre_despesas (unidade_id, categoria_id, descricao, valor, competencia)
       VALUES ($1, (SELECT id FROM public.dre_categorias_despesa LIMIT 1), 'Aluguel', 1000, '2026-05-17')
       RETURNING competencia::text, created_by`,
      [unidadeA],
    );
    expect(r.rows[0].competencia).toBe("2026-05-01");
    expect(r.rows[0].created_by).toBe(gestor.id);
  });
});
