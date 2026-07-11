import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseFechamentoResponse } from "@/lib/fechamento";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260711134000_fechamento_sinais_calibrados.sql"),
  "utf8",
);
const view = readFileSync(join(process.cwd(), "src/features/pipeline/fechamento-view.tsx"), "utf8");

function responseFixture() {
  return {
    items: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        nome: "Ana Souza",
        telefone: "11999999999",
        status: "analise_credito",
        temperatura: "quente",
        ultima_interacao: "2026-07-10T10:00:00Z",
        proximo_followup: "2026-07-12T10:00:00Z",
        projeto_nome: "Residencial Sol",
        indice: 64,
        nivel: "alta",
        metodo: "historico_calibrado",
        taxa_historica_pct: 52.5,
        amostra_etapa: 40,
        vendas_aprovadas_etapa: 21,
        documentos_pendentes: 1,
        fatores: ["Em análise de crédito", "Temperatura quente"],
      },
    ],
    total_count: 1,
    contagens: { alta: 1, media: 0, baixa: 0 },
    limit: 50,
    amostra_minima: 30,
    janela_coorte_dias: 365,
    horizonte_conversao_dias: 90,
    indice_semantica: "sinal_de_priorizacao_nao_probabilidade",
  };
}

describe("fechamento_sinais_v1", () => {
  it("calibra somente com vendas aprovadas em coortes maduras por etapa", () => {
    expect(migration).toContain("public.lead_status_transitions");
    expect(migration).toContain("status_venda = 'aprovada'::public.status_venda");
    expect(migration).toContain("v.aprovado_em >= e.entrada_em");
    expect(migration).toContain("v.aprovado_em <= e.entrada_em + interval '90 days'");
    expect(migration).toContain("t.created_at < now() - interval '90 days'");
    expect(migration).toContain("WHEN f.amostra >= 30");
    expect(migration).not.toContain("v.deleted_at");
  });

  it("limita o payload, aplica a autorização central e fecha execução pública", () => {
    expect(migration).toContain("LEAST(GREATEST(COALESCE(_limit, 50), 1), 50)");
    expect(migration.match(/public\.pode_acessar_lead\(_caller,/g)).toHaveLength(2);
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.fechamento_sinais_v1\(integer\)[\s\S]*FROM PUBLIC, anon, service_role[\s\S]*TO authenticated/,
    );
    expect(migration).not.toMatch(/'email'|'cpf'/);
  });

  it("distingue índice calibrado de heurístico e não expõe taxa de amostra pequena", () => {
    expect(migration).toMatch(
      /WHEN f\.amostra >= 30 THEN 'historico_calibrado'[\s\S]*ELSE 'heuristico'/,
    );
    expect(migration).toMatch(
      /WHEN f\.amostra >= 30[\s\S]*THEN round\(100\.0 \* f\.vendas_aprovadas[\s\S]*ELSE NULL/,
    );
    expect(migration).toContain("sinal_de_priorizacao_nao_probabilidade");
  });

  it("a tela consome uma RPC compacta e não agrega 500 leads no navegador", () => {
    expect(view).toContain('supabase.rpc("fechamento_sinais_v1"');
    expect(view).not.toContain('.from("leads")');
    expect(view).not.toContain(".limit(500)");
    expect(view).toContain("Taxa histórica observada da etapa");
    expect(view).toContain("o índice ainda é heurístico");
    expect(view).toContain("não é uma probabilidade individual");
  });
});

describe("parseFechamentoResponse", () => {
  it("aceita resposta calibrada coerente e preserva a amostra", () => {
    const parsed = parseFechamentoResponse(responseFixture());
    expect(parsed.items[0].metodo).toBe("historico_calibrado");
    expect(parsed.items[0].taxa_historica_pct).toBe(52.5);
    expect(parsed.items[0].amostra_etapa).toBe(40);
  });

  it("falha fechado quando método, taxa ou contagens são incoerentes", () => {
    const base = responseFixture();
    const semTaxa = {
      ...base,
      items: [{ ...base.items[0], taxa_historica_pct: null }],
    };
    expect(() => parseFechamentoResponse(semTaxa)).toThrow(/taxa histórica/i);

    const heuristicoComTaxa = {
      ...base,
      items: [{ ...base.items[0], metodo: "heuristico", amostra_etapa: 12 }],
    };
    expect(() => parseFechamentoResponse(heuristicoComTaxa)).toThrow(/heurístico/i);

    const calibradoSemAmostra = {
      ...base,
      items: [{ ...base.items[0], amostra_etapa: 12, vendas_aprovadas_etapa: 5 }],
    };
    expect(() => parseFechamentoResponse(calibradoSemAmostra)).toThrow(/amostra mínima/i);

    const nivelIncompativel = {
      ...base,
      items: [{ ...base.items[0], nivel: "baixa" }],
    };
    expect(() => parseFechamentoResponse(nivelIncompativel)).toThrow(/Nível incompatível/i);

    const contagemInvalida = responseFixture();
    contagemInvalida.contagens.alta = 0;
    expect(() => parseFechamentoResponse(contagemInvalida)).toThrow(/Contagens/);
  });

  it("rejeita mais de 50 itens e semântica que sugira outro contrato", () => {
    const grande = responseFixture();
    grande.items = Array.from({ length: 51 }, (_, index) => ({
      ...grande.items[0],
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    }));
    grande.total_count = 51;
    grande.contagens.alta = 51;
    expect(() => parseFechamentoResponse(grande)).toThrow();

    const semanticaInvalida = responseFixture();
    semanticaInvalida.indice_semantica = "chance_de_venda";
    expect(() => parseFechamentoResponse(semanticaInvalida)).toThrow();
  });
});
