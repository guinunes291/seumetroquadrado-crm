// Central de Distribuição ÚNICA — contratos da migration 20260827100000 e da
// consolidação de UI. A configuração das roletas vivia em 4 superfícies com
// contratos diferentes (Central via RPC, Campanhas via SQL direto com token
// no cliente, Pessoas via UPDATE direto, e chaves do v2 sem tela). Depois da
// consolidação: escrita SÓ por RPC auditada, e toda chave de settings tem
// tela (campo próprio ou o bloco data-driven "Outras chaves").
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { motivoInaptidaoLabel, roletaLabel } from "@/lib/distribuicao";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const MIG = "supabase/migrations/20260827100000_central_distribuicao_unica.sql";
const mig = read(MIG);
const migCode = mig.replace(/--[^\n]*/g, "");
const migFlat = migCode.replace(/\s+/g, " ");

describe("ordem de replay", () => {
  it("ordena DEPOIS do motor v2 de 26/08", () => {
    expect(MIG > "supabase/migrations/20260826121000_distribuicao_v2_motor.sql").toBe(true);
  });
});

describe("migration: atualizar_roleta estendida sem overload", () => {
  it("dropa a assinatura de 6 args ANTES de criar a de 9 — overload quebraria o PostgREST", () => {
    expect(migCode).toContain(
      "DROP FUNCTION IF EXISTS public.atualizar_roleta(text, boolean, boolean, text, text, boolean);",
    );
    expect(mig.indexOf("DROP FUNCTION IF EXISTS public.atualizar_roleta")).toBeLessThan(
      mig.indexOf("CREATE OR REPLACE FUNCTION public.atualizar_roleta"),
    );
  });

  it("cobre equipe_fixa e projeto, restritos a roletas de campanha, com auditoria diff", () => {
    expect(migFlat).toContain("_equipe_fixa boolean DEFAULT NULL");
    expect(migFlat).toContain("_projeto_id uuid DEFAULT NULL");
    expect(migFlat).toContain("_limpar_projeto boolean DEFAULT false");
    expect(migCode).toContain("valem apenas para roletas de campanha");
    expect(migFlat).toContain("(_antes - 'updated_at') IS DISTINCT FROM (_depois - 'updated_at')");
  });

  it("a sanidade aborta o deploy se a assinatura velha sobreviver", () => {
    expect(mig).toContain("overload quebraria o PostgREST");
  });
});

describe("migration: criar_roleta_campanha", () => {
  const fn = mig.slice(
    mig.indexOf("CREATE OR REPLACE FUNCTION public.criar_roleta_campanha"),
    mig.indexOf("REVOKE ALL ON FUNCTION public.criar_roleta_campanha"),
  );

  it("token nasce no SERVIDOR (gen_random_bytes), nunca mais no navegador", () => {
    expect(fn).toContain("encode(gen_random_bytes(24), 'hex')");
  });

  it("gate admin, slug único com sufixo numérico e INSERT auditado", () => {
    expect(fn).toContain("RAISE EXCEPTION 'forbidden'");
    expect(fn).toContain("WHILE EXISTS");
    expect(fn).toContain("'roletas', (_linha->>'id')::uuid, 'INSERT'");
  });
});

describe("migration: guarda do recálculo de tiers", () => {
  it("admin/gestor apenas — e auth.uid() IS NOT NULL preserva o cron service_role", () => {
    const fn = mig.slice(
      mig.indexOf("CREATE OR REPLACE FUNCTION public.recalcular_tiers_roleta"),
      mig.indexOf("REVOKE ALL ON FUNCTION public.recalcular_tiers_roleta"),
    );
    expect(fn.replace(/\s+/g, " ")).toContain(
      "IF auth.uid() IS NOT NULL AND NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor')) THEN",
    );
    expect(fn).toContain("RAISE EXCEPTION 'forbidden'");
  });
});

describe("migration: atualizar_corretor_distribuicao", () => {
  const fn = mig.slice(
    mig.indexOf("CREATE OR REPLACE FUNCTION public.atualizar_corretor_distribuicao"),
    mig.indexOf("REVOKE ALL ON FUNCTION public.atualizar_corretor_distribuicao"),
  );

  it("valida zonas contra o domínio canônico e o modelo de contrato", () => {
    expect(fn).toContain("ARRAY['Norte','Sul','Leste','Oeste','Centro']::text[]");
    expect(fn).toContain("NOT IN ('fixo','autonomo')");
  });

  it("auditoria restrita aos campos de distribuição (sem PII de profiles no audit_log)", () => {
    expect(fn).toContain("jsonb_build_object");
    expect(fn).not.toContain("to_jsonb(p)");
    expect(fn).toContain("'profiles', _corretor_id, 'UPDATE'");
  });
});

