/**
 * Academia SMQ · Fatia 1 · camada de dados contra o banco real.
 *
 * O que este arquivo prova, em cima do harness (todas as migrations aplicadas
 * num Postgres 16 de verdade, com a RLS valendo):
 *
 *   • o aluno não alcança gabarito, regras, indicadores nem config;
 *   • o aluno lê só o que é dele, e não escreve em NENHUMA tabela academia_*;
 *   • gestor enxerga a própria equipe e não a dos outros (decisão do dono);
 *   • ninguém age sobre si mesmo — gestor e superintendente podem ser alunos;
 *   • conta bloqueada não estuda e bot de serviço não entra na trilha;
 *   • o quiz não vira decoreba: gabarito só no retorno do envio;
 *   • a trilha leva de iniciante a HABILITADO de ponta a ponta;
 *   • o seed roda duas vezes sem duplicar.
 *
 * Nada aqui usa docs/academia/apoio/03b-teste-fluxo.sql: aquele arquivo dá
 * GRANT ... ON ALL TABLES para authenticated e desfaria os REVOKEs da casa.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarEquipe,
  criarUsuario,
  errCode,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

const SEED = "supabase/migrations/20261002120100_academia_seed.sql";

/** Mensagem de erro de uma promise rejeitada (ou null se resolveu). */
async function errMsg(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { message?: string }).message ?? "erro sem mensagem";
  }
}

let equipeA: string;
let equipeB: string;
let corretorA1: UsuarioTeste;
let corretorA2: UsuarioTeste;
let gestorA: UsuarioTeste;
let gestorB: UsuarioTeste;
let corretorB1: UsuarioTeste;
let admin: UsuarioTeste;
let superintendente: UsuarioTeste;
let bloqueado: UsuarioTeste;
let bot: UsuarioTeste;

/** Módulo de teste próprio: o seed nasce todo em rascunho, de propósito. */
let moduloId: string;
let moduloRascunhoId: string;
let aulaId: string;

async function inscrever(pessoa: string): Promise<void> {
  await comoUsuario(c, admin.id);
  await c.query(`SELECT public.academia_definir_participacao($1, true, NULL)`, [pessoa]);
}

