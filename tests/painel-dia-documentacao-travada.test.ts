// Contrato estático da 8ª exceção documentacao_travada no Painel do Dia
// (estrategia-2026-08, item 2.6 / tarefa #14). Asserções de SQL rodam sem
// comentários para valer sobre o código, não sobre a prosa da migration.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260809120000_painel_dia_documentacao_travada.sql"),
  "utf8",
);
const codigo = sql.replace(/--[^\n]*/g, "");

describe("gestao_painel_dia — exceção documentacao_travada", () => {
  it("o limiar vem de gestao_config (default 3) com seed idempotente", () => {
    expect(codigo).toContain("'documentacao_travada_dias'");
    expect(codigo).toContain("ON CONFLICT (chave) DO NOTHING");
    expect(codigo).toMatch(
      /_docs_dias int := COALESCE\(\(public\.gestao_config_valor\('documentacao_travada_dias'\)\)::int, 3\)/,
    );
  });

  it("travada = pendência que ENVELHECEU: mede pelo updated_at do doc mais antigo em aberto", () => {
    // Não é o critério cru da fila do corretor (doc criado hoje já conta lá):
    // para a gestão só entra doc pendente/reprovado sem movimento há N+ dias.
    expect(codigo).toContain("dd.status IN ('pendente', 'reprovado')");
    expect(codigo).toContain("min(dd.updated_at)");
    expect(codigo).toMatch(/WHERE e\.ativo\s+AND d\.dias >= _docs_dias/);
  });

  it("payload com docs_pendentes/dias_parado/limiar_dias e severidade 2", () => {
    expect(codigo).toContain("'documentacao_travada', 2,");
    expect(codigo).toContain("'docs_pendentes', d.n");
    expect(codigo).toContain("'limiar_dias', _docs_dias");
  });

  it("mantém mesma assinatura (sem versão nova) e os grants do painel", () => {
    // Retorno é um jsonb único: front antigo descarta o tipo desconhecido em
    // normalizarExcecao — CREATE OR REPLACE é seguro, sem degrau de fallback.
    expect(codigo).toContain("CREATE OR REPLACE FUNCTION public.gestao_painel_dia(");
    expect(codigo).toContain("public.ve_carteira_completa(_caller)");
    expect(codigo).toMatch(
      /REVOKE ALL ON FUNCTION public\.gestao_painel_dia[\s\S]*FROM PUBLIC, anon/,
    );
    expect(codigo).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.gestao_painel_dia[\s\S]*TO authenticated, service_role/,
    );
    expect(sql).toMatch(/COMMENT ON FUNCTION public\.gestao_painel_dia[\s\S]*documentacao_travada/);
  });
});
