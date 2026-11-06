/**
 * DISPARO DA BASE DO CORRETOR — Fase 1 (migration 20261102120000).
 *
 * Pedido do dono (02/11/2026): o corretor importa a base dele, o Marquinhos
 * dispara e todo lead que avançar vai direto para quem importou. O que esta
 * suíte trava:
 *
 *  1. Só corretor do piloto, com a declaração de base própria, cria disparo.
 *  2. A base entra na carteira dele como base fria: aguardando_retorno,
 *     classe 'base', sem alerta, sem cadência — e mesmo fora da região dele.
 *  3. Telefone de outra carteira, já no CRM sem ser dele, com opt-out ou
 *     repetido é bloqueado; o que já é dele entra sem duplicar.
 *  4. O Marquinhos qualifica quem recebeu o disparo: o lead fica com o
 *     corretor (não nasce filho na roleta) e vira "qualificado" quente.
 *  5. Fora da regra (outra origem, item não enviado, fora da janela) segue o
 *     registro filho de sempre.
 *  6. Dono inativo: não é devolvido (vai para a roleta).
 *  7. Importação só por service role; RLS: cada um vê só os próprios disparos.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarLead,
  criarUsuario,
  errCode,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let ana: UsuarioTeste;
let bia: UsuarioTeste;
let admin: UsuarioTeste;

async function comoService<T>(fn: () => Promise<T>): Promise<T> {
  await comoSuperuser(c);
  await c.query(`SET ROLE service_role`);
  try {
    return await fn();
  } finally {
    await c.query(`RESET ROLE`);
  }
}

async function criarDisparo(u: UsuarioTeste, nome = "Feirão 2025", declarou = true) {
  await comoUsuario(c, u.id);
  const r = await c.query(`SELECT public.disparo_base_criar($1, $2) AS id`, [nome, declarou]);
  await comoSuperuser(c);
  return r.rows[0].id as string;
}

type Linha = { linha?: number; nome: string; telefone: string; email?: string; zona?: string };

async function importar(corretor: string, disparo: string, rows: Linha[]) {
  return comoService(async () => {
    const r = await c.query(`SELECT public.importar_base_corretor_lote($1, $2, $3::jsonb) AS r`, [
      corretor,
      disparo,
      JSON.stringify(rows.map((x, i) => ({ linha: i + 2, ...x }))),
    ]);
    return r.rows[0].r as {
      novos: number;
      ja_na_carteira: number;
      bloqueados: { linha: number; motivo: string }[];
      erros: { linha: number; motivo: string }[];
    };
  });
}

/** O objeto que o webhook do Marquinhos manda para registrar_volta_campanha. */
function entrada(telefone: string, extra: Record<string, unknown> = {}) {
  return {
    nome: "Cliente da Base",
    telefone,
    email: null,
    origem: "chatbot",
    projeto_id: null,
    projeto_nome: "Residencial Novo",
    campanha: null,
    observacoes: "Qualificado pelo Marquinhos",
    renda_informada: "R$ 6.000",
    temperatura: "quente",
    zona: "Leste",
    bairro: null,
    roleta_slug: null,
    via_webhook: true,
    ...extra,
  };
}

async function voltar(payload: Record<string, unknown>) {
  return comoService(async () => {
    const r = await c.query(`SELECT public.registrar_volta_campanha($1::jsonb) AS r`, [
      JSON.stringify(payload),
    ]);
    return r.rows[0].r as Record<string, unknown>;
  });
}

async function marcarEnviado(disparo: string, quando = "now()") {
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.disparos_base_itens SET status = 'enviado', enviado_em = ${quando}
      WHERE disparo_id = $1`,
    [disparo],
  );
}

async function leadDoTelefone(tel: string) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT l.* FROM public.leads l
       JOIN public.clientes cl ON cl.id = l.cliente_id
      WHERE cl.chave_telefone = public.cliente_chave_do_telefone($1)
      ORDER BY l.created_at`,
    [tel],
  );
  return r.rows;
}

