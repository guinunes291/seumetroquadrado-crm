import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A v2 segue no banco como FALLBACK do cliente (rpcWithFallback) enquanto a
// migration da v3 não chega ao ambiente — este teste congela o contrato dela.
// O caminho principal (fila "novos" + régua única) é coberto em
// atendimento-inbox-v3.test.ts.

const root = process.cwd();
const migration = readFileSync(
  join(root, "supabase/migrations/20260711127000_atendimento_inbox_v2.sql"),
  "utf8",
);

describe("atendimento_inbox_v2 (fallback congelado)", () => {
  it("deduplica no SQL pela última interação e pela prioridade das filas", () => {
    expect(migration).toContain("LEFT JOIN LATERAL");
    expect(migration).toContain("ORDER BY i.ocorreu_em DESC, i.id DESC");
    expect(migration).toMatch(
      /WHEN b\.ultima_direcao = 'entrada'[\s\S]*THEN 'responder'[\s\S]*WHEN b\.proximo_followup[\s\S]*THEN 'followups'[\s\S]*THEN 'esfriando'[\s\S]*THEN 'docs'/,
    );
    expect(migration).toContain("row_number() OVER");
    expect(migration).toContain("PARTITION BY r.fila");
  });

  it("conta a carteira inteira mas limita somente o payload de cada fila", () => {
    expect(migration).toContain("count(*)::bigint AS total_count");
    expect(migration).toContain("FILTER (WHERE r.row_number <= _take)");
    expect(migration).toContain("LEAST(GREATEST(COALESCE(_limit_per_queue, 15), 1), 30)");
    expect(migration).not.toMatch(/LIMIT\s+(400|1000)\b/);
  });

  it("mantém no SQL os pesos e tiers usados pela UX atual", () => {
    for (const fragment of [
      "WHEN 'quente' THEN 35",
      "WHEN 'morno' THEN 15",
      "WHEN 'analise_credito' THEN 25",
      "WHEN 'visita_realizada' THEN 22",
      "WHEN 'agendado' THEN 16",
      "WHEN 'em_atendimento' THEN 12",
      "WHEN 'aguardando_retorno' THEN 10",
      "WHEN 'qualificado' THEN 10",
    ]) {
      expect(migration).toContain(fragment);
    }
    expect(migration).toMatch(/WHEN c\.score >= 60 THEN 'alta'[\s\S]*>= 35 THEN 'media'/);
  });

  it("exige conta ativa e escopo do corretor em vez de confiar no cliente", () => {
    expect(migration).toContain("public.is_active_member(_caller)");
    expect(migration).toContain("public.pode_acessar_corretor(_caller, _target)");
    expect(migration).toContain("public.pode_acessar_lead(_caller, l.id)");
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.atendimento_inbox_v2[\s\S]*FROM PUBLIC, anon, service_role[\s\S]*TO authenticated/,
    );
  });
});
