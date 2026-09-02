// Contratos da migration da prateleira (2026-09-02) — docs/revisao-projetos-foco.md §5.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const MIG = "supabase/migrations/20260902120000_prateleira_projetos.sql";
const mig = read(MIG);

describe("ordem e escopo", () => {
  it("vem depois das parceiras (usa construtoras_parceiras) e da mídia rica (usa capa/tabela)", () => {
    expect(MIG > "supabase/migrations/20260805160000_construtoras_parceiras.sql").toBe(true);
    expect(MIG > "supabase/migrations/20260711135000_projetos_vitrine_rich_media.sql").toBe(true);
  });

  it("é aditiva e idempotente: nada de DROP TABLE, tudo IF NOT EXISTS / OR REPLACE", () => {
    expect(mig).not.toMatch(/DROP TABLE/i);
    expect(mig).toContain("CREATE TABLE IF NOT EXISTS public.projeto_eventos");
    expect(mig).toContain("CREATE OR REPLACE FUNCTION public.projetos_demanda_v1()");
    expect(mig).toContain("ADD COLUMN IF NOT EXISTS arte_url text");
    expect(mig).toContain("ADD COLUMN IF NOT EXISTS logo_url text");
    expect(mig).toContain("ADD COLUMN IF NOT EXISTS preco_atualizado_em timestamptz");
    expect(mig).toContain("ADD COLUMN IF NOT EXISTS tabela_atualizada_em timestamptz");
  });
});

describe("projeto_eventos", () => {
  it("tem RLS: cada um grava o próprio gesto; dono e gestão leem", () => {
    expect(mig).toContain("ALTER TABLE public.projeto_eventos ENABLE ROW LEVEL SECURITY");
    expect(mig).toContain("FOR INSERT TO authenticated\nWITH CHECK (user_id = auth.uid())");
    expect(mig).toMatch(
      /FOR SELECT TO authenticated\s+USING \(\s+user_id = auth\.uid\(\)\s+OR public\.has_role\(auth\.uid\(\), 'admin'\)/,
    );
  });

  it("restringe os tipos aos gestos da prateleira (inclui o reporte de erro da decisão 5)", () => {
    for (const tipo of [
      "book_abrir",
      "tabela_abrir",
      "resumo_copiar",
      "enviar_lead",
      "sacola_add",
      "ficha_abrir",
      "reportar_erro",
    ]) {
      expect(mig).toContain(`'${tipo}'`);
    }
  });
});

describe("projetos_demanda_v1", () => {
  const fn = mig.slice(
    mig.indexOf("CREATE OR REPLACE FUNCTION public.projetos_demanda_v1"),
    mig.indexOf("COMMENT ON FUNCTION public.projetos_demanda_v1"),
  );

  it("é SECURITY DEFINER com search_path fixo e só para autenticados", () => {
    expect(fn).toContain("SECURITY DEFINER");
    expect(fn).toContain("SET search_path = pg_catalog, public");
    expect(fn).toContain("AND auth.uid() IS NOT NULL");
    expect(fn).toContain("REVOKE ALL ON FUNCTION public.projetos_demanda_v1() FROM PUBLIC, anon");
    expect(fn).toContain("GRANT EXECUTE ON FUNCTION public.projetos_demanda_v1() TO authenticated");
  });

  it("devolve só agregados: nenhuma coluna de lead ou venda além de contagens", () => {
    expect(fn).toMatch(
      /RETURNS TABLE \(\s+projeto_id uuid,\s+leads_30d integer,\s+leads_total integer,\s+vendas_total integer,\s+envios_7d integer,\s+envios_30d integer,\s+ultimo_envio timestamptz\s+\)/,
    );
    expect(fn).not.toMatch(/telefone|nome|email/);
  });

  it("ignora leads na lixeira e vendas rejeitadas/canceladas", () => {
    expect(fn).toContain("deleted_at IS NULL");
    expect(fn).toContain("status_venda IN ('pendente', 'aprovada')");
  });
});

describe("carimbos de atualização", () => {
  it("o trigger só carimba quando preço/sob consulta ou tabela mudam de fato", () => {
    const trg = mig.slice(mig.indexOf("tg_projetos_marca_atualizacao()"));
    expect(trg).toContain("NEW.preco_a_partir IS DISTINCT FROM OLD.preco_a_partir");
    expect(trg).toContain("NEW.sob_consulta IS DISTINCT FROM OLD.sob_consulta");
    expect(trg).toContain("NEW.tabela_precos_url IS DISTINCT FROM OLD.tabela_precos_url");
    expect(trg).toContain("BEFORE UPDATE ON public.projetos");
  });
});

describe("correção de metragem", () => {
  const fix = mig.slice(mig.indexOf("6) Metragem com vírgula perdida"));

  it("faz backup antes de atualizar e a tabela de backup não é legível por autenticados", () => {
    expect(fix.indexOf("INSERT INTO public.projetos_metragem_backup_20260902")).toBeGreaterThan(-1);
    expect(fix.indexOf("INSERT INTO public.projetos_metragem_backup_20260902")).toBeLessThan(
      fix.indexOf("UPDATE public.projetos p"),
    );
    expect(fix).toContain(
      "ALTER TABLE public.projetos_metragem_backup_20260902 ENABLE ROW LEVEL SECURITY",
    );
    expect(fix).not.toMatch(/CREATE POLICY[^;]*projetos_metragem_backup/);
  });

  it("espelha a regra de sanidade do front: >150, preço <600 mil ou nulo, resultado 12–250, faixa não invertida", () => {
    expect(fix).toContain("p.preco_a_partir IS NULL OR p.preco_a_partir < 600000");
    expect(fix).toContain("coalesce(p.metragem_min, 0) > 150 OR coalesce(p.metragem_max, 0) > 150");
    expect(fix).toContain("novo_min BETWEEN 12 AND 250");
    expect(fix).toContain("novo_max BETWEEN 12 AND 250");
    expect(fix).toContain("novo_min <= novo_max");
    expect(fix).toContain("round(p.metragem_min / 10.0, 1)");
  });
});