describe("migration: RLS de roleta_participantes fecha a escrita direta", () => {
  it("dropa as 3 policies de escrita e a sanidade confere em pg_policies", () => {
    for (const p of [
      '"gestao gerencia participantes ins"',
      '"gestao gerencia participantes upd"',
      '"gestao gerencia participantes del"',
    ]) {
      expect(migCode).toContain(`DROP POLICY IF EXISTS ${p} ON public.roleta_participantes;`);
    }
    expect(mig).toContain("pg_policies");
    expect(mig).toContain("NOTIFY pgrst, 'reload schema'");
  });
});

describe("UI: fim do SQL direto nas superfícies antigas", () => {
  it("campanhas-page não escreve mais em roletas nem em roleta_participantes", () => {
    const page = read("src/features/gestao/campanhas-page.tsx");
    expect(page).not.toMatch(/from\("roletas"\)[\s\S]{0,60}\.(insert|update|delete)\(/);
    expect(page).not.toMatch(
      /from\("roleta_participantes"\)[\s\S]{0,60}\.(insert|update|delete)\(/,
    );
    expect(page).not.toContain("crypto.getRandomValues");
  });

  it("corretores-page (Pessoas) não edita mais zonas — badges + link para a Central", () => {
    const page = read("src/features/gestao/corretores-page.tsx");
    expect(page).not.toMatch(/update\(\{\s*zonas/);
    expect(page).not.toContain("ZonasCell");
    expect(page).toContain('search={{ tab: "corretores" }}');
  });

  it("as abas novas escrevem só por RPC (nenhum insert/update direto nas tabelas da roleta)", () => {
    for (const arquivo of [
      "src/features/distribuicao/tab-filas.tsx",
      "src/features/distribuicao/fila-propriedades.tsx",
      "src/features/distribuicao/tab-corretores.tsx",
    ]) {
      const src = read(arquivo);
      expect(src).not.toMatch(
        /from\("(roletas|roleta_participantes|profiles)"\)[\s\S]{0,60}\.(insert|update|delete)\(/,
      );
    }
  });
});

describe("UI: aba Política cobre o modelo v2 inteiro", () => {
  const politica = read("src/features/distribuicao/tab-politica.tsx");
  // O array exportado, parseado da fonte (importar o .tsx puxaria o client
  // do Supabase para dentro do teste).
  const arrayCobertas =
    politica.match(/export const CHAVES_COBERTAS: string\[\] = \[([\s\S]*?)\];/)?.[1] ?? "";

  it("as 11 chaves do v2 têm campo próprio e constam de CHAVES_COBERTAS", () => {
    for (const chave of [
      "modelo_v2_ativo",
      "modelo_v2_sombra",
      "sla_quente_minutos",
      "pausa_estouros_dia",
      "faixa_a_max_min",
      "faixa_b_max_min",
      "amostra_minima_faixa",
      "janela_faixa_dias",
      "posse_dias_atendimento",
      "posse_dias_avancado",
      "disjuntor_wip",
    ]) {
      expect(politica).toContain(`"${chave}"`);
      expect(arrayCobertas).toContain(`"${chave}"`);
    }
  });

  it("a feature flag exige confirmação explícita (AlertDialog) antes de mudar produção", () => {
    expect(politica).toContain("AlertDialog");
    expect(politica).toContain("Ligar o motor v2 em produção?");
  });

  it("chave nova nunca fica invisível: bloco data-driven para o que não tem campo próprio", () => {
    expect(politica).toContain("CHAVES_COBERTAS");
    expect(politica).toContain("SettingGenerico");
    expect(politica).toContain("Outras chaves");
  });
});

describe("UI: rota com compatibilidade de links antigos", () => {
  it("?tab=zonas/origem e ?tab=<slug de roleta> (alertas do banco) caem na aba Filas", () => {
    const rota = read("src/routes/_authenticated/distribuicao.tsx");
    expect(rota).toContain("TAB_LEGADO");
    for (const legado of ["zonas", "origem", "plantao", "zona-norte", "base"]) {
      expect(rota).toContain(`${JSON.stringify(legado)}`);
    }
    expect(rota).toContain('{ tab: "filas", fila:');
  });
});

describe("vocabulário (unit real)", () => {
  it("roletaLabel: nome do banco vence; base tem label; slug cru continua o fallback", () => {
    expect(roletaLabel("base")).toBe("Roleta Base");
    expect(roletaLabel("qualquer-slug", "Nome do Banco")).toBe("Nome do Banco");
    expect(roletaLabel("qualquer-slug")).toBe("qualquer-slug");
    expect(roletaLabel("zona-norte")).toBe("Roleta Zona Norte");
  });

  it("motivos do v2 são legíveis, inclusive o disjuntor dinâmico; desconhecido segue cru", () => {
    expect(motivoInaptidaoLabel("sem_modelo_contrato")).toBe("Sem modelo de contrato definido");
    expect(motivoInaptidaoLabel("onboarding_pendente")).toBe("Onboarding não concluído");
    expect(motivoInaptidaoLabel("disjuntor_wip_31")).toBe(
      "Teto de leads ativos atingido (31 no funil)",
    );
    expect(motivoInaptidaoLabel("codigo_desconhecido")).toBe("codigo_desconhecido");
  });
});
