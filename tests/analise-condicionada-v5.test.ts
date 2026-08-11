// Guarda do item 3.1b: "Aprovado condicionado" como terceiro desfecho da
// análise de crédito + filtros por resultado da análise servidos pela
// leads_filtered_v5 / leads_status_counts_v5. Regras vigiadas: vocabulário
// fechado (valor desconhecido = erro 22023, nunca ELSE true), recorte nas
// DUAS funções (chips e lista nunca divergem), degraus do rpcWithFallback
// tirando o parâmetro que as versões antigas não conhecem, e aviso honesto
// quando o resultado veio de uma versão sem o recorte.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { flattenDashboardKpis } from "@/features/dashboard/derive";
import { ANALISE_FILTRO_OPCOES, FILTRO_PADRAO, FILTRO_URL_KEYS } from "@/lib/leads-views";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const semComentarios = (sql: string) => sql.replace(/--[^\n]*/g, "");

const migCheck = semComentarios(
  read("supabase/migrations/20260811140000_analise_aprovada_condicionada.sql"),
);
const migV5 = semComentarios(read("supabase/migrations/20260811141000_leads_filtered_v5.sql"));
const modulo = read("src/features/leads/analise-credito.ts");
const card = read("src/components/lead-stage/analise-resultado.tsx");
const dialog = read("src/components/lead-stage/credit-analysis-dialog.tsx");
const rpc = read("src/features/leads/leads-rpc.ts");
const query = read("src/features/leads/leads-query.ts");
const paginaLeads = read("src/routes/_authenticated/leads.index.tsx");
const consulta = read("src/features/atendimento/consulta-view.tsx");
const relatorios = read("src/features/dashboard/relatorios-view.tsx");

const ocorrencias = (texto: string, re: RegExp) => (texto.match(re) ?? []).length;

describe("migration aprovada_condicionada (CHECK + kpis)", () => {
  it("vocabulário passa a 5 valores, ainda NOT VALID (legado poupado)", () => {
    expect(migCheck).toContain(
      "CHECK (status IN ('enviada', 'pendente', 'aprovada', 'aprovada_condicionada', 'reprovada'))",
    );
    expect(migCheck).toContain("NOT VALID");
    expect(migCheck).toContain("WHEN duplicate_object THEN NULL");
  });

  it("dashboard_kpis ganha analise_condicionada — chave ADITIVA, assinatura preservada", () => {
    expect(migCheck).toMatch(
      /'analise_condicionada',\s*count\(\*\) FILTER \(WHERE ult\.status = 'aprovada_condicionada'\)/,
    );
    expect(migCheck).toContain("SELECT DISTINCT ON (ac.lead_id)");
    expect(migCheck).toContain("'pipeline', _pipeline || COALESCE(_analises, '{}'::jsonb)");
    expect(migCheck).toContain("NOTIFY pgrst");
  });
});

describe("migration leads_filtered_v5 (filtro por análise)", () => {
  it("nome NOVO nas duas funções — assinatura nova nunca reaproveita nome vivo", () => {
    expect(migV5).toContain("CREATE OR REPLACE FUNCTION public.leads_filtered_v5(");
    expect(migV5).toContain("CREATE OR REPLACE FUNCTION public.leads_status_counts_v5(");
    expect(ocorrencias(migV5, /_analise text DEFAULT NULL/g)).toBe(2);
  });

  it("valor desconhecido é ERRO 22023 nas DUAS funções (lição do ELSE true)", () => {
    expect(
      ocorrencias(
        migV5,
        /RAISE EXCEPTION 'analise invalido: %', _analise USING ERRCODE = '22023'/g,
      ),
    ).toBe(2);
    expect(migV5).toContain(
      "('all','em_andamento','aprovada','aprovada_condicionada','reprovada')",
    );
  });

  it("o recorte pela ÚLTIMA análise existe nas DUAS funções — chips nunca divergem", () => {
    expect(ocorrencias(migV5, /WHEN 'em_andamento' THEN/g)).toBe(2);
    expect(ocorrencias(migV5, /IN \('enviada','pendente'\)/g)).toBe(2);
    expect(ocorrencias(migV5, /ORDER BY ac\.created_at DESC LIMIT 1\) = _analise/g)).toBe(2);
  });

  it("REVOKE/GRANT com as assinaturas completas e reload do PostgREST", () => {
    expect(migV5).toContain(
      "GRANT EXECUTE ON FUNCTION public.leads_filtered_v5(boolean, text, text, text, text, timestamptz, timestamptz, text, text, text, int, text, text, text, int, int) TO authenticated",
    );
    expect(migV5).toContain(
      "GRANT EXECUTE ON FUNCTION public.leads_status_counts_v5(boolean, text, text, text, timestamptz, timestamptz, text, text, text, int, text) TO authenticated",
    );
    expect(migV5).toContain("NOTIFY pgrst, 'reload schema'");
  });
});

