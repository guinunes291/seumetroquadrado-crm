import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260711135000_projetos_vitrine_rich_media.sql");
const authenticated = read("src/routes/_authenticated/vitrine.tsx");
const publicPage = read("src/routes/vitrine-publica.tsx");

describe("Vitrine comercial rica", () => {
  it("adiciona mídia, disponibilidade e comissão com limites aditivos", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS capa_url text");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS galeria_urls text[]");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS percentual_comissao numeric(6,3)");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS disponibilidade_resumo text");
    expect(migration).toContain("cardinality(galeria_urls) <= 12");
    expect(migration).toContain("percentual_comissao BETWEEN 0 AND 100");
  });

  it("mantém comissão interna e publica somente mídia allowlisted", () => {
    const projection = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.obter_vitrine_publica"),
    );
    expect(projection).toContain("'capa_url', p.capa_url");
    expect(projection).toContain("'galeria_urls', p.galeria_urls");
    expect(projection).toContain("'disponibilidade_resumo', p.disponibilidade_resumo");
    expect(projection).not.toContain("'percentual_comissao'");
  });

  it("mostra os dados decisivos no primeiro viewport autenticado", () => {
    for (const label of ["Disponibilidade", "Comissão", "Renda mínima", "Entrega"]) {
      expect(authenticated).toContain(`label="${label}"`);
    }
    expect(authenticated).toContain("safeCatalogImageUrl");
    expect(publicPage).toContain("project.capa_url");
    expect(publicPage).toContain("project.galeria_urls");
  });
});
