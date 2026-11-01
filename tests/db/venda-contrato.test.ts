/**
 * Venda por contrato (IA) — migration 20261101120000 contra o banco real:
 * colunas do comprador, `aplicar_dados_contrato_lead` (lista fechada, RLS de
 * quem chama, nunca apaga nome/telefone), os campos novos subindo para o
 * registro mãe e a versão de prompt com a ação `ler_contrato_venda`.
 * Dados fictícios (CPF de teste 529.982.247-25).
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

let corretorA: UsuarioTeste;
let corretorB: UsuarioTeste;
let leadA: string;

const aplicar = (leadId: string, dados: Record<string, unknown>) =>
  c.query(`SELECT public.aplicar_dados_contrato_lead($1, $2::jsonb) AS r`, [
    leadId,
    JSON.stringify(dados),
  ]);

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  const equipeId = await criarEquipe(c);
  corretorA = await criarUsuario(c, { papel: "corretor", equipeId });
  corretorB = await criarUsuario(c, { papel: "corretor", equipeId });
  leadA = await criarLead(c, {
    corretorId: corretorA.id,
    status: "em_atendimento",
    nome: "Maria Exemplo",
  });
});

afterAll(async () => {
  await c.end();
});

describe("aplicar_dados_contrato_lead", () => {
  it("o dono grava os dados do contrato num UPDATE só", async () => {
    await comoUsuario(c, corretorA.id);
    const r = await aplicar(leadA, {
      cpf: "529.982.247-25",
      rg: "12.345.678-9",
      data_nascimento: "1990-01-01",
      estado_civil: "Solteiro(a)",
      profissao: "Vendedora",
      renda_estimada: 8307.34,
      endereco_logradouro: "Rua das Flores",
      endereco_numero: "100",
      endereco_bairro: "Centro",
      endereco_cidade: "São Paulo",
      endereco_uf: "sp",
      endereco_cep: "04809-180",
      conjuge_nome: "José Exemplo",
      conjuge_cpf: "111.444.777-35",
    });
    expect(r.rows[0].r).toEqual({ ok: true, campos: 14 });

    await comoSuperuser(c);
    const l = await c.query(
      `SELECT cpf, rg, data_nascimento::text AS nasc, renda_estimada::float AS renda,
              endereco_uf, endereco_cep, conjuge_cpf, nome
         FROM public.leads WHERE id = $1`,
      [leadA],
    );
    expect(l.rows[0]).toEqual({
      cpf: "529.982.247-25",
      rg: "12.345.678-9",
      nasc: "1990-01-01",
      renda: 8307.34,
      endereco_uf: "SP", // normalizado no banco
      endereco_cep: "04809180", // só dígitos
      conjuge_cpf: "11144477735",
      nome: "Maria Exemplo",
    });
  });

  it("os campos novos sobem para o registro mãe", async () => {
    await comoSuperuser(c);
    const m = await c.query(
      `SELECT c.dados ? 'rg' AS rg, c.dados ? 'endereco_cep' AS cep,
              c.dados ? 'conjuge_nome' AS conjuge, c.cpf
         FROM public.clientes AS c JOIN public.leads AS l ON l.cliente_id = c.id
        WHERE l.id = $1`,
      [leadA],
    );
    expect(m.rows[0]).toMatchObject({ rg: true, cep: true, conjuge: true });
    const campos = await c.query(`SELECT public._cliente_campos() AS c`);
    expect(campos.rows[0].c).toEqual(
      expect.arrayContaining(["nome", "cpf", "rg", "endereco_cep", "conjuge_cpf"]),
    );
  });

  it("nome e telefone nunca são apagados; campo opcional vazio limpa", async () => {
    await comoUsuario(c, corretorA.id);
    await aplicar(leadA, { nome: "", telefone: "  ", profissao: "" });
    await comoSuperuser(c);
    const l = await c.query(`SELECT nome, telefone, profissao FROM public.leads WHERE id = $1`, [
      leadA,
    ]);
    expect(l.rows[0].nome).toBe("Maria Exemplo");
    expect(l.rows[0].telefone).toBeTruthy();
    expect(l.rows[0].profissao).toBeNull();
  });

  it("campo fora da lista é erro, não some em silêncio", async () => {
    await comoUsuario(c, corretorA.id);
    expect(await errCode(aplicar(leadA, { status: "contrato_fechado" }))).toBe("22023");
    expect(await errCode(aplicar(leadA, { corretor_id: corretorB.id }))).toBe("22023");
  });

  it("corretor de outra carteira não grava (RLS) e lead some como 'não encontrado'", async () => {
    await comoUsuario(c, corretorB.id);
    expect(await errCode(aplicar(leadA, { profissao: "Hacker" }))).toBe("P0002");
  });

  it("CHECK barra UF e CEP fora do formato", async () => {
    await comoUsuario(c, corretorA.id);
    expect(await errCode(aplicar(leadA, { endereco_uf: "SPX" }))).toBe("23514");
    expect(await errCode(aplicar(leadA, { endereco_cep: "123" }))).toBe("23514");
  });

  it("anônimo não executa", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT has_function_privilege('anon', 'public.aplicar_dados_contrato_lead(uuid, jsonb)', 'EXECUTE') AS pode`,
    );
    expect(r.rows[0].pode).toBe(false);
  });
});

describe("governança da IA", () => {
  it("a versão ativa tem ler_contrato_venda e preserva as ações anteriores", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT version, action_prompts ? 'ler_contrato_venda' AS tem,
              action_prompts ? 'ler_aprovacao_credito' AS aprovacao,
              action_prompts ? 'match_projetos' AS match,
              action_prompts->>'ler_contrato_venda' AS prompt
         FROM public.samiq_prompt_versions WHERE active`,
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      version: "samiq-2026-11-contrato",
      tem: true,
      aprovacao: true,
      match: true,
    });
    expect(r.rows[0].prompt).toContain("PROMISSÁRIO COMPRADOR");
  });

  it("a reserva da ação devolve o prompt versionado", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT allowed, action_prompt FROM public.samiq_reservar_execucao($1, 'ler_contrato_venda', 12000, 1200)`,
      [corretorA.id],
    );
    expect(r.rows[0].allowed).toBe(true);
    expect(r.rows[0].action_prompt).toContain("valor_venda");
  });
});
