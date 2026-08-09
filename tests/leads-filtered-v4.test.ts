// Contrato estático da migration leads_filtered_v4 / leads_status_counts_v4
// (estrategia-2026-08 item 2.11): valida no SQL o fim do ELSE true, o recorte
// paramétrico "parado há X dias" nas DUAS funções e os guard-rails da casa.
// Molde: tests/scale-rpcs.test.ts (recorte por corpo de função).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260808123000_leads_filtered_v4.sql"),
  "utf8",
);

function functionBody(name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, `função ${name} presente`).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const next = rest.indexOf("CREATE OR REPLACE FUNCTION", 1);
  const body = next === -1 ? rest : rest.slice(0, next);
  // Sem comentários: as asserções valem sobre o CÓDIGO, não sobre a prosa
  // (o próprio comentário da migration cita o "ELSE true" que ela mata).
  return body.replace(/--[^\n]*/g, "");
}

const lista = functionBody("leads_filtered_v4");
const counts = functionBody("leads_status_counts_v4");

describe("leads_filtered_v4 / leads_status_counts_v4", () => {
  it("o ELSE true morreu: _contato desconhecido é ERRO nas duas funções", () => {
    for (const body of [lista, counts]) {
      expect(body).not.toMatch(/ELSE\s+true/i);
      expect(body).toContain("RAISE EXCEPTION 'contato invalido");
      expect(body).toContain("ERRCODE = '22023'");
      // O CASE residual fecha em false — nunca "devolver tudo" por engano.
      expect(body).toMatch(/ELSE\s+false/);
    }
  });

  it("o recorte _parado_dias existe nas DUAS funções (chips nunca divergem da lista)", () => {
    for (const body of [lista, counts]) {
      expect(body).toContain("_parado_dias int DEFAULT NULL");
      expect(body).toContain("make_interval(days => _parado_dias)");
      // Validação de faixa: fora de 1..365 é erro, não filtro silencioso.
      expect(body).toContain("RAISE EXCEPTION 'parado_dias fora de 1..365");
      // Mesmo predicado das réguas fixas: exclui status terminais.
      expect(body).toMatch(
        /_parado_dias[\s\S]{0,400}NOT IN \('contrato_fechado','pos_venda','perdido'\)/,
      );
    }
  });

  it("réguas fixas sem_contato_5d/30d continuam aceitas (compat com visões salvas)", () => {
    for (const body of [lista, counts]) {
      expect(body).toContain("'sem_contato_5d'");
      expect(body).toContain("'sem_contato_30d'");
    }
  });

  it("whitelist de sort fechada e paginação com teto", () => {
    expect(lista).toMatch(
      /_sort IN \('nome','created_at','ultima_interacao','status',\s*'temperatura','score','proximo_followup'\)/,
    );
    expect(lista).toContain("LIMIT GREATEST(1, LEAST(COALESCE(_limit, 50), 200))");
    expect(lista).toContain("OFFSET GREATEST(0, COALESCE(_offset, 0))");
  });

  it("SECURITY DEFINER com search_path fixo e auth obrigatória", () => {
    for (const body of [lista, counts]) {
      expect(body).toContain("SECURITY DEFINER SET search_path = public");
      expect(body).toContain("RAISE EXCEPTION 'unauthorized'");
    }
  });

  it("remove acesso implícito e concede execução somente a authenticated", () => {
    for (const fn of ["leads_filtered_v4", "leads_status_counts_v4"]) {
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC`),
      );
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM anon`));
      expect(sql).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO authenticated`),
      );
    }
    expect(sql).toContain("NOTIFY pgrst, 'reload schema';");
  });

  it("escopo idêntico nas duas funções (gestor vê órfãos)", () => {
    for (const body of [lista, counts]) {
      expect(body).toContain("ve_carteira_completa");
      expect(body).toContain("corretores_do_gestor");
      expect(body).toMatch(/_gestor AND l\.corretor_id IS NULL/);
    }
  });
});
