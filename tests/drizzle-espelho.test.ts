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
 *     encadeados (prevId = id do anterior);
 *  4. o caminho inverso: migration que o PRÓPRIO Lovable criou (só em
 *     drizzle/, já aplicada em produção) é trazida para supabase/migrations
 *     SEM espelho — reaplicar seria redundante. Fica em TRAZIDAS_DO_LOVABLE,
 *     e o corpo de cada função tem de ser o mesmo do Lovable.
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

/**
 * Migrations de supabase/migrations que trazem para o replay do CI o que o
 * Lovable criou e aplicou direto em produção (entradas só-drizzle do journal).
 */
const TRAZIDAS_DO_LOVABLE: Record<string, string[]> = {
  "20261010120000_migrations_do_lovable.sql": [
    "0013_vendas_total_empresa",
    "0015_comissao_tier_esteira",
    "0022_corretor_agenda_nao_vira_lead_sdr",
    "0037_leads_funil_registros_v1",
  ],
};

const migrationsSupabase = readdirSync(SUPABASE)
  .filter((f) => f.endsWith(".sql") && f >= PRIMEIRA_ESPELHADA)
  .sort();
const migrationsComEspelho = migrationsSupabase.filter((f) => !(f in TRAZIDAS_DO_LOVABLE));

/** Entrada do journal cujo arquivo é idêntico ao da migration do Supabase. */
function espelhoDe(arquivo: string): Entrada | undefined {
  const fonte = readFileSync(join(SUPABASE, arquivo));
  return entradas.find((e) => sqlDrizzle.get(e.tag)?.equals(fonte));
}

const espacos = (s: string) => s.replace(/\s+/g, " ").trim();

describe("espelho drizzle das migrations (o que o Lovable aplica em produção)", () => {
  it("toda migration nova tem cópia byte a byte no journal, na mesma ordem", () => {
    expect(migrationsSupabase[0]).toBe(PRIMEIRA_ESPELHADA);
    const semEspelho = migrationsComEspelho.filter((f) => !espelhoDe(f));
    expect(semEspelho, "sem espelho em drizzle/migrations (não chegam à produção)").toEqual([]);

    const ordem = migrationsComEspelho.map((f) => espelhoDe(f)!.idx);
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
  });

  it("o when de cada espelho passa o de toda entrada anterior (o migrator não pula)", () => {
    const espelhos = new Set(migrationsComEspelho.flatMap((f) => espelhoDe(f)?.tag ?? []));
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

  it("o que veio do Lovable entra no replay com o mesmo SQL e sem espelho", () => {
    const tags = new Set(entradas.map((e) => e.tag));
    const gemeasDoSupabase = new Set(
      readdirSync(SUPABASE)
        .filter((f) => f.endsWith(".sql"))
        .flatMap((f) => espelhoDe(f)?.tag ?? []),
    );
    for (const [arquivo, origens] of Object.entries(TRAZIDAS_DO_LOVABLE)) {
      expect(migrationsSupabase, arquivo).toContain(arquivo);
      // Espelhar reaplicaria em produção o que o Lovable já aplicou.
      expect(espelhoDe(arquivo), `${arquivo} não pode ter espelho`).toBeUndefined();

      const trazida = espacos(readFileSync(join(SUPABASE, arquivo), "utf8"));
      for (const tag of origens) {
        expect(tags.has(tag), `${tag} fora do journal`).toBe(true);
        expect(gemeasDoSupabase.has(tag), `${tag} já tem par em supabase/`).toBe(false);
        expect(trazida, arquivo).toContain(`drizzle/migrations/${tag}.sql`);

        // Corpo de cada função (entre $tag$) idêntico ao do Lovable; sem
        // função (ALTER TYPE), o arquivo inteiro.
        const original = sqlDrizzle.get(tag)!.toString("utf8");
        const corpos = [...original.matchAll(/\$(\w*)\$([\s\S]*?)\$\1\$/g)].map((m) => m[2]);
        for (const trecho of corpos.length > 0 ? corpos : [original]) {
          expect(trazida, `${tag}: SQL diferente do aplicado em produção`).toContain(
            espacos(trecho),
          );
        }
      }
    }
  });
});
