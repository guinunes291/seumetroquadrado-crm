/**
 * Bolsão de oportunidades (migration 20260914120000) — Fatia 4, passo 1.
 *
 * O que está em jogo, na ordem em que quebraria a operação:
 *  - LEAD COM VENDA NÃO SE MEXE. Regra nº 1 da diretoria e a de maior
 *    precedência do §4 do documento. Venda viva é o mesmo recorte que o índice
 *    `uq_vendas_lead_ativa` protege (rascunho/pendente/aprovada); distrato é a
 *    exceção da exceção — a venda caiu, o lead volta a ser lead.
 *  - POSSE E DISCAGEM SÃO PERGUNTAS DIFERENTES. `_lead_venda_viva` decide
 *    POSSE e respeita o distrato — negócio que caiu devolve o lead. Mas venda
 *    cancelada não reverte o status: o lead fica parado em `contrato_fechado`
 *    sem venda viva, e aí ele NÃO pode ir para o discador — quem olha a tela
 *    não sabe que a venda caiu. Congelar por status resolveria a lista e
 *    quebraria o distrato; por isso são duas regras, não uma.
 *  - OPT-OUT É EXCLUSÃO DURA. O Bolsão alimenta discador e SDR. Lead que pediu
 *    para não ser contatado entrar nessa fila é incidente de LGPD, não bug de
 *    listagem.
 *  - O TELEFONE SAI MASCARADO. Sem isso "puxar" vira opcional: bastaria copiar
 *    o número da tela e ligar por fora do CRM — que é exatamente como a
 *    carteira deixa de ser auditável.
 *  - ANONIMATO: nenhuma coluna do retorno diz de quem o lead era. É o que o
 *    §5.2 do documento pede, e vale para o contrato da RPC, não só para a tela.
 *  - Passo 1 é SÓ LEITURA: nada aqui muda dono de lead nenhum.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarLead,
  criarUsuario,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

type LinhaBolsao = {
  lead_id: string;
  nome: string;
  telefone_mascarado: string | null;
  status: string;
  origem: string;
  parado_desde: Date;
  dias_parado: number;
  tem_interacao: boolean;
  tem_contato: boolean;
  em_triagem_sdr: boolean;
};

let corretor: UsuarioTeste;
let gestor: UsuarioTeste;
let semDono: string;
let comDono: string;
let comVenda: string;
let comVendaDistratada: string;
let optOut: string;
let semTelefone: string;
let comSdr: string;
let contratoFechadoSemVenda: string;
let posVendaSemVenda: string;

async function bolsao(quem: UsuarioTeste, busca?: string): Promise<LinhaBolsao[]> {
  await comoUsuario(c, quem.id);
  const r = await c.query(`SELECT * FROM public.bolsao_v1($1, 200, 0)`, [busca ?? null]);
  return r.rows as LinhaBolsao[];
}

async function criarVenda(leadId: string, distrato = false): Promise<void> {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.vendas
       (lead_id, data_assinatura, valor_venda, status_venda, distrato)
     VALUES ($1, current_date, 250000, 'pendente'::public.status_venda, $2)`,
    [leadId, distrato],
  );
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);

  corretor = await criarUsuario(c, { nome: "Corretor Bolsão", papel: "corretor" });
  gestor = await criarUsuario(c, { nome: "Gestor Bolsão", papel: "gestor" });

  // O lead-padrão do Bolsão: vivo, sem dono, discável, parado há muito tempo.
  semDono = await criarLead(c, { nome: "Sem Dono", telefone: "11999990001" });
  comDono = await criarLead(c, {
    nome: "Com Dono",
    telefone: "11999990002",
    corretorId: corretor.id,
  });
  comVenda = await criarLead(c, { nome: "Com Venda", telefone: "11999990003" });
  comVendaDistratada = await criarLead(c, {
    nome: "Venda Distratada",
    telefone: "11999990004",
  });
  optOut = await criarLead(c, { nome: "Pediu Silêncio", telefone: "11999990005" });
  semTelefone = await criarLead(c, { nome: "Sem Telefone", telefone: "123" });
  comSdr = await criarLead(c, { nome: "Em Triagem", telefone: "11999990006" });
  // O status que mente: a venda foi cancelada ou distratada depois do
  // fechamento e ninguém reverteu o status do lead. O app chega aqui de
  // verdade; a criação direta é barrada por `trg_proteger_fechamento_insert`,
  // então o fixture desliga os triggers para reproduzir o estado final.
  contratoFechadoSemVenda = await criarLead(c, {
    nome: "Já Assinou",
    telefone: "11999990007",
  });
  posVendaSemVenda = await criarLead(c, { nome: "Pós-venda", telefone: "11999990008" });
  await comoSuperuser(c);
  await c.query(`SET session_replication_role = replica`);
  await c.query(
    `UPDATE public.leads SET status = 'contrato_fechado'::public.lead_status
      WHERE id = $1`,
    [contratoFechadoSemVenda],
  );
  await c.query(`UPDATE public.leads SET status = 'pos_venda'::public.lead_status WHERE id = $1`, [
    posVendaSemVenda,
  ]);
  await c.query(`SET session_replication_role = DEFAULT`);

  await criarVenda(comVenda);
  await criarVenda(comVendaDistratada, true);

  await comoSuperuser(c);
  await c.query(`UPDATE public.leads SET opt_out = true WHERE id = $1`, [optOut]);
  await c.query(`UPDATE public.leads SET sdr_id = $2 WHERE id = $1`, [comSdr, gestor.id]);
  // Relógio: o mais frio primeiro. `semDono` é o mais antigo da casa.
  await c.query(`UPDATE public.leads SET created_at = now() - interval '400 days' WHERE id = $1`, [
    semDono,
  ]);
});

describe("bolsao_v1 — quem entra", () => {
  it("lead vivo sem dono entra", async () => {
    const ids = (await bolsao(corretor)).map((l) => l.lead_id);
    expect(ids).toContain(semDono);
  });

  it("lead com dono NÃO entra — o Bolsão é a base sem dono", async () => {
    const ids = (await bolsao(corretor)).map((l) => l.lead_id);
    expect(ids).not.toContain(comDono);
  });

  it("lead com venda viva NÃO entra — não se mexe em quem já comprou", async () => {
    const ids = (await bolsao(corretor)).map((l) => l.lead_id);
    expect(ids).not.toContain(comVenda);
  });

  it("venda distratada devolve o lead ao Bolsão", async () => {
    const ids = (await bolsao(corretor)).map((l) => l.lead_id);
    expect(ids).toContain(comVendaDistratada);
  });

  it("opt-out NÃO entra — o Bolsão alimenta discador e SDR", async () => {
    const ids = (await bolsao(corretor)).map((l) => l.lead_id);
    expect(ids).not.toContain(optOut);
  });

  it("sem telefone discável NÃO entra — o Bolsão vale o que se disca", async () => {
    const ids = (await bolsao(corretor)).map((l) => l.lead_id);
    expect(ids).not.toContain(semTelefone);
  });

  it("contrato fechado NÃO entra, mesmo sem venda viva por trás", async () => {
    const ids = (await bolsao(corretor)).map((l) => l.lead_id);
    expect(ids).not.toContain(contratoFechadoSemVenda);
  });

  it("pós-venda NÃO entra, mesmo sem venda viva por trás", async () => {
    const ids = (await bolsao(corretor)).map((l) => l.lead_id);
    expect(ids).not.toContain(posVendaSemVenda);
  });

  it("lead em triagem de SDR entra, mas vem marcado", async () => {
    const linha = (await bolsao(corretor)).find((l) => l.lead_id === comSdr);
    expect(linha?.em_triagem_sdr).toBe(true);
  });
});

describe("bolsao_v1 — anonimato", () => {
  it("nenhuma coluna do retorno revela o dono", async () => {
    await comoUsuario(c, corretor.id);
    const r = await c.query(`SELECT * FROM public.bolsao_v1(NULL, 1, 0)`);
    const colunas = r.fields.map((f) => f.name);
    expect(colunas.some((n) => n.includes("corretor"))).toBe(false);
    expect(colunas).not.toContain("telefone");
  });

  it("o telefone sai mascarado — não dá para discar da tela", async () => {
    const linha = (await bolsao(corretor)).find((l) => l.lead_id === semDono);
    expect(linha?.telefone_mascarado).toBe("(11) •••••0001");
    expect(linha?.telefone_mascarado).not.toContain("99999");
  });
});

describe("bolsao_v1 — busca e ordem", () => {
  it("acha pelo telefone como o cliente manda, não como está no cadastro", async () => {
    const ids = (await bolsao(corretor, "(11) 99999-0001")).map((l) => l.lead_id);
    expect(ids).toEqual([semDono]);
  });

  it("o mais frio vem primeiro", async () => {
    const linhas = await bolsao(corretor);
    expect(linhas[0]?.lead_id).toBe(semDono);
    expect(linhas[0]?.dias_parado).toBeGreaterThan(390);
  });
});

describe("bolsao_diagnostico_v1", () => {
  it("a gestão vê a virada dimensionada", async () => {
    await comoUsuario(c, gestor.id);
    const r = await c.query(`SELECT * FROM public.bolsao_diagnostico_v1()`);
    const d = r.rows[0];
    expect(Number(d.base_viva)).toBe(9);
    expect(Number(d.com_dono)).toBe(1);
    expect(Number(d.sem_dono)).toBe(8);
    // Posse: só `comVenda` congela — o distratado voltou a ser lead.
    expect(Number(d.congelados_por_venda)).toBe(1);
    // Discagem: dois leads cujo status diz fechado sem venda viva por trás.
    expect(Number(d.status_de_venda)).toBe(2);
    expect(Number(d.status_de_venda_sem_venda_viva)).toBe(2);
    expect(Number(d.sem_dono_sem_telefone)).toBe(1);
    expect(Number(d.sem_dono_opt_out)).toBe(1);
    // 8 sem dono − 1 sem telefone − 1 opt-out − 1 com venda − 2 "fechados" = 3.
    expect(Number(d.bolsao_elegivel)).toBe(3);
  });

  it("fora da gestão devolve zeros — é painel, não gate", async () => {
    await comoUsuario(c, corretor.id);
    const r = await c.query(`SELECT * FROM public.bolsao_diagnostico_v1()`);
    expect(Number(r.rows[0].base_viva)).toBe(0);
  });

  it("conta o estoque com dono pelas três origens de despejo", async () => {
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads SET origem = 'importacao'::public.lead_origem
        WHERE id = $1`,
      [comDono],
    );
    await comoUsuario(c, gestor.id);
    const r = await c.query(`SELECT * FROM public.bolsao_diagnostico_v1()`);
    expect(Number(r.rows[0].estoque_com_dono)).toBe(1);
  });
});

describe("passo 1 é só leitura", () => {
  it("o classificador de venda não é sondável por um corretor", async () => {
    await comoUsuario(c, corretor.id);
    await expect(c.query(`SELECT public._lead_venda_viva($1)`, [comVenda])).rejects.toThrow();
  });

  it("nenhuma função do Bolsão é VOLATILE", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT p.proname FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname LIKE 'bolsao%'
          AND p.provolatile = 'v'`,
    );
    expect(r.rows).toEqual([]);
  });
});
