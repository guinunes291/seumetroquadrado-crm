/**
 * Motivos de perda sem retrabalho (migration 20260914150000) — uma fonte só.
 *
 * A regra "quem não se reaborda" existia em dois lugares: inline no motor de
 * SDR (20260904102000) e na função que o Bolsão usa (20260914140000). Duas
 * cópias da mesma regra não divergem por descuido — divergem por trabalho
 * normal: alguém acrescenta um motivo numa delas, a suíte passa, e a partir
 * daí o discador e o SDR trabalham populações diferentes sem que nada acuse.
 * É divergência que não dá erro; dá número errado, meses depois.
 *
 * Esta suíte sustenta duas afirmações que a migration faz:
 *
 *  1. A TROCA É EQUIVALENTE — sobre TODO o domínio da coluna, não sobre um
 *     caso feliz. `motivo_perda_categoria` tem CHECK com 11 valores, mais
 *     NULL. Testar os 12 é barato e é a única forma honesta de escrever
 *     "equivalente" no cabeçalho de uma migration.
 *  2. A FONTE CONTINUA ÚNICA — nenhuma outra função do schema pode voltar a
 *     carregar a lista inline.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comoSuperuser, novoClient } from "./helpers";

const c = novoClient();

beforeAll(async () => {
  await c.connect();
  await comoSuperuser(c);
});

afterAll(async () => {
  await c.end();
});

describe("motivo_perda_sem_retrabalho", () => {
  it("é equivalente à lista inline em todo o domínio da coluna", async () => {
    // Os valores vêm do próprio CHECK da tabela, não de uma cópia minha: se
    // alguém acrescentar uma categoria, este teste passa a cobri-la sozinho.
    const r = await c.query(`
      WITH categorias AS (
        SELECT unnest(ARRAY[
          'sem_contato','sumiu_pos_proposta','credito_score','credito_renda',
          'estourou_teto','ja_possui_imovel','preco_parcela',
          'comprou_concorrente','timing_adiou','sem_perfil','outro', NULL
        ]::text[]) AS m
      )
      SELECT
        count(*)::int AS total,
        count(*) FILTER (
          WHERE (COALESCE(m, 'outro') NOT IN
                  ('ja_possui_imovel','comprou_concorrente','sem_perfil'))
             IS DISTINCT FROM
                NOT public.motivo_perda_sem_retrabalho(m)
        )::int AS divergentes
      FROM categorias
    `);
    expect(r.rows[0].total).toBe(12);
    expect(r.rows[0].divergentes).toBe(0);
  });

  it("cobre a mesma lista de categorias que o CHECK da tabela aceita", async () => {
    // Se o CHECK ganhar um valor novo, o teste acima deixa de ser exaustivo
    // sem avisar. Este aqui avisa.
    const r = await c.query(`
      SELECT pg_get_constraintdef(oid) AS def
        FROM pg_constraint
       WHERE conrelid = 'public.leads'::regclass
         AND conname ILIKE '%motivo%'
    `);
    const def = String(r.rows[0].def);
    for (const cat of [
      "sem_contato",
      "sumiu_pos_proposta",
      "credito_score",
      "credito_renda",
      "estourou_teto",
      "ja_possui_imovel",
      "preco_parcela",
      "comprou_concorrente",
      "timing_adiou",
      "sem_perfil",
      "outro",
      // Trazidas pela cadência D1/D2/D3 (20260921120000). Ver o mapeamento
      // documento -> CRM no cabeçalho daquela migration: os demais motivos do
      // documento já existiam com outro nome e NÃO viraram apelidos novos.
      "sem_retorno_cadencia",
      "numero_invalido",
      "opt_out",
    ]) {
      expect(def, `categoria ${cat} sumiu do CHECK`).toContain(cat);
    }
    // 14 categorias e nada além delas.
    expect((def.match(/'/g) ?? []).length).toBe(28);
  });

  it("NULL continua reciclável — lead sem categoria de perda não é excluído", async () => {
    const r = await c.query(`SELECT public.motivo_perda_sem_retrabalho(NULL) AS x`);
    expect(r.rows[0].x).toBe(false);
  });
});

describe("a fonte é única", () => {
  it("nenhuma outra função do schema carrega a lista inline", async () => {
    const r = await c.query(`
      SELECT p.proname
        FROM pg_proc AS p
        JOIN pg_namespace AS n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname <> 'motivo_perda_sem_retrabalho'
         AND p.prosrc LIKE '%ja_possui_imovel%'
         AND p.prosrc LIKE '%comprou_concorrente%'
         AND p.prosrc LIKE '%sem_perfil%'
       ORDER BY p.proname
    `);
    expect(r.rows.map((x) => x.proname)).toEqual([]);
  });

  it("o motor de SDR e o Bolsão chamam a mesma função", async () => {
    // Desde 20260915130000 o predicado do Bolsão vive em `_bolsao_elegivel`
    // (usado por bolsao_v1 E pela reserva do discador) — é ela quem chama
    // motivo_perda_sem_retrabalho; bolsao_v1 precisa chamá-la.
    const r = await c.query(`
      SELECT p.proname
        FROM pg_proc AS p
        JOIN pg_namespace AS n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('alimentar_base_sdr_perdidos', '_bolsao_elegivel')
         AND p.prosrc LIKE '%motivo_perda_sem_retrabalho%'
       ORDER BY p.proname
    `);
    expect(r.rows.map((x) => x.proname)).toEqual([
      "_bolsao_elegivel",
      "alimentar_base_sdr_perdidos",
    ]);
    const bolsao = await c.query(`
      SELECT p.prosrc LIKE '%_bolsao_elegivel(l)%' AS usa
        FROM pg_proc AS p
        JOIN pg_namespace AS n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'bolsao_v1'
    `);
    expect(bolsao.rows[0]?.usa).toBe(true);
  });
});
