/**
 * Aprovação de crédito com dados (migration 20260927120000) contra o banco
 * real: colunas + coluna gerada, CHECKs, a view aprovacoes_credito_vigentes
 * (só a ÚLTIMA análise do lead, com a RLS de quem consulta) e a versão de
 * prompt que registra a ação de leitura por IA.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

let gestor: UsuarioTeste;
let corretorA: UsuarioTeste;
let corretorB: UsuarioTeste;
let leadAprovado: string;
let leadReprovadoDepois: string;
let leadVencido: string;
let leadDoB: string;

async function analise(
  leadId: string,
  corretorId: string,
  status: string,
  criadoHaDias: number,
  extra: Record<string, unknown> = {},
): Promise<string> {
  await comoSuperuser(c);
  const cols = ["lead_id", "corretor_id", "status", "created_at", ...Object.keys(extra)];
  const vals = [
    leadId,
    corretorId,
    status,
    new Date(Date.now() - criadoHaDias * 86_400_000),
    ...Object.values(extra),
  ];
  const r = await c.query(
    `INSERT INTO public.analises_credito (${cols.join(", ")})
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
    vals,
  );
  return r.rows[0].id;
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  const equipeId = await criarEquipe(c);
  gestor = await criarUsuario(c, { papel: "gestor", equipeId });
  corretorA = await criarUsuario(c, { papel: "corretor", equipeId });
  corretorB = await criarUsuario(c, { papel: "corretor", equipeId });

  const st = { status: "analise_credito" };
  leadAprovado = await criarLead(c, { ...st, corretorId: corretorA.id });
  leadReprovadoDepois = await criarLead(c, { ...st, corretorId: corretorA.id });
  leadVencido = await criarLead(c, { ...st, corretorId: corretorA.id });
  leadDoB = await criarLead(c, { ...st, corretorId: corretorB.id });

  // Retorno SIRIC real (números do exemplo do dono) + FGTS.
  await analise(leadAprovado, corretorA.id, "aprovada", 1, {
    valor_financiamento: 210222.91,
    valor_parcela: 1404.79,
    valor_fgts: 10000,
    valor_imovel_max: 275000,
    renda_familiar: 4682.64,
    faixa_mcmv: "2",
    validade_ate: new Date(Date.now() + 30 * 86_400_000),
  });
  // Aprovada e DEPOIS reprovada: não está aprovada hoje.
  await analise(leadReprovadoDepois, corretorA.id, "aprovada", 10, { valor_financiamento: 150000 });
  await analise(leadReprovadoDepois, corretorA.id, "reprovada", 2);
  await analise(leadVencido, corretorA.id, "aprovada_condicionada", 5, {
    valor_financiamento: 180000,
    validade_ate: new Date(Date.now() - 86_400_000),
  });
  await analise(leadDoB, corretorB.id, "aprovada", 1, { valor_financiamento: 300000 });
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

describe("colunas da aprovação", () => {
  it("poder_compra é gerado: financiamento + FGTS + subsídio + entrada", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT poder_compra::numeric AS p FROM public.analises_credito
       WHERE lead_id = $1`,
      [leadAprovado],
    );
    expect(Number(r.rows[0].p)).toBeCloseTo(220222.91, 2);
  });

  it("CHECKs barram vocabulário e valores inválidos em escritas novas", async () => {
    expect(
      await errCode(analise(leadAprovado, corretorA.id, "aprovada", 0, { modalidade: "xyz" })),
    ).toBe("23514");
    expect(
      await errCode(analise(leadAprovado, corretorA.id, "aprovada", 0, { valor_parcela: -1 })),
    ).toBe("23514");
    expect(
      await errCode(analise(leadAprovado, corretorA.id, "aprovada", 0, { faixa_mcmv: "5" })),
    ).toBe("23514");
  });

  it("o corretor dono grava os dados da aprovação pela própria RLS", async () => {
    await comoUsuario(c, corretorA.id);
    const r = await c.query(
      `UPDATE public.analises_credito SET banco = 'Caixa', dados_origem = 'ia_revisado'
       WHERE lead_id = $1 RETURNING banco`,
      [leadAprovado],
    );
    expect(r.rowCount).toBe(1);
    await comoSuperuser(c);
  });
});

describe("view aprovacoes_credito_vigentes", () => {
  it("corretor vê só a própria carteira e só a ÚLTIMA análise aprovada", async () => {
    await comoUsuario(c, corretorA.id);
    const r = await c.query(
      `SELECT lead_id, vencida FROM public.aprovacoes_credito_vigentes ORDER BY lead_id`,
    );
    await comoSuperuser(c);
    const ids = r.rows.map((x) => x.lead_id);
    expect(ids).toContain(leadAprovado);
    expect(ids).toContain(leadVencido);
    expect(ids).not.toContain(leadReprovadoDepois); // reprovada depois
    expect(ids).not.toContain(leadDoB); // carteira de outro corretor
    expect(r.rows.find((x) => x.lead_id === leadVencido)?.vencida).toBe(true);
    expect(r.rows.find((x) => x.lead_id === leadAprovado)?.vencida).toBe(false);
  });

  it("gestão vê a equipe e filtra por faixa de valor (o relatório)", async () => {
    await comoUsuario(c, gestor.id);
    const r = await c.query(
      `SELECT lead_id FROM public.aprovacoes_credito_vigentes
       WHERE valor_financiamento BETWEEN 200000 AND 320000 ORDER BY valor_financiamento`,
    );
    await comoSuperuser(c);
    expect(r.rows.map((x) => x.lead_id)).toEqual([leadAprovado, leadDoB]);
  });
});

describe("governança da IA", () => {
  it("a versão ativa tem a ação de leitura e preserva as ações anteriores", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT version, action_prompts ? 'ler_aprovacao_credito' AS tem,
              action_prompts ? 'match_projetos' AS preserva
       FROM public.samiq_prompt_versions WHERE active`,
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ version: "samiq-2026-09-v6", tem: true, preserva: true });
  });
});
