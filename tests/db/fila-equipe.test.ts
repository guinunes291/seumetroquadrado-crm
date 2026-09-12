/**
 * fila_equipe_v1 (migration 20260912230000): a Fila Única vista pelo gestor —
 * uma linha por corretor do escopo com carteira ativa, vencidos, sem próximo
 * passo (a régua de leads_sem_acao), fundo do funil parado e VGV em jogo.
 *
 * O que está em jogo:
 *  - ESCOPO: corretor recebe 42501 (nunca lista vazia); gestor vê a equipe
 *    (corretor de outra equipe não aparece); admin vê todos e a linha
 *    "Sem corretor";
 *  - as CONTAGENS batem com as réguas das outras telas: vencido = follow-up
 *    no passado; sem passo = nada aberto (tarefa, agendamento futuro,
 *    follow-up futuro); fundo parado = etapa do fundo + 5 dias sem movimento
 *    pelo relógio da Higiene; em jogo = preço de tabela, nunca sob consulta;
 *  - corretor da equipe sem lead vivo aparece zerado (o gestor cobra quem
 *    não tem nada na mesa também).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarEquipe,
  criarLead,
  criarProjeto,
  criarUsuario,
  errCode,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

type Row = {
  corretor_id: string | null;
  nome: string;
  carteira_ativa: number;
  vencidos: number;
  sem_proximo_passo: number;
  fundo_parado: number;
  em_jogo: string | number;
};

let admin: UsuarioTeste;
let gestorA: UsuarioTeste;
let corretor1: UsuarioTeste; // equipe A, com leads
let corretor3: UsuarioTeste; // equipe A, sem leads
let corretor2: UsuarioTeste; // equipe B

async function equipe(): Promise<Row[]> {
  const r = await c.query(`SELECT * FROM public.fila_equipe_v1()`);
  return r.rows as Row[];
}
const linha = (rows: Row[], id: string | null) => rows.find((r) => r.corretor_id === id);

beforeAll(async () => {
  await c.connect();
  await limparDados(c);

  const equipeA = await criarEquipe(c, { nome: "Equipe A Fila" });
  const equipeB = await criarEquipe(c, { nome: "Equipe B Fila" });
  admin = await criarUsuario(c, { nome: "Admin FE", papel: "admin" });
  gestorA = await criarUsuario(c, { nome: "Gestor A FE", papel: "gestor", equipeId: equipeA });
  corretor1 = await criarUsuario(c, {
    nome: "Corretor A1 FE",
    papel: "corretor",
    equipeId: equipeA,
  });
  corretor3 = await criarUsuario(c, {
    nome: "Corretor A3 FE",
    papel: "corretor",
    equipeId: equipeA,
  });
  corretor2 = await criarUsuario(c, {
    nome: "Corretor B1 FE",
    papel: "corretor",
    equipeId: equipeB,
  });
  await comoSuperuser(c);
  await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gestorA.id, equipeA]);

  const projeto = await criarProjeto(c, { nome: "Liber FE" });
  await c.query(`UPDATE public.projetos SET preco_a_partir = 250000 WHERE id = $1`, [projeto]);
  const sobConsulta = await criarProjeto(c, { nome: "Sob consulta FE" });
  await c.query(
    `UPDATE public.projetos SET preco_a_partir = 900000, sob_consulta = true WHERE id = $1`,
    [sobConsulta],
  );

  // corretor1:
  // L1 — análise de crédito parada há 20 dias, sem nada aberto: fundo + sem passo. R$ 250 mil.
  const l1 = await criarLead(c, {
    corretorId: corretor1.id,
    status: "analise_credito",
    projetoId: projeto,
  });
  await c.query(
    `UPDATE public.leads SET created_at = now() - interval '20 days',
                             ultima_interacao = now() - interval '20 days' WHERE id = $1`,
    [l1],
  );
  // L2 — em atendimento com follow-up vencido ontem e sem tarefa aberta: vencido + sem passo.
  const l2 = await criarLead(c, { corretorId: corretor1.id, status: "em_atendimento" });
  await c.query(
    `UPDATE public.leads SET proximo_followup = now() - interval '1 day' WHERE id = $1`,
    [l2],
  );
  // L3 — agendado com movimento ontem e tarefa aberta amanhã: nem parado, nem vencido, nem sem passo.
  const l3 = await criarLead(c, {
    corretorId: corretor1.id,
    status: "agendado",
    projetoId: sobConsulta,
  });
  await c.query(
    `UPDATE public.leads SET ultima_interacao = now() - interval '1 day',
                             proximo_followup = now() + interval '1 day' WHERE id = $1`,
    [l3],
  );
  await c.query(
    `INSERT INTO public.tarefas (titulo, tipo, status, prioridade, lead_id, corretor_id, criado_por, data_vencimento)
     VALUES ('Confirmar visita', 'whatsapp', 'pendente', 'alta', $1, $2, $2, now() + interval '1 day')`,
    [l3, corretor1.id],
  );
  // L4 — perdido: fora da carteira ativa.
  const l4 = await criarLead(c, { corretorId: corretor1.id, status: "em_atendimento" });
  await c.query(
    `UPDATE public.leads SET status = 'perdido', motivo_perda_categoria = 'outro' WHERE id = $1`,
    [l4],
  );
  // corretor2 (equipe B): um lead vivo.
  await criarLead(c, { corretorId: corretor2.id, status: "em_atendimento", projetoId: projeto });
  // sem dono: dois leads novos (o estoque da pré-venda).
  await criarLead(c, { corretorId: null, status: "novo" });
  await criarLead(c, { corretorId: null, status: "novo", projetoId: projeto });

  await comoSuperuser(c);
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

describe("fila_equipe_v1 — escopo", () => {
  it("corretor recebe 42501, nunca uma lista vazia", async () => {
    await comoUsuario(c, corretor1.id);
    const code = await errCode(c.query(`SELECT * FROM public.fila_equipe_v1()`));
    await comoSuperuser(c);
    expect(code).toBe("42501");
  });

  it("gestor vê a equipe inteira (inclusive quem não tem lead) e não vê outra equipe nem 'Sem corretor'", async () => {
    await comoUsuario(c, gestorA.id);
    const rows = await equipe();
    await comoSuperuser(c);
    expect(linha(rows, corretor1.id)).toBeDefined();
    expect(linha(rows, corretor3.id)).toMatchObject({
      carteira_ativa: 0,
      vencidos: 0,
      sem_proximo_passo: 0,
      fundo_parado: 0,
    });
    expect(linha(rows, corretor2.id)).toBeUndefined();
    expect(linha(rows, null)).toBeUndefined();
    // Quem tem fundo parado vem primeiro.
    expect(rows[0].corretor_id).toBe(corretor1.id);
  });

  it("admin vê todo mundo e a linha 'Sem corretor' com o estoque sem dono", async () => {
    await comoUsuario(c, admin.id);
    const rows = await equipe();
    await comoSuperuser(c);
    expect(linha(rows, corretor2.id)).toMatchObject({ carteira_ativa: 1 });
    const semDono = linha(rows, null);
    expect(semDono).toMatchObject({ nome: "Sem corretor", carteira_ativa: 2 });
    expect(Number(semDono?.em_jogo)).toBe(250000);
    // A linha sem dono fecha a lista.
    expect(rows[rows.length - 1].corretor_id).toBeNull();
  });
});

describe("fila_equipe_v1 — as contagens batem com as réguas das outras telas", () => {
  it("carteira ativa, vencidos, sem passo, fundo parado e VGV em jogo do corretor1", async () => {
    await comoUsuario(c, gestorA.id);
    const rows = await equipe();
    await comoSuperuser(c);
    const r = linha(rows, corretor1.id);
    // L1 + L2 + L3 vivos (L4 perdido fora).
    expect(r).toMatchObject({ carteira_ativa: 3 });
    // L2: follow-up de ontem.
    expect(r?.vencidos).toBe(1);
    // L1 (nada aberto) e L2 (follow-up vencido e sem tarefa); L3 tem tarefa e follow-up futuro.
    expect(r?.sem_proximo_passo).toBe(2);
    // L1 parada há 20 dias em análise; L3 agendado com movimento ontem.
    expect(r?.fundo_parado).toBe(1);
    // L1 no projeto de R$ 250 mil; L3 no projeto sob consulta não soma; L2 sem projeto.
    expect(Number(r?.em_jogo)).toBe(250000);
  });
});
