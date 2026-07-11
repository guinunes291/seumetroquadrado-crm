import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260711137000_vitrine_rollout_upgrade.sql"),
  "utf8",
);

function functionBlock(name: string, nextName?: string) {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = nextName
    ? migration.indexOf(`CREATE OR REPLACE FUNCTION public.${nextName}`, start + 1)
    : migration.length;
  return migration.slice(start, end);
}

describe("finalizador aditivo da Vitrine", () => {
  it("garante colunas opcionais sem alterar as migrations já registradas", () => {
    expect(migration).toContain("ALTER TABLE public.vitrine_links");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS total_eventos integer DEFAULT 0");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS total_requisicoes integer DEFAULT 0");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS limite_janela_inicio timestamptz");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS idempotency_key uuid");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS galeria_urls text[]");
    expect(migration).not.toContain("DROP TABLE");
    expect(migration).not.toContain("DROP COLUMN");
  });

  it("normaliza counters antes dos checks nomeados e mantém os tetos finais", () => {
    const normalize = migration.indexOf("WITH contagens AS");
    const constraints = migration.indexOf("vitrine_links_aberturas_rollout_ck");

    expect(normalize).toBeGreaterThan(0);
    expect(constraints).toBeGreaterThan(normalize);
    expect(migration).toContain("LEAST(1000");
    expect(migration).toContain("LEAST(20000");
    expect(migration).toContain("LEAST(60");
    expect(migration).toContain("CHECK (total_eventos BETWEEN 0 AND 1000) NOT VALID");
    expect(migration).toContain("CHECK (total_requisicoes BETWEEN 0 AND 20000) NOT VALID");
    expect(migration).toContain("VALIDATE CONSTRAINT vitrine_links_janela_rollout_ck");
  });

  it("faz backfill e deduplicação antes do NOT NULL/índice idempotente", () => {
    const add = migration.indexOf("ADD COLUMN IF NOT EXISTS idempotency_key uuid");
    const backfill = migration.indexOf("SET idempotency_key = gen_random_uuid()", add);
    const deduplicate = migration.indexOf("PARTITION BY evento.link_id, evento.idempotency_key");
    const notNull = migration.indexOf("ALTER COLUMN idempotency_key SET NOT NULL");
    const unique = migration.indexOf("uq_vitrine_eventos_idempotencia_rollout");

    expect(add).toBeGreaterThan(0);
    expect(backfill).toBeGreaterThan(add);
    expect(deduplicate).toBeGreaterThan(backfill);
    expect(notNull).toBeGreaterThan(deduplicate);
    expect(unique).toBeGreaterThan(notNull);
    expect(migration).toContain("ON public.vitrine_link_eventos (link_id, idempotency_key)");
    expect(migration).toContain("ADD CONSTRAINT uq_vitrine_eventos_idempotencia_rollout");
    expect(migration).toContain("UNIQUE USING INDEX uq_vitrine_eventos_idempotencia_rollout");
  });

  it("normaliza e restringe a galeria a doze strings de 1–2048 caracteres", () => {
    expect(migration).toContain("FROM unnest(COALESCE(projeto.galeria_urls");
    expect(migration).toContain("char_length(btrim(item.url)) BETWEEN 1 AND 2048");
    expect(migration).toContain("LIMIT 12");
    expect(migration).toContain("ALTER COLUMN galeria_urls SET NOT NULL");
    expect(migration).toContain("cardinality(_urls) <= 12");
    expect(migration).toContain("array_position(_urls, NULL) IS NULL");
    expect(migration).toContain("char_length(item.url) NOT BETWEEN 1 AND 2048");
    expect(migration).toContain("projetos_galeria_urls_rollout_ck");
  });

  it("reinstala as funções finais fail-closed somente para service_role", () => {
    const functions = [
      ["consumir_vitrine_requisicao", "registrar_vitrine_evento"],
      ["registrar_vitrine_evento", "limpar_vitrine_eventos_expirados"],
      ["limpar_vitrine_eventos_expirados", undefined],
    ] as const;

    for (const [name, nextName] of functions) {
      const block = functionBlock(name, nextName);
      expect(block).toContain("SECURITY DEFINER");
      expect(block).toContain("SET search_path = pg_catalog, public");
      expect(block).toContain(`REVOKE ALL ON FUNCTION public.${name}`);
      expect(block).toContain("FROM PUBLIC, anon, authenticated");
      expect(block).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}[\\s\\S]*TO service_role`),
      );
      expect(block).not.toMatch(/TO anon|TO authenticated/);
    }

    const consume = functionBlock("consumir_vitrine_requisicao", "registrar_vitrine_evento");
    expect(consume).toContain("FOR UPDATE");
    expect(consume).toContain("total_requisicoes >= 20000");
    expect(consume).toContain("_quantidade > 60");

    const register = functionBlock("registrar_vitrine_evento", "limpar_vitrine_eventos_expirados");
    expect(register).toContain("idempotency_key = _idempotency_key");
    expect(register).toContain("OR _idempotency_key IS NULL OR _tipo IS NULL");
    expect(register).toContain("_total_eventos >= 1000");
    expect(register).toContain(") >= 120 THEN");
    expect(register).toContain("ON CONFLICT (link_id, idempotency_key) DO NOTHING");

    const cleanup = functionBlock("limpar_vitrine_eventos_expirados");
    expect(cleanup).toContain("now() - interval '30 days'");
    expect(cleanup).toContain("link.revogado_em IS NOT NULL OR link.expira_em < now()");
  });
});