describe("fallback em degraus (v5 → v4 → v3 → …)", () => {
  it("leads-rpc conhece os nomes v5 e tira _analise das versões antigas", () => {
    expect(rpc).toContain('v5: "leads_filtered_v5"');
    expect(rpc).toContain('v5: "leads_status_counts_v5"');
    // Degrau 1: v5 recebe tudo; abaixo dela _analise sai; abaixo da v4 _parado_dias sai.
    expect(rpc).toContain('if (versao === "v5") return params;');
    expect(rpc).toContain("const { _analise: _semAnalise, ...atehV4 } = params;");
    expect(rpc).toContain("const { _parado_dias: _semParado, ...atehV3 } = atehV4;");
  });

  it("a cadeia de busca tenta v5 primeiro, passando o recorte", () => {
    expect(query).toContain('rpcLeadsFiltered("v5"');
    expect(query).toContain("_analise: analise");
  });
});

describe("fiação do filtro nas telas", () => {
  it("opções compartilhadas e filtro no padrão/URL (drill-through carrega junto)", () => {
    expect(ANALISE_FILTRO_OPCOES.map((o) => o.value)).toEqual([
      "em_andamento",
      "aprovada",
      "aprovada_condicionada",
      "reprovada",
      "nao_aprovada",
    ]);
    expect(FILTRO_PADRAO.analise).toBe("all");
    expect(FILTRO_URL_KEYS).toContain("analise");
  });

  it("/leads: Select no grid e TODAS as cadeias diretas levam o recorte (contagens, seleção em massa, fila de foco)", () => {
    expect(paginaLeads).toContain('aria-label="Filtrar por análise de crédito"');
    expect(paginaLeads).toContain('rpcLeadsStatusCounts("v5"');
    // 3 chamadas diretas de RPC fora da lista: counts, selecionar-todos e fila
    // de foco — nenhuma ação em massa pode alcançar lead escondido pelo filtro.
    expect(ocorrencias(paginaLeads, /_analise: analiseFilter/g)).toBe(3);
    expect(paginaLeads).toContain("analise: analiseFilter");
  });

  it("/leads: sem v5 no banco, o recorte ignorado é AVISADO — nunca dado silenciosamente sem filtro", () => {
    expect(paginaLeads).toContain('analiseFilter !== "all" && source !== "v5"');
    expect(paginaLeads).toContain("IGNORADO");
  });

  it("Consulta: filtro no drawer, na query e no drill-through para /leads", () => {
    expect(consulta).toContain("analise: filtros.analise");
    expect(consulta).toContain("Análise de crédito");
    expect(consulta).toContain('analise: filtros.analise !== "all" ? filtros.analise : undefined');
  });
});

describe("terceiro desfecho no fluxo de decisão", () => {
  it("módulo: condicionada é status decidido, com rótulo e eco próprios", () => {
    expect(modulo).toContain('"aprovada_condicionada"');
    expect(modulo).toContain('aprovada_condicionada: "Aprovada com condição"');
    // A condição entra nas observações com rótulo próprio (não é "Reprovação").
    expect(modulo).toMatch(/rotuloMotivo/);
    expect(modulo).toContain('"Análise de crédito APROVADA COM CONDIÇÃO"');
  });

  it("card: botão próprio, dialog pedindo a condição e próximos passos de aprovação", () => {
    expect(card).toContain("Aprovar c/ condição");
    expect(card).toContain("Condição imposta pelo banco");
    // Condicionada libera a venda E permite nova rodada se a condição não fechar.
    expect(card).toContain('status === "aprovada" || status === "aprovada_condicionada"');
    expect(card).toContain('status === "aprovada_condicionada" && onNovaAnalise');
  });

  it("modal de registro da etapa oferece a condicionada", () => {
    expect(dialog).toContain('"aprovada_condicionada"');
    expect(dialog).toContain('aprovada_condicionada: "Aprovada com condição"');
  });

  it("dashboard: flatten conta condicionada (0 sem a chave, nunca NaN) e o card desdobra", () => {
    const flat = flattenDashboardKpis({
      pipeline: { analise_credito: 9, analise_aprovada: 3, analise_condicionada: 4 },
      periodo: {},
    });
    expect(flat.analise_condicionada).toBe(4);
    expect(flattenDashboardKpis({ pipeline: {}, periodo: {} }).analise_condicionada).toBe(0);
    expect(relatorios).toContain("condicionada(s)");
  });
});
