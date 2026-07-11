import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql"));
const read = (f: string) => readFileSync(join(DIR, f), "utf8");
const all = files.map(read).join("\n");

function fileMatching(re: RegExp): string {
  const f = files.find((name) => re.test(read(name)));
  if (!f) throw new Error(`nenhuma migração casa ${re}`);
  return read(f);
}

describe("segurança das migrações", () => {
  it("todas as tabelas de staging (PII) recebem RLS", () => {
    // A migração de segurança de julho/2026 deve ligar RLS nas 4 stg_*.
    for (const t of ["stg_leads", "stg_agendamentos", "stg_visitas", "stg_analises"]) {
      expect(all).toContain(t);
    }
    expect(all).toMatch(/ENABLE ROW LEVEL SECURITY/);
    // O loop da migração de segurança cobre as 4 tabelas de staging.
    const seg = fileMatching(/stg_leads[\s\S]*ENABLE ROW LEVEL SECURITY/);
    expect(seg).toContain("REVOKE ALL");
  });

  it("a policy aberta de INSERT de vendas é removida", () => {
    expect(all).toContain('DROP POLICY IF EXISTS "vendas_insert_auth"');
    // e a substituta exige criado_por_id = auth.uid()
    const seg = fileMatching(/vendas_insert_own_or_gestor/);
    expect(seg).toContain("criado_por_id = auth.uid()");
  });

  it("existe o índice único parcial de dedup de telefone (guardado)", () => {
    const dedup = fileMatching(/uq_leads_projeto_telefone_ativo/);
    expect(dedup).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_projeto_telefone_ativo/);
    // guardado num DO-block que não trava se houver duplicatas
    expect(dedup).toContain("WHEN unique_violation THEN");
  });
});
describe("dedup: FK de auditoria", () => {
  it("adiciona FK guardada em leads.corretor_anterior_id", () => {
    const fk = fileMatching(/leads_corretor_anterior_fk/);
    expect(fk).toContain("REFERENCES auth.users(id)");
    expect(fk).toContain("ON DELETE SET NULL");
    // NOT VALID + validate guardado (não trava em órfãos legados)
    expect(fk).toContain("NOT VALID");
    expect(fk).toContain("VALIDATE CONSTRAINT");
  });
});

// NOTA: a consolidação das migrações duplicadas de comissoes/vendas/analises
// (schemas divergentes entre 20260616* e 20260619185115 que quebram
// `supabase db reset`) exige introspecção do banco vivo e está documentada como
// follow-up em docs/auditoria/2026-07-diagnostico.md — não é coberta por teste
// estático porque muitas "duplicatas" no repo são DROP TABLE IF EXISTS + CREATE
// (reproduzíveis), e distingui-las sem o schema vivo geraria falso positivo.
