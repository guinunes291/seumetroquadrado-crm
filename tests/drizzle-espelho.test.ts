/**
 * Espelho drizzle — o caminho de uma migration até a produção.
 *
 * O Lovable aplica no banco de produção o que está em drizzle/migrations, pelo
 * migrator do drizzle: lê meta/_journal.json e roda, numa transação, toda
 * entrada cujo "when" é MAIOR que o created_at da última já aplicada
 * (drizzle.__drizzle_migrations). O CI (tests/db) aplica supabase/migrations —
 * então migration sem espelho passa no CI e nunca chega à produção. Foi o que
 * aconteceu com a zona estrita (#234): cinco migrations verdes no CI, nenhuma
 * no banco vivo.
 *
 * A partir da primeira migration espelhada (Academia, 0016):
 *  1. toda migration de supabase/migrations tem cópia byte a byte em
 *     drizzle/migrations, registrada no journal, na mesma ordem dos nomes;
 *  2. o "when" de cada espelho é maior que o de TODA entrada anterior — senão
 *     o migrator o pula em silêncio (as entradas criadas pelo próprio Lovable
 *     têm "when" do relógio e podem ficar para trás; os espelhos, não);
 *  3. todo .sql de drizzle/migrations está no journal, e os snapshots seguem
 *     encadeados (prevId = id do anterior).
 *
 * Para espelhar: `espelhar()` de scripts/academia/converter-lote.mjs.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SUPABASE = join(process.cwd(), "supabase", "migrations");
const DRIZZLE = join(process.cwd(), "drizzle", "migrations");
const PRIMEIRA_ESPELHADA = "20261002120000_academia_fundacao.sql";

type Entrada = { idx: number; when: number; tag: string };
const journal = JSON.parse(readFileSync(join(DRIZZLE, "meta", "_journal.json"), "utf8")) as {
  entries: Entrada[];
};
const entradas = [...journal.entries].sort((a, b) => a.idx - b.idx);
const sqlDrizzle = new Map(
  entradas.map((e) => [e.tag, readFileSync(join(DRIZZLE, `${e.tag}.sql`))]),
);

const migrationsSupabase = readdirSync(SUPABASE)
  .filter((f) => f.endsWith(".sql") && f >= PRIMEIRA_ESPELHADA)
  .sort();

/** Entrada do journal cujo arquivo é idêntico ao da migration do Supabase. */
function espelhoDe(arquivo: string): Entrada | undefined {
  const fonte = readFileSync(join(SUPABASE, arquivo));
  return entradas.find((e) => sqlDrizzle.get(e.tag)?.equals(fonte));
}

describe("espelho drizzle das migrations (o que o Lovable aplica em produção)", () => {
  it("toda migration nova tem cópia byte a byte no journal, na mesma ordem", () => {
    expect(migrationsSupabase[0]).toBe(PRIMEIRA_ESPELHADA);
    const semEspelho = migrationsSupabase.filter((f) => !espelhoDe(f));
    expect(semEspelho, "sem espelho em drizzle/migrations (não chegam à produção)").toEqual([]);

    const ordem = migrationsSupabase.map((f) => espelhoDe(f)!.idx);
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
  });

  it("o when de cada espelho passa o de toda entrada anterior (o migrator não pula)", () => {
    const espelhos = new Set(migrationsSupabase.flatMap((f) => espelhoDe(f)?.tag ?? []));
    let maior = 0;
    const pulados: string[] = [];
    for (const e of entradas) {
      if (espelhos.has(e.tag) && e.when <= maior)
        pulados.push(`${e.tag} (when ${e.when} ≤ ${maior})`);
      maior = Math.max(maior, e.when);
    }
    expect(pulados).toEqual([]);
  });

  it("todo .sql está no journal e os snapshots seguem encadeados", () => {
    const tags = new Set(entradas.map((e) => e.tag));
    const soltos = readdirSync(DRIZZLE)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(/\.sql$/, ""))
      .filter((t) => !tags.has(t));
    expect(soltos, "arquivo fora do journal nunca é aplicado").toEqual([]);

    expect(entradas.map((e) => e.idx)).toEqual(entradas.map((_, i) => i));
    let anterior: string | null = null;
    for (const e of entradas) {
      const snap = JSON.parse(
        readFileSync(
          join(DRIZZLE, "meta", `${String(e.idx).padStart(4, "0")}_snapshot.json`),
          "utf8",
        ),
      ) as { id: string; prevId: string };
      if (anterior !== null) expect(snap.prevId, e.tag).toBe(anterior);
      anterior = snap.id;
    }
  });
});
