import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260826130000_venda_efetivacao_flags.sql"),
  "utf8",
);

describe("migration dos marcos de efetivação da venda", () => {
  it("adiciona os 3 marcos com timestamps e backfill das vendas já decididas", () => {
    for (const coluna of ["contrato_assinado", "ato_pago", "apto_repasse"]) {
      expect(migration).toContain(
        `ADD COLUMN IF NOT EXISTS ${coluna} boolean NOT NULL DEFAULT false`,
      );
      expect(migration).toContain(`ADD COLUMN IF NOT EXISTS ${coluna}_em timestamptz`);
    }
    // Aprovadas e canceladas já produziram efeitos: entram com tudo ligado.
    expect(migration).toMatch(
      /UPDATE public\.vendas\s*\nSET contrato_assinado = true[\s\S]*WHERE status_venda IN \('aprovada'::public\.status_venda, 'cancelada'::public\.status_venda\)/,
    );
  });

  it("cria o check de coerência: venda aprovada carrega os 3 marcos", () => {
    expect(migration).toContain("vendas_efetivacao_aprovada_ck");
    expect(migration).toMatch(
      /CHECK \(\s*status_venda <> 'aprovada'::public\.status_venda\s*OR \(contrato_assinado AND ato_pago AND apto_repasse\)\s*\) NOT VALID/,
    );
    expect(migration).toContain(
      "ALTER TABLE public.vendas VALIDATE CONSTRAINT vendas_efetivacao_aprovada_ck",
    );
  });

  it("guard: marcos só mudam pela RPC e timestamps derivam dos flags", () => {
    expect(migration).toContain(
      "use a RPC atualizar_efetivacao_venda para alterar os marcos de efetivação",
    );
    expect(migration).toContain("current_setting('app.efetivacao_venda', true) = 'on'");
    // Normalização vale para qualquer papel (flag liga → carimba; desliga → limpa).
    expect(migration).toMatch(
      /IF NEW\.contrato_assinado IS DISTINCT FROM OLD\.contrato_assinado THEN[\s\S]*WHEN NOT NEW\.contrato_assinado THEN NULL/,
    );
  });

  it("RPC atualizar_efetivacao_venda: conta ativa, escopo do lead, papel e só antes da decisão", () => {
    const rpc = migration.match(
      /CREATE OR REPLACE FUNCTION public\.atualizar_efetivacao_venda[\s\S]*?GRANT EXECUTE ON FUNCTION public\.atualizar_efetivacao_venda[\s\S]*?TO authenticated;/,
    )?.[0];
    expect(rpc).toBeTruthy();
    expect(rpc).toContain("public.is_active_member(_uid)");
    expect(rpc).toContain("public.pode_acessar_lead(_uid, _venda.lead_id)");
    expect(rpc).toContain("marcos de efetivação exigem gestão ou o corretor da venda");
    expect(rpc).toContain("marcos de efetivação só podem ser alterados antes da decisão da venda");
    expect(rpc).toContain("FOR UPDATE");
    expect(rpc).toMatch(/INSERT INTO public\.lead_eventos[\s\S]*'efetivacao_venda'/);
  });

  it("aprovar_venda exige os 3 marcos ativos para aprovar, mantendo as demais regras", () => {
    const approval = migration.match(
      /CREATE OR REPLACE FUNCTION public\.aprovar_venda[\s\S]*?GRANT EXECUTE ON FUNCTION public\.aprovar_venda[\s\S]*?TO authenticated;/,
    )?.[0];
    expect(approval).toBeTruthy();
    expect(approval).toMatch(
      /IF NOT \(_venda\.contrato_assinado AND _venda\.ato_pago AND _venda\.apto_repasse\) THEN/,
    );
    expect(approval).toContain("venda só pode ser aprovada com os 3 marcos de efetivação ativos");
    // Regras pré-existentes preservadas na redefinição.
    expect(approval).toContain("aprovação de venda exige papel de gestão");
    expect(approval).toContain("public.pode_acessar_lead(_uid, _venda.lead_id)");
    expect(approval).toContain("motivo é obrigatório para rejeitar ou cancelar");
    expect(approval).toContain("venda em estado terminal não pode ser reaberta");
  });
});
