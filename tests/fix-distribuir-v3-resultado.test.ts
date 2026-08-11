// Guarda do fix P0 de 2026-08-11: a "Filas por zona" (20260811172447)
// gravava resultado='ok' no caminho de sucesso de _distribuir_lead_v3, valor
// que o CHECK de distribution_log não aceita — toda atribuição com vencedor
// estourava (inclusive o descarte, que redistribui). O fix corrige a ESCRITA
// para 'sucesso' (vocabulário que o app inteiro lê) e precisa ordenar DEPOIS
// da migration bugada para o replay terminar no estado certo.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const FIX = "supabase/migrations/20260811180000_fix_distribuir_v3_resultado_sucesso.sql";
const fix = read(FIX).replace(/--[^\n]*/g, "");
const check = read("supabase/migrations/20260709120100_distribuicao_v3_fundacao.sql");

describe("fix _distribuir_lead_v3: resultado do sucesso", () => {
  it("o INSERT vencedor grava 'sucesso' — e 'ok' não sobra em nenhum resultado", () => {
    expect(fix).toContain("_distribuido_por, _slug, _regra, 'sucesso')");
    // 'ok' segue existindo só como chave do jsonb de retorno, nunca na coluna.
    expect(fix).not.toContain(", 'ok')");
  });

  it("os três desfechos do motor cabem no CHECK da fundação", () => {
    expect(check).toContain("CHECK (resultado IN ('sucesso','sem_corretor','erro','excecao'))");
    for (const valor of ["'excecao'", "'sem_corretor'", "'sucesso'"]) {
      expect(fix).toContain(valor);
    }
  });

  it("ordena DEPOIS da migration bugada — replay aplica a bugada e termina nesta", () => {
    expect(
      FIX > "supabase/migrations/20260811172447_728c5b8a-96f3-4b00-a992-d9e2108ad029.sql",
    ).toBe(true);
    expect(fix).toContain("CREATE OR REPLACE FUNCTION public._distribuir_lead_v3(");
  });
});