beforeAll(async () => {
  await c.connect();
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

beforeEach(async () => {
  await limparDados(c);
  ana = await criarUsuario(c, { nome: "Ana Base", papel: "corretor" });
  bia = await criarUsuario(c, { nome: "Bia Outra", papel: "corretor" });
  admin = await criarUsuario(c, { nome: "Admin", papel: "admin" });
  await comoUsuario(c, admin.id);
  await c.query(`SELECT public.disparo_base_definir_piloto($1, true)`, [ana.id]);
  await comoSuperuser(c);
});

describe("piloto e criação do disparo", () => {
  it("corretor fora do piloto não cria disparo", async () => {
    await comoUsuario(c, bia.id);
    expect(await errCode(c.query(`SELECT public.disparo_base_criar('x', true)`))).toBe("42501");
  });

  it("sem a declaração de base própria não nasce disparo", async () => {
    await comoUsuario(c, ana.id);
    expect(await errCode(c.query(`SELECT public.disparo_base_criar('x', false)`))).toBe("22023");
  });

  it("só admin define o piloto", async () => {
    await comoUsuario(c, ana.id);
    expect(
      await errCode(c.query(`SELECT public.disparo_base_definir_piloto($1, true)`, [bia.id])),
    ).toBe("42501");
  });
});

describe("importação da base", () => {
  it("a base entra na carteira como base fria, sem alerta e sem cadência, mesmo fora da região", async () => {
    const d = await criarDisparo(ana);
    const r = await importar(ana.id, d, [
      { nome: "Maria Souza", telefone: "(11) 98111-0001", zona: "Norte" },
      { nome: "João Lima", telefone: "11981110002" },
    ]);
    expect(r).toMatchObject({ novos: 2, ja_na_carteira: 0, bloqueados: [], erros: [] });

    const [maria] = await leadDoTelefone("11981110001");
    expect(maria).toMatchObject({
      corretor_id: ana.id,
      status: "aguardando_retorno",
      classe_lead: "base",
      origem: "captacao_corretor",
      canal_entrada: "importacao",
      cadencia_etapa: null,
    });
    const alertas = await c.query(
      `SELECT count(*)::int AS n FROM public.alertas WHERE user_id = $1`,
      [ana.id],
    );
    expect(alertas.rows[0].n).toBe(0);
    const itens = await c.query(
      `SELECT status, origem_item FROM public.disparos_base_itens WHERE disparo_id = $1`,
      [d],
    );
    expect(itens.rows).toHaveLength(2);
    expect(itens.rows.every((x) => x.status === "na_fila" && x.origem_item === "novo")).toBe(true);
  });

  it("bloqueia outra carteira, já no CRM sem dono, opt-out e repetido; o que já é dela entra sem duplicar", async () => {
    await criarLead(c, { nome: "Da Bia", telefone: "11982220001", corretorId: bia.id });
    await criarLead(c, { nome: "Sem dono", telefone: "11982220002", corretorId: null });
    const saiu = await criarLead(c, { nome: "Saiu", telefone: "11982220003", corretorId: null });
    await c.query(`UPDATE public.leads SET opt_out = true WHERE id = $1`, [saiu]);
    const daAna = await criarLead(c, {
      nome: "Já da Ana",
      telefone: "11982220004",
      corretorId: ana.id,
      status: "em_atendimento",
    });

    const d = await criarDisparo(ana);
    const r = await importar(ana.id, d, [
      { nome: "Da Bia", telefone: "11982220001" },
      { nome: "Sem dono", telefone: "11982220002" },
      { nome: "Saiu", telefone: "11982220003" },
      { nome: "Já da Ana", telefone: "11982220004" },
      { nome: "Já da Ana de novo", telefone: "(11) 98222-0004" },
      { nome: "Sem DDD", telefone: "98222" },
    ]);
    expect(r.novos).toBe(0);
    expect(r.ja_na_carteira).toBe(1);
    expect(r.bloqueados.map((b) => b.motivo)).toEqual([
      "outra_carteira",
      "ja_no_crm",
      "pediu_para_sair",
      "repetido_na_planilha",
    ]);
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0].motivo).toMatch(/telefone/);

    // O lead da Bia não mudou de dono e o da Ana não foi duplicado nem rebaixado.
    expect((await leadDoTelefone("11982220001"))[0].corretor_id).toBe(bia.id);
    const ana4 = await leadDoTelefone("11982220004");
    expect(ana4).toHaveLength(1);
    expect(ana4[0]).toMatchObject({ id: daAna, status: "em_atendimento" });
  });

  it("disparo que já começou não recebe mais contatos", async () => {
    const d = await criarDisparo(ana);
    await c.query(`UPDATE public.disparos_base SET status = 'enviando' WHERE id = $1`, [d]);
    expect(await errCode(importar(ana.id, d, [{ nome: "X", telefone: "11983330001" }]))).toBe(
      "22023",
    );
  });

  it("importação é só service role (a server function confere o corretor)", async () => {
    const d = await criarDisparo(ana);
    await comoUsuario(c, ana.id);
    expect(
      await errCode(
        c.query(`SELECT public.importar_base_corretor_lote($1, $2, '[]'::jsonb)`, [ana.id, d]),
      ),
    ).toBe("42501");
  });

  it("RLS: a Bia não vê o disparo da Ana; o admin vê", async () => {
    const d = await criarDisparo(ana);
    await importar(ana.id, d, [{ nome: "Maria", telefone: "11984440001" }]);
    await comoUsuario(c, bia.id);
    expect((await c.query(`SELECT id FROM public.disparos_base`)).rows).toHaveLength(0);
    expect((await c.query(`SELECT id FROM public.disparos_base_itens`)).rows).toHaveLength(0);
    await comoUsuario(c, ana.id);
    expect((await c.query(`SELECT id FROM public.disparos_base_itens`)).rows).toHaveLength(1);
    await comoUsuario(c, admin.id);
    expect((await c.query(`SELECT id FROM public.disparos_base`)).rows).toHaveLength(1);
    // Ninguém escreve direto: só pelas RPCs.
    await comoUsuario(c, ana.id);
    expect(
      await errCode(
        c.query(`UPDATE public.disparos_base SET status = 'concluido' WHERE id = $1`, [d]),
      ),
    ).toBe("42501");
  });
});