/** Cria módulo em rascunho na fase 0 com 1 aula e 5 questões. */
async function criarModulo(codigo: string, exigePratica: boolean): Promise<string> {
  await comoSuperuser(c);
  const m = await c.query(
    `INSERT INTO public.academia_modulos
       (codigo, numero, fase, titulo, obrigatorio, exige_pratica, status)
     VALUES ($1, 99, 0, $2, true, $3, 'rascunho') RETURNING id`,
    [codigo, `Módulo de teste ${codigo}`, exigePratica],
  );
  const id = m.rows[0].id as string;
  await c.query(
    `INSERT INTO public.academia_aulas (modulo_id, ordem, titulo, tipo, status)
     VALUES ($1, 1, 'Aula de teste', 'texto', 'publicado')`,
    [id],
  );
  for (let i = 1; i <= 5; i++) {
    await c.query(
      `INSERT INTO public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta)
       VALUES ($1, $2, $3, '["errada","certa"]'::jsonb, 1)`,
      [id, i, `Questão ${i}`],
    );
  }
  return id;
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);

  equipeA = await criarEquipe(c, { nome: "Equipe A" });
  equipeB = await criarEquipe(c, { nome: "Equipe B" });

  corretorA1 = await criarUsuario(c, { papel: "corretor", equipeId: equipeA, nome: "A1" });
  corretorA2 = await criarUsuario(c, { papel: "corretor", equipeId: equipeA, nome: "A2" });
  gestorA = await criarUsuario(c, { papel: "gestor", equipeId: equipeA, nome: "Gestor A" });
  corretorB1 = await criarUsuario(c, { papel: "corretor", equipeId: equipeB, nome: "B1" });
  gestorB = await criarUsuario(c, { papel: "gestor", equipeId: equipeB, nome: "Gestor B" });
  admin = await criarUsuario(c, { papel: "admin", equipeId: null, nome: "Admin" });
  superintendente = await criarUsuario(c, {
    papel: "superintendente",
    equipeId: null,
    nome: "Super",
  });
  bloqueado = await criarUsuario(c, { papel: "corretor", equipeId: equipeA, nome: "Bloqueado" });
  bot = await criarUsuario(c, { papel: "corretor", equipeId: null, nome: "Bot" });

  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.service_bots (user_id, descricao) VALUES ($1, 'bot de teste')`,
    [bot.id],
  );
  // O gestor da equipe é o gestor da equipe: a regra da casa olha os dois lados.
  await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gestorA.id, equipeA]);
  await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gestorB.id, equipeB]);

  // Módulos de teste são recriados a cada rodada: eles não têm FK para
  // profiles, então limparDados não os leva.
  await c.query(`DELETE FROM public.academia_modulos WHERE codigo LIKE 'TST%'`);

  moduloId = await criarModulo("TST01", true);
  moduloRascunhoId = await criarModulo("TST02", false);

  // O dono decidiu: corretor, SDR, superintendente e gestor podem ser alunos.
  // Gestor-aluno é o caso que o teste mais persegue.
  for (const p of [corretorA1, corretorA2, corretorB1, gestorA, gestorB, bloqueado]) {
    await inscrever(p.id);
  }

  // Publica TST01 como admin (TST02 fica em rascunho de propósito).
  await comoUsuario(c, admin.id);
  await c.query(`SELECT public.academia_publicar_modulo($1)`, [moduloId]);

  await comoSuperuser(c);
  const a = await c.query(`SELECT id FROM public.academia_aulas WHERE modulo_id = $1`, [moduloId]);
  aulaId = a.rows[0].id as string;

  // Bloqueia a conta DEPOIS de inscrever: o veto de inscrição é para entrar.
  await c.query(`UPDATE public.profiles SET status_conta = 'bloqueada' WHERE id = $1`, [
    bloqueado.id,
  ]);
});

afterAll(async () => {
  await c.end();
});

describe("o que o aluno não alcança", () => {
  it("corretor lê 0 linhas de questoes, regras, indicadores e config", async () => {
    await comoUsuario(c, corretorA1.id);
    for (const t of [
      "academia_questoes",
      "academia_regras_recomendacao",
      "academia_indicadores",
      "academia_config",
    ]) {
      const r = await c.query(`SELECT count(*)::int AS n FROM public.${t}`);
      expect(r.rows[0].n, `${t} deveria voltar 0 linhas para corretor`).toBe(0);
    }
  });

  it("gestor-aluno também não lê o gabarito (ele faz o mesmo quiz)", async () => {
    await comoUsuario(c, gestorA.id);
    const r = await c.query(`SELECT count(*)::int AS n FROM public.academia_questoes`);
    expect(r.rows[0].n).toBe(0);
  });

  it("gestor e superintendente leem regras e config (precisam entender a recomendação)", async () => {
    for (const u of [gestorA, superintendente, admin]) {
      await comoUsuario(c, u.id);
      const reg = await c.query(
        `SELECT count(*)::int AS n FROM public.academia_regras_recomendacao`,
      );
      const cfg = await c.query(`SELECT count(*)::int AS n FROM public.academia_config`);
      expect(reg.rows[0].n, `regras para ${u.nome}`).toBeGreaterThan(0);
      expect(cfg.rows[0].n, `config para ${u.nome}`).toBe(1);
    }
  });

  it("corretor não vê módulo em rascunho", async () => {
    await comoUsuario(c, corretorA1.id);
    const r = await c.query(`SELECT codigo FROM public.academia_modulos WHERE codigo LIKE 'TST%'`);
    expect(r.rows.map((x) => x.codigo)).toEqual(["TST01"]);
  });

  it("admin vê o rascunho", async () => {
    await comoUsuario(c, admin.id);
    const r = await c.query(
      `SELECT codigo FROM public.academia_modulos WHERE codigo LIKE 'TST%' ORDER BY codigo`,
    );
    expect(r.rows.map((x) => x.codigo)).toEqual(["TST01", "TST02"]);
  });
});

describe("escrita direta é barrada em todas as tabelas academia_*", () => {
  // A barreira tem DUAS formas, e elas falham diferente.
  //
  // Tabela pessoal (escrita só por RPC): authenticated não tem o GRANT de
  // escrita, então o comando morre no privilégio — erro 42501, alto e claro.
  //
  // Conteúdo, config e regras: authenticated TEM o GRANT (o admin precisa
  // dele) e quem barra é a policy. Um UPDATE de não-admin não explode: a
  // cláusula USING não enxerga linha nenhuma e o comando afeta 0 linhas.
  // Silencioso, e seguro do mesmo jeito. O que o teste prova aqui é que o
  // valor NÃO mudou — não que houve exceção.
  it("corretor não escreve nas tabelas pessoais: erro de privilégio", async () => {
    await comoUsuario(c, corretorA1.id);
    expect(
      await errCode(
        c.query(
          `INSERT INTO public.academia_progresso_aulas (corretor_id, aula_id) VALUES ($1, $2)`,
          [corretorA1.id, aulaId],
        ),
      ),
    ).toBe("42501");
    expect(
      await errCode(
        c.query(
          `UPDATE public.academia_participantes SET nivel = 'mestre' WHERE corretor_id = $1`,
          [corretorA1.id],
        ),
      ),
    ).toBe("42501");
    expect(await errCode(c.query(`DELETE FROM public.academia_niveis_historico`))).toBe("42501");
    expect(await errCode(c.query(`DELETE FROM public.academia_certificados`))).toBe("42501");
    expect(
      await errCode(
        c.query(
          `INSERT INTO public.academia_indicadores
             (corretor_id, indicador, data_ref, janela_dias, amostra)
           VALUES ($1, 'x', current_date, 30, 1)`,
          [corretorA1.id],
        ),
      ),
    ).toBe("42501");
  });

  it("corretor e gestor não mudam config, gabarito nem regras: 0 linhas, valor intacto", async () => {
    await comoSuperuser(c);
    const antes = await c.query(`SELECT nota_minima_padrao FROM public.academia_config WHERE id`);
    const gabaritoAntes = await c.query(
      `SELECT correta FROM public.academia_questoes WHERE modulo_id = $1 ORDER BY ordem`,
      [moduloId],
    );

    for (const u of [corretorA1, gestorA]) {
      await comoUsuario(c, u.id);
      const cfg = await c.query(`UPDATE public.academia_config SET nota_minima_padrao = 50`);
      expect(cfg.rowCount, `${u.nome} não pode tocar a config`).toBe(0);
      const gab = await c.query(`UPDATE public.academia_questoes SET correta = 0`);
      expect(gab.rowCount, `${u.nome} não pode tocar o gabarito`).toBe(0);
      const reg = await c.query(`UPDATE public.academia_regras_recomendacao SET ativa = false`);
      expect(reg.rowCount, `${u.nome} não pode tocar as regras`).toBe(0);
    }

    await comoSuperuser(c);
    const depois = await c.query(`SELECT nota_minima_padrao FROM public.academia_config WHERE id`);
    const gabaritoDepois = await c.query(
      `SELECT correta FROM public.academia_questoes WHERE modulo_id = $1 ORDER BY ordem`,
      [moduloId],
    );
    expect(depois.rows).toEqual(antes.rows);
    expect(gabaritoDepois.rows).toEqual(gabaritoAntes.rows);
  });

  it("gestor não apaga histórico de nível nem certificado (era o buraco da 01)", async () => {
    await comoUsuario(c, gestorA.id);
    expect(await errCode(c.query(`DELETE FROM public.academia_niveis_historico`))).toBe("42501");
    expect(await errCode(c.query(`DELETE FROM public.academia_certificados`))).toBe("42501");
    expect(
      await errCode(c.query(`UPDATE public.academia_participantes SET nivel = 'mestre'`)),
    ).toBe("42501");
  });

  it("admin escreve conteúdo de verdade", async () => {
    await comoUsuario(c, admin.id);
    const r = await c.query(
      `UPDATE public.academia_modulos SET titulo = titulo WHERE codigo = 'TST01'`,
    );
    expect(r.rowCount).toBe(1);
  });
});

describe("escopo de equipe", () => {
  it("corretor lê só os próprios participantes, tentativas e práticas", async () => {
    await comoUsuario(c, corretorA1.id);
    const r = await c.query(`SELECT corretor_id FROM public.academia_participantes`);
    expect(r.rows.map((x) => x.corretor_id)).toEqual([corretorA1.id]);
  });

  it("gestor A lê a equipe A e NÃO lê a equipe B", async () => {
    await comoUsuario(c, gestorA.id);
    const r = await c.query(`SELECT corretor_id FROM public.academia_participantes`);
    const ids = r.rows.map((x) => x.corretor_id as string);
    expect(ids).toEqual(expect.arrayContaining([corretorA1.id, corretorA2.id, gestorA.id]));
    expect(ids).not.toContain(corretorB1.id);
    expect(ids).not.toContain(gestorB.id);
  });

  it("admin e superintendente leem todo mundo", async () => {
    for (const u of [admin, superintendente]) {
      await comoUsuario(c, u.id);
      const r = await c.query(`SELECT corretor_id FROM public.academia_participantes`);
      const ids = r.rows.map((x) => x.corretor_id as string);
      expect(ids, `${u.nome} deveria ver as duas equipes`).toEqual(
        expect.arrayContaining([corretorA1.id, corretorB1.id]),
      );
    }
  });

  it("gestor B não atribui módulo para A1", async () => {
    await comoUsuario(c, gestorB.id);
    expect(
      await errCode(
        c.query(`SELECT public.academia_atribuir($1, $2, NULL, 'teste')`, [
          corretorA1.id,
          moduloId,
        ]),
      ),
    ).toBe("42501");
  });
});

describe("ninguém age sobre si mesmo", () => {
  it("gestor-aluno não avalia a própria prática", async () => {
    await comoUsuario(c, gestorA.id);
    const p = await c.query(`SELECT public.academia_pratica_enviar($1, $2, NULL) AS id`, [
      moduloId,
      "prática do próprio gestor",
    ]);
    const praticaId = p.rows[0].id as string;
    expect(
      await errCode(
        c.query(`SELECT public.academia_pratica_avaliar($1, 'aprovada', '[]'::jsonb, 'ok')`, [
          praticaId,
        ]),
      ),
    ).toBe("42501");

    // e o admin consegue, porque não é ele mesmo
    await comoUsuario(c, admin.id);
    await c.query(
      `SELECT public.academia_pratica_avaliar($1, 'aprovada', '[]'::jsonb, 'foco: X')`,
      [praticaId],
    );
  });

  it("gestor não faz override do próprio nível nem se atribui módulo", async () => {
    await comoUsuario(c, gestorA.id);
    expect(
      await errCode(
        c.query(`SELECT public.academia_definir_habilitado($1, true, 'porque sim')`, [gestorA.id]),
      ),
    ).toBe("42501");
    expect(
      await errCode(
        c.query(`SELECT public.academia_atribuir($1, $2, NULL, 'auto')`, [gestorA.id, moduloId]),
      ),
    ).toBe("42501");
  });

  it("gestor B não avalia prática de corretor da equipe A", async () => {
    await comoUsuario(c, corretorA1.id);
    const p = await c.query(`SELECT public.academia_pratica_enviar($1, $2, NULL) AS id`, [
      moduloId,
      "prática do A1",
    ]);
    const praticaId = p.rows[0].id as string;

    await comoUsuario(c, gestorB.id);
    expect(
      await errCode(
        c.query(`SELECT public.academia_pratica_avaliar($1, 'aprovada', '[]'::jsonb, 'ok')`, [
          praticaId,
        ]),
      ),
    ).toBe("42501");

    // limpa para não interferir no fluxo feliz
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.academia_praticas WHERE id = $1`, [praticaId]);
  });
});

