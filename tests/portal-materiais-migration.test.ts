// Contratos da migration do Portal do Empreendimento (2026-09-13) —
// docs/portal-empreendimento.md. Guarda o que a tela assume do banco: tipos
// fechados iguais aos do app, RLS de leitura para o time e escrita para a
// gestão, e o novo gesto `material_abrir` em projeto_eventos.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TIPOS_MATERIAL } from "@/lib/projeto-materiais";

const DIR = join(process.cwd(), "supabase", "migrations");
const NOME = "20260913190000_portal_projeto_materiais.sql";
const mig = readFileSync(join(DIR, NOME), "utf8");

describe("ordem e escopo", () => {
  it("é a última migration do repositório (o runner do Supabase recusa versão anterior à remota)", () => {
    const todas = readdirSync(DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    // Se uma migration mais nova entrar depois, este teste deixa de fazer
    // sentido e deve ser ajustado — o que importa é que na data do PR ela era
    // a maior (ver scripts/db-harness/README.md, "Numeração").
    expect(todas.at(-1)).toBe(NOME);
    expect(NOME > "20260902120000_prateleira_projetos.sql").toBe(true);
  });

  it("é aditiva e idempotente: sem DROP TABLE, policies e trigger recriáveis", () => {
    expect(mig).not.toMatch(/DROP TABLE/i);
    expect(mig).toContain("CREATE TABLE IF NOT EXISTS public.projeto_materiais");
    expect(mig).toContain("CREATE INDEX IF NOT EXISTS idx_projeto_materiais_projeto");
    expect(mig).toContain("DROP TRIGGER IF EXISTS trg_projeto_materiais_updated_at");
    expect((mig.match(/DROP POLICY IF EXISTS/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});

describe("projeto_materiais", () => {
  it("apaga junto com o projeto e só aceita link http(s) com título", () => {
    expect(mig).toContain("REFERENCES public.projetos(id) ON DELETE CASCADE");
    expect(mig).toContain("url ~* '^https?://'");
    expect(mig).toContain("char_length(btrim(titulo)) BETWEEN 1 AND 120");
  });

  it("os tipos do CHECK são exatamente os que o app conhece", () => {
    const trecho = mig.slice(
      mig.indexOf("tipo text NOT NULL CHECK (tipo IN ("),
      mig.indexOf("titulo text"),
    );
    const noBanco = [...trecho.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    const noApp = TIPOS_MATERIAL.map((t) => t.tipo).sort();
    expect(noBanco).toEqual(noApp);
  });

  it("RLS: todo autenticado lê os ativos; só admin/gestor vê inativos e escreve", () => {
    expect(mig).toContain("ALTER TABLE public.projeto_materiais ENABLE ROW LEVEL SECURITY");
    expect(mig).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON public.projeto_materiais TO authenticated",
    );
    expect(mig).toMatch(
      /FOR SELECT TO authenticated\s+USING \(ativo OR public\.has_role\(auth\.uid\(\), 'admin'\) OR public\.has_role\(auth\.uid\(\), 'gestor'\)\)/,
    );
    for (const op of ["INSERT", "UPDATE", "DELETE"]) {
      const re = new RegExp(
        `FOR ${op} TO authenticated\\s+(USING|WITH CHECK) \\(public\\.has_role\\(auth\\.uid\\(\\), 'admin'\\) OR public\\.has_role\\(auth\\.uid\\(\\), 'gestor'\\)\\)`,
      );
      expect(mig, `policy de ${op}`).toMatch(re);
    }
    // Nenhuma policy aberta (USING (true)) nesta tabela.
    expect(mig).not.toMatch(/USING \(true\)/);
  });
});

describe("projeto_eventos.tipo", () => {
  it("recria o CHECK com os sete gestos antigos + material_abrir (nada some)", () => {
    const bloco = mig.slice(mig.indexOf("ADD CONSTRAINT projeto_eventos_tipo_check"));
    for (const tipo of [
      "book_abrir",
      "tabela_abrir",
      "resumo_copiar",
      "enviar_lead",
      "sacola_add",
      "ficha_abrir",
      "reportar_erro",
      "material_abrir",
    ]) {
      expect(bloco).toContain(`'${tipo}'`);
    }
    // Não quebra num banco sem a prateleira aplicada.
    expect(mig).toContain("IF to_regclass('public.projeto_eventos') IS NULL");
  });
});
