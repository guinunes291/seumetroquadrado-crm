// Academia SMQ · LOTE 3 (M04, M05, M06, M07, M08, M09), o domínio técnico,
// importado do formato canônico por scripts/academia/converter-lote.mjs.
//
// Os seis módulos já existiam no seed da Fatia 1 (conteúdo do Notion). O
// LOTE 3 vira a versão atual e o conteúdo antigo é arquivado, não apagado.
// Prova: contagens, conteúdo antigo arquivado, seeds idempotentes (os do lote
// e o da Fatia 1), regras de recomendação ainda apontando para os módulos, e o
// gabarito da prática fora do alcance do corretor.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarEquipe,
  criarUsuario,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

const LOTE = ["M04", "M05", "M06", "M07", "M08", "M09"];
const SEEDS = [
  "supabase/migrations/20261008120100_academia_lote3_m04.sql",
  "supabase/migrations/20261008120200_academia_lote3_m05.sql",
  "supabase/migrations/20261008120300_academia_lote3_m06.sql",
  "supabase/migrations/20261008120400_academia_lote3_m07.sql",
  "supabase/migrations/20261008120500_academia_lote3_m08.sql",
  "supabase/migrations/20261008120600_academia_lote3_m09.sql",
];
const SEED_FATIA1 = "supabase/migrations/20261002120100_academia_seed.sql";

let gestor: UsuarioTeste;
let corretor: UsuarioTeste;

async function contar(): Promise<Record<string, number>> {
  await comoSuperuser(c);
  const r = await c.query(`
    SELECT (SELECT count(*) FROM public.academia_aulas)                AS aulas,
           (SELECT count(*) FROM public.academia_aulas
             WHERE status = 'publicado')                               AS aulas_publicadas,
           (SELECT count(*) FROM public.academia_questoes)             AS questoes,
           (SELECT count(*) FROM public.academia_questoes WHERE ativa) AS questoes_ativas,
           (SELECT count(*) FROM public.academia_flashcards)           AS flashcards,
           (SELECT count(*) FROM public.academia_conteudo_gerente)     AS gerente`);
  return Object.fromEntries(Object.entries(r.rows[0]).map(([k, v]) => [k, Number(v)]));
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  // Outros testes rodam de novo o seed da Fatia 1, que sobrescreve o cabeçalho
  // (título, objetivos) de módulo em rascunho com o texto antigo. Em produção
  // migration não roda duas vezes; aqui, reaplicar os seeds do LOTE 3 (que são
  // idempotentes) devolve o estado que a importação deixa.
  for (const s of SEEDS) await c.query(readFileSync(s, "utf8"));
  const equipe = await criarEquipe(c, { nome: "Equipe Lote 3" });
  gestor = await criarUsuario(c, { papel: "gestor", equipeId: equipe, nome: "Gestor" });
  corretor = await criarUsuario(c, { papel: "corretor", equipeId: equipe, nome: "Corretor" });
});

afterAll(async () => {
  await comoSuperuser(c);
  await c.end();
});

