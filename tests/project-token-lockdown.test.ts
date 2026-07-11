import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260711136000_projetos_webhook_token_lockdown.sql");
const projection = read("src/lib/projetos-query.ts");
const consumers = [
  "src/routes/_authenticated/vitrine.tsx",
  "src/routes/_authenticated/match.tsx",
  "src/routes/_authenticated/projetos.index.tsx",
  "src/routes/_authenticated/projetos.$projetoId.tsx",
].map(read);

describe("segredo de webhook dos projetos", () => {
  it("remove grants de tabela e reconcede apenas colunas sem o token", () => {
    expect(migration).toContain(
      "REVOKE SELECT, INSERT, UPDATE ON TABLE public.projetos FROM authenticated",
    );
    const grants = migration.slice(
      migration.indexOf("GRANT SELECT"),
      migration.indexOf("COMMENT ON COLUMN"),
    );
    expect(grants).toContain("ON TABLE public.projetos TO authenticated");
    expect(grants).not.toContain("webhook_token");
  });

  it("proíbe SELECT * e usa a projeção explícita em todos os consumidores", () => {
    const selectColumns = projection.match(/PROJETO_CRM_SELECT\s*=\s*\n?\s*"([^"]+)"/)?.[1];
    expect(selectColumns).toBeTruthy();
    expect(selectColumns).not.toContain("webhook_token");
    for (const source of consumers) {
      expect(source).toContain("PROJETO_CRM_SELECT");
      expect(source).not.toMatch(/from\("projetos"\)[\s\S]{0,160}select\("\*"\)/);
    }
  });
});
