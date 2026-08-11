// Guarda do item 3.1 (Onda D, forma segura): aprovação/reprovação da análise
// de crédito no fluxo — a tabela analises_credito deixa de ser órfã, o card
// de decisão entra no peek e na página do lead, e o pipeline responde
// "quantos negócios estão liberados". Asserções de SQL rodam sem comentários.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { flattenDashboardKpis } from "@/features/dashboard/derive";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const sql = read("supabase/migrations/20260810120000_analises_credito_fluxo.sql");
const codigo = sql.replace(/--[^\n]*/g, "");
const modulo = read("src/features/leads/analise-credito.ts");
const card = read("src/components/lead-stage/analise-resultado.tsx");
const dialog = read("src/components/lead-stage/credit-analysis-dialog.tsx");
const peek = read("src/features/leads/lead-peek-drawer.tsx");
const detalhe = read("src/routes/_authenticated/leads.$leadId.tsx");
const relatorios = read("src/features/dashboard/relatorios-view.tsx");

describe("migration analises_credito_fluxo (3.1)", () => {
  it("vocabulário fechado só para escritas novas (NOT VALID poupa o legado)", () => {
    expect(codigo).toMatch(
      /CHECK \(status IN \('enviada', 'pendente', 'aprovada', 'reprovada'\)\) NOT VALID/,
    );
    expect(codigo).toContain("WHEN duplicate_object THEN NULL");
  });

  it("RLS passa à régua do lead — lead transferido não some da análise", () => {
    expect(codigo).toContain("DROP POLICY IF EXISTS analises_select_own_or_gestor");
    expect(codigo).toMatch(
      /FOR SELECT TO authenticated[\s\S]{0,400}pode_acessar_lead\(auth\.uid\(\), lead_id\)/,
    );
    expect(codigo).toMatch(
      /FOR UPDATE TO authenticated[\s\S]{0,600}pode_acessar_lead\(auth\.uid\(\), lead_id\)/,
    );
    // INSERT deixa de aceitar qualquer autenticado.
    expect(codigo).toContain("DROP POLICY IF EXISTS analises_insert_auth");
    expect(codigo).toMatch(/FOR INSERT TO authenticated[\s\S]{0,300}corretor_id = auth\.uid\(\)/);
  });

  it("dashboard_kpis ganha analise_aprovada/reprovada por ÚLTIMA análise, aditivo", () => {
    expect(codigo).toContain(
      "'analise_aprovada',  count(*) FILTER (WHERE ult.status = 'aprovada')",
    );
    expect(codigo).toContain("SELECT DISTINCT ON (ac.lead_id)");
    expect(codigo).toMatch(/l\.status = 'analise_credito'/);
    // Assinatura preservada e merge aditivo no jsonb do pipeline.
    expect(codigo).toContain("'pipeline', _pipeline || COALESCE(_analises, '{}'::jsonb)");
    expect(codigo).toContain("CREATE INDEX IF NOT EXISTS analises_credito_lead_recentes_idx");
  });
});

describe("fluxo no app (3.1)", () => {
  it("o modal de análise passa a REGISTRAR na tabela, não só na timeline", () => {
    expect(dialog).toContain("registrarAnalise({");
    expect(dialog).toContain('["analise-credito", lead.id]');
  });

  it("decidirAnalise cobre o legado (sem registro aberto → cria já decidida) e ecoa na timeline", () => {
    // A régua de "já decidida" vive em ANALISE_DECIDIDA (inclui a condicionada).
    expect(modulo).toContain("ANALISE_DECIDIDA.some((s) => s === atual?.status)");
    expect(modulo).toMatch(/if \(atual && !atualDecidida\)/);
    expect(modulo).toContain('"Análise de crédito APROVADA"');
    expect(modulo).toContain('fonte: "fluxo_analise"');
  });

  it("o card decide OU oferece o próximo passo — nunca os dois", () => {
    expect(card).toContain('if (lead.status !== "analise_credito") return null');
    expect(card).toMatch(/\{!decidida \? \(/);
    expect(card).toContain("Registrar venda");
    expect(card).toContain("Nova análise");
    expect(card).toContain("Motivo da reprovação");
  });

  it("o card vive no peek e na página do lead com os modais existentes", () => {
    for (const src of [peek, detalhe]) {
      expect(src).toContain("<AnaliseCreditoCard");
      expect(src).toMatch(/onRegistrarVenda=\{\(\) => setModalState\(\{ modal: "contrato_fechado"/);
      expect(src).toMatch(/onNovaAnalise=\{\(\) => setModalState\(\{ modal: "analise_credito"/);
    }
  });

  it("Pipeline agora responde 'quantos liberados' no card de Análise", () => {
    expect(relatorios).toContain("analiseDetalhe");
    expect(relatorios).toContain("aprovada(s)");
    const flat = flattenDashboardKpis({
      pipeline: { analise_credito: 7, analise_aprovada: 3, analise_reprovada: 2 },
      periodo: {},
    });
    expect(flat.analise_aprovada).toBe(3);
    expect(flat.analise_reprovada).toBe(2);
    // RPC antiga sem as chaves → 0, nunca NaN.
    expect(flattenDashboardKpis({ pipeline: {}, periodo: {} }).analise_aprovada).toBe(0);
  });
});