describe("a volta pelo Marquinhos", () => {
  const TEL = "11985550001";

  async function prepararEnviado() {
    const d = await criarDisparo(ana);
    await importar(ana.id, d, [{ nome: "Maria Base", telefone: TEL }]);
    await marcarEnviado(d);
    return d;
  }

  it("quem recebeu o disparo e foi qualificado fica com o corretor que importou", async () => {
    const d = await prepararEnviado();
    const r = await voltar(entrada(TEL));
    const [lead, ...outros] = await leadDoTelefone(TEL);
    expect(outros).toHaveLength(0); // nenhum registro filho
    expect(r).toMatchObject({
      acao: "base_do_corretor",
      lead_id: lead.id,
      corretor_id: ana.id,
      disparo_id: d,
    });
    expect(lead).toMatchObject({
      corretor_id: ana.id,
      status: "qualificado",
      classe_lead: "quente",
    });
    const item = await c.query(
      `SELECT status, qualificado_em FROM public.disparos_base_itens WHERE disparo_id = $1`,
      [d],
    );
    expect(item.rows[0].status).toBe("qualificado");
    expect(item.rows[0].qualificado_em).not.toBeNull();
  });

  it("status que o corretor já trabalhou não volta para trás", async () => {
    await prepararEnviado();
    const [lead] = await leadDoTelefone(TEL);
    await c.query(`UPDATE public.leads SET status = 'em_atendimento' WHERE id = $1`, [lead.id]);
    await voltar(entrada(TEL));
    expect((await leadDoTelefone(TEL))[0].status).toBe("em_atendimento");
  });

  it("outra origem (anúncio) segue o registro filho de sempre", async () => {
    await prepararEnviado();
    const r = await voltar(entrada(TEL, { origem: "facebook" }));
    expect(r.acao).toBe("registro_filho");
  });

  it("contato ainda não disparado segue o registro filho", async () => {
    const d = await criarDisparo(ana);
    await importar(ana.id, d, [{ nome: "Maria Base", telefone: TEL }]);
    const r = await voltar(entrada(TEL));
    expect(r.acao).toBe("registro_filho");
  });

  it("fora da janela de resposta segue o registro filho", async () => {
    const d = await criarDisparo(ana);
    await importar(ana.id, d, [{ nome: "Maria Base", telefone: TEL }]);
    await marcarEnviado(d, "now() - interval '31 days'");
    const r = await voltar(entrada(TEL));
    expect(r.acao).toBe("registro_filho");
  });

  it("dono inativo não recebe de volta: o lead vai para a roleta", async () => {
    await prepararEnviado();
    await c.query(`UPDATE public.profiles SET status_conta = 'bloqueada' WHERE id = $1`, [ana.id]);
    const r = await voltar(entrada(TEL));
    expect(r.acao).toBe("base_do_corretor");
    expect(r.corretor_id).not.toBe(ana.id);
    const [lead] = await leadDoTelefone(TEL);
    expect(lead.classe_lead).toBe("quente");
  });
});

describe("custeio", () => {
  it("empresa paga até a cota; depois o corretor entra com o rateio", async () => {
    await comoUsuario(c, ana.id);
    const antes = (await c.query(`SELECT public.disparo_base_custeio() AS r`)).rows[0].r;
    expect(antes).toMatchObject({
      cota_empresa: 1000,
      enviados: 0,
      restante_na_cota: 1000,
      corretor_paga_agora: 0,
    });
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.disparo_base_config SET valor = '1'::jsonb WHERE chave = 'cota_empresa_contatos'`,
    );
    try {
      const d = await criarDisparo(ana);
      await importar(ana.id, d, [{ nome: "Maria", telefone: "11986660001" }]);
      await marcarEnviado(d);
      await comoUsuario(c, ana.id);
      const depois = (await c.query(`SELECT public.disparo_base_custeio() AS r`)).rows[0].r;
      expect(depois).toMatchObject({ enviados: 1, restante_na_cota: 0, corretor_paga_agora: 0.5 });
    } finally {
      await comoSuperuser(c);
      await c.query(
        `UPDATE public.disparo_base_config SET valor = '1000'::jsonb WHERE chave = 'cota_empresa_contatos'`,
      );
    }
  });
});
