import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A migration troca a AVALIAÇÃO do gate de carteira (por linha → InitPlan),
// nunca a REGRA. Estes testes travam os invariantes de segurança da nova
// forma: se alguém "simplificar" um branch e abrir a carteira, isso quebra.

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260718100000_escopo_carteira_rapido.sql"),
  "utf8",
);

function bloco(inicio: string): string {
  const start = migration.indexOf(inicio);
  if (start < 0) throw new Error(`bloco ausente: ${inicio}`);
  const proximaFuncao = migration.indexOf("CREATE OR REPLACE FUNCTION", start + 1);
  const proximaSecao = migration.indexOf("-- ----", start + 1);
  const candidatos = [proximaFuncao, proximaSecao].filter((i) => i > 0);
  const fim = candidatos.length ? Math.min(...candidatos) : migration.length;
  return migration.slice(start, fim);
}

/** Migration sem linhas de comentário — para asserções "não contém". */
const soCodigo = migration
  .split("\n")
  .filter((linha) => !linha.trimStart().startsWith("--"))
  .join("\n");

describe("helpers de escopo", () => {
  it("ve_carteira_completa é só admin/superintendente (has_role já exige conta ativa)", () => {
    const fn = bloco("CREATE OR REPLACE FUNCTION public.ve_carteira_completa");
    expect(fn).toContain("has_role(_user_id, 'admin'::public.app_role)");
    expect(fn).toContain("has_role(_user_id, 'superintendente'::public.app_role)");
    expect(fn).not.toContain("'corretor'");
    expect(fn).not.toContain("'gestor'");
  });

  it("corretores_do_gestor exige papel gestor e vínculo de equipe (mesmo EXISTS de pode_acessar_lead)", () => {
    const fn = bloco("CREATE OR REPLACE FUNCTION public.corretores_do_gestor");
    expect(fn).toContain("has_role(_user_id, 'gestor'::public.app_role)");
    expect(fn).toContain("c.equipe_id IS NOT NULL");
    expect(fn).toContain("g.equipe_id = c.equipe_id");
    expect(fn).toContain("e.gestor_id = _user_id");
  });

  it("helpers não são executáveis por anon", () => {
    for (const fn of ["ve_carteira_completa(uuid)", "corretores_do_gestor(uuid)"]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon`);
    }
  });
});

describe("policies de SELECT no padrão InitPlan", () => {
  it("leads: conta ativa + (dono | visão total | equipe do gestor), tudo via subconsulta escalar", () => {
    const policy = migration.match(
      /CREATE POLICY "leads_select_carteira"[\s\S]*?ON public\.leads[\s\S]*?\);/,
    )?.[0];
    expect(policy).toBeTruthy();
    expect(policy).toContain("(SELECT public.is_active_member(auth.uid()))");
    expect(policy).toContain("corretor_id = (SELECT auth.uid())");
    expect(policy).toContain("(SELECT public.ve_carteira_completa(auth.uid()))");
    expect(policy).toContain("corretor_id IN (SELECT public.corretores_do_gestor(auth.uid()))");
  });

  for (const tabela of ["tarefas", "agendamentos"]) {
    it(`${tabela}: acesso continua derivado do LEAD, não do corretor denormalizado da linha`, () => {
      const policy = migration.match(
        new RegExp(`CREATE POLICY "${tabela}_select_carteira"[\\s\\S]*?\\n  \\);`),
      )?.[0];
      expect(policy).toBeTruthy();
      expect(policy).toContain("(SELECT public.is_active_member(auth.uid()))");
      // branch com lead: resolve o corretor DO LEAD via EXISTS
      expect(policy).toContain("lead_id IS NOT NULL");
      expect(policy).toContain("FROM public.leads AS l");
      expect(policy).toContain("l.corretor_id = (SELECT auth.uid())");
      expect(policy).toContain("l.corretor_id IN (SELECT public.corretores_do_gestor(auth.uid()))");
      // branch sem lead: espelha pode_acessar_corretor (exige corretor não nulo)
      expect(policy).toContain("lead_id IS NULL");
      expect(policy).toContain("corretor_id IS NOT NULL");
    });
  }

  it("nenhuma definição nova reintroduz pode_acessar_lead por linha", () => {
    expect(soCodigo).not.toContain("pode_acessar_lead(");
  });
});

describe("RPCs do kanban com escopo pré-computado", () => {
  for (const fn of ["pipeline_snapshot_v3", "pipeline_stage_page_v2"]) {
    it(`${fn}: gate de conta ativa + escopo declarado + grants fechados`, () => {
      const corpo = bloco(`CREATE OR REPLACE FUNCTION public.${fn}`);
      expect(corpo).toContain("IF NOT public.is_active_member(_caller) THEN");
      expect(corpo).toContain("_ve_tudo := public.ve_carteira_completa(_caller);");
      expect(corpo).toContain("ARRAY(SELECT public.corretores_do_gestor(_caller))");
      expect(corpo).toContain(
        "(_ve_tudo OR l.corretor_id = _caller OR l.corretor_id = ANY(_equipe))",
      );
      expect(corpo).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, service_role/);
      expect(corpo).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO authenticated/);
    });
  }

  it("pipeline_stage_page_v2 preserva cursor estável e teto de 20", () => {
    const corpo = bloco("CREATE OR REPLACE FUNCTION public.pipeline_stage_page_v2");
    expect(corpo).toContain("LEAST(GREATEST(COALESCE(_limit, 20), 1), 20)");
    expect(corpo).toContain("(l.created_at, l.id) < (_cursor_created_at, _cursor_id)");
    expect(corpo).not.toMatch(/\bOFFSET\b/);
  });
});

describe("leads_sem_acao", () => {
  const corpo = bloco("CREATE OR REPLACE FUNCTION public.leads_sem_acao");

  it("aplica o mesmo escopo de carteira e cap de linhas", () => {
    expect(corpo).toContain("IF NOT public.is_active_member(_caller) THEN");
    expect(corpo).toContain(
      "(_ve_tudo OR l.corretor_id = _caller OR l.corretor_id = ANY(_equipe))",
    );
    expect(corpo).toContain("LEAST(GREATEST(COALESCE(_limit, 60), 1), 100)");
    expect(corpo).toContain("SET statement_timeout = '8s'");
  });

  it("espelha os filtros do cliente (status ativos, follow-up futuro exclui, anti-joins com escopo)", () => {
    expect(corpo).toContain("l.status NOT IN ('perdido', 'contrato_fechado', 'pos_venda')");
    expect(corpo).toContain("l.proximo_followup IS NULL OR l.proximo_followup <= now()");
    expect(corpo).toContain("t.status IN ('pendente', 'em_andamento')");
    expect(corpo).toContain("a.status NOT IN ('cancelado', 'realizado', 'nao_compareceu')");
    // o recorte _corretores vale nas 3 fontes, como o cliente fazia com .in()
    expect(corpo).toContain("(_corretores IS NULL OR l.corretor_id = ANY(_corretores))");
    expect(corpo).toContain("(_corretores IS NULL OR t.corretor_id = ANY(_corretores))");
    expect(corpo).toContain("(_corretores IS NULL OR a.corretor_id = ANY(_corretores))");
  });

  it("não é executável por anon nem service_role implícito", () => {
    expect(corpo).toContain("REVOKE ALL ON FUNCTION public.leads_sem_acao(uuid[], integer)");
    expect(corpo).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.leads_sem_acao[\s\S]*TO authenticated/,
    );
  });
});
