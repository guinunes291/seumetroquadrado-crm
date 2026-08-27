/**
 * COMISSÕES — visibilidade por beneficiário (migration 20260827200000).
 *
 * Regra de produto: o corretor enxerga SÓ as PRÓPRIAS comissões (linhas em
 * que ele é o beneficiário), nunca o restante da cadeia de comissionados da
 * venda — nem mesmo da venda DELE. A cadeia inteira é visão de gestão:
 * gestor/superintendente no escopo de leads que já enxergam, admin sempre.
 * O mesmo recorte vale para o comissao_ledger (trilha de auditoria).
 *
 * Fixture: venda do lead do corretor A com 3 linhas de comissão — a dele, o
 * override do gestor e uma sem beneficiário ("a atribuir", casa) — e duas
 * linhas de ledger. O teste pina quem lê o quê.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
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
let corretorA: UsuarioTeste;
let corretorB: UsuarioTeste;
let admin: UsuarioTeste;
let leadA: string;
let vendaId: string;
let comissaoA: string; // beneficiário = corretor A
let comissaoG: string; // beneficiário = gestor (override)
let comissaoSem: string; // sem beneficiário (a atribuir)

beforeAll(async () => {
  await c.connect();
  await limparDados(c);

  const equipe = await criarEquipe(c, { nome: "Equipe Comissões" });
  gestor = await criarUsuario(c, { papel: "gestor", nome: "Gestor Comissões", equipeId: equipe });
  corretorA = await criarUsuario(c, {
    papel: "corretor",
    nome: "Corretor Beneficiário",
    equipeId: equipe,
  });
  corretorB = await criarUsuario(c, { papel: "corretor", nome: "Corretor De Fora" });
  admin = await criarUsuario(c, { papel: "admin", nome: "Admin Comissões" });
  await comoSuperuser(c);
  await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gestor.id, equipe]);

  // Etapa é irrelevante para a policy (o recorte é por beneficiário/escopo);
  // "fechado" exigiria a esteira de aprovação inteira — desnecessário aqui.
  leadA = await criarLead(c, { corretorId: corretorA.id, status: "em_atendimento" });

  const venda = await c.query(
    `INSERT INTO public.vendas (lead_id, corretor_id, data_assinatura)
     VALUES ($1, $2, current_date) RETURNING id`,
    [leadA, corretorA.id],
  );
  vendaId = venda.rows[0].id as string;

  // A cadeia da venda: corretor + override do gestor + linha a atribuir.
  const inserirComissao = async (
    beneficiarioId: string | null,
    tipo: string,
    valor: number,
  ): Promise<string> => {
    const r = await c.query(
      `INSERT INTO public.comissoes
         (venda_id, lead_id, beneficiario_id, tipo, valor_base, percentual, valor_comissao, valor_liquido)
       VALUES ($1, $2, $3, $4, 100000, 1, $5, $5) RETURNING id`,
      [vendaId, leadA, beneficiarioId, tipo, valor],
    );
    return r.rows[0].id as string;
  };
  comissaoA = await inserirComissao(corretorA.id, "corretor", 1000);
  comissaoG = await inserirComissao(gestor.id, "gestor", 200);
  comissaoSem = await inserirComissao(null, "indicador", 300);

  await c.query(
    `INSERT INTO public.comissao_ledger
       (comissao_id, venda_id, beneficiario_id, beneficiario_tipo, evento, valor, idempotency_key)
     VALUES ($1, $2, $3, 'corretor', 'credito', 1000, 'teste-ledger-a'),
            ($4, $2, $5, 'gestor',   'credito',  200, 'teste-ledger-g')`,
    [comissaoA, vendaId, corretorA.id, comissaoG, gestor.id],
  );
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

describe("comissoes: o corretor vê só a própria linha", () => {
  it("corretor A lê EXATAMENTE a comissão dele — o resto da cadeia da própria venda some", async () => {
    await comoUsuario(c, corretorA.id);
    const r = await c.query(
      `SELECT id, beneficiario_id FROM public.comissoes WHERE venda_id = $1`,
      [vendaId],
    );
    expect(r.rows.map((x: { id: string }) => x.id)).toEqual([comissaoA]);
    expect(r.rows[0].beneficiario_id).toBe(corretorA.id);
  });

  it("corretor de fora não lê linha alguma da venda alheia", async () => {
    await comoUsuario(c, corretorB.id);
    const r = await c.query(`SELECT 1 FROM public.comissoes WHERE venda_id = $1`, [vendaId]);
    expect(r.rowCount).toBe(0);
  });

  it("gestor da equipe lê a cadeia inteira (inclusive a linha sem beneficiário)", async () => {
    await comoUsuario(c, gestor.id);
    const r = await c.query(
      `SELECT id FROM public.comissoes WHERE venda_id = $1 ORDER BY valor_comissao DESC`,
      [vendaId],
    );
    expect(r.rows.map((x: { id: string }) => x.id)).toEqual([comissaoA, comissaoSem, comissaoG]);
  });

  it("admin lê tudo", async () => {
    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT count(*)::int AS n FROM public.comissoes WHERE venda_id = $1`, [
      vendaId,
    ]);
    expect(r.rows[0].n).toBe(3);
  });

  it("UPDATE segue gestão-only: o corretor não consegue tocar nem a própria linha", async () => {
    await comoUsuario(c, corretorA.id);
    const r = await c.query(
      `UPDATE public.comissoes SET status = 'paga' WHERE id = $1 RETURNING id`,
      [comissaoA],
    );
    // RLS de UPDATE filtra a linha (USING) — zero linhas afetadas, sem erro.
    expect(r.rowCount).toBe(0);
  });
});

describe("comissao_ledger: mesmo recorte da tabela principal", () => {
  it("corretor A lê só o próprio evento; o do gestor some", async () => {
    await comoUsuario(c, corretorA.id);
    const r = await c.query(
      `SELECT beneficiario_id FROM public.comissao_ledger WHERE venda_id = $1`,
      [vendaId],
    );
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].beneficiario_id).toBe(corretorA.id);
  });

  it("gestor da equipe lê a trilha inteira", async () => {
    await comoUsuario(c, gestor.id);
    const r = await c.query(
      `SELECT count(*)::int AS n FROM public.comissao_ledger WHERE venda_id = $1`,
      [vendaId],
    );
    expect(r.rows[0].n).toBe(2);
  });
});