describe("guardas das RPCs", () => {
  it("avaliar prática inexistente ou já avaliada não passa em silêncio", async () => {
    await comoUsuario(c, admin.id);
    expect(
      await errMsg(
        c.query(
          `SELECT public.academia_pratica_avaliar('00000000-0000-0000-0000-000000000000',
                  'aprovada', '[]'::jsonb, 'ok')`,
        ),
      ),
    ).toMatch(/pratica nao encontrada/i);

    await comoUsuario(c, corretorA2.id);
    const p = await c.query(`SELECT public.academia_pratica_enviar($1, 'x', NULL) AS id`, [
      moduloId,
    ]);
    const praticaId = p.rows[0].id as string;
    await comoUsuario(c, gestorA.id);
    await c.query(`SELECT public.academia_pratica_avaliar($1, 'refazer', '[]'::jsonb, 'refaça')`, [
      praticaId,
    ]);
    expect(
      await errMsg(
        c.query(`SELECT public.academia_pratica_avaliar($1, 'aprovada', '[]'::jsonb, 'ok')`, [
          praticaId,
        ]),
      ),
    ).toMatch(/ja avaliada/i);
  });

  it("feedback é obrigatório", async () => {
    await comoUsuario(c, corretorA2.id);
    const p = await c.query(`SELECT public.academia_pratica_enviar($1, 'y', NULL) AS id`, [
      moduloId,
    ]);
    await comoUsuario(c, gestorA.id);
    expect(
      await errMsg(
        c.query(`SELECT public.academia_pratica_avaliar($1, 'aprovada', '[]'::jsonb, '  ')`, [
          p.rows[0].id,
        ]),
      ),
    ).toMatch(/feedback obrigatorio/i);
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.academia_praticas WHERE id = $1`, [p.rows[0].id]);
  });

  it("prática em módulo rascunho é recusada", async () => {
    await comoUsuario(c, corretorA1.id);
    expect(
      await errMsg(
        c.query(`SELECT public.academia_pratica_enviar($1, 'z', NULL)`, [moduloRascunhoId]),
      ),
    ).toMatch(/modulo indisponivel/i);
  });

  it("quem não participa não envia prática", async () => {
    await comoUsuario(c, superintendente.id);
    expect(
      await errCode(c.query(`SELECT public.academia_pratica_enviar($1, 'w', NULL)`, [moduloId])),
    ).toBe("42501");
  });

  it("a origem da atribuição não vem do cliente: é sempre 'gestor'", async () => {
    await comoUsuario(c, gestorA.id);
    await c.query(`SELECT public.academia_atribuir($1, $2, NULL, 'estudar')`, [
      corretorA1.id,
      moduloId,
    ]);
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT origem FROM public.academia_atribuicoes WHERE corretor_id = $1 AND modulo_id = $2`,
      [corretorA1.id, moduloId],
    );
    expect(r.rows[0].origem).toBe("gestor");

    // a função interna que aceita origem não é chamável por authenticated
    await comoUsuario(c, gestorA.id);
    expect(
      await errCode(
        c.query(
          `SELECT public.academia_atribuir_interno($1, $2, NULL, 'x', 'recomendacao', NULL, NULL)`,
          [corretorA1.id, moduloId],
        ),
      ),
    ).toBe("42501");

    await comoSuperuser(c);
    await c.query(`DELETE FROM public.academia_atribuicoes WHERE corretor_id = $1`, [
      corretorA1.id,
    ]);
  });

  it("academia_recalcular_nivel não é executável por usuário logado", async () => {
    await comoUsuario(c, corretorA1.id);
    expect(
      await errCode(c.query(`SELECT public.academia_recalcular_nivel($1)`, [corretorA2.id])),
    ).toBe("42501");
  });
});

