import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260711122000_sales_approval_integrity.sql"),
  "utf8",
);

describe("migration de integridade comercial", () => {
  it("adiciona aprovação gerencial com backfill e uma venda ativa por lead", () => {
    expect(migration).toContain("'rascunho', 'pendente', 'aprovada', 'rejeitada', 'cancelada'");
    expect(migration).toMatch(
      /WHEN distrato THEN 'cancelada'::public\.status_venda[\s\S]*ELSE 'aprovada'::public\.status_venda/,
    );
    expect(migration).toContain("LOCK TABLE public.vendas IN SHARE ROW EXCLUSIVE MODE");
    expect(migration).toContain("public.venda_integridade_conflitos");
    expect(migration).toContain("Revisar fechamento sem venda aprovada");
    expect(migration).toMatch(
      /status IN \([\s\S]*'contrato_fechado'[\s\S]*NOT EXISTS \([\s\S]*status_venda = 'aprovada'/,
    );
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_vendas_lead_ativa[\s\S]*status_venda IN/,
    );
  });

  it("retira comissão, venda e VGV do INSERT e credita somente após aprovação", () => {
    expect(migration).toContain("DROP TRIGGER IF EXISTS trg_gerar_comissoes_v2");
    expect(migration).toContain("DROP TRIGGER IF EXISTS trg_pont_venda");
    expect(migration).toMatch(/gerar_comissoes_para_venda[\s\S]*_v\.status_venda <> 'aprovada'/);
    expect(migration).toMatch(
      /IF NEW\.status_venda = 'aprovada'[\s\S]*gerar_comissoes_para_venda\(NEW\.id\)[\s\S]*bump_atividade\([\s\S]*_ven => 1[\s\S]*_vgv => NEW\.valor_venda/,
    );
    const transitionPoints = migration.match(
      /CREATE OR REPLACE FUNCTION public\.pont_after_transicao\(\)[\s\S]*?REVOKE ALL ON FUNCTION public\.pont_after_transicao\(\)/,
    )?.[0];
    expect(transitionPoints).toBeTruthy();
    expect(transitionPoints).not.toContain("'contrato_fechado'");
  });

  it("mantém ledgers imutáveis, idempotentes e com estorno simétrico", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.comissao_ledger");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.venda_metricas_ledger");
    expect(migration).toContain("UNIQUE (comissao_id, evento)");
    expect(migration).toContain("UNIQUE (venda_id, evento)");
    expect(migration).toContain("ledger imutável: registre um evento compensatório");
    expect(migration).toMatch(
      /'estorno'[\s\S]*-1[\s\S]*-NEW\.valor_venda[\s\S]*_ven => -1[\s\S]*_vgv => -NEW\.valor_venda/,
    );
  });

  it("aprova sob lock, conta ativa, papel de gestão e escopo do lead", () => {
    const approval = migration.match(
      /CREATE OR REPLACE FUNCTION public\.aprovar_venda[\s\S]*?GRANT EXECUTE ON FUNCTION public\.aprovar_venda[\s\S]*?TO authenticated;/,
    )?.[0];
    expect(approval).toBeTruthy();
    expect(approval).toContain("public.is_active_member(_uid)");
    expect(approval).toContain("public.has_role(_uid, 'gestor'");
    expect(approval).toContain("public.has_role(_uid, 'superintendente'");
    expect(approval).toContain("public.pode_acessar_lead(_uid, _venda.lead_id)");
    expect(approval).toContain("FOR UPDATE");
    expect(approval).toContain("motivo é obrigatório para rejeitar ou cancelar");
  });

  it("transiciona lead com ownership, grafo, motivo, próxima ação e follow-up", () => {
    const transition = migration.match(
      /CREATE OR REPLACE FUNCTION public\.transicionar_lead[\s\S]*?GRANT EXECUTE ON FUNCTION public\.transicionar_lead[\s\S]*?TO authenticated;/,
    )?.[0];
    expect(transition).toBeTruthy();
    expect(transition).toContain("public.is_active_member(_uid)");
    expect(transition).toContain("public.pode_acessar_lead(_uid, p_lead_id)");
    expect(transition).toContain("public.transicao_lead_permitida");
    expect(transition).toContain("motivo é obrigatório ao perder um lead");
    expect(transition).toContain("aguardando retorno exige follow-up futuro");
    expect(transition).toContain("informe próxima ação ou follow-up");
    expect(transition).toMatch(/status_venda = 'aprovada'::public\.status_venda/);
    expect(transition).toContain("INSERT INTO public.lead_eventos");
  });

  it("nega fechamento sem venda aprovada e fecha RLS de vendas/comissões", () => {
    expect(migration).toContain("trg_proteger_fechamento_sem_venda_aprovada");
    expect(migration).toContain("lead só pode ser fechado após aprovação da venda");
    expect(migration).toMatch(
      /CREATE POLICY "vendas_insert_integridade"[\s\S]*public\.is_active_member\(auth\.uid\(\)\)[\s\S]*criado_por_id = auth\.uid\(\)[\s\S]*public\.pode_acessar_lead/,
    );
    expect(migration).toContain("REVOKE INSERT, DELETE ON public.comissoes FROM authenticated");
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.aprovar_venda[\s\S]*FROM PUBLIC, anon;/,
    );
    expect(migration).toMatch(
      /FUNCTION public\.vendas_mes_anterior[\s\S]*v\.status_venda = 'aprovada'/,
    );
  });
});
