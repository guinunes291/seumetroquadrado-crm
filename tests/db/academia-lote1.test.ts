// Academia SMQ · LOTE 1 (M00, M25, M26, M27, M15) importado do formato
// canônico por scripts/academia/converter-lote.mjs.
//
// Prova o que a importação promete: as contagens do lote, o seed idempotente
// (roda de novo sem duplicar, e o seed da Fatia 1 também), o M15 antigo
// arquivado e não apagado, módulo publicado nunca tocado, e a RLS das duas
// tabelas novas (flashcards e material do gerente).
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

const LOTE = ["M00", "M25", "M26", "M27", "M15"];
const SEEDS = [
  "supabase/migrations/20261006120100_academia_lote1_m00.sql",
  "supabase/migrations/20261006120200_academia_lote1_m25.sql",
  "supabase/migrations/20261006120300_academia_lote1_m26.sql",
  "supabase/migrations/20261006120400_academia_lote1_m27.sql",
  "supabase/migrations/20261006120500_academia_lote1_m15.sql",
];
const SEED_FATIA1 = "supabase/migrations/20261002120100_academia_seed.sql";

let admin: UsuarioTeste;
let gestor: UsuarioTeste;
let corretor: UsuarioTeste;

/** Contagens do conteúdo da Academia inteira (não só do lote). */
async function contar(): Promise<Record<string, number>> {
  await comoSuperuser(c);
  const r = await c.query(`
    SELECT (SELECT count(*) FROM public.academia_modulos WHERE codigo NOT LIKE 'TST%') AS modulos,
           (SELECT count(*) FROM public.academia_aulas)                 AS aulas,
           (SELECT count(*) FROM public.academia_aulas
             WHERE status = 'publicado')                                AS aulas_publicadas,
           (SELECT count(*) FROM public.academia_questoes)              AS questoes,
           (SELECT count(*) FROM public.academia_questoes WHERE ativa)  AS questoes_ativas,
           (SELECT count(*) FROM public.academia_flashcards)            AS flashcards,
           (SELECT count(*) FROM public.academia_conteudo_gerente)      AS gerente`);
  return Object.fromEntries(Object.entries(r.rows[0]).map(([k, v]) => [k, Number(v)]));
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  const equipe = await criarEquipe(c, { nome: "Equipe Lote 1" });
  admin = await criarUsuario(c, { papel: "admin", equipeId: null, nome: "Admin" });
  gestor = await criarUsuario(c, { papel: "gestor", equipeId: equipe, nome: "Gestor" });
  corretor = await criarUsuario(c, { papel: "corretor", equipeId: equipe, nome: "Corretor" });
});

afterAll(async () => {
  await comoSuperuser(c);
  await c.end();
});