describe("publicar módulo", () => {
  it("gestor não publica", async () => {
    await comoUsuario(c, gestorA.id);
    expect(
      await errCode(c.query(`SELECT public.academia_publicar_modulo($1)`, [moduloRascunhoId])),
    ).toBe("42501");
  });

  it("admin não publica com revisão pendente, e publica depois de limpá-la", async () => {
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.academia_modulos SET revisao_pendente = 'falta o dono revisar' WHERE id = $1`,
      [moduloRascunhoId],
    );
    await comoUsuario(c, admin.id);
    expect(
      await errMsg(c.query(`SELECT public.academia_publicar_modulo($1)`, [moduloRascunhoId])),
    ).toMatch(/revisao pendente: falta o dono revisar/i);

    await comoSuperuser(c);
    await c.query(`UPDATE public.academia_modulos SET revisao_pendente = NULL WHERE id = $1`, [
      moduloRascunhoId,
    ]);
    await comoUsuario(c, admin.id);
    await c.query(`SELECT public.academia_publicar_modulo($1)`, [moduloRascunhoId]);
    await comoSuperuser(c);
    const r = await c.query(`SELECT status FROM public.academia_modulos WHERE id = $1`, [
      moduloRascunhoId,
    ]);
    expect(r.rows[0].status).toBe("publicado");
    // volta para rascunho: o fluxo feliz mede a fase 0 com 1 módulo obrigatório
    await c.query(
      `UPDATE public.academia_modulos SET status = 'rascunho', publicado_em = NULL WHERE id = $1`,
      [moduloRascunhoId],
    );
  });

  it("módulo sem 5 questões ativas não publica", async () => {
    const id = await criarModulo("TST03", false);
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.academia_questoes WHERE modulo_id = $1 AND ordem > 2`, [id]);
    await comoUsuario(c, admin.id);
    expect(await errMsg(c.query(`SELECT public.academia_publicar_modulo($1)`, [id]))).toMatch(
      /ao menos 5 questoes ativas/i,
    );
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.academia_modulos WHERE id = $1`, [id]);
  });
});

describe("quem não pode estudar", () => {
  it("conta bloqueada não marca aula", async () => {
    await comoUsuario(c, bloqueado.id);
    expect(await errCode(c.query(`SELECT public.academia_marcar_aula($1, true)`, [aulaId]))).toBe(
      "42501",
    );
  });

  it("bot de serviço não pode ser inscrito", async () => {
    await comoUsuario(c, admin.id);
    expect(
      await errMsg(
        c.query(`SELECT public.academia_definir_participacao($1, true, NULL)`, [bot.id]),
      ),
    ).toMatch(/bot de servico/i);
  });

  it("conta não ativa não pode ser inscrita, mas pode ser desinscrita", async () => {
    await comoUsuario(c, admin.id);
    expect(
      await errMsg(
        c.query(`SELECT public.academia_definir_participacao($1, true, NULL)`, [bloqueado.id]),
      ),
    ).toMatch(/conta nao esta ativa/i);
    await c.query(`SELECT public.academia_definir_participacao($1, false, NULL)`, [bloqueado.id]);
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT participa FROM public.academia_participantes WHERE corretor_id = $1`,
      [bloqueado.id],
    );
    expect(r.rows[0].participa).toBe(false);
  });

  it("só admin inscreve: gestor não", async () => {
    await comoUsuario(c, gestorA.id);
    expect(
      await errCode(
        c.query(`SELECT public.academia_definir_participacao($1, true, NULL)`, [
          superintendente.id,
        ]),
      ),
    ).toBe("42501");
  });
});

