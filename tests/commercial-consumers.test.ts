import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("consumidores comerciais", () => {
  it("APIs públicas expõem somente vendas e comissões aprovadas", () => {
    const vendas = read("src/routes/api/public/vendas/index.ts");
    const comissoes = read("src/routes/api/public/comissoes/index.ts");
    const metricas = read("src/routes/api/public/metricas.ts");

    expect(vendas).toContain('.eq("status_venda", "aprovada")');
    expect(comissoes).toContain('.eq("vendas.status_venda", "aprovada")');
    expect(metricas).toMatch(
      /\.eq\("status_venda", "aprovada"\)[\s\S]*\.gte\("aprovado_em", desde\)/,
    );
    expect(metricas).toMatch(
      /\.eq\("status_venda", "cancelada"\)[\s\S]*\.gte\("status_venda_updated_at", desde\)/,
    );
  });

  it("metas não inferem venda pelo status ou timeline do lead", () => {
    const helper = read("src/lib/metas.ts");
    const page = read("src/routes/_authenticated/metas.tsx");

    expect(helper).toContain('venda.status_venda !== "aprovada"');
    expect(helper).toContain("venda.aprovado_em");
    expect(page).toContain('.eq("status_venda", "aprovada")');
    expect(page).toContain('.gte("aprovado_em", ini)');
    expect(page).not.toContain('.from("lead_status_transitions")');
  });

  it("agendamento e API de perda usam transicionar_lead", () => {
    const agendamentos = read("src/lib/agendamentos.ts");
    const perda = read("src/routes/api/public/leads/$id.perda.ts");
    const patchLead = read("src/routes/api/public/leads/$id.ts");

    expect(agendamentos).toContain("await transicionarLead({");
    expect(agendamentos).not.toMatch(/from\("leads"\)[\s\S]{0,180}update\([\s\S]{0,120}status:/);
    expect(perda).toContain('"transicionar_lead_api_perda"');
    expect(perda).toContain("p_categoria: categoria");
    expect(perda).toContain("p_data_perda: dataPerdaFinal");
    expect(perda).not.toContain('patch.status = "perdido"');
    expect(patchLead).toContain("status é gerenciado pelo funil interno do CRM");
  });
});

describe("guarda transversal de status", () => {
  const salesMigration = read("supabase/migrations/20260711122000_sales_approval_integrity.sql");
  const guardMigration = read(
    "supabase/migrations/20260711130000_lead_status_transition_guard.sql",
  );

  it("exige flag transacional para UPDATE autenticado", () => {
    expect(guardMigration).toContain("trg_validar_status_lead_via_rpc");
    expect(guardMigration).toContain("current_setting('app.transicionar_lead', true)");
    expect(guardMigration).toContain("status do lead só pode ser alterado por transicionar_lead");
  });

  it("abre a flag apenas nos fluxos controlados", () => {
    expect(salesMigration).toMatch(
      /FUNCTION public\.transicionar_lead[\s\S]*set_config\('app\.transicionar_lead', 'on', true\)/,
    );
    expect(salesMigration).toMatch(
      /FUNCTION public\.aplicar_efeitos_status_venda[\s\S]*set_config\('app\.transicionar_lead', 'on', true\)/,
    );
    expect(guardMigration).toMatch(
      /FUNCTION public\.marcar_lead_perdido_v2[\s\S]*set_config\('app\.transicionar_lead', 'on', true\)/,
    );
    expect(guardMigration).toMatch(
      /FUNCTION public\.marcar_lead_perdido_v2[\s\S]*public\.transicionar_lead\(/,
    );
    expect(guardMigration).toMatch(
      /FUNCTION public\.transicionar_lead_api_perda[\s\S]*auth\.role\(\) IS DISTINCT FROM 'service_role'[\s\S]*'perdido'::public\.lead_status[\s\S]*motivo_perda_categoria[\s\S]*data_perda/,
    );
    expect(guardMigration).toMatch(
      /REVOKE ALL ON FUNCTION public\.transicionar_lead_api_perda[\s\S]*FROM PUBLIC, anon, authenticated/,
    );
  });
});