describe("LOTE 1 importado", () => {
  it("tem os 5 módulos em rascunho, nas fases certas, com as contagens do lote", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT m.codigo, m.fase, m.status, m.nota_minima, m.revisao_pendente IS NOT NULL AS trava,
              m.extras->>'trilha' AS trilha, m.extras->>'nivel_alvo_sistema' AS nivel,
              (SELECT count(*) FROM public.academia_aulas a
                WHERE a.modulo_id = m.id AND a.codigo IS NOT NULL AND a.status = 'publicado') AS aulas,
              (SELECT count(*) FROM public.academia_questoes q
                WHERE q.modulo_id = m.id AND q.codigo IS NOT NULL AND q.ativa) AS questoes,
              (SELECT count(*) FROM public.academia_flashcards f
                WHERE f.modulo_id = m.id AND f.ativa) AS flashcards
         FROM public.academia_modulos m
        WHERE m.codigo = ANY($1)
        ORDER BY m.codigo`,
      [LOTE],
    );
    const porCodigo = Object.fromEntries(r.rows.map((x) => [x.codigo, x]));
    expect(Object.keys(porCodigo).sort()).toEqual([...LOTE].sort());
    for (const cod of ["M00", "M25", "M26", "M27"]) {
      expect(porCodigo[cod].fase, cod).toBe(0);
      expect(porCodigo[cod].trilha, cod).toBe("T0");
    }
    expect(porCodigo.M15.fase).toBe(3);
    expect(porCodigo.M00.nivel).toBe("iniciante");
    expect(porCodigo.M15.nivel, "Apto no texto é habilitado no sistema").toBe("habilitado");
    for (const x of r.rows) {
      expect(x.status, x.codigo).toBe("rascunho");
      expect(x.nota_minima, x.codigo).toBe(80);
      expect(x.trava, `${x.codigo}: revisao_pendente trava a publicação`).toBe(true);
    }
    const soma = (k: string) => r.rows.reduce((s, x) => s + Number(x[k]), 0);
    expect(soma("aulas")).toBe(23);
    expect(soma("questoes")).toBe(100);
    expect(soma("flashcards")).toBe(65);
  });

  it("a alternativa correta aparece nas quatro posições", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT q.correta, count(*)::int AS n FROM public.academia_questoes q
         JOIN public.academia_modulos m ON m.id = q.modulo_id
        WHERE m.codigo = ANY($1) AND q.ativa AND q.codigo IS NOT NULL
        GROUP BY q.correta ORDER BY q.correta`,
      [LOTE],
    );
    expect(r.rows.map((x) => x.correta)).toEqual([0, 1, 2, 3]);
    for (const x of r.rows) expect(x.n).toBeLessThanOrEqual(40);
  });

  it("nenhum travessão nem traço médio chegou ao banco", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT
         (SELECT count(*) FROM public.academia_modulos
           WHERE codigo = ANY($1)
             AND (titulo || coalesce(objetivo_principal,'') || objetivos::text
                  || coalesce(pratica_descricao,'') || extras::text) ~ '[–—]')
       + (SELECT count(*) FROM public.academia_aulas WHERE codigo IS NOT NULL
             AND (titulo || coalesce(conteudo_md,'') || extras::text) ~ '[–—]')
       + (SELECT count(*) FROM public.academia_questoes WHERE codigo IS NOT NULL
             AND (enunciado || alternativas::text || coalesce(explicacao,'')) ~ '[–—]')
       + (SELECT count(*) FROM public.academia_flashcards
             WHERE (frente || verso) ~ '[–—]')
       + (SELECT count(*) FROM public.academia_conteudo_gerente
             WHERE conteudo::text ~ '[–—]') AS n`,
      [LOTE],
    );
    expect(Number(r.rows[0].n)).toBe(0);
  });

  it("o M15 antigo foi arquivado, não apagado", async () => {
    await comoSuperuser(c);
    const r = await c.query(`
      SELECT
        (SELECT count(*) FROM public.academia_aulas a WHERE a.modulo_id = m.id
            AND a.codigo IS NULL)                                     AS aulas_antigas,
        (SELECT count(*) FROM public.academia_aulas a WHERE a.modulo_id = m.id
            AND a.codigo IS NULL AND a.status <> 'arquivado')         AS aulas_antigas_vivas,
        (SELECT count(*) FROM public.academia_aulas a WHERE a.modulo_id = m.id
            AND a.status = 'publicado')                               AS aulas_publicadas,
        (SELECT count(*) FROM public.academia_questoes q WHERE q.modulo_id = m.id
            AND q.codigo IS NULL)                                     AS questoes_antigas,
        (SELECT count(*) FROM public.academia_questoes q WHERE q.modulo_id = m.id
            AND q.codigo IS NULL AND q.ativa)                         AS questoes_antigas_ativas,
        (SELECT count(*) FROM public.academia_questoes q WHERE q.modulo_id = m.id
            AND q.ativa)                                              AS questoes_ativas
      FROM public.academia_modulos m WHERE m.codigo = 'M15'`);
    const x = Object.fromEntries(Object.entries(r.rows[0]).map(([k, v]) => [k, Number(v)]));
    expect(x.aulas_antigas, "as 7 aulas da Fatia 1 continuam no banco").toBe(7);
    expect(x.aulas_antigas_vivas).toBe(0);
    expect(x.aulas_publicadas).toBe(6);
    expect(x.questoes_antigas, "as 8 questões da Fatia 1 continuam no banco").toBe(8);
    expect(x.questoes_antigas_ativas).toBe(0);
    expect(x.questoes_ativas, "o quiz sorteia só do LOTE 1").toBe(20);
  });

  it("o O01 da Integração continua como estava", async () => {
    await comoSuperuser(c);
    const r = await c.query(`
      SELECT m.fase,
             (SELECT count(*) FROM public.academia_aulas a
               WHERE a.modulo_id = m.id AND a.status = 'publicado')::int AS aulas
        FROM public.academia_modulos m WHERE m.codigo = 'O01'`);
    expect(r.rows[0]).toEqual({ fase: 0, aulas: 5 });
  });
});

describe("idempotência", () => {
  it("os seeds do LOTE 1 rodam de novo sem duplicar nem mudar nada", async () => {
    const antes = await contar();
    const ids = async () =>
      (
        await c.query(`
          SELECT string_agg(id::text, ',' ORDER BY id) AS ids FROM (
            SELECT id FROM public.academia_aulas UNION ALL
            SELECT id FROM public.academia_questoes UNION ALL
            SELECT id FROM public.academia_flashcards) t`)
      ).rows[0].ids as string;
    const idsAntes = await ids();
    for (const s of SEEDS) await c.query(readFileSync(s, "utf8"));
    expect(await contar()).toEqual(antes);
    expect(await ids(), "upsert mantém as mesmas linhas").toBe(idsAntes);
  });

  it("o seed da Fatia 1 roda de novo sem ressuscitar o M15 antigo", async () => {
    const antes = await contar();
    await c.query(readFileSync(SEED_FATIA1, "utf8"));
    expect(await contar()).toEqual(antes);
  });

  it("módulo publicado não é tocado pelo seed", async () => {
    await comoSuperuser(c);
    await c.query("BEGIN");
    try {
      await c.query(
        `UPDATE public.academia_modulos SET status = 'publicado', titulo = 'editado no CRM'
          WHERE codigo = 'M25'`,
      );
      await c.query(
        `UPDATE public.academia_aulas a SET titulo = 'aula editada no CRM'
           FROM public.academia_modulos m
          WHERE a.modulo_id = m.id AND m.codigo = 'M25' AND a.codigo = 'M25-A1'`,
      );
      await c.query(readFileSync(SEEDS[1], "utf8"));
      const r = await c.query(`
        SELECT m.titulo, a.titulo AS aula
          FROM public.academia_modulos m
          JOIN public.academia_aulas a ON a.modulo_id = m.id AND a.codigo = 'M25-A1'
         WHERE m.codigo = 'M25'`);
      expect(r.rows[0]).toEqual({ titulo: "editado no CRM", aula: "aula editada no CRM" });
    } finally {
      await c.query("ROLLBACK");
    }
  });
});

describe("RLS das tabelas novas", () => {
  it("corretor não lê flashcard de módulo em rascunho; lê quando o módulo é publicado", async () => {
    await comoUsuario(c, corretor.id);
    const rascunho = await c.query(`SELECT count(*)::int AS n FROM public.academia_flashcards`);
    expect(rascunho.rows[0].n).toBe(0);

    await comoSuperuser(c);
    await c.query("BEGIN");
    try {
      await c.query(`UPDATE public.academia_modulos SET status = 'publicado' WHERE codigo = 'M25'`);
      await comoUsuario(c, corretor.id);
      const pub = await c.query(`SELECT count(*)::int AS n FROM public.academia_flashcards`);
      expect(pub.rows[0].n).toBe(13);
    } finally {
      await c.query("ROLLBACK");
      await comoSuperuser(c);
    }
  });

  it("só o admin escreve flashcard", async () => {
    await comoUsuario(c, gestor.id);
    const code = await errCode(
      c.query(
        `INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso)
         SELECT id, 'TST-F01', 99, 'f', 'v' FROM public.academia_modulos WHERE codigo = 'M15'`,
      ),
    );
    // O gestor nem enxerga o módulo em rascunho: o SELECT não traz linha e o
    // INSERT não insere nada. Com o id na mão, a policy recusa (42501).
    expect(code).toBeNull();
    await comoSuperuser(c);
    const id = (await c.query(`SELECT id FROM public.academia_modulos WHERE codigo = 'M15'`))
      .rows[0].id as string;
    await comoUsuario(c, gestor.id);
    expect(
      await errCode(
        c.query(
          `INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso)
           VALUES ($1, 'TST-F01', 99, 'f', 'v')`,
          [id],
        ),
      ),
    ).toBe("42501");

    await comoUsuario(c, admin.id);
    const todos = await c.query(`SELECT count(*)::int AS n FROM public.academia_flashcards`);
    expect(todos.rows[0].n, "o admin revisa tudo em rascunho").toBe(65);
    await comoSuperuser(c);
  });

  it("guia do gerente e gabarito: a gestão lê, o corretor não", async () => {
    const ler = async (u: UsuarioTeste) => {
      await comoUsuario(c, u.id);
      const r = await c.query(
        `SELECT count(*)::int AS n,
                count(*) FILTER (WHERE conteudo ? 'pratica_gabarito')::int AS gabaritos
           FROM public.academia_conteudo_gerente`,
      );
      await comoSuperuser(c);
      return r.rows[0];
    };
    expect(await ler(corretor)).toEqual({ n: 0, gabaritos: 0 });
    expect(await ler(gestor)).toEqual({ n: 5, gabaritos: 1 });
    expect(await ler(admin)).toEqual({ n: 5, gabaritos: 1 });
  });

  it("o gabarito da prática não vaza pelo módulo", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT count(*)::int AS n FROM public.academia_modulos
        WHERE codigo = ANY($1)
          AND (extras->'pratica' ? 'gabarito' OR extras ? 'guia_gestor'
               OR pratica_descricao ILIKE '%gabarito:%')`,
      [LOTE],
    );
    expect(r.rows[0].n).toBe(0);
  });
});