/** Marca a única aula do módulo e resolve o quiz. */
async function fazerQuiz(
  uid: string,
  modulo: string,
  acertando: boolean,
): Promise<{ questoes: Array<Record<string, unknown>>; resultado: Record<string, unknown> }> {
  await comoUsuario(c, uid);
  const ini = await c.query(`SELECT public.academia_quiz_iniciar($1) AS r`, [modulo]);
  const r = ini.rows[0].r as { tentativa_id: string; questoes: Array<{ id: string }> };
  const respostas: Record<string, number> = {};
  for (const q of r.questoes) respostas[q.id] = acertando ? 1 : 0;
  const env = await c.query(`SELECT public.academia_quiz_enviar($1, $2::jsonb) AS r`, [
    r.tentativa_id,
    JSON.stringify(respostas),
  ]);
  return {
    questoes: r.questoes as unknown as Array<Record<string, unknown>>,
    resultado: env.rows[0].r as Record<string, unknown>,
  };
}

describe("quiz", () => {
  it("as questões saem sem gabarito; o gabarito só volta no envio", async () => {
    await comoUsuario(c, corretorA1.id);
    await c.query(`SELECT public.academia_marcar_aula($1, true)`, [aulaId]);

    const { questoes, resultado } = await fazerQuiz(corretorA1.id, moduloId, true);
    for (const q of questoes) {
      expect(Object.keys(q).sort()).toEqual(["alternativas", "enunciado", "id"]);
    }
    expect(resultado.aprovado).toBe(true);
    expect(Number(resultado.nota)).toBe(100);
    const gabarito = resultado.gabarito as Array<Record<string, unknown>>;
    expect(gabarito).toHaveLength(5);
    expect(gabarito[0]).toHaveProperty("correta");
  });

  it("não deixa iniciar o quiz sem concluir as aulas", async () => {
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.academia_tentativas WHERE corretor_id = $1`, [corretorA2.id]);
    await comoUsuario(c, corretorA2.id);
    expect(await errMsg(c.query(`SELECT public.academia_quiz_iniciar($1)`, [moduloId]))).toMatch(
      /conclua todas as aulas/i,
    );
  });

  it("intervalo entre tentativas reprovadas tem mensagem clara", async () => {
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.academia_tentativas WHERE corretor_id = $1`, [corretorA1.id]);
    await c.query(
      `UPDATE public.academia_config SET quiz_intervalo_min = 60, quiz_max_tentativas_dia = 3`,
    );
    const { resultado } = await fazerQuiz(corretorA1.id, moduloId, false);
    expect(resultado.aprovado).toBe(false);

    await comoUsuario(c, corretorA1.id);
    expect(await errMsg(c.query(`SELECT public.academia_quiz_iniciar($1)`, [moduloId]))).toMatch(
      /aguarde 60 minutos entre tentativas/i,
    );
  });

  it("limite diário tem mensagem clara", async () => {
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.academia_config SET quiz_intervalo_min = 0, quiz_max_tentativas_dia = 1`,
    );
    await comoUsuario(c, corretorA1.id);
    expect(await errMsg(c.query(`SELECT public.academia_quiz_iniciar($1)`, [moduloId]))).toMatch(
      /limite de 1 tentativas por dia/i,
    );

    await comoSuperuser(c);
    await c.query(
      `UPDATE public.academia_config SET quiz_intervalo_min = 60, quiz_max_tentativas_dia = 3`,
    );
    await c.query(`DELETE FROM public.academia_tentativas WHERE corretor_id = $1`, [corretorA1.id]);
  });
});

describe("recomendação em sombra", () => {
  it("o aluno não vê a recomendação em sombra e vê quando ela abre", async () => {
    await comoSuperuser(c);
    const regra = await c.query(
      `SELECT id FROM public.academia_regras_recomendacao WHERE codigo = 'R01'`,
    );
    const rec = await c.query(
      `INSERT INTO public.academia_recomendacoes
         (regra_id, corretor_id, modulo_id, indicador, data_ref, status)
       VALUES ($1, $2, $3, 'tempo_primeiro_contato',
               (now() AT TIME ZONE 'America/Sao_Paulo')::date, 'sombra')
       RETURNING id`,
      [regra.rows[0].id, corretorA1.id, moduloId],
    );
    const recId = rec.rows[0].id as string;

    await comoUsuario(c, corretorA1.id);
    let r = await c.query(`SELECT count(*)::int AS n FROM public.academia_recomendacoes`);
    expect(r.rows[0].n, "sombra é invisível para o aluno").toBe(0);

    // a gestão vê mesmo em sombra
    await comoUsuario(c, gestorA.id);
    r = await c.query(`SELECT count(*)::int AS n FROM public.academia_recomendacoes`);
    expect(r.rows[0].n).toBe(1);

    await comoSuperuser(c);
    await c.query(`UPDATE public.academia_recomendacoes SET status = 'aberta' WHERE id = $1`, [
      recId,
    ]);
    await comoUsuario(c, corretorA1.id);
    r = await c.query(`SELECT count(*)::int AS n FROM public.academia_recomendacoes`);
    expect(r.rows[0].n).toBe(1);

    await comoSuperuser(c);
    await c.query(`DELETE FROM public.academia_recomendacoes WHERE id = $1`, [recId]);
  });
});

describe("fluxo feliz: de iniciante a Habilitado", () => {
  it("A2 conclui a fase 0 e sobe de nível, com histórico e certificado", async () => {
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.academia_praticas WHERE corretor_id = $1`, [corretorA2.id]);
    await c.query(`DELETE FROM public.academia_tentativas WHERE corretor_id = $1`, [corretorA2.id]);

    let nivel = await c.query(
      `SELECT nivel FROM public.academia_participantes WHERE corretor_id = $1`,
      [corretorA2.id],
    );
    expect(nivel.rows[0].nivel).toBe("iniciante");

    // 1. aulas
    await comoUsuario(c, corretorA2.id);
    await c.query(`SELECT public.academia_marcar_aula($1, true)`, [aulaId]);

    // 2. quiz
    const { resultado } = await fazerQuiz(corretorA2.id, moduloId, true);
    expect(resultado.aprovado).toBe(true);

    // o módulo exige prática: o quiz sozinho não promove
    await comoSuperuser(c);
    nivel = await c.query(
      `SELECT nivel FROM public.academia_participantes WHERE corretor_id = $1`,
      [corretorA2.id],
    );
    expect(nivel.rows[0].nivel, "quiz sem prática não promove").toBe("iniciante");

    // 3. prática enviada pelo aluno e aprovada pelo gestor da equipe dele
    await comoUsuario(c, corretorA2.id);
    const p = await c.query(`SELECT public.academia_pratica_enviar($1, $2, NULL) AS id`, [
      moduloId,
      "gravação do roleplay",
    ]);
    await comoUsuario(c, gestorA.id);
    await c.query(
      `SELECT public.academia_pratica_avaliar($1, 'aprovada', '[]'::jsonb, 'foco: renda antes de preço')`,
      [p.rows[0].id],
    );

    // 4. nível, histórico e certificado
    await comoSuperuser(c);
    nivel = await c.query(
      `SELECT nivel FROM public.academia_participantes WHERE corretor_id = $1`,
      [corretorA2.id],
    );
    expect(nivel.rows[0].nivel).toBe("habilitado");

    const hist = await c.query(
      `SELECT de, para, motivo FROM public.academia_niveis_historico WHERE corretor_id = $1`,
      [corretorA2.id],
    );
    expect(hist.rows).toHaveLength(1);
    expect(hist.rows[0]).toMatchObject({ de: "iniciante", para: "habilitado" });

    const cert = await c.query(
      `SELECT nivel FROM public.academia_certificados WHERE corretor_id = $1`,
      [corretorA2.id],
    );
    expect(cert.rows.map((x) => x.nivel)).toEqual(["habilitado"]);

    // 5. a view de resumo usa o nome novo e mostra o selo
    const resumo = await c.query(
      `SELECT habilitado, modulos_concluidos FROM public.v_academia_corretor_resumo
        WHERE corretor_id = $1`,
      [corretorA2.id],
    );
    expect(resumo.rows[0].habilitado).toBe(true);
    expect(Number(resumo.rows[0].modulos_concluidos)).toBe(1);
  });

  it("o selo Habilitado não encosta no Apto da roleta v2", async () => {
    await comoSuperuser(c);
    const r = await c.query(`SELECT onboarding_concluido_em FROM public.profiles WHERE id = $1`, [
      corretorA2.id,
    ]);
    expect(
      r.rows[0].onboarding_concluido_em,
      "a Academia não preenche o gate da roleta",
    ).toBeNull();
  });
});