describe("LOTE 3 importado", () => {
  it("tem os 6 módulos em rascunho nas fases certas, com as contagens do lote", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT m.codigo, m.fase, m.status, m.nota_minima, m.revisao_pendente IS NOT NULL AS trava,
              m.extras->>'trilha' AS trilha, m.extras->>'nivel_alvo_sistema' AS nivel,
              (SELECT count(*) FROM public.academia_aulas a
                WHERE a.modulo_id = m.id AND a.codigo IS NOT NULL AND a.status = 'publicado')::int AS aulas,
              (SELECT count(*) FROM public.academia_questoes q
                WHERE q.modulo_id = m.id AND q.codigo IS NOT NULL AND q.ativa)::int AS questoes,
              (SELECT count(*) FROM public.academia_flashcards f
                WHERE f.modulo_id = m.id AND f.ativa)::int AS flashcards
         FROM public.academia_modulos m
        WHERE m.codigo = ANY($1)
        ORDER BY m.codigo`,
      [LOTE],
    );
    expect(r.rows.map((x) => x.codigo)).toEqual(LOTE);
    for (const x of r.rows) {
      // M04 é da trilha Fundação; M05 a M09, do Domínio Técnico. M04 e M05
      // entram no núcleo do Apto; M06 a M09 miram o Intermediário.
      const t1 = x.codigo === "M04";
      expect(x.fase, x.codigo).toBe(t1 ? 1 : 2);
      expect(x.trilha, x.codigo).toBe(t1 ? "T1" : "T2");
      expect(x.nivel, x.codigo).toBe(
        ["M04", "M05"].includes(x.codigo) ? "habilitado" : "intermediario",
      );
      expect(x.status, x.codigo).toBe("rascunho");
      expect(x.nota_minima, x.codigo).toBe(80);
      expect(x.trava, `${x.codigo}: revisao_pendente trava a publicação`).toBe(true);
      expect(x.questoes, x.codigo).toBe(20);
    }
    const soma = (k: string) => r.rows.reduce((s, x) => s + Number(x[k]), 0);
    expect(soma("aulas")).toBe(30);
    expect(soma("questoes")).toBe(120);
    expect(soma("flashcards")).toBe(81);
  });

  it("o conteúdo antigo dos 6 módulos foi arquivado, não apagado", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT m.codigo,
              count(*) FILTER (WHERE a.codigo IS NULL)::int                           AS antigas,
              count(*) FILTER (WHERE a.codigo IS NULL AND a.status <> 'arquivado')::int AS antigas_vivas
         FROM public.academia_modulos m
         JOIN public.academia_aulas a ON a.modulo_id = m.id
        WHERE m.codigo = ANY($1)
        GROUP BY m.codigo`,
      [LOTE],
    );
    for (const x of r.rows) {
      expect(x.antigas, `${x.codigo}: aulas da Fatia 1 continuam no banco`).toBeGreaterThan(0);
      expect(x.antigas_vivas, x.codigo).toBe(0);
    }
    const q = await c.query(
      `SELECT count(*) FILTER (WHERE q.codigo IS NULL)::int              AS antigas,
              count(*) FILTER (WHERE q.codigo IS NULL AND q.ativa)::int  AS antigas_ativas
         FROM public.academia_questoes q
         JOIN public.academia_modulos m ON m.id = q.modulo_id
        WHERE m.codigo = ANY($1)`,
      [LOTE],
    );
    expect(q.rows[0].antigas, "as 30 questões da Fatia 1 continuam no banco").toBe(30);
    expect(q.rows[0].antigas_ativas).toBe(0);
  });

  it("as regras de recomendação continuam apontando para módulos que existem", async () => {
    await comoSuperuser(c);
    const r = await c.query(`
      SELECT count(*)::int AS orfas FROM public.academia_regras_recomendacao g
       WHERE NOT EXISTS (SELECT 1 FROM public.academia_modulos m WHERE m.codigo = g.modulo_codigo)`);
    expect(r.rows[0].orfas).toBe(0);
  });

  it("nenhum travessão nem traço médio chegou ao banco", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT
         (SELECT count(*) FROM public.academia_modulos m
           WHERE m.codigo = ANY($1)
             AND (m.titulo || coalesce(m.objetivo_principal,'') || m.objetivos::text
                  || coalesce(m.pratica_descricao,'') || m.extras::text) ~ '[–—]')
       + (SELECT count(*) FROM public.academia_aulas a JOIN public.academia_modulos m ON m.id = a.modulo_id
           WHERE m.codigo = ANY($1) AND a.codigo IS NOT NULL
             AND (a.titulo || coalesce(a.conteudo_md,'') || a.extras::text) ~ '[–—]')
       + (SELECT count(*) FROM public.academia_questoes q JOIN public.academia_modulos m ON m.id = q.modulo_id
           WHERE m.codigo = ANY($1) AND q.codigo IS NOT NULL
             AND (q.enunciado || q.alternativas::text || coalesce(q.explicacao,'')) ~ '[–—]') AS n`,
      [LOTE],
    );
    expect(Number(r.rows[0].n)).toBe(0);
  });
});

describe("idempotência", () => {
  it("os seeds do LOTE 3 rodam de novo sem duplicar nem mudar nada", async () => {
    const antes = await contar();
    for (const s of SEEDS) await c.query(readFileSync(s, "utf8"));
    expect(await contar()).toEqual(antes);
  });

  it("o seed da Fatia 1 roda de novo sem ressuscitar o conteúdo antigo", async () => {
    // Em transação: o seed antigo também reescreve o cabeçalho dos módulos em
    // rascunho, e isso não pode vazar para os outros testes.
    const antes = await contar();
    await c.query("BEGIN");
    try {
      await c.query(readFileSync(SEED_FATIA1, "utf8"));
      expect(await contar()).toEqual(antes);
    } finally {
      await c.query("ROLLBACK");
    }
  });
});

describe("material do gerente", () => {
  it("os 6 gabaritos do lote ficam com a gestão; o corretor não lê nenhum", async () => {
    await comoSuperuser(c);
    const ids = (
      await c.query(`SELECT id FROM public.academia_modulos WHERE codigo = ANY($1)`, [LOTE])
    ).rows.map((x) => x.id as string);
    const ler = async (u: UsuarioTeste) => {
      await comoUsuario(c, u.id);
      const r = await c.query(
        `SELECT count(*)::int AS n,
                count(*) FILTER (WHERE conteudo ? 'pratica_gabarito')::int AS gabaritos
           FROM public.academia_conteudo_gerente WHERE modulo_id = ANY($1)`,
        [ids],
      );
      await comoSuperuser(c);
      return r.rows[0];
    };
    expect(await ler(corretor)).toEqual({ n: 0, gabaritos: 0 });
    expect(await ler(gestor)).toEqual({ n: 6, gabaritos: 6 });

    const vaza = await c.query(
      `SELECT count(*)::int AS n FROM public.academia_modulos
        WHERE codigo = ANY($1)
          AND (extras->'pratica' ? 'gabarito' OR extras ? 'guia_gestor')`,
      [LOTE],
    );
    expect(vaza.rows[0].n, "o gabarito não vaza pelo módulo").toBe(0);
  });
});
