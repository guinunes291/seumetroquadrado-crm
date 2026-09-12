/**
 * fila_funil_v1 (migration 20260912190000): o funil das etapas da Fila Única
 * em dois recortes numa chamada.
 *
 * O que está em jogo:
 *  - o RELÓGIO de "parado" é o da Higiene (GREATEST(ultima_interacao,
 *    ultimo_contato), senão created_at) — um contato recente sem interação
 *    registrada NÃO é lead parado;
 *  - a SAFRA é por created_at dentro da janela; a BASE é a carteira inteira;
 *  - 'perdido' volta como etapa própria e venda nunca conta como parada;
 *  - ESCOPO: corretor vê só a própria carteira (o _corretor é ignorado),
 *    gestor vê o time (corretor de outra equipe devolve zero linhas, não
 *    erro), admin vê tudo.
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

type Row = { recorte: string; etapa: string; ordem: number; quantidade: number; parados: number };

let admin: UsuarioTeste;
let gestorA: UsuarioTeste;
let corretor1: UsuarioTeste; // equipe A (time do gestorA)
let corretor2: UsuarioTeste; // equipe B (fora do time)

async function funil(dias = 30, corretor: string | null = null): Promise<Row[]> {
  const r = await c.query(`SELECT * FROM public.fila_funil_v1($1, $2)`, [dias, corretor]);
  return r.rows as Row[];
}

const linha = (rows: Row[], recorte: string, etapa: string) =>
  rows.find((r) => r.recorte === recorte && r.etapa === etapa);

beforeAll(async () => {
  await c.connect();
  await limparDados(c);

  const equipeA = await criarEquipe(c, { nome: "Equipe A Funil" });
  const equipeB = await criarEquipe(c, { nome: "Equipe B Funil" });
  admin = await criarUsuario(c, { nome: "Admin F", papel: "admin" });
  gestorA = await criarUsuario(c, { nome: "Gestor A F", papel: "gestor", equipeId: equipeA });
  corretor1 = await criarUsuario(c, {
    nome: "Corretor A1 F",
    papel: "corretor",
    equipeId: equipeA,
  });
  corretor2 = await criarUsuario(c, {
    nome: "Corretor B1 F",
    papel: "corretor",
    equipeId: equipeB,
  });
  await comoSuperuser(c);
  await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gestorA.id, equipeA]);

  // corretor1: um lead por situação que o funil precisa distinguir.
  // L1 — chegou agora, sem 1º contato: safra + base, não parado.
  await criarLead(c, { corretorId: corretor1.id, status: "aguardando_atendimento" });
  // L2 — criado há 20 dias (dentro da safra), última interação há 10 dias:
  // PARADO nos dois recortes.
  const l2 = await criarLead(c, { corretorId: corretor1.id, status: "em_atendimento" });
  await c.query(
    `UPDATE public.leads SET created_at = now() - interval '20 days',
                             ultima_interacao = now() - interval '10 days',
                             ultimo_contato = NULL
      WHERE id = $1`,
    [l2],
  );
  // L3 — criado há 60 dias (fora da safra); interação velha MAS contato de
  // ontem: o relógio da Higiene pega o maior dos dois → NÃO parado.
  const l3 = await criarLead(c, { corretorId: corretor1.id, status: "analise_credito" });
  await c.query(
    `UPDATE public.leads SET created_at = now() - interval '60 days',
                             ultima_interacao = now() - interval '40 days',
                             ultimo_contato = now() - interval '1 day'
      WHERE id = $1`,
    [l3],
  );
  // L4 — perdido hoje: saída lateral, nos dois recortes.
  const l4 = await criarLead(c, { corretorId: corretor1.id, status: "em_atendimento" });
  await c.query(
    `UPDATE public.leads SET status = 'perdido', motivo_perda_categoria = 'outro' WHERE id = $1`,
    [l4],
  );
  // L5 — na lixeira: nunca entra.
  const l5 = await criarLead(c, { corretorId: corretor1.id, status: "em_atendimento" });
  await c.query(`UPDATE public.leads SET na_lixeira = true WHERE id = $1`, [l5]);
  // L6 — venda antiga e sem movimento: conta na base, nunca como parada.
  // contrato_fechado tem guarda de produção (trg_proteger_fechamento_sem_
  // venda_aprovada: só fecha com venda aprovada). A fixture é um dado
  // histórico e entra por baixo do trigger, como em higiene-funil.test.ts —
  // a guarda segue valendo no caminho real (aprovar-venda.test.ts a cobre).
  const l6 = await criarLead(c, { corretorId: corretor1.id, status: "em_atendimento" });
  await c.query(`SET session_replication_role = replica`);
  await c.query(
    `UPDATE public.leads SET status = 'contrato_fechado'::public.lead_status,
                             created_at = now() - interval '60 days',
                             ultima_interacao = now() - interval '40 days'
      WHERE id = $1`,
    [l6],
  );
  await c.query(`SET session_replication_role = DEFAULT`);
  // L7 — sem dono, em 'novo': a "entrada" do funil, que só quem vê tudo enxerga.
  await criarLead(c, { corretorId: null, status: "novo" });

  // corretor2 (outra equipe): um lead em atendimento, chegou agora.
  await criarLead(c, { corretorId: corretor2.id, status: "em_atendimento" });

  await comoSuperuser(c);
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

describe("fila_funil_v1 — corretor vê a própria carteira nos dois recortes", () => {
  it("base: cada etapa com quantidade e parados pelo relógio da Higiene; perdido à parte", async () => {
    await comoUsuario(c, corretor1.id);
    const rows = await funil(30);
    await comoSuperuser(c);

    expect(linha(rows, "base", "aguardando_atendimento")).toMatchObject({
      ordem: 1,
      quantidade: 1,
      parados: 0,
    });
    expect(linha(rows, "base", "em_atendimento")).toMatchObject({
      ordem: 4,
      quantidade: 1,
      parados: 1,
    });
    // interação há 40 dias, contato ontem: GREATEST → não parado.
    expect(linha(rows, "base", "analise_credito")).toMatchObject({
      ordem: 7,
      quantidade: 1,
      parados: 0,
    });
    expect(linha(rows, "base", "perdido")).toMatchObject({ ordem: 99, quantidade: 1, parados: 0 });
    // venda: 40 dias sem interação e mesmo assim parados = 0 (etapa terminal).
    expect(linha(rows, "base", "venda")).toMatchObject({ ordem: 8, quantidade: 1, parados: 0 });
    // lead sem dono não é do corretor; lixeira fora; nada do corretor2.
    expect(linha(rows, "base", "entrada")).toBeUndefined();
    const totalBase = rows
      .filter((r) => r.recorte === "base")
      .reduce((s, r) => s + r.quantidade, 0);
    expect(totalBase).toBe(5);
  });

  it("safra: só quem foi criado na janela; a janela é parametrizável", async () => {
    await comoUsuario(c, corretor1.id);
    const rows30 = await funil(30);
    const rows7 = await funil(7);
    await comoSuperuser(c);

    // 30 dias: L1 (agora), L2 (20 dias, parado), L4 (perdido agora). L3 (60 dias) fora.
    expect(linha(rows30, "safra", "aguardando_atendimento")).toMatchObject({ quantidade: 1 });
    expect(linha(rows30, "safra", "em_atendimento")).toMatchObject({ quantidade: 1, parados: 1 });
    expect(linha(rows30, "safra", "analise_credito")).toBeUndefined();
    expect(linha(rows30, "safra", "venda")).toBeUndefined();
    expect(linha(rows30, "safra", "perdido")).toMatchObject({ quantidade: 1 });
    // 7 dias: L2 (20 dias) também sai.
    expect(linha(rows7, "safra", "em_atendimento")).toBeUndefined();
    expect(linha(rows7, "safra", "aguardando_atendimento")).toMatchObject({ quantidade: 1 });
  });

  it("o parâmetro _corretor é ignorado para quem não é gestão", async () => {
    await comoUsuario(c, corretor1.id);
    const rows = await funil(30, corretor2.id);
    await comoSuperuser(c);
    // Continua a carteira do corretor1 (em_atendimento parado), nunca a do corretor2.
    expect(linha(rows, "base", "em_atendimento")).toMatchObject({ quantidade: 1, parados: 1 });
  });
});

describe("fila_funil_v1 — escopo da gestão", () => {
  it("gestor sem filtro vê o time; corretor de outra equipe devolve zero linhas, não erro", async () => {
    await comoUsuario(c, gestorA.id);
    const time = await funil(30);
    const foraDoTime = await funil(30, corretor2.id);
    const doTime = await funil(30, corretor1.id);
    await comoSuperuser(c);

    expect(linha(time, "base", "em_atendimento")).toMatchObject({ quantidade: 1, parados: 1 });
    expect(foraDoTime).toHaveLength(0);
    expect(linha(doTime, "base", "analise_credito")).toMatchObject({ quantidade: 1 });
  });

  it("admin sem filtro vê a operação inteira", async () => {
    await comoUsuario(c, admin.id);
    const rows = await funil(30);
    await comoSuperuser(c);
    // em_atendimento: L2 (corretor1, parado) + o do corretor2 (não parado).
    expect(linha(rows, "base", "em_atendimento")).toMatchObject({ quantidade: 2, parados: 1 });
    // O lead sem dono é a "entrada" — só aparece para quem vê a carteira inteira.
    expect(linha(rows, "base", "entrada")).toMatchObject({ ordem: 0, quantidade: 1, parados: 0 });
  });

  it("gestor não vê a entrada (lead sem dono não é da equipe)", async () => {
    await comoUsuario(c, gestorA.id);
    const rows = await funil(30);
    await comoSuperuser(c);
    expect(linha(rows, "base", "entrada")).toBeUndefined();
  });
});