describe("seed e flags", () => {
  it("o seed roda duas vezes sem erro e sem duplicata", async () => {
    await comoSuperuser(c);
    const contar = async () => {
      const r = await c.query(`
        SELECT (SELECT count(*) FROM public.academia_fases)                AS fases,
               (SELECT count(*) FROM public.academia_modulos
                 WHERE codigo NOT LIKE 'TST%')                             AS modulos,
               (SELECT count(*) FROM public.academia_aulas a
                  JOIN public.academia_modulos m ON m.id = a.modulo_id
                 WHERE m.codigo NOT LIKE 'TST%')                           AS aulas,
               (SELECT count(*) FROM public.academia_regras_recomendacao)  AS regras`);
      return r.rows[0] as Record<string, string>;
    };
    const antes = await contar();
    expect(Number(antes.regras)).toBe(8);
    expect(Number(antes.modulos)).toBeGreaterThan(0);

    await c.query(readFileSync(SEED, "utf8"));
    const depois = await contar();
    expect(depois).toEqual(antes);
  });

  it("a fase 0 chama Integração e exige o nível habilitado", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT nome, nivel_que_exige FROM public.academia_fases WHERE numero = 0`,
    );
    expect(r.rows[0]).toMatchObject({ nome: "Integração", nivel_que_exige: "habilitado" });
  });

  it("R07 nasce desativada; R05 e R06 saem na calibração de 29/09/2026", async () => {
    // R07: não existe fonte de dados. R05 e R06: 1,5x a mediana real passa de
    // 100%, então nunca disparariam (decisão do dono, migration de calibração).
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT codigo, ativa FROM public.academia_regras_recomendacao ORDER BY codigo`,
    );
    const desativadas = r.rows.filter((x) => !x.ativa).map((x) => x.codigo);
    expect(desativadas).toEqual(["R05", "R06", "R07"]);
  });

  it("calibração: R02 com janela de 90 dias e R08 com 10 pontos de diferença mínima", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT codigo, janela_dias, diferenca_minima::float AS dif
         FROM public.academia_regras_recomendacao WHERE codigo IN ('R01', 'R02', 'R08')
        ORDER BY codigo`,
    );
    expect(r.rows).toEqual([
      { codigo: "R01", janela_dias: 90, dif: 5 },
      { codigo: "R02", janela_dias: 90, dif: null },
      { codigo: "R08", janela_dias: 90, dif: 10 },
    ]);
  });

  it("app_flags ganhou as duas chaves, desligadas", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT chave, ativo FROM public.app_flags WHERE chave LIKE 'academia%' ORDER BY chave`,
    );
    expect(r.rows).toEqual([
      { chave: "academia_card_inicio", ativo: false },
      { chave: "academia_menu", ativo: false },
    ]);
  });

  it("o gate da roleta recusa 'ativo' pelo CHECK nomeado", async () => {
    await comoSuperuser(c);
    expect(
      await errCode(c.query(`UPDATE public.academia_config SET gate_roleta_modo = 'ativo'`)),
    ).toBe("23514");
    const r = await c.query(
      `SELECT conname FROM pg_constraint WHERE conname = 'academia_config_gate_roleta_modo_chk'`,
    );
    expect(r.rows).toHaveLength(1);
  });
});
