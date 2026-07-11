import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260711124000_scale_read_models_v2.sql"),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const next = migration.indexOf("CREATE OR REPLACE FUNCTION public.", start + 1);
  if (start < 0) throw new Error(`RPC ${name} ausente`);
  return migration.slice(start, next < 0 ? migration.length : next);
}

describe("RPCs de escala v2", () => {
  it("pagina a busca por cursor estavel e nunca retorna mais de 50 leads", () => {
    const sql = functionBody("leads_search_v2");
    expect(sql).toContain("LEAST(GREATEST(COALESCE(_limit, 50), 1), 50)");
    expect(sql).toContain("(s.relevance_score, s.created_at, s.id)");
    expect(sql).toContain("ORDER BY a.relevance_score DESC, a.created_at DESC, a.id DESC");
    expect(sql).toContain("public.pode_acessar_lead(_caller, l.id)");
    expect(sql).not.toMatch(/\bOFFSET\b/);
  });

  it("calcula o snapshot no banco e pagina cada etapa em lotes de ate 20", () => {
    const snapshot = functionBody("pipeline_snapshot_v2");
    const page = functionBody("pipeline_stage_page_v2");

    expect(snapshot).toContain("enum_range(NULL::public.lead_status)");
    expect(snapshot).toContain("followups_vencidos");
    expect(snapshot).toContain("public.pode_acessar_lead(_caller, l.id)");
    expect(page).toContain("LEAST(GREATEST(COALESCE(_limit, 20), 1), 20)");
    expect(page).toContain("(l.created_at, l.id) < (_cursor_created_at, _cursor_id)");
    expect(page).toContain("public.pode_acessar_lead(_caller, l.id)");
    expect(page).not.toMatch(/\bOFFSET\b/);
  });

  it("mantem ranking e metricas compactos, periodizados e com escopo de equipe", () => {
    const ranking = functionBody("ranking_periodo_v2");
    const metrics = functionBody("metricas_periodo_v2");

    for (const sql of [ranking, metrics]) {
      expect(sql).toContain("public.is_active_member(_caller)");
      expect(sql).toContain("gestor.equipe_id = p.equipe_id");
      expect(sql).toContain("e.gestor_id = _caller");
      expect(sql).toContain("atividades_diarias");
    }
    expect(ranking).toContain("LEAST(GREATEST(COALESCE(_limit, 50), 1), 50)");
    expect(metrics).toContain("RETURNS jsonb");
  });

  it("remove acesso implicito e concede execucao somente a authenticated", () => {
    for (const rpc of [
      "leads_search_v2",
      "pipeline_snapshot_v2",
      "pipeline_stage_page_v2",
      "ranking_periodo_v2",
      "metricas_periodo_v2",
    ]) {
      const sql = functionBody(rpc);
      expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, service_role/);
      expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO authenticated/);
    }
  });
});
