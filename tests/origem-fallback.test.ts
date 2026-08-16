// Consolidação das roletas de origem — contratos da migration 20260816150000
// e da fiação de UI. Decisão de produto (2026-08-16, parte 2): mesclar ou
// desativar roleta de origem é operação de DADOS. O destino fixo da landing
// saiu do código (canal resolve pela linha 'site' do mapeamento editável) e
// roleta de origem despreparada cai no Plantão pronto em vez de represar
// lead. Na Central, Plantão/Marquinhos/Landing viram UMA aba com seletor.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const MIG = "supabase/migrations/20260816150000_origem_config_e_fallback_pronto.sql";
const mig = read(MIG);
const migSemComentario = mig.replace(/--[^\n]*/g, "");

describe("ordem e escopo da migration", () => {
  it("ordena DEPOIS da migration das roletas por zona — replay termina nesta", () => {
    expect(MIG > "supabase/migrations/20260816140000_roletas_por_zona.sql").toBe(true);
  });

  it("não regride o fix P0: o INSERT vencedor segue gravando 'sucesso'", () => {
    expect(migSemComentario).toContain("_distribuido_por, _slug, _regra, 'sucesso')");
    expect(migSemComentario).not.toContain(", 'ok')");
  });
});

describe("_roleta_pronta — régua única de prontidão", () => {
  it("ativa + participante ativo não pausado, reutilizada pela roleta_da_zona", () => {
    expect(mig).toContain("CREATE OR REPLACE FUNCTION public._roleta_pronta(_slug text)");
    const zona = mig.slice(
      mig.indexOf("CREATE OR REPLACE FUNCTION public.roleta_da_zona"),
      mig.indexOf("GRANT EXECUTE ON FUNCTION public.roleta_da_zona"),
    );
    expect(zona).toContain("public._roleta_pronta(zr.roleta_slug)");
  });
});

describe("landing sem destino fixo", () => {
  it("canal webhook_landing resolve pela linha 'site' do mapeamento editável", () => {
    const fn = mig.slice(
      mig.indexOf("CREATE OR REPLACE FUNCTION public._resolver_roleta_lead"),
      mig.indexOf("REVOKE ALL ON FUNCTION public._resolver_roleta_lead"),
    );
    expect(fn).toContain("WHEN _canal = 'webhook_landing' THEN");
    expect(fn).toContain("WHERE dc.origem = 'site'::public.lead_origem");
    // O destino fixo morreu: nenhum THEN 'landing' hardcoded.
    expect(fn).not.toMatch(/THEN\s+'landing'/);
  });

  it("o espelho TS segue a mesma regra (mapa['site'], não constante)", () => {
    const lib = read("src/lib/distribuicao.ts");
    const fn = lib.slice(lib.indexOf("export function resolverRoletaPorOrigem"));
    expect(fn).toContain('"webhook_landing" ? "site" : origem');
    expect(fn).not.toContain('return "landing"');
  });
});

describe("motor v3 — roleta de origem despreparada não represa lead", () => {
  const v3 = mig.slice(mig.indexOf("CREATE OR REPLACE FUNCTION public._distribuir_lead_v3"));

  it("fallback só na triagem por origem: slug explícito e roleta de zona não passam por ele", () => {
    const bloco = v3.replace(/\s+/g, " ");
    expect(bloco).toContain("_slug := COALESCE(_roleta_slug, public.roleta_da_zona(_zona))");
    expect(bloco).toContain(
      "IF _slug IS NULL THEN _slug := public._resolver_roleta_lead(_lead.canal_entrada, _lead.origem);",
    );
  });

  it("desvia para o Plantão apenas quando a origem não está pronta E o Plantão está", () => {
    const bloco = v3.replace(/\s+/g, " ");
    expect(bloco).toContain("AND NOT public._roleta_pronta(_slug)");
    expect(bloco).toContain("AND public._roleta_pronta('plantao')");
    expect(bloco).toContain("_slug <> 'plantao'");
  });

  it("o desvio fica auditável: contexto e motivo do log nomeiam a roleta de origem", () => {
    expect(v3).toContain("'origem_fallback', _origem_fallback");
    expect(v3).toContain("inativa/sem time; caiu no Plantão");
  });
});

describe("UI — uma aba de origem, uma de zonas", () => {
  it("a Central tem a aba 'origem' e não tem mais abas por roleta de origem", () => {
    const cc = read("src/features/distribuicao/command-center.tsx");
    expect(cc).toContain('"origem"');
    expect(cc).toContain("TabOrigem");
    expect(cc).not.toContain('TabsTrigger value="plantao"');
    expect(cc).not.toContain('TabsTrigger value="marquinhos"');
    expect(cc).not.toContain('TabsTrigger value="landing"');
  });

  it("a aba de origem cobre as três roletas via seletor", () => {
    const tab = read("src/features/distribuicao/tab-origem.tsx");
    for (const slug of ["plantao", "marquinhos", "landing"]) {
      expect(tab).toContain(`"${slug}"`);
    }
    expect(tab).toContain("RoletaTab");
  });
});
