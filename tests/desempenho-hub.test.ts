// Guardas do hub de Desempenho (/ranking) após o redesign de setembro/2026:
// a aba Competição (Copa SMQ) saiu, as URLs antigas continuam caindo em pé,
// e a migration que amarra a pontuação aos pesos vigentes tem a forma certa.
// Fonte lida como texto, padrão da casa (ver tests/financeiro-hub.test.ts).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const ranking = read("src/routes/_authenticated/ranking.tsx");
const copaRota = read("src/routes/_authenticated/copa.tsx");
const migration = read("supabase/migrations/20260905120000_pontuacao_recalculo_config.sql");
const simetria = read("supabase/migrations/20260905130000_pontuacao_simetria_eventos.sql");
const pagina = read("src/features/ranking/ranking-page.tsx");
const dados = read("src/features/ranking/use-ranking-data.ts");

describe("hub de Desempenho — Competição encerrada", () => {
  it("não existe mais aba Competição nem a página da Copa", () => {
    expect(ranking).not.toContain('<TabsTrigger value="competicao"');
    expect(ranking).not.toContain("CopaPage");
    for (const f of [
      "src/features/ranking/copa-page.tsx",
      "src/features/ranking/copa-admin.tsx",
      "src/features/ranking/copa-ui.tsx",
      "src/lib/copa.ts",
    ]) {
      expect(existsSync(join(process.cwd(), f)), `${f} deveria ter sido removido`).toBe(false);
    }
  });

  it("URL nenhuma morre: /copa e ?tab=competicao caem no ranking", () => {
    expect(copaRota).toMatch(/redirect\(\{ to: "\/ranking", search: \{\} \}\)/);
    expect(ranking).toMatch(
      /search\.tab === "competicao"[\s\S]{0,120}redirect\(\{ to: "\/ranking"/,
    );
    // "competicao" segue na whitelist do validateSearch — o beforeLoad precisa
    // ler o valor cru para redirecionar (lição das abas distribuicao/comissoes).
    expect(ranking).toMatch(/DESEMPENHO_TABS[\s\S]{0,160}"competicao"/);
  });

  it("Ranking e Conquistas continuam como abas do hub", () => {
    expect(ranking).toContain('<TabsTrigger value="ranking"');
    expect(ranking).toContain('<TabsTrigger value="conquistas"');
    expect(ranking).toContain("<RankingPanel />");
    expect(ranking).toContain("<ConquistasPage />");
  });
});

describe("hub de Desempenho — fontes dos números", () => {
  it("o ranking continua vindo agregado do RPC (máx. 50 linhas) e as metas do mês", () => {
    expect(dados).toContain('supabase.rpc("ranking_periodo_v2"');
    expect(dados).toContain("RANKING_LIMITE = 50");
    expect(dados).toContain("_limit: RANKING_LIMITE");
    expect(dados).toContain('.from("metas")');
    expect(dados).toContain('.from("configuracao_pontuacao")');
  });

  it("a página não faz conta própria: agrega metas sem dupla contagem via ranking-derive", () => {
    expect(pagina).toContain(
      "agregarMetas(metas, escopoDe(rankingMes, escopoCompleto, escopoDeTime))",
    );
    expect(pagina).not.toMatch(/meta_vendas \|\| 0/);
  });

  it("hoje é o de São Paulo, não o do aparelho", () => {
    expect(dados).toContain("agoraSaoPaulo()");
    expect(dados).toContain("getDateRange(periodo, hoje)");
  });
});

describe("migration 20260905120000 — pontuação acompanha os pesos", () => {
  it("recalcula com a MESMA fórmula de bump_atividade e só onde difere", () => {
    for (const chave of ["ligacao", "whatsapp", "agendamento", "visita", "documentacao", "venda"]) {
      expect(migration).toContain(`public.pontos_de('${chave}')`);
    }
    expect(migration).toMatch(/WHERE a\.pontuacao_total IS DISTINCT FROM/);
  });

  it("dispara por comando em INSERT/UPDATE/DELETE de configuracao_pontuacao e reconcilia o histórico", () => {
    expect(migration).toMatch(
      /AFTER INSERT OR UPDATE OR DELETE ON public\.configuracao_pontuacao\s+FOR EACH STATEMENT/,
    );
    expect(migration).toMatch(/^SELECT public\.recalcular_pontuacao_atividades\(\);/m);
  });

  it("usuário comum não executa o recálculo direto", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.recalcular_pontuacao_atividades\(\) FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.recalcular_pontuacao_atividades\(\) TO service_role/,
    );
  });
});

describe("migration 20260905130000 — contadores simétricos e meses congelados", () => {
  it("cada evento sobe e desce pelo mesmo predicado, nos três triggers", () => {
    for (const fn of [
      "pont_interacao_conta",
      "pont_agendamento_conta",
      "pont_visita_conta",
      "pont_documentacao_conta",
    ]) {
      expect(simetria).toContain(`CREATE OR REPLACE FUNCTION public.${fn}(`);
    }
    expect(simetria).toMatch(
      /AFTER INSERT OR UPDATE OF deleted_at, tipo, autor_id, metadata OR DELETE ON public\.interacoes/,
    );
    expect(simetria).toMatch(
      /AFTER INSERT OR UPDATE OF status, deleted_at, tipo, corretor_id, auto_gerado, criado_por_id OR DELETE ON public\.agendamentos/,
    );
    expect(simetria).toMatch(
      /AFTER INSERT OR UPDATE OF status, deleted_at, data_inicio, tipo, corretor_id OR DELETE ON public\.agendamentos/,
    );
  });

  it("meses fechados são congelados e a reconciliação respeita a janela", () => {
    expect(simetria).toContain("CREATE OR REPLACE FUNCTION public.pont_dia_editavel(_dia date)");
    expect((simetria.match(/public\.pont_dia_editavel\(/g) ?? []).length).toBeGreaterThanOrEqual(7);
    expect(simetria).toContain("reconciliar_atividades_diarias(_desde date DEFAULT NULL)");
    expect(simetria).toContain("LOCK TABLE public.atividades_diarias IN SHARE ROW EXCLUSIVE MODE");
  });

  it("a duplicata da ligação é carimbada na inserção, e o histórico ganha snapshot antes da reconciliação", () => {
    expect(simetria).toMatch(/BEFORE INSERT ON public\.interacoes/);
    expect(simetria).toContain("pontuacao_ignorada");
    expect(simetria).toContain("metrics.atividades_diarias_snapshot_20260905");
    expect(simetria).toMatch(/^SELECT public\.reconciliar_atividades_diarias\('2026-06-16'\);/m);
  });
});
